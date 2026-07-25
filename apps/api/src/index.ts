import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq, isNull } from "drizzle-orm";
import {
  achievements,
  aiGenerations,
  aiSettings,
  cycleParticipants,
  cycles,
  documents,
  feedbackItems,
  goals,
  importBundles,
  nextLevelAssessments,
  people,
  reviews,
  roleAssignments,
  roleDefinitions,
  roleExpectations,
  roleFrameworkVersions,
  workspace,
} from "@prm/db";
import type { PacketDTO, PersonDTO, RoleDefinitionDTO, WorkspaceStatus } from "@prm/shared";
import { seedWorkspace } from "./seed.js";
import {
  checksum,
  clearSession,
  createSession,
  decryptSecret,
  encryptSecret,
  getDb,
  getSessionToken,
  getWorkspaceSecret,
  hashPassword,
  id,
  isInitialized,
  logActivity,
  nowIso,
  requireSession,
  setWorkspaceSecret,
  deriveWorkspaceSecret,
  verifyPassword,
} from "./store.js";

type Vars = { token: string };

const app = new Hono<{ Variables: Vars }>();

app.use("*", cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"], credentials: true }));

app.use("/api/*", async (c, next) => {
  if (
    c.req.path === "/api/health" ||
    c.req.path === "/api/workspace/status" ||
    c.req.path === "/api/workspace/init" ||
    c.req.path === "/api/workspace/unlock"
  ) {
    return next();
  }
  const token = c.req.header("x-prm-token") ?? "";
  if (!requireSession(token)) {
    return c.json({ error: "Unauthorized — unlock workspace" }, 401);
  }
  c.set("token", token);
  await next();
});

function mapPerson(p: typeof people.$inferSelect, assignment?: {
  roleDefinitionId: string | null;
  roleTitle: string | null;
  targetNextRoleDefinitionId: string | null;
  targetNextRoleTitle: string | null;
}): PersonDTO {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    title: p.title,
    levelKey: p.levelKey,
    managerId: p.managerId,
    hireDate: p.hireDate,
    roleDefinitionId: assignment?.roleDefinitionId ?? null,
    roleTitle: assignment?.roleTitle ?? null,
    targetNextRoleDefinitionId: assignment?.targetNextRoleDefinitionId ?? null,
    targetNextRoleTitle: assignment?.targetNextRoleTitle ?? null,
  };
}

function loadRole(roleId: string | null | undefined): RoleDefinitionDTO | null {
  if (!roleId) return null;
  const db = getDb();
  const role = db.select().from(roleDefinitions).where(eq(roleDefinitions.id, roleId)).all()[0];
  if (!role) return null;
  const expectations = db
    .select()
    .from(roleExpectations)
    .where(eq(roleExpectations.roleDefinitionId, role.id))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: role.id,
    key: role.key,
    title: role.title,
    track: role.track as RoleDefinitionDTO["track"],
    levelKey: role.levelKey,
    summary: role.summary,
    nextRoleKeys: JSON.parse(role.nextRoleKeysJson) as string[],
    expectations: expectations.map((e) => ({
      id: e.id,
      kind: e.kind as "responsibility" | "expectation",
      text: e.text,
      sortOrder: e.sortOrder,
    })),
  };
}

function assignmentFor(personId: string) {
  const db = getDb();
  const a = db
    .select()
    .from(roleAssignments)
    .where(and(eq(roleAssignments.personId, personId), isNull(roleAssignments.effectiveTo)))
    .all()[0];
  if (!a) return undefined;
  const role = db.select().from(roleDefinitions).where(eq(roleDefinitions.id, a.roleDefinitionId)).all()[0];
  const next = a.targetNextRoleDefinitionId
    ? db.select().from(roleDefinitions).where(eq(roleDefinitions.id, a.targetNextRoleDefinitionId)).all()[0]
    : null;
  return {
    roleDefinitionId: a.roleDefinitionId,
    roleTitle: role?.title ?? null,
    targetNextRoleDefinitionId: a.targetNextRoleDefinitionId,
    targetNextRoleTitle: next?.title ?? null,
    frameworkVersionId: a.frameworkVersionId,
  };
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/workspace/status", (c) => {
  const initialized = isInitialized();
  const unlocked = Boolean(getSessionToken() && requireSession(getSessionToken() ?? undefined));
  let name: string | null = null;
  let personCount = 0;
  let hasAiKey = false;
  let aiProvider: string | null = null;
  if (initialized) {
    const db = getDb();
    name = db.select().from(workspace).limit(1).all()[0]?.name ?? null;
    personCount = db.select().from(people).all().length;
    const ai = db.select().from(aiSettings).where(eq(aiSettings.id, "default")).all()[0];
    hasAiKey = Boolean(ai?.apiKeyEncrypted);
    aiProvider = ai?.provider ?? null;
  }
  const body: WorkspaceStatus = { initialized, unlocked, name, personCount, hasAiKey, aiProvider };
  return c.json(body);
});

