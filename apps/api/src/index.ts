import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq, isNull } from "drizzle-orm";
import {
  achievements,
  activityEvents,
  aiSettings,
  citationSnapshots,
  cycleParticipants,
  cycles,
  documents,
  evidenceLinks,
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
  roleFrameworkVersions,
  workspace,
} from "@prm/db";
import type {
  BiasFinding,
  ConsistencyDTO,
  DecisionLogEntry,
  PacketDTO,
  PersonDTO,
  RoleDefinitionDTO,
  WorkspaceStatus,
} from "@prm/shared";
import { COMPETENCY_CATALOG, MIDDLE_BAND, competencyLabel } from "@prm/shared";
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
import {
  buildChatSystemPrompt,
  buildSystemPrompt,
  getAiConfig,
  localDigest,
  runChat,
  storeGeneration,
  type ChatMessage,
} from "./ai.js";
import { extractCitationIds, filterCitationsAgainstAllowlist } from "./citations.js";
import { runBiasToneLint } from "./bias.js";
import { renderPromotionPacketHtml, renderSubjectPacketHtml } from "./packetHtml.js";
import { localPeerSynthesize } from "./peerSynth.js";

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
    competencyKeys: JSON.parse(role.competencyKeysJson || "[]") as string[],
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
  let thinEvidenceCount = 0;
  if (initialized && unlocked) {
    try {
      const db = getDb();
      name = db.select().from(workspace).limit(1).all()[0]?.name ?? null;
      const allPeople = db.select().from(people).all();
      personCount = allPeople.length;
      const ai = db.select().from(aiSettings).where(eq(aiSettings.id, "default")).all()[0];
      hasAiKey = Boolean(ai?.apiKeyEncrypted);
      aiProvider = ai?.provider ?? null;
      for (const p of allPeople.filter((x) => x.managerId)) {
        const n =
          db.select().from(achievements).where(eq(achievements.personId, p.id)).all().length +
          db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, p.id)).all().length +
          db.select().from(documents).where(eq(documents.personId, p.id)).all().length;
        if (n < 2) thinEvidenceCount += 1;
      }
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
    thinEvidenceCount,
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

  const manager = revs.find((r) => r.type === "manager" && r.status !== "superseded");
  const links = manager
    ? db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, manager.id)).all()
    : [];
  const snaps = manager
    ? db.select().from(citationSnapshots).where(eq(citationSnapshots.reviewId, manager.id)).all()
    : [];

  const achRows = db.select().from(achievements).where(eq(achievements.personId, personId)).all();
  const goalRows = db.select().from(goals).where(eq(goals.personId, personId)).all();
  const fbRows = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, personId)).all();
  const docRows = db.select().from(documents).where(eq(documents.personId, personId)).all();

  const allCycles = db.select().from(cycles).all();
  const priorCandidates = allCycles
    .filter((cy) => cy.id !== cycleId)
    .map((cy) => {
      const mgr = db
        .select()
        .from(reviews)
        .where(and(eq(reviews.cycleId, cy.id), eq(reviews.subjectPersonId, personId), eq(reviews.type, "manager")))
        .all()
        .find((r) => r.status === "finalized" || r.status === "shared");
      return mgr ? { cycle: cy, review: mgr } : null;
    })
    .filter(Boolean) as Array<{ cycle: typeof cycles.$inferSelect; review: typeof reviews.$inferSelect }>;
  priorCandidates.sort((a, b) => b.cycle.windowEnd.localeCompare(a.cycle.windowEnd));
  const prior = priorCandidates[0] ?? null;
  let priorCycle: PacketDTO["priorCycle"] = null;
  if (prior) {
    const p = JSON.parse(prior.review.payloadJson) as Record<string, unknown>;
    priorCycle = {
      cycleId: prior.cycle.id,
      cycleName: prior.cycle.name,
      windowEnd: prior.cycle.windowEnd,
      overall: typeof p.overall === "number" ? p.overall : null,
      summary: String(p.summary ?? ""),
      strengths: String(p.strengths ?? ""),
      growthAreas: String(p.growth_areas ?? ""),
      competencies: (p.competencies ?? {}) as Record<string, number>,
    };
  }

  const timeline: PacketDTO["timeline"] = [];
  for (const a of achRows) {
    timeline.push({
      at: a.occurredAt,
      kind: "achievement",
      title: a.title,
      detail: a.description,
      sourceId: a.id,
    });
  }
  for (const f of fbRows) {
    timeline.push({
      at: f.occurredAt,
      kind: "feedback",
      title: `Feedback (${f.kind}) from ${f.fromName ?? "someone"}`,
      detail: f.body.slice(0, 200),
      sourceId: f.id,
    });
  }
  for (const d of docRows) {
    timeline.push({
      at: d.occurredAt,
      kind: "document",
      title: d.title,
      detail: d.filename,
      sourceId: d.id,
    });
  }
  for (const g of goalRows) {
    timeline.push({
      at: g.createdAt?.slice(0, 10) ?? g.createdAt,
      kind: "goal",
      title: g.title,
      detail: g.status,
      sourceId: g.id,
    });
  }
  for (const cand of priorCandidates.slice(0, 3)) {
    const p = JSON.parse(cand.review.payloadJson) as Record<string, unknown>;
    timeline.push({
      at: cand.cycle.windowEnd,
      kind: "prior_review",
      title: `${cand.cycle.name} manager review`,
      detail: `Overall ${p.overall ?? "—"} · ${(String(p.summary ?? "")).slice(0, 160)}`,
      sourceId: cand.review.id,
    });
  }
  timeline.sort((a, b) => b.at.localeCompare(a.at));

  const packet: PacketDTO = {
    person: mapPerson(person, a),
    currentRole,
    nextRole,
    selfReview: revs.find((r) => r.type === "self") ? mapRev(revs.find((r) => r.type === "self")!) : null,
    peerReviews: revs.filter((r) => r.type === "peer").map(mapRev),
    managerReview: manager ? mapRev(manager) : null,
    goals: goalRows.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
    })),
    achievements: achRows.map((row) => ({
      id: row.id,
      title: row.title,
      occurredAt: row.occurredAt,
      description: row.description,
    })),
    feedback: fbRows.map((f) => ({
      id: f.id,
      fromName: f.fromName,
      kind: f.kind,
      body: f.body,
      occurredAt: f.occurredAt,
    })),
    documents: docRows.map((d) => ({
      id: d.id,
      title: d.title,
      visibility: d.visibility as PacketDTO["documents"][number]["visibility"],
    })),
    evidenceLinks: links.map((l) => ({
      id: l.id,
      targetType: l.targetType,
      targetKey: l.targetKey,
      sourceType: l.sourceType,
      sourceId: l.sourceId,
    })),
    citationSnapshots: snaps.map((s) => ({
      id: s.id,
      sourceType: s.sourceType,
      sourceId: s.sourceId,
      title: s.title,
      excerpt: s.excerpt,
      checksum: s.checksum,
    })),
    priorCycle,
    timeline: timeline.slice(0, 40),
    flags,
  };
  return c.json(packet);
});

