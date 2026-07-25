import { eq, and, isNull } from "drizzle-orm";
import {
  accounts,
  achievements,
  aiSettings,
  concernLogs,
  cycleParticipants,
  cycles,
  feedbackItems,
  goals,
  people,
  reviews,
  roleAssignments,
  roleDefinitions,
  roleExpectations,
  roleFrameworkVersions,
  roleFrameworks,
  workspace,
} from "@prm/db";
import {
  bootstrapVault,
  getDb,
  id,
  logActivity,
  nowIso,
  paths,
} from "./store.js";

const FRAMEWORK = {
  name: "Engineering Career Framework 2026",
  roles: [
    {
      key: "eng_ic3",
      title: "Software Engineer (IC3)",
      track: "ic" as const,
      levelKey: "IC3",
      summary: "Delivers well-scoped features with guidance; growing ownership.",
      next: ["eng_ic4"],
      expectations: [
        { kind: "responsibility" as const, text: "Implements features within a squad with code review support." },
        { kind: "responsibility" as const, text: "Writes tests and documents non-obvious decisions." },
        { kind: "expectation" as const, text: "Unblocks self with timely escalation and options." },
        { kind: "expectation" as const, text: "Collaborates clearly in design and standup forums." },
      ],
    },
    {
      key: "eng_ic4",
      title: "Senior Software Engineer (IC4)",
      track: "ic" as const,
      levelKey: "IC4",
      summary: "Owns multi-sprint outcomes; creates clarity for others.",
      next: ["eng_ic5", "eng_m1"],
      expectations: [
        { kind: "responsibility" as const, text: "Owns ambiguous projects end-to-end across dependencies." },
        { kind: "responsibility" as const, text: "Raises engineering quality through design and review." },
        { kind: "expectation" as const, text: "Mentors IC3s; multiplies team output." },
        { kind: "expectation" as const, text: "Connects delivery to user/business outcomes." },
      ],
    },
    {
      key: "eng_ic5",
      title: "Staff Software Engineer (IC5)",
      track: "ic" as const,
      levelKey: "IC5",
      summary: "Drives multi-squad technical outcomes and leverage.",
      next: [],
      expectations: [
        { kind: "responsibility" as const, text: "Sets technical direction for a problem domain." },
        { kind: "expectation" as const, text: "Creates systems/process leverage beyond individual contribution." },
        { kind: "expectation" as const, text: "Influences partner teams without formal authority." },
      ],
    },
    {
      key: "eng_m1",
      title: "Engineering Manager (M1)",
      track: "manager" as const,
      levelKey: "M1",
      summary: "Delivers through a team; coaches and sets clear expectations.",
      next: [],
      expectations: [
        { kind: "responsibility" as const, text: "Runs effective 1:1s, feedback, and career conversations." },
        { kind: "expectation" as const, text: "Team delivers predictably with healthy culture." },
        { kind: "expectation" as const, text: "Develops engineers toward next-level scope." },
      ],
    },
  ],
};

const TEAM = [
  { name: "Alex Rivera", title: "Engineering Manager", levelKey: "M1", roleKey: "eng_m1", isEm: true },
  { name: "Maya Chen", title: "Senior Software Engineer", levelKey: "IC4", roleKey: "eng_ic4", nextKey: "eng_ic5" },
  { name: "Jordan Lee", title: "Software Engineer", levelKey: "IC3", roleKey: "eng_ic3", nextKey: "eng_ic4" },
  { name: "Sam Okonkwo", title: "Senior Software Engineer", levelKey: "IC4", roleKey: "eng_ic4", nextKey: "eng_ic5" },
  { name: "Riley Nguyen", title: "Software Engineer", levelKey: "IC3", roleKey: "eng_ic3", nextKey: "eng_ic4" },
  { name: "Casey Brooks", title: "Software Engineer", levelKey: "IC3", roleKey: "eng_ic3", nextKey: "eng_ic4" },
  { name: "Priya Shah", title: "Senior Software Engineer", levelKey: "IC4", roleKey: "eng_ic4", nextKey: "eng_m1" },
  { name: "Devon Park", title: "Software Engineer", levelKey: "IC3", roleKey: "eng_ic3", nextKey: "eng_ic4" },
];