app.post("/api/workspace/init", async (c) => {
  if (isInitialized()) return c.json({ error: "Already initialized" }, 400);
  const body = await c.req.json<{ name?: string; password?: string; seed?: boolean }>();
  const password = body.password || "workbench";
  if (body.seed !== false) {
    const result = await seedWorkspace({ name: body.name, password });
    return c.json({ ...result, token: getSessionToken() });
  }
  const db = getDb();
  const { hash, salt } = hashPassword(password);
  const wsId = id("ws");
  db.insert(workspace).values({
    id: wsId,
    name: body.name || "My Team",
    createdAt: nowIso(),
    settingsJson: "{}",
    passwordHash: hash,
    passwordSalt: salt,
  }).run();
  db.insert(aiSettings).values({ id: "default", enabled: 0, provider: "anthropic" }).run();
  const token = createSession(password, salt);
  logActivity("workspace.init", "workspace", wsId);
  return c.json({ workspaceId: wsId, token });
});

app.post("/api/workspace/unlock", async (c) => {
  if (!isInitialized()) return c.json({ error: "Not initialized" }, 400);
  const { password } = await c.req.json<{ password: string }>();
  const db = getDb();
  const ws = db.select().from(workspace).limit(1).all()[0];
  if (!verifyPassword(password, ws.passwordHash, ws.passwordSalt)) {
    return c.json({ error: "Invalid password" }, 401);
  }
  const token = createSession(password, ws.passwordSalt);
  setWorkspaceSecret(deriveWorkspaceSecret(password, ws.passwordSalt));
  logActivity("workspace.unlock", "workspace", ws.id);
  return c.json({ token, name: ws.name });
});

app.post("/api/workspace/lock", (c) => {
  clearSession();
  return c.json({ ok: true });
});

app.get("/api/people", (c) => {
  const db = getDb();
  const rows = db.select().from(people).all();
  return c.json(rows.map((p) => mapPerson(p, assignmentFor(p.id))));
});

app.get("/api/people/:id", (c) => {
  const db = getDb();
  const p = db.select().from(people).where(eq(people.id, c.req.param("id"))).all()[0];
  if (!p) return c.json({ error: "Not found" }, 404);
  return c.json(mapPerson(p, assignmentFor(p.id)));
});

app.post("/api/people", async (c) => {
  const body = await c.req.json<{
    name: string;
    email?: string;
    title?: string;
    levelKey?: string;
    managerId?: string;
    hireDate?: string;
  }>();
  const db = getDb();
  const personId = id("person");
  db.insert(people).values({
    id: personId,
    name: body.name,
    email: body.email ?? null,
    title: body.title ?? null,
    levelKey: body.levelKey ?? null,
    managerId: body.managerId ?? null,
    hireDate: body.hireDate ?? null,
    status: "active",
    createdAt: nowIso(),
  }).run();
  logActivity("person.create", "person", personId, { name: body.name });
  return c.json(mapPerson(db.select().from(people).where(eq(people.id, personId)).all()[0], assignmentFor(personId)));
});

app.get("/api/roles", (c) => {
  const db = getDb();
  const versions = db.select().from(roleFrameworkVersions).all();
  const published = versions.filter((v) => v.status === "published").sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  if (!published) return c.json([]);
  const roles = db.select().from(roleDefinitions).where(eq(roleDefinitions.frameworkVersionId, published.id)).all();
  return c.json(roles.map((r) => loadRole(r.id)));
});

