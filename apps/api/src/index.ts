import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq, isNull } from "drizzle-orm";
import {
  achievements,
  aiSettings,
  cycleParticipants,
  cycles,
  documents,
  feedbackItems,
  goals,
  importBundles,
  nextLevelAssessments,
  people,
  promotionCases,
  reviews,
  roleAssignments,
  roleDefinitions,
  roleExpectations,
  workspace,
} from "@prm/db";
import type { PacketDTO, PersonDTO, RoleDefinitionDTO, WorkspaceStatus } from "@prm/shared";
import { seedWorkspace } from "./seed.js";
import {
  checksum,
  encryptSecret,
  encryptionStatus,
  getDb,
  getSessionToken,
  getWorkspaceSecret,
  id,
  isInitialized,
  lockVault,
  logActivity,
  nowIso,
  requireSession,
  bootstrapVault,
  unlockVault,
  writeEncryptedDocument,
  readDocumentFile,
} from "./store.js";
import { buildSystemPrompt, getAiConfig, localDigest, runChat, storeGeneration } from "./ai.js";

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
  const enc = encryptionStatus();
  const unlocked = Boolean(getSessionToken() && requireSession(getSessionToken() ?? undefined));
  let name: string | null = null;
  let personCount = 0;
  let hasAiKey = false;
  let aiProvider: string | null = null;
  if (initialized && unlocked) {
    try {
      const db = getDb();
      name = db.select().from(workspace).limit(1).all()[0]?.name ?? null;
      personCount = db.select().from(people).all().length;
      const ai = db.select().from(aiSettings).where(eq(aiSettings.id, "default")).all()[0];
      hasAiKey = Boolean(ai?.apiKeyEncrypted);
      aiProvider = ai?.provider ?? null;
    } catch {
      /* locked */
    }
  }
  const body: WorkspaceStatus & { encryptedAtRest: boolean } = {
    initialized,
    unlocked,
    name,
    personCount,
    hasAiKey,
    aiProvider,
    encryptedAtRest: enc.encryptedAtRest,
  };
  return c.json(body);
});

app.post("/api/workspace/init", async (c) => {
  if (isInitialized()) return c.json({ error: "Already initialized" }, 400);
  const body = await c.req.json<{ name?: string; password?: string; seed?: boolean }>();
  const password = body.password || "workbench";
  if (body.seed !== false) {
    const result = await seedWorkspace({ name: body.name, password });
    return c.json({ ...result, token: getSessionToken(), encryptedAtRest: false });
  }
  const { hash, salt } = bootstrapVault(password);
  const db = getDb();
  const wsId = id("ws");
  db.insert(workspace)
    .values({
      id: wsId,
      name: body.name || "My Team",
      createdAt: nowIso(),
      settingsJson: "{}",
      passwordHash: hash,
      passwordSalt: salt,
    })
    .run();
  db.insert(aiSettings).values({ id: "default", enabled: 0, provider: "anthropic" }).run();
  logActivity("workspace.init", "workspace", wsId);
  return c.json({ workspaceId: wsId, token: getSessionToken() });
});

app.post("/api/workspace/unlock", async (c) => {
  if (!isInitialized()) return c.json({ error: "Not initialized" }, 400);
  const { password } = await c.req.json<{ password: string }>();
  try {
    const token = unlockVault(password);
    const db = getDb();
    const ws = db.select().from(workspace).limit(1).all()[0];
    logActivity("workspace.unlock", "workspace", ws?.id);
    return c.json({ token, name: ws?.name, encryptedAtRest: false });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Unlock failed" }, 401);
  }
});

app.post("/api/workspace/lock", (c) => {
  lockVault();
  return c.json({ ok: true, encryptedAtRest: true });
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

app.post("/api/people/:id/documents", async (c) => {
  const personId = c.req.param("id");
  const db = getDb();
  const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
  if (!person) return c.json({ error: "Not found" }, 404);

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Expected multipart form upload" }, 400);
  }
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === "string") return c.json({ error: "file required" }, 400);
  const allowed = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/markdown",
    "text/csv",
    "image/png",
    "image/jpeg",
  ];
  const mime = file.type || "application/octet-stream";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extOk = ["pdf", "docx", "pptx", "txt", "md", "csv", "png", "jpg", "jpeg"].includes(ext);
  if (!extOk && !allowed.includes(mime)) {
    return c.json({ error: "File type not allowlisted" }, 400);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > 25 * 1024 * 1024) return c.json({ error: "Max 25MB" }, 400);

  const title = String(form.title || file.name);
  const visibility = String(form.visibility || "em_and_subject");
  const occurredAt = String(form.occurredAt || nowIso().slice(0, 10));
  const saved = writeEncryptedDocument(file.name, buf);
  const docId = id("doc");
  db.insert(documents)
    .values({
      id: docId,
      personId,
      title,
      filename: file.name,
      mimeType: mime,
      storagePath: saved.storagePath,
      visibility,
      occurredAt,
      scanStatus: "allowlist_ok",
      createdAt: nowIso(),
    })
    .run();
  logActivity("document.upload", "document", docId, { personId, bytes: saved.byteSize });
  return c.json({ id: docId, title, byteSize: saved.byteSize, checksum: checksum(buf) });
});