function resolveEvidenceSnapshot(
  personId: string,
  sourceType: string,
  sourceId: string,
): { title: string; excerpt: string | null; checksum: string | null } | null {
  const db = getDb();
  if (sourceType === "achievement") {
    const row = db.select().from(achievements).where(eq(achievements.id, sourceId)).all()[0];
    if (!row || row.personId !== personId) return null;
    return { title: row.title, excerpt: row.description, checksum: null };
  }
  if (sourceType === "goal") {
    const row = db.select().from(goals).where(eq(goals.id, sourceId)).all()[0];
    if (!row || row.personId !== personId) return null;
    return { title: row.title, excerpt: row.description, checksum: null };
  }
  if (sourceType === "feedback") {
    const row = db.select().from(feedbackItems).where(eq(feedbackItems.id, sourceId)).all()[0];
    if (!row || row.toPersonId !== personId) return null;
    return {
      title: `Feedback from ${row.fromName ?? "someone"} (${row.kind})`,
      excerpt: row.body.slice(0, 280),
      checksum: null,
    };
  }
  if (sourceType === "document") {
    const row = db.select().from(documents).where(eq(documents.id, sourceId)).all()[0];
    if (!row || row.personId !== personId) return null;
    let hash: string | null = null;
    try {
      hash = checksum(readDocumentFile(row.storagePath));
    } catch {
      hash = null;
    }
    return { title: row.title, excerpt: row.filename, checksum: hash };
  }
  if (sourceType === "role_expectation") {
    const row = db.select().from(roleExpectations).where(eq(roleExpectations.id, sourceId)).all()[0];
    if (!row) return null;
    return { title: `Expectation (${row.kind})`, excerpt: row.text, checksum: null };
  }
  return null;
}

function inferSourceType(sourceId: string): string {
  if (sourceId.startsWith("ach_")) return "achievement";
  if (sourceId.startsWith("goal_")) return "goal";
  if (sourceId.startsWith("fb_")) return "feedback";
  if (sourceId.startsWith("doc_")) return "document";
  if (sourceId.startsWith("rexp_")) return "role_expectation";
  return "unknown";
}