app.post("/api/roles/assign", async (c) => {
  const body = await c.req.json<{
    personId: string;
    roleDefinitionId: string;
    targetNextRoleDefinitionId?: string | null;
  }>();
  const db = getDb();
  const role = db.select().from(roleDefinitions).where(eq(roleDefinitions.id, body.roleDefinitionId)).all()[0];
  if (!role) return c.json({ error: "Role not found" }, 404);
  const existing = db
    .select()
    .from(roleAssignments)
    .where(and(eq(roleAssignments.personId, body.personId), isNull(roleAssignments.effectiveTo)))
    .all();
  const today = nowIso().slice(0, 10);
  for (const row of existing) {
    db.update(roleAssignments).set({ effectiveTo: today }).where(eq(roleAssignments.id, row.id)).run();
  }
  const assignmentId = id("ra");
  db.insert(roleAssignments).values({
    id: assignmentId,
    personId: body.personId,
    roleDefinitionId: body.roleDefinitionId,
    frameworkVersionId: role.frameworkVersionId,
    targetNextRoleDefinitionId: body.targetNextRoleDefinitionId ?? null,
    effectiveFrom: today,
  }).run();
  logActivity("role.assign", "person", body.personId, { roleDefinitionId: body.roleDefinitionId });
  return c.json({ ok: true, assignmentId });
});

app.get("/api/cycles", (c) => {
  const db = getDb();
  const rows = db.select().from(cycles).all();
  return c.json(
    rows.map((cycle) => ({
      id: cycle.id,
      name: cycle.name,
      windowStart: cycle.windowStart,
      windowEnd: cycle.windowEnd,
      status: cycle.status,
      participantCount: db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycle.id)).all().length,
    })),
  );
});

app.post("/api/cycles", async (c) => {
  const body = await c.req.json<{
    name: string;
    windowStart: string;
    windowEnd: string;
    includeDirects?: boolean;
  }>();
  const db = getDb();
  const cycleId = id("cycle");
  db.insert(cycles).values({
    id: cycleId,
    name: body.name,
    windowStart: body.windowStart,
    windowEnd: body.windowEnd,
    status: "self_open",
    createdAt: nowIso(),
  }).run();

  if (body.includeDirects !== false) {
    const all = db.select().from(people).all();
    const em = all.find((p) => !p.managerId) ?? all[0];
    for (const p of all.filter((x) => x.managerId === em?.id)) {
      const a = assignmentFor(p.id);
      db.insert(cycleParticipants).values({
        id: id("cp"),
        cycleId,
        personId: p.id,
        managerPersonId: em?.id ?? null,
        roleDefinitionId: a?.roleDefinitionId ?? null,
        targetNextRoleDefinitionId: a?.targetNextRoleDefinitionId ?? null,
        eligibility: "full",
        phaseStatusJson: JSON.stringify({ self: "pending", peer: "pending", manager: "draft" }),
      }).run();
    }
  }
  logActivity("cycle.create", "cycle", cycleId, { name: body.name });
  return c.json({ id: cycleId });
});

app.get("/api/cycles/:id/command-center", (c) => {
  const db = getDb();
  const cycleId = c.req.param("id");
  const participants = db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycleId)).all();
  const items = participants.map((cp) => {
    const person = db.select().from(people).where(eq(people.id, cp.personId)).all()[0];
    const revs = db.select().from(reviews).where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, cp.personId))).all();
    return {
      participantId: cp.id,
      person: person ? mapPerson(person, assignmentFor(person.id)) : null,
      eligibility: cp.eligibility,
      phaseStatus: JSON.parse(cp.phaseStatusJson) as Record<string, string>,
      hasSelf: revs.some((r) => r.type === "self"),
      peerCount: revs.filter((r) => r.type === "peer").length,
      managerStatus: revs.find((r) => r.type === "manager")?.status ?? "missing",
    };
  });
  return c.json({ cycleId, items });
});

