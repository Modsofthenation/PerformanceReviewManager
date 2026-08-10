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
import { seedDefaultRoleFramework } from "./seedDefaultRoleFramework.js";

const TEAM = [
  { name: "Alex Rivera", title: "Engineering Manager", levelKey: "M1", roleKey: "eng_m1", isEm: true },
  { name: "Maya Chen", title: "Senior Software Engineer", levelKey: "IC4", roleKey: "eng_ic4", nextKey: "eng_ic5" },
  { name: "Jordan Lee", title: "Software Engineer", levelKey: "IC3", roleKey: "eng_ic3", nextKey: "eng_ic4" },
  { name: "Sam Okonkwo", title: "Senior Software Engineer", levelKey: "IC4", roleKey: "eng_ic4", nextKey: "eng_ic5" },
  { name: "Riley Nguyen", title: "Software Engineer", levelKey: "IC3", roleKey: "eng_ic3", nextKey: "eng_ic4" },
  { name: "Casey Brooks", title: "Junior Software Engineer", levelKey: "IC2", roleKey: "eng_ic2", nextKey: "eng_ic3" },
  { name: "Priya Shah", title: "Senior Software Engineer", levelKey: "IC4", roleKey: "eng_ic4", nextKey: "eng_l1" },
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

  const day = (offsetDays: number) => {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  // Keep the open cycle and "recent" evidence relative to today so demos stay in-window.
  const openStart = day(-150);
  const openEnd = day(30);
  const priorStart = day(-330);
  const priorEnd = day(-151);
  const midCycle = day(-90);
  const midFeedback = day(-60);
  const recentA = day(-12);
  const recentB = day(-10);
  const recentC = day(-9);
  const recentD = day(-11);
  const roleFrom = openStart;
  const priorCycleName = `Prior cycle (${priorStart.slice(0, 4)})`;
  const openCycleName = `Current cycle (${openStart.slice(0, 7)} → ${openEnd.slice(0, 7)})`;

  const wsId = id("ws");
  const accountId = id("acct");
  const createdAt = nowIso();

  db.insert(workspace).values({
    id: wsId,
    name: opts.name ?? "Platform Engineering",
    createdAt,
    settingsJson: JSON.stringify({
      retention: "current_plus_previous",
      theme: "workbench",
      onboarding: { completed: true, step: "done" },
    }),
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

  const { frameworkVersionId: fwvId, roleIds } = seedDefaultRoleFramework(db, {
    ownerName: "Seed EM",
    createdAt,
  });

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
      effectiveFrom: roleFrom,
      assignedByAccountId: accountId,
    }).run();
  }

  // Sample dossier for directs
  for (const member of TEAM.filter((t) => !t.isEm)) {
    const pid = personIds[member.name];
    db.insert(goals).values({
      id: id("goal"),
      personId: pid,
      title: `Deliver roadmap outcomes for ${member.levelKey}`,
      description: "Measurable delivery against squad commitments.",
      status: "on_track",
      createdAt,
    }).run();
    db.insert(achievements).values({
      id: id("ach"),
      personId: pid,
      title: "Shipped checkout reliability improvements",
      description: "Reduced timeout errors; partnered with SRE.",
      occurredAt: midCycle,
      createdAt,
    }).run();
    db.insert(feedbackItems).values({
      id: id("fb"),
      toPersonId: pid,
      fromName: "Design partner",
      kind: "praise",
      body: "Clear communication in cross-functional design reviews.",
      visibility: "em_and_subject",
      occurredAt: midFeedback,
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
      occurredAt: i === 0 ? recentA : recentB,
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
      occurredAt: recentC,
      themesJson: JSON.stringify(["pacing", "stakeholders"]),
      createdAt,
    }).run();
  }
  const firstDirect = personIds[TEAM.find((t) => !t.isEm)!.name];
  db.insert(concernLogs).values({
    id: id("concern"),
    personId: firstDirect,
    occurredAt: recentD,
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
    name: priorCycleName,
    windowStart: priorStart,
    windowEnd: priorEnd,
    status: "closed",
    createdAt,
  }).run();

  const cycleId = id("cycle");
  db.insert(cycles).values({
    id: cycleId,
    name: openCycleName,
    windowStart: openStart,
    windowEnd: openEnd,
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

// Only when running `tsx src/seed.ts` directly — never when bundled into the desktop
// sidecar entry (`prm-api.mjs`), where import.meta.url === argv[1] would also match.
const entry = process.argv[1] ?? "";
if (/(^|[/\\])seed\.(ts|js|mjs)$/.test(entry)) {
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