app.put("/api/reviews/manager", async (c) => {
  const body = await c.req.json<{
    cycleId: string;
    subjectPersonId: string;
    payload: Record<string, unknown>;
    status?: string;
    decisionReason?: string;
    gapAssessments?: Array<{ roleExpectationId: string; mark: string }>;
    evidenceLinks?: Array<{
      targetType: string;
      targetKey: string;
      sourceType: string;
      sourceId: string;
    }>;
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

  const nextStatus = body.status ?? existing?.status ?? "draft";
  const competencies = (body.payload.competencies ?? {}) as Record<string, number>;
  const links = body.evidenceLinks ?? [];
  const prevPayload = existing ? (JSON.parse(existing.payloadJson) as Record<string, unknown>) : {};
  const prevComps = (prevPayload.competencies ?? {}) as Record<string, number>;
  const prevOverall = typeof prevPayload.overall === "number" ? prevPayload.overall : null;
  const nextOverall = typeof body.payload.overall === "number" ? body.payload.overall : null;
  const prevPromo = String(prevPayload.promo_readiness ?? "");
  const nextPromo = String(body.payload.promo_readiness ?? "");

  const ratingChanges: Array<{ field: string; from: unknown; to: unknown }> = [];
  if (prevOverall !== null && nextOverall !== null && prevOverall !== nextOverall) {
    ratingChanges.push({ field: "overall", from: prevOverall, to: nextOverall });
  }
  for (const [key, score] of Object.entries(competencies)) {
    if (typeof score !== "number") continue;
    if (prevComps[key] != null && prevComps[key] !== score) {
      ratingChanges.push({ field: `competency:${key}`, from: prevComps[key], to: score });
    }
  }
  if (prevPromo && nextPromo && prevPromo !== nextPromo) {
    ratingChanges.push({ field: "promo_readiness", from: prevPromo, to: nextPromo });
  }

  if (ratingChanges.length && !(body.decisionReason ?? "").trim()) {
    return c.json(
      {
        error: "Decision reason required when overall, competency, or promo readiness scores change.",
        code: "decision_reason_required",
        changes: ratingChanges,
      },
      400,
    );
  }

  if (nextStatus === "finalized" || nextStatus === "shared") {
    const missing: string[] = [];
    for (const [key, score] of Object.entries(competencies)) {
      if (typeof score !== "number") continue;
      if (score === MIDDLE_BAND) continue;
      const has = links.some((l) => l.targetType === "competency" && l.targetKey === key);
      if (!has) missing.push(competencyLabel(key));
    }
    const overall = Number(body.payload.overall ?? MIDDLE_BAND);
    if (overall !== MIDDLE_BAND) {
      const hasAny = links.length > 0;
      if (!hasAny) missing.push("overall rating");
    }
    if ((overall === 1 || overall === 5) && links.length < 2) {
      missing.push("extreme overall (1 or 5) needs ≥2 evidence links");
    }
    if (missing.length) {
      return c.json(
        {
          error: `Evidence density gate failed. Missing links for: ${missing.join(", ")}`,
          code: "evidence_required",
          missing,
        },
        400,
      );
    }
  }

  const ts = nowIso();
  let reviewId = existing?.id;
  if (existing) {
    db.update(reviews)
      .set({
        payloadJson: JSON.stringify(body.payload),
        status: nextStatus,
        updatedAt: ts,
      })
      .where(eq(reviews.id, existing.id))
      .run();
  } else {
    reviewId = id("rev");
    db.insert(reviews)
      .values({
        id: reviewId!,
        cycleId: body.cycleId,
        subjectPersonId: body.subjectPersonId,
        type: "manager",
        status: nextStatus,
        authorName: "Manager",
        payloadJson: JSON.stringify(body.payload),
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }

  if (body.gapAssessments && reviewId) {
    const old = db.select().from(nextLevelAssessments).where(eq(nextLevelAssessments.reviewId, reviewId)).all();
    for (const row of old) {
      db.delete(nextLevelAssessments).where(eq(nextLevelAssessments.id, row.id)).run();
    }
    for (const g of body.gapAssessments) {
      db.insert(nextLevelAssessments)
        .values({
          id: id("nla"),
          reviewId,
          roleExpectationId: g.roleExpectationId,
          mark: g.mark,
        })
        .run();
    }
  }

  if (body.evidenceLinks && reviewId) {
    const oldLinks = db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, reviewId)).all();
    for (const row of oldLinks) db.delete(evidenceLinks).where(eq(evidenceLinks.id, row.id)).run();
    for (const link of body.evidenceLinks) {
      db.insert(evidenceLinks)
        .values({
          id: id("elink"),
          reviewId,
          targetType: link.targetType,
          targetKey: link.targetKey,
          sourceType: link.sourceType,
          sourceId: link.sourceId,
          createdAt: ts,
        })
        .run();
    }
  }

  if ((nextStatus === "finalized" || nextStatus === "shared") && reviewId) {
    const oldSnaps = db.select().from(citationSnapshots).where(eq(citationSnapshots.reviewId, reviewId)).all();
    for (const row of oldSnaps) db.delete(citationSnapshots).where(eq(citationSnapshots.id, row.id)).run();

    const cited = new Map<string, { sourceType: string; sourceId: string }>();
    for (const link of links) {
      cited.set(`${link.sourceType}:${link.sourceId}`, {
        sourceType: link.sourceType,
        sourceId: link.sourceId,
      });
    }
    const narrative = [
      body.payload.summary,
      body.payload.strengths,
      body.payload.growth_areas,
      body.payload.dev_plan,
      body.payload.role_fit,
    ]
      .map((x) => String(x ?? ""))
      .join("\n");
    for (const cid of extractCitationIds(narrative)) {
      const sourceType = inferSourceType(cid);
      cited.set(`${sourceType}:${cid}`, { sourceType, sourceId: cid });
    }

    for (const item of cited.values()) {
      const snap = resolveEvidenceSnapshot(body.subjectPersonId, item.sourceType, item.sourceId);
      if (!snap) continue;
      db.insert(citationSnapshots)
        .values({
          id: id("csnap"),
          reviewId,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          title: snap.title,
          excerpt: snap.excerpt,
          checksum: snap.checksum,
          createdAt: ts,
        })
        .run();
    }
    logActivity("review.finalize", "review", reviewId, {
      snapshots: cited.size,
      evidenceLinks: links.length,
    });
  }

  if (ratingChanges.length && reviewId) {
    logActivity("review.decision", "review", reviewId, {
      reason: (body.decisionReason ?? "").trim(),
      changes: ratingChanges,
      cycleId: body.cycleId,
      subjectPersonId: body.subjectPersonId,
    });
  }

  logActivity("review.save", "review", reviewId, { type: "manager", status: nextStatus });
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

app.post("/api/people/:id/feedback", async (c) => {
  const personId = c.req.param("id");
  const body = await c.req.json<{
    body: string;
    fromName?: string;
    kind?: string;
    visibility?: string;
    occurredAt?: string;
  }>();
  if (!body.body?.trim()) return c.json({ error: "Feedback body required" }, 400);
  const db = getDb();
  const fbId = id("fb");
  db.insert(feedbackItems).values({
    id: fbId,
    toPersonId: personId,
    fromName: body.fromName?.trim() || null,
    kind: body.kind ?? "coaching",
    body: body.body.trim(),
    visibility: body.visibility ?? "em_and_subject",
    occurredAt: body.occurredAt ?? nowIso().slice(0, 10),
    createdAt: nowIso(),
  }).run();
  logActivity("feedback.create", "person", personId, { feedbackId: fbId });
  return c.json({ id: fbId });
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
  const cfg = getAiConfig();
  const allowDocExtract =
    cfg.localOnly || cfg.provider === "ollama" || cfg.documentExtractEgress;
  const dataClassesSent = ["dossier_public"] as string[];

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
  for (const d of docs) {
    lines.push(`Document [${d.id}] (${d.visibility}): ${d.title} @ ${d.occurredAt}`);
    const ext = (d.filename.split(".").pop() ?? "").toLowerCase();
    const textLike =
      ["txt", "md", "csv"].includes(ext) ||
      (d.mimeType ?? "").startsWith("text/") ||
      d.mimeType === "text/markdown" ||
      d.mimeType === "text/csv";
    if (allowDocExtract && textLike) {
      try {
        const raw = readDocumentFile(d.storagePath).toString("utf8").slice(0, 4000);
        if (raw.trim()) {
          lines.push(`Document extract [${d.id}]:\n${raw.trim()}`);
          if (!dataClassesSent.includes("document_extract")) dataClassesSent.push("document_extract");
        }
      } catch {
        /* missing file */
      }
    } else if (textLike && !allowDocExtract) {
      lines.push(`Document extract [${d.id}]: (held back — enable document extract egress or local-only AI)`);
    }
  }
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
  return { person, role, next, lines, citations, ach, docs, dataClassesSent };
}

/** Compact workspace pack for chat when no single person is scoped. Caps per-person rows. */
function buildWorkspaceContext(cycleId?: string) {
  const db = getDb();
  const cfg = getAiConfig();
  const allowDocExtract =
    cfg.localOnly || cfg.provider === "ollama" || cfg.documentExtractEgress;
  const dataClassesSent = ["dossier_public"] as string[];
  const allPeople = db.select().from(people).all();
  const allCycles = db.select().from(cycles).all();
  const allPromos = db.select().from(promotionCases).all();
  const allRoles = db.select().from(roleDefinitions).all();
  const lines: string[] = [];
  const citations: string[] = [];

  lines.push(`Workspace roster (${allPeople.length} people):`);
  for (const p of allPeople) {
    const a = assignmentFor(p.id);
    const role = loadRole(a?.roleDefinitionId);
    const next = loadRole(a?.targetNextRoleDefinitionId);
    lines.push(
      `Person [${p.id}] ${p.name} — ${p.title ?? "no title"} / ${p.levelKey ?? "?"} · role=${role?.title ?? "unassigned"} · next=${next?.title ?? "none"}`,
    );
  }

  lines.push(`Role definitions (${allRoles.length}):`);
  for (const r of allRoles) {
    const expectations = db
      .select()
      .from(roleExpectations)
      .where(eq(roleExpectations.roleDefinitionId, r.id))
      .all();
    lines.push(`Role [${r.id}] ${r.title} (${r.track}/${r.levelKey}): ${r.summary ?? ""}`);
    for (const e of expectations.slice(0, 8)) {
      lines.push(`  Expectation [${e.id}] (${e.kind}): ${e.text}`);
      citations.push(e.id);
    }
  }

  lines.push(`Cycles (${allCycles.length}):`);
  for (const cycle of allCycles) {
    const n = db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycle.id)).all().length;
    lines.push(`Cycle [${cycle.id}] ${cycle.name} (${cycle.status}) ${cycle.windowStart}→${cycle.windowEnd}, ${n} participants`);
  }

  if (allPromos.length) {
    lines.push(`Promotion cases (${allPromos.length}):`);
    for (const promo of allPromos) {
      const person = allPeople.find((p) => p.id === promo.personId);
      const current = loadRole(promo.currentRoleDefinitionId);
      const target = loadRole(promo.targetRoleDefinitionId);
      lines.push(
        `Promo [${promo.id}] ${person?.name ?? promo.personId}: ${current?.title ?? "?"} → ${target?.title ?? "?"} (${promo.status})`,
      );
    }
  }

  const directs = allPeople.filter((p) => p.managerId);
  for (const p of directs) {
    const ach = db.select().from(achievements).where(eq(achievements.personId, p.id)).all().slice(0, 6);
    const g = db.select().from(goals).where(eq(goals.personId, p.id)).all().slice(0, 6);
    const fb = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, p.id)).all().slice(0, 6);
    const docs = db.select().from(documents).where(eq(documents.personId, p.id)).all().slice(0, 4);
    if (!ach.length && !g.length && !fb.length && !docs.length) continue;
    lines.push(`--- Evidence for ${p.name} [${p.id}] ---`);
    for (const item of ach) {
      lines.push(`Achievement [${item.id}] ${item.occurredAt}: ${item.title}. ${item.description ?? ""}`);
      citations.push(item.id);
    }
    for (const item of g) {
      lines.push(`Goal [${item.id}] (${item.status}): ${item.title}`);
      citations.push(item.id);
    }
    for (const item of fb) {
      lines.push(`Feedback [${item.id}] from ${item.fromName ?? "someone"}: ${item.body}`);
      citations.push(item.id);
    }
    for (const d of docs) {
      lines.push(`Document [${d.id}] (${d.visibility}): ${d.title} @ ${d.occurredAt}`);
      citations.push(d.id);
      const ext = (d.filename.split(".").pop() ?? "").toLowerCase();
      const textLike =
        ["txt", "md", "csv"].includes(ext) ||
        (d.mimeType ?? "").startsWith("text/") ||
        d.mimeType === "text/markdown" ||
        d.mimeType === "text/csv";
      if (allowDocExtract && textLike) {
        try {
          const raw = readDocumentFile(d.storagePath).toString("utf8").slice(0, 2500);
          if (raw.trim()) {
            lines.push(`Document extract [${d.id}]:\n${raw.trim()}`);
            if (!dataClassesSent.includes("document_extract")) dataClassesSent.push("document_extract");
          }
        } catch {
          /* missing */
        }
      }
    }
    if (cycleId) {
      const revs = db
        .select()
        .from(reviews)
        .where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, p.id)))
        .all();
      const self = revs.find((r) => r.type === "self");
      if (self) lines.push(`Self-review [${self.id}] JSON: ${self.payloadJson}`);
      for (const peer of revs.filter((r) => r.type === "peer")) {
        lines.push(`Peer-review [${peer.id}] author=${peer.authorName}: ${peer.payloadJson}`);
      }
    }
  }

  return { lines, citations, scopeLabel: "entire workspace" as const, dataClassesSent };
}