app.get("/api/packets/:cycleId/:personId", (c) => {
  const db = getDb();
  const cycleId = c.req.param("cycleId");
  const personId = c.req.param("personId");
  const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
  if (!person) return c.json({ error: "Not found" }, 404);
  const a = assignmentFor(personId);
  const participant = db
    .select()
    .from(cycleParticipants)
    .where(and(eq(cycleParticipants.cycleId, cycleId), eq(cycleParticipants.personId, personId)))
    .all()[0];
  const currentRole = loadRole(participant?.roleDefinitionId ?? a?.roleDefinitionId);
  const nextRole = loadRole(participant?.targetNextRoleDefinitionId ?? a?.targetNextRoleDefinitionId);
  const revs = db.select().from(reviews).where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, personId))).all();
  const mapRev = (r: typeof reviews.$inferSelect) => ({
    id: r.id,
    type: r.type as PacketDTO["selfReview"] extends infer T ? NonNullable<T>["type"] : never,
    status: r.status as PacketDTO["managerReview"] extends infer T ? NonNullable<T>["status"] : never,
    subjectPersonId: r.subjectPersonId,
    authorName: r.authorName,
    payload: JSON.parse(r.payloadJson) as Record<string, unknown>,
    updatedAt: r.updatedAt,
  });
  const flags: string[] = [];
  if (!currentRole) flags.push("unassigned_role");
  if (!revs.some((r) => r.type === "self")) flags.push("missing_self_import");
  if (!db.select().from(achievements).where(eq(achievements.personId, personId)).all().length) flags.push("thin_evidence");

  const packet: PacketDTO = {
    person: mapPerson(person, a),
    currentRole,
    nextRole,
    selfReview: revs.find((r) => r.type === "self") ? mapRev(revs.find((r) => r.type === "self")!) : null,
    peerReviews: revs.filter((r) => r.type === "peer").map(mapRev),
    managerReview: revs.find((r) => r.type === "manager" && r.status !== "superseded")
      ? mapRev(revs.find((r) => r.type === "manager" && r.status !== "superseded")!)
      : null,
    goals: db.select().from(goals).where(eq(goals.personId, personId)).all().map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
    })),
    achievements: db.select().from(achievements).where(eq(achievements.personId, personId)).all().map((a) => ({
      id: a.id,
      title: a.title,
      occurredAt: a.occurredAt,
    })),
    documents: db.select().from(documents).where(eq(documents.personId, personId)).all().map((d) => ({
      id: d.id,
      title: d.title,
      visibility: d.visibility as PacketDTO["documents"][number]["visibility"],
    })),
    flags,
  };
  return c.json(packet);
});

app.put("/api/reviews/manager", async (c) => {
  const body = await c.req.json<{
    cycleId: string;
    subjectPersonId: string;
    payload: Record<string, unknown>;
    status?: string;
    gapAssessments?: Array<{ roleExpectationId: string; mark: string }>;
  }>();
  const db = getDb();
  const existing = db
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.cycleId, body.cycleId),
        eq(reviews.subjectPersonId, body.subjectPersonId),
        eq(reviews.type, "manager"),
      ),
    )
    .all()
    .find((r) => r.status !== "superseded");

  const ts = nowIso();
  let reviewId = existing?.id;
  if (existing) {
    db.update(reviews)
      .set({
        payloadJson: JSON.stringify(body.payload),
        status: body.status ?? existing.status,
        updatedAt: ts,
      })
      .where(eq(reviews.id, existing.id))
      .run();
  } else {
    reviewId = id("rev");
    db.insert(reviews).values({
      id: reviewId!,
      cycleId: body.cycleId,
      subjectPersonId: body.subjectPersonId,
      type: "manager",
      status: body.status ?? "draft",
      authorName: "Manager",
      payloadJson: JSON.stringify(body.payload),
      createdAt: ts,
      updatedAt: ts,
    }).run();
  }

  if (body.gapAssessments && reviewId) {
    // replace assessments
    const old = db.select().from(nextLevelAssessments).where(eq(nextLevelAssessments.reviewId, reviewId)).all();
    for (const row of old) {
      db.delete(nextLevelAssessments).where(eq(nextLevelAssessments.id, row.id)).run();
    }
    for (const g of body.gapAssessments) {
      db.insert(nextLevelAssessments).values({
        id: id("nla"),
        reviewId,
        roleExpectationId: g.roleExpectationId,
        mark: g.mark,
      }).run();
    }
  }

  logActivity("review.save", "review", reviewId, { type: "manager" });
  return c.json({ id: reviewId });
});