export async function seedWorkspace(opts: {
  name?: string;
  password?: string;
  emName?: string;
} = {}) {
  const password = opts.password ?? "workbench";
  const { hash, salt } = bootstrapVault(password);
  const db = getDb();
  const existing = db.select().from(workspace).limit(1).all();
  if (existing.length > 1) {
    throw new Error("Workspace already initialized");
  }
  // bootstrap creates empty DB; workspace row should not exist yet
  if (existing.length === 1) {
    throw new Error("Workspace already initialized");
  }

  const wsId = id("ws");
  const accountId = id("acct");
  const createdAt = nowIso();

  db.insert(workspace).values({
    id: wsId,
    name: opts.name ?? "Platform Engineering",
    createdAt,
    settingsJson: JSON.stringify({ retention: "current_plus_previous", theme: "workbench" }),
    passwordHash: hash,
    passwordSalt: salt,
  }).run();

  db.insert(accounts).values({
    id: accountId,
    displayName: opts.emName ?? "Alex Rivera",
    email: "alex.rivera@example.com",
    createdAt,
  }).run();

  db.insert(aiSettings).values({
    id: "default",
    enabled: 0,
    provider: "anthropic",
    modelDigest: "claude-sonnet-4-5",
    modelDraft: "claude-sonnet-4-5",
    localOnly: 0,
  }).run();

  const fwId = id("fw");
  const fwvId = id("fwv");
  db.insert(roleFrameworks).values({ id: fwId, name: FRAMEWORK.name, createdAt }).run();
  db.insert(roleFrameworkVersions).values({
    id: fwvId,
    frameworkId: fwId,
    versionLabel: "2026.1",
    status: "published",
    publishedAt: createdAt,
    sourceFilename: "seeded",
  }).run();

  const roleIds: Record<string, string> = {};
  for (const role of FRAMEWORK.roles) {
    const rid = id("role");
    roleIds[role.key] = rid;
    db.insert(roleDefinitions).values({
      id: rid,
      frameworkVersionId: fwvId,
      key: role.key,
      title: role.title,
      track: role.track,
      levelKey: role.levelKey,
      summary: role.summary,
      nextRoleKeysJson: JSON.stringify(role.next),
      competencyKeysJson: JSON.stringify(
        role.track === "manager"
          ? ["execution", "ownership", "collaboration", "impact", "people_leadership", "org_influence"]
          : ["execution", "technical_depth", "ownership", "collaboration", "impact", "growth_leadership"],
      ),
    }).run();
    role.expectations.forEach((exp, idx) => {
      db.insert(roleExpectations).values({
        id: id("rexp"),
        roleDefinitionId: rid,
        kind: exp.kind,
        text: exp.text,
        sortOrder: idx,
      }).run();
    });
  }

  const personIds: Record<string, string> = {};
  let emPersonId = "";
  for (const member of TEAM) {
    const pid = id("person");
    personIds[member.name] = pid;
    if (member.isEm) emPersonId = pid;
    db.insert(people).values({
      id: pid,
      name: member.name,
      email: `${member.name.toLowerCase().replace(" ", ".")}@example.com`,
      title: member.title,
      levelKey: member.levelKey,
      managerId: member.isEm ? null : null, // set after
      hireDate: "2023-03-01",
      status: "active",
      createdAt,
    }).run();
  }

  for (const member of TEAM) {
    if (member.isEm) continue;
    db.update(people)
      .set({ managerId: emPersonId })
      .where(eq(people.id, personIds[member.name]))
      .run();
  }

  for (const member of TEAM) {
    const roleDefinitionId = roleIds[member.roleKey];
    const nextKey = "nextKey" in member ? (member as { nextKey?: string }).nextKey : undefined;
    db.insert(roleAssignments).values({
      id: id("ra"),
      personId: personIds[member.name],
      roleDefinitionId,
      frameworkVersionId: fwvId,
      targetNextRoleDefinitionId: nextKey ? roleIds[nextKey] : null,
      effectiveFrom: "2026-01-01",
      assignedByAccountId: accountId,
    }).run();
  }

  // Sample dossier for directs
  for (const member of TEAM.filter((t) => !t.isEm)) {
    const pid = personIds[member.name];
    db.insert(goals).values({
      id: id("goal"),
      personId: pid,
      title: `Deliver H1 roadmap outcomes for ${member.levelKey}`,
      description: "Measurable delivery against squad commitments.",
      status: "on_track",
      createdAt,
    }).run();
    db.insert(achievements).values({
      id: id("ach"),
      personId: pid,
      title: "Shipped checkout reliability improvements",
      description: "Reduced timeout errors; partnered with SRE.",
      occurredAt: "2026-03-15",
      createdAt,
    }).run();
    db.insert(feedbackItems).values({
      id: id("fb"),
      toPersonId: pid,
      fromName: "Design partner",
      kind: "praise",
      body: "Clear communication in cross-functional design reviews.",
      visibility: "em_and_subject",
      occurredAt: "2026-04-02",
      themesJson: JSON.stringify(["collaboration", "delivery"]),
      createdAt,
    }).run();
  }

  // Recent window evidence (sprint pulse demos) + a couple of external sync-style rows
  const recentDirects = TEAM.filter((t) => !t.isEm).slice(0, 3);
  for (const [i, member] of recentDirects.entries()) {
    const pid = personIds[member.name];
    db.insert(achievements).values({
      id: id("ach"),
      personId: pid,
      title: i === 0 ? "Closed checkout latency epic" : "Merged payment retry hardening",
      description: "Synced-style achievement for the current coaching window.",
      occurredAt: i === 0 ? "2026-07-18" : "2026-07-20",
      createdAt,
      sourceProvider: i === 0 ? "jira" : "bitbucket",
      externalId: i === 0 ? "CHK-241" : "pr-1882",
      externalUrl: i === 0 ? "https://example.atlassian.net/browse/CHK-241" : "https://bitbucket.org/example/pr/1882",
    }).run();
    db.insert(feedbackItems).values({
      id: id("fb"),
      toPersonId: pid,
      fromName: "EM note",
      kind: "coaching",
      body: "Discussed pacing and stakeholder updates for the current sprint.",
      visibility: "em_only",
      occurredAt: "2026-07-21",
      themesJson: JSON.stringify(["pacing", "stakeholders"]),
      createdAt,
    }).run();
  }
  const firstDirect = personIds[TEAM.find((t) => !t.isEm)!.name];
  db.insert(concernLogs).values({
    id: id("concern"),
    personId: firstDirect,
    occurredAt: "2026-07-19",
    title: "Missed partner handoff",
    body: "Late handoff to design delayed review by a day.",
    expectationText: "Confirm handoffs in Slack the morning of the due date.",
    planText: "Add handoff checklist to the squad ritual.",
    status: "open",
    aiAllowed: 0,
    createdAt,
    updatedAt: createdAt,
  }).run();

  const priorCycleId = id("cycle");
  db.insert(cycles).values({
    id: priorCycleId,
    name: "H2 2025",
    windowStart: "2025-07-01",
    windowEnd: "2025-12-31",
    status: "closed",
    createdAt,
  }).run();

  const cycleId = id("cycle");
  db.insert(cycles).values({
    id: cycleId,
    name: "H1 2026",
    windowStart: "2026-01-01",
    windowEnd: "2026-06-30",
    status: "manager_open",
    createdAt,
  }).run();

  for (const member of TEAM.filter((t) => !t.isEm)) {
    const pid = personIds[member.name];
    const assignment = db
      .select()
      .from(roleAssignments)
      .where(and(eq(roleAssignments.personId, pid), isNull(roleAssignments.effectiveTo)))
      .all()[0];
    for (const cid of [priorCycleId, cycleId]) {
      db.insert(cycleParticipants).values({
        id: id("cp"),
        cycleId: cid,
        personId: pid,
        managerPersonId: emPersonId,
        roleDefinitionId: assignment?.roleDefinitionId ?? null,
        targetNextRoleDefinitionId: assignment?.targetNextRoleDefinitionId ?? null,
        eligibility: "full",
        phaseStatusJson: JSON.stringify({
          self: cid === cycleId ? "pending" : "returned",
          peer: cid === cycleId ? "pending" : "returned",
          manager: cid === cycleId ? "draft" : "finalized",
        }),
      }).run();
    }
  }

  // Prior-cycle manager ratings so trends / compare have history
  const rated = TEAM.filter((t) => !t.isEm).slice(0, 4);
  for (const [i, member] of rated.entries()) {
    const pid = personIds[member.name];
    const overall = 3 + (i % 2);
    db.insert(reviews).values({
      id: id("rev"),
      cycleId: priorCycleId,
      subjectPersonId: pid,
      authorPersonId: emPersonId,
      type: "manager",
      status: "finalized",
      payloadJson: JSON.stringify({
        overall,
        competencies: { execution: overall, ownership: overall, collaboration: 3 },
        promo_readiness: "not_applicable",
        summary: `H2 2025 summary for ${member.name}`,
      }),
      createdAt,
      updatedAt: createdAt,
    }).run();
  }

  logActivity("workspace.seeded", "workspace", wsId, { people: TEAM.length, dataDir: paths.root });

  return {
    workspaceId: wsId,
    password,
    cycleId,
    emPersonId,
    personCount: TEAM.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("seed.ts")) {
  seedWorkspace()
    .then((r) => {
      console.log("Seeded workspace:", r);
      console.log("Default password: workbench");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