app.get("/api/documents/:id/download", (c) => {
  const db = getDb();
  const doc = db.select().from(documents).where(eq(documents.id, c.req.param("id"))).all()[0];
  if (!doc) return c.json({ error: "Not found" }, 404);
  const data = readDocumentFile(doc.storagePath);
  return new Response(data, {
    headers: {
      "content-type": doc.mimeType || "application/octet-stream",
      "content-disposition": `attachment; filename="${doc.filename}"`,
    },
  });
});

function buildEvidenceContext(personId: string, cycleId?: string) {
  const db = getDb();
  const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
  const a = assignmentFor(personId);
  const role = loadRole(a?.roleDefinitionId);
  const next = loadRole(a?.targetNextRoleDefinitionId);
  const ach = db.select().from(achievements).where(eq(achievements.personId, personId)).all();
  const g = db.select().from(goals).where(eq(goals.personId, personId)).all();
  const fb = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, personId)).all();
  const docs = db.select().from(documents).where(eq(documents.personId, personId)).all();
  const revs = cycleId
    ? db
        .select()
        .from(reviews)
        .where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, personId)))
        .all()
    : [];
  const lines: string[] = [];
  lines.push(`Subject: ${person?.name} (${person?.title ?? ""})`);
  lines.push(`Current role: ${role?.title ?? "unassigned"} [${role?.id ?? ""}]`);
  if (next) lines.push(`Next role: ${next.title} [${next.id}]`);
  if (role) {
    for (const e of role.expectations) lines.push(`Current expectation [${e.id}] (${e.kind}): ${e.text}`);
  }
  if (next) {
    for (const e of next.expectations) lines.push(`Next expectation [${e.id}] (${e.kind}): ${e.text}`);
  }
  for (const item of ach) lines.push(`Achievement [${item.id}] ${item.occurredAt}: ${item.title}. ${item.description ?? ""}`);
  for (const item of g) lines.push(`Goal [${item.id}] (${item.status}): ${item.title}`);
  for (const item of fb) lines.push(`Feedback [${item.id}] from ${item.fromName ?? "someone"}: ${item.body}`);
  for (const d of docs) lines.push(`Document [${d.id}] (${d.visibility}): ${d.title} @ ${d.occurredAt}`);
  const self = revs.find((r) => r.type === "self");
  if (self) lines.push(`Self-review [${self.id}] JSON: ${self.payloadJson}`);
  for (const p of revs.filter((r) => r.type === "peer")) {
    lines.push(`Peer-review [${p.id}] author=${p.authorName}: ${p.payloadJson}`);
  }
  const citations = [
    ...ach.map((x) => x.id),
    ...g.map((x) => x.id),
    ...fb.map((x) => x.id),
    ...docs.map((x) => x.id),
    ...(role?.expectations.map((e) => e.id) ?? []),
    ...(next?.expectations.map((e) => e.id) ?? []),
  ];
  return { person, role, next, lines, citations, ach, docs };
}

app.post("/api/ai/digest", async (c) => {
  const body = await c.req.json<{ cycleId: string; personId: string; useCloud?: boolean }>();
  const ctx = buildEvidenceContext(body.personId, body.cycleId);
  const cfg = getAiConfig();
  const dataClassesSent = ["dossier_public"];
  let outputText: string;
  let model = "local-grounded";

  const localLines = [
    `Subject: ${ctx.person?.name} — role bar: ${ctx.role?.title ?? "unassigned"}${ctx.next ? ` → next: ${ctx.next.title}` : ""}.`,
    ctx.role
      ? `Current-role expectations in play: ${ctx.role.expectations.length} (stable ids).`
      : "Gap: unassigned role.",
    ...ctx.ach.slice(0, 5).map((item) => `Achievement [${item.id}]: ${item.title} (${item.occurredAt}).`),
    ...ctx.lines.filter((l) => l.startsWith("Goal") || l.startsWith("Feedback") || l.startsWith("Self") || l.startsWith("Peer") || l.startsWith("Gap") || l.startsWith("Thin")).slice(0, 12),
  ];

  if (body.useCloud !== false && cfg.enabled && (cfg.hasApiKey || cfg.localOnly || cfg.provider === "ollama")) {
    try {
      const result = await runChat("evidence_digest", [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: `Produce an 8–12 bullet evidence digest for the manager writing desk.\nCite ids.\n\nEVIDENCE:\n${ctx.lines.join("\n")}`,
        },
      ]);
      outputText = result.text;
      model = result.model;
    } catch (e) {
      outputText = `${localDigest(localLines)}\n\n(Cloud draft failed: ${e instanceof Error ? e.message : "error"} — showing local digest.)`;
    }
  } else {
    outputText = localDigest(localLines);
  }

  const generationId = storeGeneration({
    feature: "evidence_digest",
    subjectPersonId: body.personId,
    cycleId: body.cycleId,
    model,
    outputText,
    citations: ctx.citations,
    dataClassesSent,
  });
  return c.json({ generationId, outputText, citations: ctx.citations, dataClassesSent, model });
});