app.post("/api/bundles/export", async (c) => {
  const body = await c.req.json<{
    kind: "self" | "peer";
    cycleId: string;
    subjectPersonId: string;
    peerAuthorName?: string;
  }>();
  const db = getDb();
  const person = db.select().from(people).where(eq(people.id, body.subjectPersonId)).all()[0];
  const cycle = db.select().from(cycles).where(eq(cycles.id, body.cycleId)).all()[0];
  if (!person || !cycle) return c.json({ error: "Not found" }, 404);
  const templateKey = body.kind === "self" ? "ic_self" : "peer";
  const bundle = {
    version: 1,
    kind: body.kind,
    templateKey,
    cycleId: body.cycleId,
    cycleName: cycle.name,
    subjectPersonId: body.subjectPersonId,
    subjectName: person.name,
    peerAuthorName: body.peerAuthorName ?? null,
    exportedAt: nowIso(),
    fields:
      body.kind === "self"
        ? {
            top_outcomes: "",
            growth_areas: "",
            support_needed: "",
            proposed_goals: "",
            promo_interest: "unsure",
          }
        : {
            context: "",
            strengths: "",
            growth: "",
            observation_confidence: "occasional",
          },
    instructions:
      body.kind === "self"
        ? "Fill fields, save this JSON, and return to your manager for import. Do not rename cycleId/subjectPersonId."
        : "Author hidden in shared packet later — not cryptographically anonymous. Fill and return JSON to the manager.",
  };
  logActivity("bundle.export", "person", body.subjectPersonId, { kind: body.kind });
  return c.json(bundle);
});

app.post("/api/bundles/import", async (c) => {
  const body = await c.req.json<{
    bundle: Record<string, unknown>;
    sourceFilename?: string;
  }>();
  const bundle = body.bundle;
  const kind = bundle.kind as "self" | "peer";
  const cycleId = String(bundle.cycleId);
  const subjectPersonId = String(bundle.subjectPersonId);
  const fields = (bundle.fields ?? {}) as Record<string, unknown>;
  const payload = JSON.stringify(fields);
  const db = getDb();
  const bundleId = id("bundle");
  const ts = nowIso();
  db.insert(importBundles).values({
    id: bundleId,
    kind,
    cycleId,
    subjectPersonId,
    claimedAuthorName: (bundle.peerAuthorName as string) ?? (bundle.claimedAuthorName as string) ?? null,
    templateKey: String(bundle.templateKey ?? kind),
    payloadJson: payload,
    checksum: checksum(payload),
    sourceFilename: body.sourceFilename ?? null,
    importedAt: ts,
  }).run();

  const reviewId = id("rev");
  db.insert(reviews).values({
    id: reviewId,
    cycleId,
    subjectPersonId,
    type: kind,
    status: "submitted",
    authorName:
      kind === "self"
        ? db.select().from(people).where(eq(people.id, subjectPersonId)).all()[0]?.name ?? "Self"
        : ((bundle.peerAuthorName as string) ?? "Peer"),
    payloadJson: payload,
    importBundleId: bundleId,
    createdAt: ts,
    updatedAt: ts,
  }).run();

  logActivity("bundle.import", "review", reviewId, { kind });
  return c.json({ bundleId, reviewId });
});

app.get("/api/people/:id/dossier", (c) => {
  const personId = c.req.param("id");
  const db = getDb();
  return c.json({
    goals: db.select().from(goals).where(eq(goals.personId, personId)).all(),
    achievements: db.select().from(achievements).where(eq(achievements.personId, personId)).all(),
    feedback: db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, personId)).all(),
    documents: db.select().from(documents).where(eq(documents.personId, personId)).all(),
  });
});

app.post("/api/people/:id/achievements", async (c) => {
  const personId = c.req.param("id");
  const body = await c.req.json<{ title: string; description?: string; occurredAt?: string }>();
  const db = getDb();
  const achId = id("ach");
  db.insert(achievements).values({
    id: achId,
    personId,
    title: body.title,
    description: body.description ?? null,
    occurredAt: body.occurredAt ?? nowIso().slice(0, 10),
    createdAt: nowIso(),
  }).run();
  return c.json({ id: achId });
});