app.post("/api/ai/digest", async (c) => {
  const body = await c.req.json<{ cycleId: string; personId: string; useCloud?: boolean }>();
  const ctx = buildEvidenceContext(body.personId, body.cycleId);
  const cfg = getAiConfig();
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

  const filtered = filterCitationsAgainstAllowlist(outputText, ctx.citations);
  outputText = filtered.text;

  const generationId = storeGeneration({
    feature: "evidence_digest",
    subjectPersonId: body.personId,
    cycleId: body.cycleId,
    model,
    outputText,
    citations: filtered.citationsUsed,
    dataClassesSent: ctx.dataClassesSent,
  });
  return c.json({
    generationId,
    outputText,
    citations: filtered.citationsUsed,
    citationsDropped: filtered.citationsDropped,
    dataClassesSent: ctx.dataClassesSent,
    model,
  });
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
    const filtered = filterCitationsAgainstAllowlist(result.text, ctx.citations);
    const generationId = storeGeneration({
      feature: "draft_section",
      subjectPersonId: body.personId,
      cycleId: body.cycleId,
      model: result.model,
      outputText: filtered.text,
      citations: filtered.citationsUsed,
      dataClassesSent: ctx.dataClassesSent,
    });
    return c.json({
      generationId,
      outputText: filtered.text,
      section: body.section,
      model: result.model,
      citations: filtered.citationsUsed,
      citationsDropped: filtered.citationsDropped,
      dataClassesSent: ctx.dataClassesSent,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "AI failed" }, 500);
  }
});