app.post("/api/ai/draft-section", async (c) => {
  const body = await c.req.json<{
    cycleId: string;
    personId: string;
    section: "summary" | "strengths" | "growth_areas" | "dev_plan" | "role_fit";
  }>();
  const cfg = getAiConfig();
  if (!cfg.enabled) return c.json({ error: "Enable AI in Settings" }, 400);
  const ctx = buildEvidenceContext(body.personId, body.cycleId);
  try {
    const result = await runChat("draft_section", [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: `Draft the manager review section "${body.section}" (2–3 short paragraphs or bullets).
Ground every claim in evidence ids. Section purpose:
- summary: overall narrative vs current role
- strengths: specific strengths
- growth_areas: specific growth
- dev_plan: next-cycle focus
- role_fit: assessment vs current RoleDefinition expectations

EVIDENCE:
${ctx.lines.join("\n")}`,
      },
    ]);
    const generationId = storeGeneration({
      feature: "draft_section",
      subjectPersonId: body.personId,
      cycleId: body.cycleId,
      model: result.model,
      outputText: result.text,
      citations: ctx.citations,
      dataClassesSent: ["dossier_public"],
    });
    return c.json({ generationId, outputText: result.text, section: body.section, model: result.model, citations: ctx.citations });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "AI failed" }, 500);
  }
});

app.post("/api/ai/role-gap", async (c) => {
  const body = await c.req.json<{ cycleId: string; personId: string }>();
  const cfg = getAiConfig();
  if (!cfg.enabled) return c.json({ error: "Enable AI in Settings" }, 400);
  const ctx = buildEvidenceContext(body.personId, body.cycleId);
  if (!ctx.next) return c.json({ error: "No target next role assigned" }, 400);
  try {
    const result = await runChat("role_gap", [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: `For each NEXT-role expectation id, classify demonstrating|emerging|not_yet with a one-line rationale and citations.
Return markdown list: - [rexp_id] mark — rationale [citations]

EVIDENCE:
${ctx.lines.join("\n")}`,
      },
    ]);
    const generationId = storeGeneration({
      feature: "role_gap",
      subjectPersonId: body.personId,
      cycleId: body.cycleId,
      model: result.model,
      outputText: result.text,
      citations: ctx.citations,
      dataClassesSent: ["dossier_public"],
    });
    return c.json({ generationId, outputText: result.text, model: result.model });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "AI failed" }, 500);
  }
});

app.post("/api/ai/test", async (c) => {
  const cfg = getAiConfig();
  try {
    if (cfg.localOnly || cfg.provider === "ollama") {
      const text = await runChat("evidence_digest", [
        { role: "system", content: "Reply with exactly: OK" },
        { role: "user", content: "ping" },
      ]);
      return c.json({ ok: true, model: text.model, sample: text.text.slice(0, 80) });
    }
    if (!cfg.hasApiKey) return c.json({ ok: false, error: "No API key" }, 400);
    const text = await runChat("evidence_digest", [
      { role: "system", content: "Reply with exactly: OK" },
      { role: "user", content: "ping" },
    ]);
    return c.json({ ok: true, model: text.model, sample: text.text.slice(0, 80) });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, 500);
  }
});

app.get("/api/promotions", (c) => {
  const db = getDb();
  const rows = db.select().from(promotionCases).all();
  return c.json(
    rows.map((r) => {
      const person = db.select().from(people).where(eq(people.id, r.personId)).all()[0];
      const current = loadRole(r.currentRoleDefinitionId);
      const target = loadRole(r.targetRoleDefinitionId);
      return {
        id: r.id,
        status: r.status,
        personId: r.personId,
        personName: person?.name,
        currentRole: current?.title,
        targetRole: target?.title,
        cycleId: r.cycleId,
        reviewId: r.reviewId,
        createdAt: r.createdAt,
      };
    }),
  );
});