app.post("/api/people/:id/goals", async (c) => {
  const personId = c.req.param("id");
  const body = await c.req.json<{ title: string; description?: string; status?: string }>();
  const db = getDb();
  const goalId = id("goal");
  db.insert(goals).values({
    id: goalId,
    personId,
    title: body.title,
    description: body.description ?? null,
    status: body.status ?? "on_track",
    createdAt: nowIso(),
  }).run();
  return c.json({ id: goalId });
});

app.get("/api/ai/settings", (c) => {
  const db = getDb();
  const row = db.select().from(aiSettings).where(eq(aiSettings.id, "default")).all()[0];
  return c.json({
    enabled: Boolean(row?.enabled),
    provider: row?.provider ?? "anthropic",
    modelDigest: row?.modelDigest,
    modelDraft: row?.modelDraft,
    localOnly: Boolean(row?.localOnly),
    ollamaBaseUrl: row?.ollamaBaseUrl,
    privateNotesEgress: Boolean(row?.privateNotesEgress),
    meetingSummaryEgress: Boolean(row?.meetingSummaryEgress),
    documentExtractEgress: Boolean(row?.documentExtractEgress),
    hasApiKey: Boolean(row?.apiKeyEncrypted),
  });
});

app.put("/api/ai/settings", async (c) => {
  const body = await c.req.json<{
    enabled?: boolean;
    provider?: string;
    modelDigest?: string;
    modelDraft?: string;
    localOnly?: boolean;
    ollamaBaseUrl?: string;
    privateNotesEgress?: boolean;
    meetingSummaryEgress?: boolean;
    documentExtractEgress?: boolean;
    apiKey?: string | null;
  }>();
  const db = getDb();
  const secret = getWorkspaceSecret();
  const current = db.select().from(aiSettings).where(eq(aiSettings.id, "default")).all()[0];
  let apiKeyEncrypted = current?.apiKeyEncrypted ?? null;
  if (body.apiKey === null) apiKeyEncrypted = null;
  else if (body.apiKey && secret) apiKeyEncrypted = encryptSecret(body.apiKey, secret);
  else if (body.apiKey && !secret) return c.json({ error: "Workspace secret unavailable — re-unlock" }, 400);

  db.update(aiSettings)
    .set({
      enabled: body.enabled === undefined ? current?.enabled ?? 0 : body.enabled ? 1 : 0,
      provider: body.provider ?? current?.provider ?? "anthropic",
      modelDigest: body.modelDigest ?? current?.modelDigest,
      modelDraft: body.modelDraft ?? current?.modelDraft,
      localOnly: body.localOnly === undefined ? current?.localOnly ?? 0 : body.localOnly ? 1 : 0,
      ollamaBaseUrl: body.ollamaBaseUrl ?? current?.ollamaBaseUrl,
      privateNotesEgress:
        body.privateNotesEgress === undefined ? current?.privateNotesEgress ?? 0 : body.privateNotesEgress ? 1 : 0,
      meetingSummaryEgress:
        body.meetingSummaryEgress === undefined ? current?.meetingSummaryEgress ?? 0 : body.meetingSummaryEgress ? 1 : 0,
      documentExtractEgress:
        body.documentExtractEgress === undefined
          ? current?.documentExtractEgress ?? 0
          : body.documentExtractEgress
            ? 1
            : 0,
      apiKeyEncrypted,
    })
    .where(eq(aiSettings.id, "default"))
    .run();
  logActivity("ai.settings.update", "ai_settings", "default");
  return c.json({ ok: true });
});