app.post("/api/ai/peer-synthesize", async (c) => {
  const body = await c.req.json<{ cycleId: string; personId: string; useCloud?: boolean }>();
  const db = getDb();
  const peers = db
    .select()
    .from(reviews)
    .where(
      and(eq(reviews.cycleId, body.cycleId), eq(reviews.subjectPersonId, body.personId), eq(reviews.type, "peer")),
    )
    .all();
  if (!peers.length) return c.json({ error: "No peer imports for this person/cycle" }, 400);

  const ctx = buildEvidenceContext(body.personId, body.cycleId);
  const peerInputs = peers.map((p) => ({
    authorName: p.authorName,
    payload: JSON.parse(p.payloadJson) as Record<string, unknown>,
  }));
  const peerBlock = peerInputs
    .map(
      (p, i) =>
        `### Peer ${i + 1} (author EM-visible: ${p.authorName ?? "unknown"})\n${JSON.stringify(p.payload, null, 2)}`,
    )
    .join("\n\n");

  const cfg = getAiConfig();
  let outputText: string;
  let model = "local-heuristic";

  if (body.useCloud !== false && cfg.enabled && (cfg.hasApiKey || cfg.localOnly || cfg.provider === "ollama")) {
    try {
      const result = await runChat("peer_synthesize", [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: `Synthesize peer feedback into themes for the manager writing desk.
Return markdown with: ## Themes (strength / growth bullets), ## Representative quotes (short), ## Caveats.
Cite only provided [ach_…] / [rexp_…] / [fb_…] ids. Do not invent evidence. Stay advisory.

Peer imports:
${peerBlock}

Related evidence ids (optional citations):
${ctx.citations.slice(0, 40).join(", ") || "(none)"}`,
        },
      ]);
      outputText = result.text;
      model = result.model;
    } catch (e) {
      outputText = `${localPeerSynthesize(peerInputs)}\n\n(Cloud synthesize failed: ${e instanceof Error ? e.message : "error"} — showing local rollup.)`;
    }
  } else {
    outputText = localPeerSynthesize(peerInputs);
  }

  const filtered = filterCitationsAgainstAllowlist(outputText, ctx.citations);
  const generationId = storeGeneration({
    feature: "peer_synthesize",
    subjectPersonId: body.personId,
    cycleId: body.cycleId,
    model,
    outputText: filtered.text,
    citations: filtered.citationsUsed,
    dataClassesSent: ctx.dataClassesSent,
  });
  return c.json({
    generationId,
    outputText: filtered.text,
    model,
    citations: filtered.citationsUsed,
    citationsDropped: filtered.citationsDropped,
    dataClassesSent: ctx.dataClassesSent,
  });
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
    const filtered = filterCitationsAgainstAllowlist(result.text, ctx.citations);
    const generationId = storeGeneration({
      feature: "role_gap",
      subjectPersonId: body.personId,
      cycleId: body.cycleId,
      model: result.model,
      outputText: filtered.text,
      citations: filtered.citationsUsed,
      dataClassesSent: ctx.dataClassesSent,
    });
    return c.json({
      generationId,
      outputText: filtered.text,
      model: result.model,
      citationsDropped: filtered.citationsDropped,
      dataClassesSent: ctx.dataClassesSent,
    });
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

const MAX_CHAT_MESSAGES = 24;
const MAX_CHAT_MESSAGE_CHARS = 4000;

app.post("/api/ai/chat", async (c) => {
  const body = await c.req.json<{
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    personId?: string | null;
    cycleId?: string | null;
  }>();
  const cfg = getAiConfig();
  if (!cfg.enabled) return c.json({ error: "Enable AI in Settings" }, 400);

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (!incoming.length) return c.json({ error: "messages required" }, 400);
  if (incoming.length > MAX_CHAT_MESSAGES) {
    return c.json({ error: `At most ${MAX_CHAT_MESSAGES} messages per request` }, 400);
  }
  for (const m of incoming) {
    if (m.role !== "user" && m.role !== "assistant") {
      return c.json({ error: "Each message role must be user or assistant" }, 400);
    }
    if (typeof m.content !== "string" || !m.content.trim()) {
      return c.json({ error: "Each message needs non-empty content" }, 400);
    }
    if (m.content.length > MAX_CHAT_MESSAGE_CHARS) {
      return c.json({ error: `Message too long (max ${MAX_CHAT_MESSAGE_CHARS} chars)` }, 400);
    }
  }
  if (incoming[incoming.length - 1]?.role !== "user") {
    return c.json({ error: "Last message must be from the user" }, 400);
  }

  const personId = body.personId || undefined;
  const cycleId = body.cycleId || undefined;
  if (personId) {
    const person = getDb().select().from(people).where(eq(people.id, personId)).all()[0];
    if (!person) return c.json({ error: "Person not found" }, 404);
  }

  const ctx = personId
    ? (() => {
        const evidence = buildEvidenceContext(personId, cycleId);
        return {
          lines: evidence.lines,
          citations: evidence.citations,
          scopeLabel: evidence.person?.name ? `person: ${evidence.person.name}` : `person: ${personId}`,
          dataClassesSent: evidence.dataClassesSent,
        };
      })()
    : buildWorkspaceContext(cycleId);

  const history: ChatMessage[] = incoming.map((m) => ({ role: m.role, content: m.content.trim() }));
  const packed: ChatMessage[] = [
    { role: "system", content: buildChatSystemPrompt() },
    {
      role: "user",
      content: `WORKSPACE EVIDENCE (scope=${ctx.scopeLabel}${cycleId ? `; cycle=${cycleId}` : ""}):\n${ctx.lines.join("\n")}\n\nUse only this evidence for the conversation that follows. Acknowledge the scope briefly only if asked.`,
    },
    {
      role: "assistant",
      content: "Understood. I will answer only from the provided workspace evidence and cite ids when making claims.",
    },
    ...history,
  ];

  try {
    const result = await runChat("chat_dossier", packed);
    const filtered = filterCitationsAgainstAllowlist(result.text, ctx.citations);
    const generationId = storeGeneration({
      feature: "chat_dossier",
      subjectPersonId: personId,
      cycleId,
      model: result.model,
      outputText: filtered.text,
      citations: filtered.citationsUsed,
      dataClassesSent: ctx.dataClassesSent,
    });
    return c.json({
      generationId,
      reply: filtered.text,
      model: result.model,
      provider: result.provider,
      citations: filtered.citationsUsed,
      citationsDropped: filtered.citationsDropped,
      dataClassesSent: ctx.dataClassesSent,
      scopeLabel: ctx.scopeLabel,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "AI failed" }, 500);
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
    decisionReason?: string;
    assessments?: Array<{ roleExpectationId: string; mark: string }>;
  }>();
  const db = getDb();
  const row = db.select().from(promotionCases).where(eq(promotionCases.id, c.req.param("id"))).all()[0];
  if (!row?.reviewId) return c.json({ error: "Not found" }, 404);

  const review = db.select().from(reviews).where(eq(reviews.id, row.reviewId)).all()[0];
  const prevPayload = review ? (JSON.parse(review.payloadJson) as Record<string, unknown>) : {};
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  if (body.status && body.status !== row.status) {
    changes.push({ field: "status", from: row.status, to: body.status });
  }
  if (body.payload) {
    const prevRec = String(prevPayload.recommendation ?? "");
    const nextRec = String(body.payload.recommendation ?? "");
    if (prevRec && nextRec && prevRec !== nextRec) {
      changes.push({ field: "recommendation", from: prevRec, to: nextRec });
    }
  }
  if (changes.length && !(body.decisionReason ?? "").trim()) {
    return c.json(
      {
        error: "Decision reason required when promo status or recommendation changes.",
        code: "decision_reason_required",
        changes,
      },
      400,
    );
  }

  if (body.status) {
    db.update(promotionCases).set({ status: body.status }).where(eq(promotionCases.id, row.id)).run();
  }
  if (body.payload) {
    db.update(reviews)
      .set({
        payloadJson: JSON.stringify(body.payload),
        updatedAt: nowIso(),
        status: body.status === "submitted" ? "submitted" : "draft",
      })
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
  if (changes.length) {
    logActivity("promo.decision", "promotion_case", row.id, {
      reason: (body.decisionReason ?? "").trim(),
      changes,
      personId: row.personId,
    });
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
    const filtered = filterCitationsAgainstAllowlist(result.text, ctx.citations);
    const generationId = storeGeneration({
      feature: "promotion_draft",
      subjectPersonId: row.personId,
      cycleId: row.cycleId ?? undefined,
      model: result.model,
      outputText: filtered.text,
      citations: filtered.citationsUsed,
      dataClassesSent: ctx.dataClassesSent,
    });
    return c.json({
      generationId,
      outputText: filtered.text,
      model: result.model,
      citationsDropped: filtered.citationsDropped,
      dataClassesSent: ctx.dataClassesSent,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "AI failed" }, 500);
  }
});

app.post("/api/ai/bias-lint", async (c) => {
  const body = await c.req.json<{
    cycleId?: string;
    personId?: string;
    text?: string;
  }>();
  let text = body.text?.trim() ?? "";
  if (!text && body.cycleId && body.personId) {
    const db = getDb();
    const manager = db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.cycleId, body.cycleId),
          eq(reviews.subjectPersonId, body.personId),
          eq(reviews.type, "manager"),
        ),
      )
      .all()
      .find((r) => r.status !== "superseded");
    if (manager) {
      const p = JSON.parse(manager.payloadJson) as Record<string, unknown>;
      text = [p.summary, p.strengths, p.growth_areas, p.dev_plan, p.role_fit].map((x) => String(x ?? "")).join("\n\n");
    }
  }
  const findings: BiasFinding[] = runBiasToneLint(text);
  return c.json({ findings, ephemeral: true });
});