app.post("/api/promotions", async (c) => {
  const body = await c.req.json<{ personId: string; cycleId?: string }>();
  const db = getDb();
  const a = assignmentFor(body.personId);
  if (!a?.roleDefinitionId || !a.targetNextRoleDefinitionId) {
    return c.json({ error: "Person needs current role and target next role" }, 400);
  }
  const caseId = id("promo");
  const ts = nowIso();
  const reviewId = id("rev");
  db.insert(reviews)
    .values({
      id: reviewId,
      cycleId: body.cycleId ?? "none",
      subjectPersonId: body.personId,
      type: "promotion",
      status: "draft",
      authorName: "Manager",
      payloadJson: JSON.stringify({
        case_summary: "",
        scope_examples: "",
        remaining_gaps: "",
        recommendation: "not_yet",
      }),
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  const next = loadRole(a.targetNextRoleDefinitionId);
  for (const e of next?.expectations ?? []) {
    db.insert(nextLevelAssessments)
      .values({ id: id("nla"), reviewId, roleExpectationId: e.id, mark: "emerging" })
      .run();
  }
  db.insert(promotionCases)
    .values({
      id: caseId,
      personId: body.personId,
      cycleId: body.cycleId ?? null,
      currentRoleDefinitionId: a.roleDefinitionId,
      targetRoleDefinitionId: a.targetNextRoleDefinitionId,
      reviewId,
      status: "draft",
      createdAt: ts,
    })
    .run();
  logActivity("promotion.create", "promotion_case", caseId);
  return c.json({ id: caseId, reviewId });
});

app.get("/api/promotions/:id", (c) => {
  const db = getDb();
  const row = db.select().from(promotionCases).where(eq(promotionCases.id, c.req.param("id"))).all()[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  const person = db.select().from(people).where(eq(people.id, row.personId)).all()[0];
  const review = row.reviewId
    ? db.select().from(reviews).where(eq(reviews.id, row.reviewId)).all()[0]
    : null;
  const assessments = row.reviewId
    ? db.select().from(nextLevelAssessments).where(eq(nextLevelAssessments.reviewId, row.reviewId)).all()
    : [];
  return c.json({
    ...row,
    person: person ? mapPerson(person, assignmentFor(person.id)) : null,
    currentRole: loadRole(row.currentRoleDefinitionId),
    targetRole: loadRole(row.targetRoleDefinitionId),
    review: review
      ? {
          id: review.id,
          status: review.status,
          payload: JSON.parse(review.payloadJson),
        }
      : null,
    assessments,
  });
});

app.put("/api/promotions/:id", async (c) => {
  const body = await c.req.json<{
    status?: string;
    payload?: Record<string, unknown>;
    assessments?: Array<{ roleExpectationId: string; mark: string }>;
  }>();
  const db = getDb();
  const row = db.select().from(promotionCases).where(eq(promotionCases.id, c.req.param("id"))).all()[0];
  if (!row?.reviewId) return c.json({ error: "Not found" }, 404);
  if (body.status) {
    db.update(promotionCases).set({ status: body.status }).where(eq(promotionCases.id, row.id)).run();
  }
  if (body.payload) {
    db.update(reviews)
      .set({ payloadJson: JSON.stringify(body.payload), updatedAt: nowIso(), status: body.status === "submitted" ? "submitted" : "draft" })
      .where(eq(reviews.id, row.reviewId))
      .run();
  }
  if (body.assessments) {
    const old = db.select().from(nextLevelAssessments).where(eq(nextLevelAssessments.reviewId, row.reviewId)).all();
    for (const o of old) db.delete(nextLevelAssessments).where(eq(nextLevelAssessments.id, o.id)).run();
    for (const a of body.assessments) {
      db.insert(nextLevelAssessments)
        .values({ id: id("nla"), reviewId: row.reviewId, roleExpectationId: a.roleExpectationId, mark: a.mark })
        .run();
    }
  }
  return c.json({ ok: true });
});

app.post("/api/ai/promotion-draft", async (c) => {
  const body = await c.req.json<{ promotionId: string }>();
  const db = getDb();
  const row = db.select().from(promotionCases).where(eq(promotionCases.id, body.promotionId)).all()[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  const cfg = getAiConfig();
  if (!cfg.enabled) return c.json({ error: "Enable AI in Settings" }, 400);
  const ctx = buildEvidenceContext(row.personId, row.cycleId ?? undefined);
  try {
    const result = await runChat("promotion_draft", [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: `Draft a promotion case against the NEXT role only.
Return JSON with keys: case_summary, scope_examples, remaining_gaps, recommendation (ready|not_yet).
Map evidence to next-role expectations.

EVIDENCE:
${ctx.lines.join("\n")}`,
      },
    ]);
    const generationId = storeGeneration({
      feature: "promotion_draft",
      subjectPersonId: row.personId,
      cycleId: row.cycleId ?? undefined,
      model: result.model,
      outputText: result.text,
      citations: ctx.citations,
      dataClassesSent: ["dossier_public"],
    });
    return c.json({ generationId, outputText: result.text, model: result.model });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "AI failed" }, 500);
  }
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