app.post("/api/ai/digest", async (c) => {
  const body = await c.req.json<{ cycleId: string; personId: string }>();
  const db = getDb();
  const settings = db.select().from(aiSettings).where(eq(aiSettings.id, "default")).all()[0];
  const person = db.select().from(people).where(eq(people.id, body.personId)).all()[0];
  const a = assignmentFor(body.personId);
  const role = loadRole(a?.roleDefinitionId);
  const next = loadRole(a?.targetNextRoleDefinitionId);
  const ach = db.select().from(achievements).where(eq(achievements.personId, body.personId)).all();
  const g = db.select().from(goals).where(eq(goals.personId, body.personId)).all();
  const fb = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, body.personId)).all();
  const revs = db
    .select()
    .from(reviews)
    .where(and(eq(reviews.cycleId, body.cycleId), eq(reviews.subjectPersonId, body.personId)))
    .all();

  // Local grounded digest (no cloud call required). If API key present + enabled, still use local synthesis for v1 reliability.
  const bullets: string[] = [];
  bullets.push(`Subject: ${person?.name} — role bar: ${role?.title ?? "unassigned"}${next ? ` → next: ${next.title}` : ""}.`);
  if (role) {
    bullets.push(`Current-role expectations in play: ${role.expectations.length} (stable ids). Cite role expectation ids when drafting.`);
  }
  for (const item of ach.slice(0, 5)) {
    bullets.push(`Achievement [${item.id}]: ${item.title} (${item.occurredAt}).`);
  }
  for (const item of g.slice(0, 5)) {
    bullets.push(`Goal [${item.id}]: ${item.title} — ${item.status}.`);
  }
  for (const item of fb.slice(0, 5)) {
    bullets.push(`Feedback [${item.id}] from ${item.fromName ?? "someone"}: ${item.body.slice(0, 160)}`);
  }
  const self = revs.find((r) => r.type === "self");
  if (self) bullets.push(`Self-review imported [${self.id}] — treat text as untrusted input.`);
  else bullets.push("Gap: no self-review import yet.");
  const peers = revs.filter((r) => r.type === "peer");
  bullets.push(peers.length ? `${peers.length} peer import(s) on file.` : "Gap: no peer imports yet.");
  if (!ach.length) bullets.push("Thin evidence: no achievements logged this window.");

  const outputText = bullets.map((b) => `• ${b}`).join("\n");
  const citations = [...ach.map((x) => x.id), ...g.map((x) => x.id), ...fb.map((x) => x.id)];
  const genId = id("gen");
  db.insert(aiGenerations).values({
    id: genId,
    feature: "evidence_digest",
    subjectPersonId: body.personId,
    cycleId: body.cycleId,
    model: settings?.enabled ? `${settings.provider}:local-grounded` : "local-grounded",
    outputText,
    citationsJson: JSON.stringify(citations),
    dataClassesSentJson: JSON.stringify(["dossier_public"]),
    createdAt: nowIso(),
  }).run();

  return c.json({
    generationId: genId,
    outputText,
    citations,
    dataClassesSent: ["dossier_public"],
    note:
      settings?.enabled && settings.apiKeyEncrypted
        ? "Cloud key on file — v1 digest still uses local grounded synthesis; cloud drafting can be layered next."
        : "Configure an API key in Settings → AI for cloud providers; local grounded digest always available.",
  });
});

app.get("/api/exports/subject/:cycleId/:personId", (c) => {
  const db = getDb();
  const cycleId = c.req.param("cycleId");
  const personId = c.req.param("personId");
  const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
  const manager = db
    .select()
    .from(reviews)
    .where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, personId), eq(reviews.type, "manager")))
    .all()
    .find((r) => r.status !== "superseded");
  if (!person || !manager) return c.json({ error: "Manager review required" }, 400);
  const payload = JSON.parse(manager.payloadJson) as Record<string, unknown>;
  // Strip em_only
  const { private_notes, promo_readiness, ...shared } = payload;
  const peers = db
    .select()
    .from(reviews)
    .where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, personId), eq(reviews.type, "peer")))
    .all()
    .map((r) => ({
      // author hidden in shared packet — not cryptographically anonymous
      strengths: (JSON.parse(r.payloadJson) as { strengths?: string }).strengths,
      growth: (JSON.parse(r.payloadJson) as { growth?: string }).growth,
    }));
  return c.json({
    subject: person.name,
    notice: "Author names for peer input are hidden in this shared packet — not cryptographically anonymous.",
    summary: shared.summary,
    strengths: shared.strengths,
    growth_areas: shared.growth_areas,
    dev_plan: shared.dev_plan,
    overall: shared.overall,
    role_fit: shared.role_fit,
    peerThemes: peers,
    exportedAt: nowIso(),
  });
});

const port = Number(process.env.PRM_PORT ?? 8787);
console.log(`PRM API listening on http://127.0.0.1:${port}`);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