app.get("/api/consistency", (c) => {
  const cycleId = c.req.query("cycleId");
  const db = getDb();
  const cycle = cycleId
    ? db.select().from(cycles).where(eq(cycles.id, cycleId)).all()[0]
    : db.select().from(cycles).all().sort((a, b) => b.windowStart.localeCompare(a.windowStart))[0];
  if (!cycle) return c.json({ error: "No cycle found" }, 404);

  const participants = db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycle.id)).all();
  const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, unset: 0 };
  const cards: ConsistencyDTO["cards"] = [];

  for (const cp of participants) {
    const person = db.select().from(people).where(eq(people.id, cp.personId)).all()[0];
    if (!person) continue;
    const a = assignmentFor(cp.personId);
    const role = loadRole(cp.roleDefinitionId ?? a?.roleDefinitionId);
    const manager = db
      .select()
      .from(reviews)
      .where(and(eq(reviews.cycleId, cycle.id), eq(reviews.subjectPersonId, cp.personId), eq(reviews.type, "manager")))
      .all()
      .find((r) => r.status !== "superseded");
    const payload = manager ? (JSON.parse(manager.payloadJson) as Record<string, unknown>) : {};
    const overall = typeof payload.overall === "number" ? payload.overall : null;
    if (overall != null && overall >= 1 && overall <= 5) distribution[String(overall)] += 1;
    else distribution.unset += 1;

    const comps = (payload.competencies ?? {}) as Record<string, number>;
    const allLinks = manager
      ? db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, manager.id)).all()
      : [];
    const linkCount = allLinks.length;
    const flags: string[] = [];
    let evidenceGaps = 0;
    if (!role) flags.push("unassigned_role");
    if (overall != null && overall !== MIDDLE_BAND && linkCount === 0) {
      flags.push("missing_evidence");
      evidenceGaps += 1;
    }
    if ((overall === 1 || overall === 5) && linkCount < 2) {
      flags.push("extreme_overall_thin");
      evidenceGaps += 1;
    }
    for (const [k, score] of Object.entries(comps)) {
      if (score !== MIDDLE_BAND) {
        const has = allLinks.some((l) => l.targetType === "competency" && l.targetKey === k);
        if (!has) {
          flags.push(`thin:${k}`);
          evidenceGaps += 1;
        }
      }
    }

    cards.push({
      personId: person.id,
      personName: person.name,
      title: person.title,
      roleTitle: role?.title ?? null,
      overall,
      competencies: comps,
      evidenceLinkCount: linkCount,
      evidenceGaps,
      managerStatus: manager?.status ?? "missing",
      flags,
    });
  }

  cards.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0) || a.personName.localeCompare(b.personName));

  const result: ConsistencyDTO = {
    cycleId: cycle.id,
    cycleName: cycle.name,
    distribution,
    cards,
  };
  return c.json(result);
});

app.get("/api/activity", (c) => {
  const db = getDb();
  const action = c.req.query("action");
  const entityId = c.req.query("entityId");
  const personId = c.req.query("personId");
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 40)));
  let rows = db.select().from(activityEvents).all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (action) rows = rows.filter((r) => r.action === action);
  if (entityId) rows = rows.filter((r) => r.entityId === entityId);
  if (personId) {
    rows = rows.filter((r) => {
      if (r.entityType === "person" && r.entityId === personId) return true;
      try {
        const detail = JSON.parse(r.detailJson) as Record<string, unknown>;
        return detail.subjectPersonId === personId || detail.personId === personId;
      } catch {
        return false;
      }
    });
  }
  const entries: DecisionLogEntry[] = rows.slice(0, limit).map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    detail: JSON.parse(r.detailJson) as Record<string, unknown>,
    createdAt: r.createdAt,
  }));
  return c.json({ entries });
});

app.get("/api/workspace/thin-dossiers", (c) => {
  const db = getDb();
  const allPeople = db.select().from(people).all().filter((p) => p.managerId);
  const items = allPeople.map((p) => {
    const a = assignmentFor(p.id);
    const ach = db.select().from(achievements).where(eq(achievements.personId, p.id)).all().length;
    const fb = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, p.id)).all().length;
    const docs = db.select().from(documents).where(eq(documents.personId, p.id)).all().length;
    const goalsN = db.select().from(goals).where(eq(goals.personId, p.id)).all().length;
    const evidenceCount = ach + fb + docs;
    return {
      personId: p.id,
      name: p.name,
      title: p.title,
      roleTitle: a?.roleTitle ?? null,
      achievementCount: ach,
      feedbackCount: fb,
      documentCount: docs,
      goalCount: goalsN,
      evidenceCount,
      thin: evidenceCount < 2,
    };
  });
  items.sort((a, b) => a.evidenceCount - b.evidenceCount || a.name.localeCompare(b.name));
  return c.json({
    thinCount: items.filter((i) => i.thin).length,
    items,
  });
});

app.get("/api/exports/subject/:cycleId/:personId", (c) => {
  const db = getDb();
  const cycleId = c.req.param("cycleId");
  const personId = c.req.param("personId");
  const format = (c.req.query("format") ?? "json").toLowerCase();
  const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
  const cycle = db.select().from(cycles).where(eq(cycles.id, cycleId)).all()[0];
  const manager = db
    .select()
    .from(reviews)
    .where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, personId), eq(reviews.type, "manager")))
    .all()
    .find((r) => r.status !== "superseded");
  if (!person || !manager) return c.json({ error: "Manager review required" }, 400);
  const payload = JSON.parse(manager.payloadJson) as Record<string, unknown>;
  const { private_notes, promo_readiness, ...shared } = payload;
  void private_notes;
  void promo_readiness;
  const peers = db
    .select()
    .from(reviews)
    .where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, personId), eq(reviews.type, "peer")))
    .all()
    .map((r) => ({
      strengths: (JSON.parse(r.payloadJson) as { strengths?: string }).strengths,
      growth: (JSON.parse(r.payloadJson) as { growth?: string }).growth,
    }));
  const a = assignmentFor(personId);
  const role = loadRole(a?.roleDefinitionId);
  const snaps = db
    .select()
    .from(citationSnapshots)
    .where(eq(citationSnapshots.reviewId, manager.id))
    .all()
    .map((s) => ({ title: s.title, excerpt: s.excerpt, sourceId: s.sourceId }));
  const competencies = (shared.competencies ?? {}) as Record<string, number>;
  const competencyLabels = Object.fromEntries(COMPETENCY_CATALOG.map((x) => [x.key, x.name]));
  const exportedAt = nowIso();

  const allCycles = db.select().from(cycles).all();
  const priorCandidates = allCycles
    .filter((cy) => cy.id !== cycleId)
    .map((cy) => {
      const mgr = db
        .select()
        .from(reviews)
        .where(and(eq(reviews.cycleId, cy.id), eq(reviews.subjectPersonId, personId), eq(reviews.type, "manager")))
        .all()
        .find((r) => r.status === "finalized" || r.status === "shared");
      return mgr ? { cycle: cy, review: mgr } : null;
    })
    .filter(Boolean) as Array<{ cycle: typeof cycles.$inferSelect; review: typeof reviews.$inferSelect }>;
  priorCandidates.sort((a, b) => b.cycle.windowEnd.localeCompare(a.cycle.windowEnd));
  const priorRow = priorCandidates[0] ?? null;
  let priorCycle: {
    cycleName: string;
    windowEnd: string;
    overall: number | null;
    summary: string;
    strengths: string;
    growthAreas: string;
  } | null = null;
  if (priorRow) {
    const p = JSON.parse(priorRow.review.payloadJson) as Record<string, unknown>;
    priorCycle = {
      cycleName: priorRow.cycle.name,
      windowEnd: priorRow.cycle.windowEnd,
      overall: typeof p.overall === "number" ? p.overall : null,
      summary: String(p.summary ?? ""),
      strengths: String(p.strengths ?? ""),
      growthAreas: String(p.growth_areas ?? ""),
    };
  }

  const timeline: Array<{ at: string; kind: string; title: string; detail?: string | null }> = [];
  for (const aRow of db.select().from(achievements).where(eq(achievements.personId, personId)).all()) {
    timeline.push({ at: aRow.occurredAt, kind: "achievement", title: aRow.title, detail: aRow.description });
  }
  for (const f of db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, personId)).all()) {
    timeline.push({
      at: f.occurredAt,
      kind: "feedback",
      title: `Feedback (${f.kind})`,
      detail: f.body.slice(0, 160),
    });
  }
  for (const cand of priorCandidates.slice(0, 3)) {
    const p = JSON.parse(cand.review.payloadJson) as Record<string, unknown>;
    timeline.push({
      at: cand.cycle.windowEnd,
      kind: "prior_review",
      title: `${cand.cycle.name} manager review`,
      detail: `Overall ${p.overall ?? "—"}`,
    });
  }
  timeline.sort((a, b) => b.at.localeCompare(a.at));
  const timelineSlice = timeline.slice(0, 24);

  if (format === "html" || format === "pdf") {
    const html = renderSubjectPacketHtml({
      subjectName: person.name,
      roleTitle: role?.title,
      cycleName: cycle?.name,
      summary: String(shared.summary ?? ""),
      strengths: String(shared.strengths ?? ""),
      growthAreas: String(shared.growth_areas ?? ""),
      devPlan: String(shared.dev_plan ?? ""),
      roleFit: String(shared.role_fit ?? ""),
      overall: typeof shared.overall === "number" ? shared.overall : null,
      competencies,
      competencyLabels,
      peerThemes: peers,
      citationSnapshots: snaps,
      priorCycle,
      timeline: timelineSlice,
      exportedAt,
    });
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `inline; filename="${person.name.replace(/\s+/g, "-").toLowerCase()}-review.html"`,
      },
    });
  }

  return c.json({
    subject: person.name,
    notice: "Author names for peer input are hidden in this shared packet — not cryptographically anonymous.",
    summary: shared.summary,
    strengths: shared.strengths,
    growth_areas: shared.growth_areas,
    dev_plan: shared.dev_plan,
    overall: shared.overall,
    role_fit: shared.role_fit,
    competencies,
    peerThemes: peers,
    citationSnapshots: snaps,
    priorCycle,
    timeline: timelineSlice,
    exportedAt,
  });
});

app.get("/api/exports/promotion/:id", (c) => {
  const db = getDb();
  const row = db.select().from(promotionCases).where(eq(promotionCases.id, c.req.param("id"))).all()[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  const person = db.select().from(people).where(eq(people.id, row.personId)).all()[0];
  const current = loadRole(row.currentRoleDefinitionId);
  const target = loadRole(row.targetRoleDefinitionId);
  const review = row.reviewId
    ? db.select().from(reviews).where(eq(reviews.id, row.reviewId)).all()[0]
    : null;
  const payload = review ? (JSON.parse(review.payloadJson) as Record<string, unknown>) : {};
  const assessments = review
    ? db
        .select()
        .from(nextLevelAssessments)
        .where(eq(nextLevelAssessments.reviewId, review.id))
        .all()
        .map((a) => {
          const exp = db.select().from(roleExpectations).where(eq(roleExpectations.id, a.roleExpectationId)).all()[0];
          return { text: exp?.text ?? a.roleExpectationId, mark: a.mark };
        })
    : [];
  const exportedAt = nowIso();
  const format = (c.req.query("format") ?? "html").toLowerCase();
  const html = renderPromotionPacketHtml({
    personName: person?.name ?? row.personId,
    currentRole: current?.title,
    targetRole: target?.title,
    caseSummary: String(payload.case_summary ?? ""),
    scopeExamples: String(payload.scope_examples ?? ""),
    remainingGaps: String(payload.remaining_gaps ?? ""),
    recommendation: String(payload.recommendation ?? ""),
    assessments,
    exportedAt,
  });
  if (format === "json") {
    return c.json({
      personName: person?.name,
      currentRole: current?.title,
      targetRole: target?.title,
      payload,
      assessments,
      exportedAt,
    });
  }
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="promo-${(person?.name ?? "case").replace(/\s+/g, "-").toLowerCase()}.html"`,
    },
  });
});

const port = Number(process.env.PRM_PORT ?? 8787);
console.log(`PRM API listening on http://127.0.0.1:${port}`);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
