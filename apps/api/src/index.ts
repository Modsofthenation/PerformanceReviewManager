import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { access, readFile } from "node:fs/promises";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
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
  roleFrameworks,
  workspace,
  concernLogs,
  meetingSummaries,
  integrationSettings,
  personExternalLinks,
} from "@prm/db";
import type {
  BiasFinding,
  ConsistencyDTO,
  DecisionLogEntry,
  PacketDTO,
  PersonDTO,
  RoleDefinitionDTO,
  RoleDraftDTO,
  RoleFrameworkInfo,
  WorkspaceStatus,
  ConcernLogDTO,
  CycleStatsDTO,
  DeadlineNudge,
  IntegrationProvider,
  IntegrationRemoteUser,
  IntegrationSettingsDTO,
  IntegrationSyncResult,
  PersonExternalLinkDTO,
  TeamPerformanceDTO,
  ReviewDTO,
} from "@prm/shared";
import { COMPETENCY_CATALOG, MIDDLE_BAND, competencyLabel } from "@prm/shared";
import { seedWorkspace } from "./seed.js";
import { seedDefaultRoleFramework } from "./seedDefaultRoleFramework.js";
import { buildTeamPerformance } from "./teamPerformance.js";
import type { TeamPerformancePersonInput } from "./teamPerformance.js";
import { loadCycleCompare, loadPersonTimeline, loadRatingTrends, loadSprintPulse } from "./analyticsGather.js";
import {
  checksum,
  encryptSecret,
  encryptionStatus,
  getDb,
  getSqlite,
  getSessionToken,
  getWorkspaceSecret,
  id,
  isInitialized,
  lockVault,
  logActivity,
  nowIso,
  requireSession,
  bootstrapVault,
  destroyWorkspace,
  unlockVault,
  writeEncryptedDocument,
  writeFrameworkFile,
  readDocumentFile,
  exportAuditPack,
  verifyActivityChain,
  createEncryptedBackup,
  listEncryptedBackups,
  restoreEncryptedBackup,
  dataDirSyncRisk,
} from "./store.js";
import {
  checkAuthRateLimit,
  clearAuthFailures,
  recordAuthFailure,
  validateWorkspacePassword,
} from "./authPolicy.js";
import { timingSafeEqual } from "node:crypto";
import {
  buildChatSystemPrompt,
  buildSystemPrompt,
  getAiConfig,
  localDigest,
  normalizeAiProvider,
  probeCursorCloudKey,
  resolveCursorBaseUrl,
  runChat,
  storeGeneration,
  type ChatMessage,
} from "./ai.js";
import { CURSOR_CLOUD_API_BASE } from "./cursorCloud.js";
import { extractCitationIds, filterCitationsAgainstAllowlist } from "./citations.js";
import { runBiasToneLint } from "./bias.js";
import { mergeLintFindings, runFaithfulnessLint } from "./faithfulness.js";
import { registerP1Routes } from "./p1Routes.js";
import { registerOneOnOneRoutes } from "./oneOnOnes.js";
import { indexReviewFts } from "./reviewSearch.js";
import { renderPromotionPacketHtml, renderSubjectPacketHtml } from "./packetHtml.js";
import {
  enhancePromotionCommitteeHtml,
  renderCalibRoomHtml,
  renderDirectorBriefingHtml,
  bumpDistribution,
  emptyDistribution,
} from "./directorPacks.js";
import { buildDirectorAttention, buildDirectorBriefing } from "./directorGather.js";
import { readonlyBundleFilename, sealReadonlyBundle } from "./readonlyBundle.js";
import { localPeerSynthesize } from "./peerSynth.js";
import { bitbucketSearchMembers, bitbucketTestConnection } from "./bitbucket.js";
import { githubSearchUsers, githubTestConnection } from "./github.js";
import { jiraSearchUsers, jiraTestConnection } from "./jira.js";
import { linearSearchUsers, linearViewer } from "./linear.js";
import { buildDeliveryRollup } from "./deliveryRollup.js";
import {
  ensureIntegrationRow,
  getBitbucketConfig,
  getGitHubConfig,
  getJiraConfig,
  getLinearConfig,
  syncPersonIntegrations,
} from "./integrations.js";
import { registerFeatureRoutes, bundleFieldsForKind } from "./featureRoutes.js";
import {
  buildPersonTimeline,
  collectRatingChanges,
  evidenceDensityErrors,
  isShareableVisibility,
  looksLikeMeetingDoc,
  redactSnapshotForSubject,
  resolveEvidenceSnapshot,
  validateEvidenceLinks,
  type EvidenceLinkInput,
  type TimelineEntry,
} from "./evidenceGates.js";
import { parsePeopleCsv } from "./peopleCsv.js";
import {
  FRAMEWORK_EXTRACT_SYSTEM,
  parseExtractedRolesJson,
  parseFrameworkTextLocal,
  slugifyRoleKey,
  textFromUpload,
  type RoleDraft,
} from "./roleFramework.js";

type Vars = { token: string };

const app = new Hono<{ Variables: Vars }>();

const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
  "tauri://localhost",
  "https://tauri.localhost",
  "http://tauri.localhost",
  "https://asset.localhost",
  "http://asset.localhost",
];

function corsOrigin(origin: string): string | null {
  if (CORS_ORIGINS.includes(origin)) return origin;
  // Packaged Tauri custom-protocol hosts only — not arbitrary *.localhost
  if (/^https?:\/\/(?:tauri|asset)\.localhost(?::\d+)?$/i.test(origin)) return origin;
  if (origin.startsWith("tauri://")) return origin;
  return null;
}

function launchTokenMatches(hdr: string, launch: string) {
  try {
    const a = Buffer.from(hdr);
    const b = Buffer.from(launch);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

app.use(
  "*",
  cors({
    origin: (origin) => (origin ? corsOrigin(origin) : CORS_ORIGINS[0]),
    credentials: true,
    allowHeaders: ["Content-Type", "x-prm-token", "x-prm-launch-token"],
  }),
);

/** When PRM_LAUNCH_TOKEN is set (desktop sidecar), require matching header on every API call. */
app.use("/api/*", async (c, next) => {
  const launch = process.env.PRM_LAUNCH_TOKEN?.trim();
  if (launch) {
    if (c.req.path === "/api/health") return next();
    const hdr = c.req.header("x-prm-launch-token") ?? "";
    if (!launchTokenMatches(hdr, launch)) {
      return c.json({ error: "Invalid or missing launch token", code: "launch_token_required" }, 401);
    }
  }
  return next();
});

app.use("/api/*", async (c, next) => {
  if (
    c.req.path === "/api/health" ||
    c.req.path === "/api/workspace/status" ||
    c.req.path === "/api/workspace/init" ||
    c.req.path === "/api/workspace/unlock" ||
    c.req.path === "/api/workspace/destroy"
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
          db.select().from(documents).where(eq(documents.personId, p.id)).all().length +
          db.select().from(goals).where(eq(goals.personId, p.id)).all().length;
        if (n < 2) thinEvidenceCount += 1;
      }
    } catch {
      /* locked */
    }
  }
  const syncRisk = dataDirSyncRisk();
  const body: WorkspaceStatus & { encryptedAtRest: boolean } = {
    initialized,
    unlocked,
    name,
    personCount,
    hasAiKey,
    aiProvider,
    thinEvidenceCount,
    encryptedAtRest: enc.encryptedAtRest,
    dataDirSyncRisk: syncRisk.risky,
    dataDirSyncWarning: syncRisk.warning,
  };
  return c.json(body);
});

app.post("/api/workspace/init", async (c) => {
  if (isInitialized()) return c.json({ error: "Already initialized" }, 400);
  const body = await c.req.json<{ name?: string; password?: string; seed?: boolean; emName?: string }>();
  const pw = validateWorkspacePassword(body.password);
  if (!pw.ok) return c.json({ error: pw.error }, 400);
  // Seed only when explicitly requested — never default to demo data.
  if (body.seed === true) {
    const result = await seedWorkspace({ name: body.name, password: pw.password });
    return c.json({ ...result, token: getSessionToken(), encryptedAtRest: false });
  }
  const { hash, salt } = bootstrapVault(pw.password);
  const db = getDb();
  const wsId = id("ws");
  db.insert(workspace)
    .values({
      id: wsId,
      name: body.name || "My Team",
      createdAt: nowIso(),
      settingsJson: JSON.stringify({ onboarding: { completed: false, step: "team", skipped: {} } }),
      passwordHash: hash,
      passwordSalt: salt,
    })
    .run();
  db.insert(aiSettings).values({ id: "default", enabled: 0, provider: "anthropic" }).run();
  const { frameworkVersionId, roleIds } = seedDefaultRoleFramework(db, {
    ownerName: (body.emName ?? "").trim() || "Workspace EM",
  });
  const emNameTrimmed = (body.emName ?? "").trim();
  let emPersonId: string | null = null;
  if (emNameTrimmed) {
    emPersonId = id("person");
    const createdAt = nowIso();
    db.insert(people)
      .values({
        id: emPersonId,
        name: emNameTrimmed,
        email: null,
        title: "Engineering Manager",
        levelKey: "M1",
        managerId: null,
        hireDate: null,
        status: "active",
        createdAt,
      })
      .run();
    const emRoleId = roleIds.eng_m1;
    if (emRoleId) {
      db.insert(roleAssignments)
        .values({
          id: id("ra"),
          personId: emPersonId,
          roleDefinitionId: emRoleId,
          frameworkVersionId,
          targetNextRoleDefinitionId: roleIds.eng_m2 ?? null,
          effectiveFrom: createdAt.slice(0, 10),
          assignedByAccountId: null,
        })
        .run();
    }
    logActivity("person.create", "person", emPersonId, { name: emNameTrimmed, role: "em" });
  }
  logActivity("workspace.init", "workspace", wsId);
  return c.json({ workspaceId: wsId, token: getSessionToken(), emPersonId });
});

app.post("/api/workspace/unlock", async (c) => {
  if (!isInitialized()) return c.json({ error: "Not initialized" }, 400);
  const limited = checkAuthRateLimit("unlock");
  if (limited) return c.json({ error: limited, code: "rate_limited" }, 429);
  const { password } = await c.req.json<{ password: string }>();
  try {
    const token = unlockVault(password);
    clearAuthFailures("unlock");
    const db = getDb();
    const ws = db.select().from(workspace).limit(1).all()[0];
    logActivity("workspace.unlock", "workspace", ws?.id);
    return c.json({ token, name: ws?.name, encryptedAtRest: false });
  } catch (e) {
    recordAuthFailure("unlock");
    return c.json({ error: e instanceof Error ? e.message : "Unlock failed" }, 401);
  }
});

app.post("/api/workspace/lock", (c) => {
  lockVault();
  return c.json({ ok: true, encryptedAtRest: true });
});

/** Wipe local vault + data so a new empty/demo workspace can be created. Public (password-gated). */
app.post("/api/workspace/destroy", async (c) => {
  if (!isInitialized()) return c.json({ error: "No workspace to delete" }, 400);
  const limited = checkAuthRateLimit("destroy");
  if (limited) return c.json({ error: limited, code: "rate_limited" }, 429);
  const body = await c.req.json<{ password?: string; confirm?: string }>();
  if (body.confirm !== "DELETE") {
    return c.json({ error: 'Type confirm: "DELETE" to erase the workspace' }, 400);
  }
  if (!body.password) return c.json({ error: "password required" }, 400);
  try {
    destroyWorkspace(body.password);
    clearAuthFailures("destroy");
    return c.json({ ok: true, initialized: false });
  } catch (e) {
    recordAuthFailure("destroy");
    const err = e as Error & { code?: string };
    const status =
      err.message === "Invalid password" ? 401 : err.code === "legal_hold" ? 403 : 400;
    return c.json({ error: err.message || "Destroy failed", code: err.code }, status);
  }
});

app.get("/api/workspace/backups", (c) => {
  return c.json({ backups: listEncryptedBackups() });
});

app.post("/api/workspace/backup", async (c) => {
  const body = await c.req.json<{ label?: string }>().catch(() => ({}) as { label?: string });
  try {
    const result = createEncryptedBackup(body.label);
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Backup failed" }, 500);
  }
});

app.post("/api/workspace/restore", async (c) => {
  const body = await c.req.json<{ filename: string; confirm?: boolean }>();
  if (!body.filename) return c.json({ error: "filename required" }, 400);
  if (!body.confirm) return c.json({ error: "confirm: true required" }, 400);
  try {
    const result = restoreEncryptedBackup(body.filename);
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Restore failed" }, 500);
  }
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

app.get("/api/people/import/template", (c) => {
  const csv = "name,email,title,levelKey,hireDate\nMaya Chen,maya@example.com,Senior Software Engineer,IC4,2024-03-01\n";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="prm-people-template.csv"',
    },
  });
});

app.post("/api/people/import", async (c) => {
  const body = await c.req.json<{
    rows?: Array<{
      name?: string;
      email?: string;
      title?: string;
      levelKey?: string;
      hireDate?: string;
    }>;
    csv?: string;
    defaultManagerId?: string | null;
  }>();
  const db = getDb();
  const em =
    body.defaultManagerId ||
    db.select().from(people).all().find((p) => !p.managerId)?.id ||
    null;

  let rows = body.rows ?? [];
  if ((!rows.length || body.csv) && body.csv) {
    try {
      rows = parsePeopleCsv(body.csv);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Invalid CSV" }, 400);
    }
  }
  if (!rows.length) return c.json({ error: "No rows to import" }, 400);
  if (rows.length > 500) return c.json({ error: "Max 500 rows per import" }, 400);
  if (!em) {
    return c.json(
      {
        error:
          "Create an EM (a person with no manager) before importing directs, or pass defaultManagerId.",
      },
      400,
    );
  }

  const existing = db.select().from(people).all();
  const byEmail = new Map(
    existing.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p] as const),
  );
  const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p] as const));

  const created: Array<{ id: string; name: string }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const name = String(row.name ?? "").trim();
    if (!name) {
      errors.push({ row: i + 1, message: "name required" });
      continue;
    }
    const email = row.email?.trim() || undefined;
    if (email && byEmail.has(email.toLowerCase())) {
      skipped.push({ name, reason: `duplicate email ${email}` });
      continue;
    }
    if (byName.has(name.toLowerCase())) {
      skipped.push({ name, reason: "duplicate name" });
      continue;
    }
    const personId = id("person");
    db.insert(people)
      .values({
        id: personId,
        name,
        email: email ?? null,
        title: row.title?.trim() || null,
        levelKey: row.levelKey?.trim() || null,
        managerId: em,
        hireDate: row.hireDate?.trim() || null,
        status: "active",
        createdAt: nowIso(),
      })
      .run();
    created.push({ id: personId, name });
    byName.set(name.toLowerCase(), { id: personId } as (typeof existing)[0]);
    if (email) byEmail.set(email.toLowerCase(), { id: personId } as (typeof existing)[0]);
  }

  logActivity("person.import", "workspace", em, {
    created: created.length,
    skipped: skipped.length,
    errors: errors.length,
  });
  return c.json({ created, skipped, errors });
});

app.get("/api/roles", (c) => {
  const db = getDb();
  const published = getPublishedVersion();
  if (!published) return c.json([]);
  const roles = db.select().from(roleDefinitions).where(eq(roleDefinitions.frameworkVersionId, published.id)).all();
  return c.json(roles.map((r) => loadRole(r.id)));
});

app.get("/api/roles/framework", (c) => {
  const info = frameworkInfo();
  return c.json(info ?? { frameworkId: null, frameworkName: null, versionId: null, versionLabel: null, sourceFilename: null, roleCount: 0, ownerName: null, effectiveFrom: null, effectiveTo: null, insufficient: [] });
});

function getPublishedVersion() {
  const db = getDb();
  const versions = db.select().from(roleFrameworkVersions).all();
  return versions.filter((v) => v.status === "published").sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] ?? null;
}

function ensurePublishedVersion() {
  const db = getDb();
  const existing = getPublishedVersion();
  if (existing) return existing;
  const fwId = id("fw");
  const fwvId = id("fwv");
  const createdAt = nowIso();
  db.insert(roleFrameworks).values({ id: fwId, name: "Custom Career Framework", createdAt }).run();
  db.insert(roleFrameworkVersions)
    .values({
      id: fwvId,
      frameworkId: fwId,
      versionLabel: "draft.1",
      status: "published",
      publishedAt: createdAt,
      sourceFilename: null,
    })
    .run();
  return db.select().from(roleFrameworkVersions).where(eq(roleFrameworkVersions.id, fwvId)).all()[0]!;
}

function frameworkInsufficient(versionId: string): string[] {
  const db = getDb();
  const warnings: string[] = [];
  const roles = db.select().from(roleDefinitions).where(eq(roleDefinitions.frameworkVersionId, versionId)).all();
  if (roles.length === 0) warnings.push("No role definitions in the published version.");
  const keys = new Set(roles.map((r) => r.key));
  for (const role of roles) {
    const exps = db.select().from(roleExpectations).where(eq(roleExpectations.roleDefinitionId, role.id)).all();
    if (exps.length === 0) warnings.push(`Role “${role.title}” has no expectations.`);
    for (const next of JSON.parse(role.nextRoleKeysJson) as string[]) {
      if (!keys.has(next)) warnings.push(`Role “${role.title}” points to missing next key “${next}”.`);
    }
  }
  const directs = db.select().from(people).all().filter((p) => p.managerId && p.status === "active");
  const unassigned = directs.filter((p) => !assignmentFor(p.id));
  if (unassigned.length) warnings.push(`${unassigned.length} active direct(s) have no role assignment.`);
  return warnings;
}

function frameworkInfo(): RoleFrameworkInfo | null {
  const db = getDb();
  const version = getPublishedVersion();
  if (!version) return null;
  const fw = db.select().from(roleFrameworks).where(eq(roleFrameworks.id, version.frameworkId)).all()[0];
  const roleCount = db
    .select()
    .from(roleDefinitions)
    .where(eq(roleDefinitions.frameworkVersionId, version.id))
    .all().length;
  return {
    frameworkId: version.frameworkId,
    frameworkName: fw?.name ?? "Career Framework",
    versionId: version.id,
    versionLabel: version.versionLabel,
    sourceFilename: version.sourceFilename,
    roleCount,
    ownerName: version.ownerName ?? null,
    effectiveFrom: version.effectiveFrom ?? null,
    effectiveTo: version.effectiveTo ?? null,
    insufficient: frameworkInsufficient(version.id),
  };
}

function defaultCompetencyKeys(track: string): string[] {
  return track === "manager"
    ? ["execution", "ownership", "collaboration", "impact", "people_leadership", "org_influence"]
    : ["execution", "technical_depth", "ownership", "collaboration", "impact", "growth_leadership"];
}

function uniqueRoleKey(frameworkVersionId: string, desired: string, excludeId?: string): string {
  const db = getDb();
  const existing = db
    .select()
    .from(roleDefinitions)
    .where(eq(roleDefinitions.frameworkVersionId, frameworkVersionId))
    .all()
    .filter((r) => r.id !== excludeId)
    .map((r) => r.key);
  let key = desired || slugifyRoleKey("role");
  if (!existing.includes(key)) return key;
  let i = 2;
  while (existing.includes(`${key}_${i}`)) i += 1;
  return `${key}_${i}`;
}

function insertRoleDraft(frameworkVersionId: string, draft: RoleDraft) {
  const db = getDb();
  const roleId = id("role");
  const key = uniqueRoleKey(frameworkVersionId, draft.key || slugifyRoleKey(draft.title, draft.levelKey));
  db.insert(roleDefinitions)
    .values({
      id: roleId,
      frameworkVersionId,
      key,
      title: draft.title,
      track: draft.track,
      levelKey: draft.levelKey,
      summary: draft.summary,
      nextRoleKeysJson: JSON.stringify(draft.nextRoleKeys ?? []),
      competencyKeysJson: JSON.stringify(defaultCompetencyKeys(draft.track)),
    })
    .run();
  draft.expectations.forEach((exp, idx) => {
    db.insert(roleExpectations)
      .values({
        id: id("rexp"),
        roleDefinitionId: roleId,
        kind: exp.kind,
        text: exp.text,
        sortOrder: idx,
      })
      .run();
  });
  return roleId;
}

function replaceExpectations(roleId: string, expectations: Array<{ id?: string; kind: string; text: string; sortOrder?: number }>) {
  const db = getDb();
  const existing = db.select().from(roleExpectations).where(eq(roleExpectations.roleDefinitionId, roleId)).all();
  for (const row of existing) {
    db.delete(roleExpectations).where(eq(roleExpectations.id, row.id)).run();
  }
  expectations.forEach((exp, idx) => {
    db.insert(roleExpectations)
      .values({
        id: exp.id && exp.id.startsWith("rexp_") ? exp.id : id("rexp"),
        roleDefinitionId: roleId,
        kind: exp.kind === "expectation" ? "expectation" : "responsibility",
        text: exp.text,
        sortOrder: exp.sortOrder ?? idx,
      })
      .run();
  });
}

app.post("/api/roles", async (c) => {
  const body = await c.req.json<{
    key?: string;
    title: string;
    track?: string;
    levelKey?: string | null;
    summary?: string | null;
    nextRoleKeys?: string[];
    expectations?: Array<{ kind?: string; text: string }>;
  }>();
  if (!body.title?.trim()) return c.json({ error: "title required" }, 400);
  const version = ensurePublishedVersion();
  const draft: RoleDraft = {
    key: body.key?.trim() || slugifyRoleKey(body.title, body.levelKey),
    title: body.title.trim(),
    track: body.track === "manager" || body.track === "other" ? body.track : "ic",
    levelKey: body.levelKey?.trim() || null,
    summary: body.summary?.trim() || null,
    nextRoleKeys: body.nextRoleKeys ?? [],
    expectations: (body.expectations ?? [])
      .filter((e) => e.text?.trim())
      .map((e) => ({
        kind: e.kind === "expectation" ? ("expectation" as const) : ("responsibility" as const),
        text: e.text.trim(),
      })),
  };
  const roleId = insertRoleDraft(version.id, draft);
  logActivity("role.create", "role", roleId, { title: draft.title, levelKey: draft.levelKey });
  return c.json(loadRole(roleId));
});

app.put("/api/roles/:id", async (c) => {
  const roleId = c.req.param("id");
  const db = getDb();
  const role = db.select().from(roleDefinitions).where(eq(roleDefinitions.id, roleId)).all()[0];
  if (!role) return c.json({ error: "Role not found" }, 404);
  const body = await c.req.json<{
    key?: string;
    title?: string;
    track?: string;
    levelKey?: string | null;
    summary?: string | null;
    nextRoleKeys?: string[];
    expectations?: Array<{ id?: string; kind?: string; text: string; sortOrder?: number }>;
  }>();
  const title = body.title?.trim() || role.title;
  const levelKey = body.levelKey === undefined ? role.levelKey : body.levelKey?.trim() || null;
  const track = body.track === "manager" || body.track === "other" || body.track === "ic" ? body.track : role.track;
  const key = uniqueRoleKey(
    role.frameworkVersionId,
    body.key?.trim() || role.key,
    roleId,
  );
  db.update(roleDefinitions)
    .set({
      key,
      title,
      track,
      levelKey,
      summary: body.summary === undefined ? role.summary : body.summary?.trim() || null,
      nextRoleKeysJson:
        body.nextRoleKeys === undefined ? role.nextRoleKeysJson : JSON.stringify(body.nextRoleKeys),
    })
    .where(eq(roleDefinitions.id, roleId))
    .run();
  if (body.expectations) {
    replaceExpectations(
      roleId,
      body.expectations.filter((e) => e.text?.trim()).map((e) => ({
        id: e.id,
        kind: e.kind ?? "responsibility",
        text: e.text.trim(),
        sortOrder: e.sortOrder,
      })),
    );
  }
  logActivity("role.update", "role", roleId, { title });
  return c.json(loadRole(roleId));
});

app.delete("/api/roles/:id", (c) => {
  const roleId = c.req.param("id");
  const db = getDb();
  const role = db.select().from(roleDefinitions).where(eq(roleDefinitions.id, roleId)).all()[0];
  if (!role) return c.json({ error: "Role not found" }, 404);
  const assigned = db.select().from(roleAssignments).where(eq(roleAssignments.roleDefinitionId, roleId)).all();
  const targeted = db
    .select()
    .from(roleAssignments)
    .where(eq(roleAssignments.targetNextRoleDefinitionId, roleId))
    .all();
  if (assigned.length || targeted.length) {
    return c.json({ error: "Role is assigned to people — reassign them first", code: "role_in_use" }, 409);
  }
  const expectations = db.select().from(roleExpectations).where(eq(roleExpectations.roleDefinitionId, roleId)).all();
  for (const e of expectations) db.delete(roleExpectations).where(eq(roleExpectations.id, e.id)).run();
  db.delete(roleDefinitions).where(eq(roleDefinitions.id, roleId)).run();
  logActivity("role.delete", "role", roleId, { title: role.title });
  return c.json({ ok: true });
});

app.post("/api/roles/framework/upload", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Expected multipart form upload" }, 400);
  }
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === "string") return c.json({ error: "file required" }, 400);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["pdf", "docx", "txt", "md", "csv"].includes(ext)) {
    return c.json({ error: "Allowlisted: pdf, docx, txt, md, csv" }, 400);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > 25 * 1024 * 1024) return c.json({ error: "Max 25MB" }, 400);
  const safeFilename = basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
  const saved = writeFrameworkFile(safeFilename, buf);
  const version = ensurePublishedVersion();
  const db = getDb();
  db.update(roleFrameworkVersions)
    .set({ sourceFilename: saved.storageName })
    .where(eq(roleFrameworkVersions.id, version.id))
    .run();
  let extractedText: string | null = null;
  let extractError: string | null = null;
  try {
    extractedText = textFromUpload(buf, safeFilename);
  } catch (e) {
    extractError = e instanceof Error ? e.message : "Could not extract text";
  }
  logActivity("framework.upload", "framework_version", version.id, {
    filename: safeFilename,
    bytes: saved.byteSize,
  });
  return c.json({
    ok: true,
    storageName: saved.storageName,
    filename: safeFilename,
    byteSize: saved.byteSize,
    textChars: extractedText?.length ?? 0,
    textPreview: extractedText?.slice(0, 2000) ?? null,
    extractError,
    framework: frameworkInfo(),
  });
});

app.post("/api/roles/extract", async (c) => {
  const body = await c.req.json<{
    text?: string;
    useAi?: boolean;
  }>();
  const text = body.text?.trim() ?? "";
  if (!text) return c.json({ error: "text required — paste framework content or upload a readable .txt/.md first" }, 400);
  if (text.length > 120_000) return c.json({ error: "Text too long (max ~120k chars)" }, 400);

  const useAi = body.useAi !== false;
  const cfg = getAiConfig();
  let roles: RoleDraft[] = [];
  let mode: "ai" | "local" = "local";
  let model: string | null = null;
  let warning: string | null = null;

  if (useAi && cfg.enabled && (cfg.localOnly || cfg.provider === "ollama" || cfg.hasApiKey)) {
    try {
      const result = await runChat("framework_extract", [
        { role: "system", content: FRAMEWORK_EXTRACT_SYSTEM },
        {
          role: "user",
          content: `Extract RoleDefinitions from this career framework document:\n\n${text.slice(0, 100_000)}`,
        },
      ]);
      roles = parseExtractedRolesJson(result.text);
      mode = "ai";
      model = result.model;
      storeGeneration({
        feature: "framework_extract",
        model: result.model,
        outputText: result.text.slice(0, 50_000),
        citations: [],
        dataClassesSent: ["framework_document"],
      });
      if (!roles.length) {
        warning = "AI returned no roles — fell back to local parser";
        roles = parseFrameworkTextLocal(text);
        mode = "local";
      }
    } catch (e) {
      warning = e instanceof Error ? e.message : "AI extract failed";
      roles = parseFrameworkTextLocal(text);
      mode = "local";
    }
  } else {
    if (useAi && !cfg.enabled) warning = "AI disabled — using local parser. Enable AI in Settings for better extract.";
    else if (useAi && !cfg.hasApiKey && cfg.provider !== "ollama" && !cfg.localOnly) {
      warning = "No API key — using local parser.";
    }
    roles = parseFrameworkTextLocal(text);
  }

  if (!roles.length) {
    return c.json({
      error: "No roles detected. Try markdown headings (# IC4 — Title) with bullet lists, or enable AI.",
      roles: [],
      mode,
      model,
      warning,
    }, 400);
  }

  logActivity("framework.extract", "framework_version", getPublishedVersion()?.id ?? null, {
    mode,
    count: roles.length,
  });
  return c.json({ roles: roles as RoleDraftDTO[], mode, model, warning });
});

app.post("/api/roles/import", async (c) => {
  const body = await c.req.json<{
    roles: RoleDraft[];
    replace?: boolean;
  }>();
  const drafts = body.roles ?? [];
  if (!drafts.length) return c.json({ error: "roles required" }, 400);
  if (drafts.length > 40) return c.json({ error: "Max 40 roles per import" }, 400);

  const version = ensurePublishedVersion();
  const db = getDb();

  if (body.replace) {
    const existing = db
      .select()
      .from(roleDefinitions)
      .where(eq(roleDefinitions.frameworkVersionId, version.id))
      .all();
    for (const role of existing) {
      const inUse =
        db.select().from(roleAssignments).where(eq(roleAssignments.roleDefinitionId, role.id)).all().length > 0 ||
        db.select().from(roleAssignments).where(eq(roleAssignments.targetNextRoleDefinitionId, role.id)).all()
          .length > 0;
      if (inUse) {
        return c.json(
          { error: `Cannot replace: ${role.title} is still assigned. Reassign people or import without replace.` },
          409,
        );
      }
    }
    for (const role of existing) {
      const exps = db.select().from(roleExpectations).where(eq(roleExpectations.roleDefinitionId, role.id)).all();
      for (const e of exps) db.delete(roleExpectations).where(eq(roleExpectations.id, e.id)).run();
      db.delete(roleDefinitions).where(eq(roleDefinitions.id, role.id)).run();
    }
  }

  const created: RoleDefinitionDTO[] = [];
  for (const draft of drafts) {
    if (!draft.title?.trim()) continue;
    const roleId = insertRoleDraft(version.id, {
      key: draft.key || slugifyRoleKey(draft.title, draft.levelKey),
      title: draft.title.trim(),
      track: draft.track === "manager" || draft.track === "other" ? draft.track : "ic",
      levelKey: draft.levelKey ?? null,
      summary: draft.summary ?? null,
      nextRoleKeys: draft.nextRoleKeys ?? [],
      expectations: (draft.expectations ?? [])
        .filter((e) => e.text?.trim())
        .map((e) => ({
          kind: e.kind === "expectation" ? ("expectation" as const) : ("responsibility" as const),
          text: e.text.trim(),
        })),
    });
    const loaded = loadRole(roleId);
    if (loaded) created.push(loaded);
  }

  logActivity("framework.import", "framework_version", version.id, {
    created: created.length,
    replace: Boolean(body.replace),
  });
  return c.json({ created, framework: frameworkInfo() });
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

app.post("/api/roles/assign-bulk", async (c) => {
  const body = await c.req.json<{
    assignments?: Array<{
      personId: string;
      roleDefinitionId: string;
      targetNextRoleDefinitionId?: string | null;
    }>;
  }>();
  const list = body.assignments ?? [];
  if (!list.length) return c.json({ error: "assignments required" }, 400);
  if (list.length > 100) return c.json({ error: "Max 100 assignments" }, 400);
  const db = getDb();
  const today = nowIso().slice(0, 10);
  let saved = 0;
  const errors: string[] = [];
  for (const item of list) {
    if (!item.personId || !item.roleDefinitionId) {
      errors.push("Missing personId or roleDefinitionId");
      continue;
    }
    const role = db.select().from(roleDefinitions).where(eq(roleDefinitions.id, item.roleDefinitionId)).all()[0];
    if (!role) {
      errors.push(`Role not found for ${item.personId}`);
      continue;
    }
    const existing = db
      .select()
      .from(roleAssignments)
      .where(and(eq(roleAssignments.personId, item.personId), isNull(roleAssignments.effectiveTo)))
      .all();
    for (const row of existing) {
      db.update(roleAssignments).set({ effectiveTo: today }).where(eq(roleAssignments.id, row.id)).run();
    }
    db.insert(roleAssignments)
      .values({
        id: id("ra"),
        personId: item.personId,
        roleDefinitionId: item.roleDefinitionId,
        frameworkVersionId: role.frameworkVersionId,
        targetNextRoleDefinitionId: item.targetNextRoleDefinitionId ?? null,
        effectiveFrom: today,
      })
      .run();
    saved += 1;
  }
  logActivity("role.assign_bulk", "workspace", null, { saved, errors: errors.length });
  return c.json({ ok: true, saved, errors });
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
    selfDue?: string;
    peerDue?: string;
    managerDue?: string;
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
        phaseStatusJson: JSON.stringify({
          self: "pending",
          peer: "pending",
          manager: "draft",
          selfDue: body.selfDue ?? body.windowEnd,
          peerDue: body.peerDue ?? body.windowEnd,
          managerDue: body.managerDue ?? body.windowEnd,
        }),
      }).run();
    }
  }
  logActivity("cycle.create", "cycle", cycleId, { name: body.name });
  return c.json({ id: cycleId });
});

function readPhaseStatus(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writePhaseStatus(participantId: string, patch: Record<string, string>) {
  const db = getDb();
  const row = db.select().from(cycleParticipants).where(eq(cycleParticipants.id, participantId)).all()[0];
  if (!row) return null;
  const next = { ...readPhaseStatus(row.phaseStatusJson), ...patch };
  db.update(cycleParticipants)
    .set({ phaseStatusJson: JSON.stringify(next) })
    .where(eq(cycleParticipants.id, participantId))
    .run();
  return next;
}

function participantFor(cycleId: string, personId: string) {
  const db = getDb();
  return db
    .select()
    .from(cycleParticipants)
    .where(and(eq(cycleParticipants.cycleId, cycleId), eq(cycleParticipants.personId, personId)))
    .all()[0];
}

app.patch("/api/cycles/:id", async (c) => {
  const cycleId = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    windowStart?: string;
    windowEnd?: string;
    status?: string;
  }>();
  const db = getDb();
  const cycle = db.select().from(cycles).where(eq(cycles.id, cycleId)).all()[0];
  if (!cycle) return c.json({ error: "Not found" }, 404);
  db.update(cycles)
    .set({
      name: body.name ?? cycle.name,
      windowStart: body.windowStart ?? cycle.windowStart,
      windowEnd: body.windowEnd ?? cycle.windowEnd,
      status: body.status ?? cycle.status,
    })
    .where(eq(cycles.id, cycleId))
    .run();
  logActivity("cycle.update", "cycle", cycleId, body as Record<string, unknown>);
  return c.json({ ok: true });
});

app.post("/api/cycles/:id/participants/:personId/waive", async (c) => {
  const cycleId = c.req.param("id");
  const personId = c.req.param("personId");
  const body = await c.req.json<{ phase: string; reason: string }>();
  if (!body.reason?.trim()) return c.json({ error: "reason required" }, 400);
  const phase = body.phase === "peer" ? "peer" : "self";
  const cp = participantFor(cycleId, personId);
  if (!cp) return c.json({ error: "Participant not found" }, 404);
  const phaseStatus = writePhaseStatus(cp.id, {
    [phase]: "waived",
    [`${phase}WaiveReason`]: body.reason.trim(),
    [`${phase}WaivedAt`]: nowIso(),
  });
  logActivity("cycle.waive", "person", personId, { cycleId, phase, reason: body.reason.trim() });
  return c.json({ ok: true, phaseStatus });
});

app.get("/api/cycles/:id/nudges", (c) => {
  const cycleId = c.req.param("id");
  const db = getDb();
  const cycle = db.select().from(cycles).where(eq(cycles.id, cycleId)).all()[0];
  if (!cycle) return c.json({ error: "Not found" }, 404);
  const end = new Date(cycle.windowEnd);
  const now = new Date();
  const daysUntilDue = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const participants = db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycleId)).all();
  const nudges: DeadlineNudge[] = [];
  for (const cp of participants) {
    const person = db.select().from(people).where(eq(people.id, cp.personId)).all()[0];
    if (!person) continue;
    const phase = readPhaseStatus(cp.phaseStatusJson);
    const hasSelf = db
      .select()
      .from(reviews)
      .where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, cp.personId), eq(reviews.type, "self")))
      .all().length > 0;
    const selfStatus = hasSelf ? "returned" : phase.self || "pending";
    if (selfStatus === "returned" || selfStatus === "waived") continue;
    const subject = encodeURIComponent(`Self-review due: ${cycle.name}`);
    const body = encodeURIComponent(
      `Hi ${person.name},\n\nPlease complete your self-review for ${cycle.name} (due ${cycle.windowEnd}).\nYour manager will send a JSON bundle — fill it and return the file.\n\nThanks`,
    );
    nudges.push({
      personId: person.id,
      personName: person.name,
      email: person.email,
      cycleId,
      cycleName: cycle.name,
      windowEnd: cycle.windowEnd,
      daysUntilDue,
      missingSelf: !hasSelf,
      selfStatus,
      mailtoHref: person.email
        ? `mailto:${encodeURIComponent(person.email)}?subject=${subject}&body=${body}`
        : `mailto:?subject=${subject}&body=${body}`,
    });
  }
  return c.json({ cycleId, windowEnd: cycle.windowEnd, daysUntilDue, nudges });
});

app.get("/api/cycles/:id/stats", (c) => {
  const db = getDb();
  const cycleId = c.req.param("id");
  const cycle = db.select().from(cycles).where(eq(cycles.id, cycleId)).all()[0];
  if (!cycle) return c.json({ error: "Not found" }, 404);
  const participants = db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycleId)).all();
  const BUDGET = 45 * 60;
  const peopleStats: CycleStatsDTO["people"] = [];
  let totalSeconds = 0;
  let peopleWithTime = 0;
  let under45 = 0;
  let thin = 0;
  let linkedTotal = 0;
  let peopleWithDraft = 0;
  let coverageHits = 0;
  let coverageNeed = 0;

  for (const cp of participants) {
    const person = db.select().from(people).where(eq(people.id, cp.personId)).all()[0];
    if (!person) continue;
    const ach = db.select().from(achievements).where(eq(achievements.personId, person.id)).all().length;
    const fb = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, person.id)).all().length;
    const docs = db.select().from(documents).where(eq(documents.personId, person.id)).all().length;
    const goalsN = db.select().from(goals).where(eq(goals.personId, person.id)).all().length;
    const evidenceCount = ach + fb + docs + goalsN;
    const isThin = evidenceCount < 2;
    if (isThin) thin += 1;

    const manager = db
      .select()
      .from(reviews)
      .where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, person.id), eq(reviews.type, "manager")))
      .all()
      .find((r) => r.status !== "superseded");

    let writingSeconds = 0;
    let linkedSources = 0;
    let managerStatus = "not_started";
    if (manager) {
      managerStatus = manager.status;
      peopleWithDraft += 1;
      try {
        const payload = JSON.parse(manager.payloadJson) as Record<string, unknown>;
        if (typeof payload.writing_seconds_total === "number") {
          writingSeconds = payload.writing_seconds_total;
        }
        const comps = (payload.competencies ?? {}) as Record<string, number>;
        const overall = typeof payload.overall === "number" ? payload.overall : null;
        const links = db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, manager.id)).all();
        linkedSources = new Set(links.map((l) => l.sourceId)).size;
        linkedTotal += linkedSources;
        const scored: Array<{ key: string; score: number }> = [
          ...Object.entries(comps).map(([key, score]) => ({ key, score })),
          ...(overall != null ? [{ key: "overall", score: overall }] : []),
        ];
        for (const s of scored) {
          if (s.score === 3) continue;
          coverageNeed += 1;
          const has = links.some(
            (l) =>
              (s.key === "overall" && l.targetType === "overall") ||
              (l.targetType === "competency" && l.targetKey === s.key),
          );
          if (has) coverageHits += 1;
        }
      } catch {
        /* ignore */
      }
    }
    if (writingSeconds > 0) {
      peopleWithTime += 1;
      totalSeconds += writingSeconds;
      if (writingSeconds <= BUDGET) under45 += 1;
    }
    peopleStats.push({
      personId: person.id,
      personName: person.name,
      writingSeconds,
      under45Min: writingSeconds > 0 ? writingSeconds <= BUDGET : true,
      evidenceCount,
      thin: isThin,
      linkedSources,
      managerStatus,
    });
  }

  const avgSeconds = peopleWithTime ? Math.round(totalSeconds / peopleWithTime) : 0;
  const stats: CycleStatsDTO = {
    cycleId,
    cycleName: cycle.name,
    participantCount: participants.length,
    thinDossierCount: thin,
    writing: {
      peopleWithTime,
      totalSeconds,
      avgSeconds,
      under45MinCount: under45,
      under45MinPct: peopleWithTime ? Math.round((under45 / peopleWithTime) * 100) : 100,
    },
    evidence: {
      peopleWithDraft,
      avgLinkedSources: peopleWithDraft ? Math.round((linkedTotal / peopleWithDraft) * 10) / 10 : 0,
      coveragePct: coverageNeed ? Math.round((coverageHits / coverageNeed) * 100) : 100,
    },
    people: peopleStats.sort((a, b) => a.personName.localeCompare(b.personName)),
  };
  return c.json(stats);
});

app.get("/api/cycles/:id/command-center", (c) => {
  const db = getDb();
  const cycleId = c.req.param("id");
  const participants = db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycleId)).all();
  const items = participants.map((cp) => {
    const person = db.select().from(people).where(eq(people.id, cp.personId)).all()[0];
    const revs = db.select().from(reviews).where(and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, cp.personId))).all();
    const phaseStatus = readPhaseStatus(cp.phaseStatusJson);
    const hasSelf = revs.some((r) => r.type === "self");
    const selfStatus = hasSelf
      ? "returned"
      : phaseStatus.self === "waived"
        ? "waived"
        : phaseStatus.self === "exported"
          ? "exported"
          : "pending";
    const peerStatus =
      phaseStatus.peer === "waived"
        ? "waived"
        : revs.filter((r) => r.type === "peer").length
          ? "returned"
          : phaseStatus.peer === "exported"
            ? "exported"
            : "pending";
    return {
      participantId: cp.id,
      person: person ? mapPerson(person, assignmentFor(person.id)) : null,
      eligibility: cp.eligibility,
      phaseStatus: { ...phaseStatus, self: selfStatus, peer: peerStatus },
      hasSelf,
      peerCount: revs.filter((r) => r.type === "peer").length,
      managerStatus: revs.find((r) => r.type === "manager")?.status ?? "missing",
      selfStatus,
      peerStatus,
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
  const mapRev = (r: typeof reviews.$inferSelect): ReviewDTO => ({
    id: r.id,
    type: r.type as ReviewDTO["type"],
    status: r.status as ReviewDTO["status"],
    subjectPersonId: r.subjectPersonId,
    authorName: r.authorName,
    payload: JSON.parse(r.payloadJson) as Record<string, unknown>,
    updatedAt: r.updatedAt,
  });
  const flags: string[] = [];
  if (!currentRole) flags.push("unassigned_role");
  const phaseStatus = participant ? readPhaseStatus(participant.phaseStatusJson) : {};
  const hasSelf = revs.some((r) => r.type === "self");
  if (!hasSelf && phaseStatus.self !== "waived") flags.push("missing_self_import");
  if (!db.select().from(achievements).where(eq(achievements.personId, personId)).all().length) flags.push("thin_evidence");

  const cycle = db.select().from(cycles).where(eq(cycles.id, cycleId)).all()[0];
  const windowStart = cycle?.windowStart ?? "0000-01-01";
  const windowEnd = cycle?.windowEnd ?? "9999-12-31";
  const inWindow = (iso: string | null | undefined) => {
    if (!iso) return true;
    const day = iso.slice(0, 10);
    return day >= windowStart.slice(0, 10) && day <= windowEnd.slice(0, 10);
  };

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

  const priorEntries: TimelineEntry[] = priorCandidates.slice(0, 3).map((cand) => {
    const p = JSON.parse(cand.review.payloadJson) as Record<string, unknown>;
    return {
      at: cand.cycle.windowEnd,
      kind: "prior_review",
      title: `${cand.cycle.name} manager review`,
      detail: `Overall ${p.overall ?? "—"} · ${(String(p.summary ?? "")).slice(0, 160)}`,
      sourceId: cand.review.id,
    };
  });

  let timeline: PacketDTO["timeline"] = [];
  if (
    manager &&
    (manager.status === "finalized" || manager.status === "shared") &&
    manager.frozenTimelineJson
  ) {
    try {
      timeline = JSON.parse(manager.frozenTimelineJson) as PacketDTO["timeline"];
    } catch {
      timeline = [];
    }
  }
  if (!timeline.length) {
    timeline = buildPersonTimeline(db, personId, { priorEntries }).slice(0, 40);
  }

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
      createdAt: g.createdAt,
    })),
    achievements: achRows.map((row) => ({
      id: row.id,
      title: row.title,
      occurredAt: row.occurredAt,
      description: row.description,
      outOfWindow: !inWindow(row.occurredAt),
    })),
    feedback: fbRows.map((f) => ({
      id: f.id,
      fromName: f.fromName,
      kind: f.kind,
      body: f.body,
      occurredAt: f.occurredAt,
      outOfWindow: !inWindow(f.occurredAt),
    })),
    documents: docRows.map((d) => ({
      id: d.id,
      title: d.title,
      visibility: d.visibility as PacketDTO["documents"][number]["visibility"],
      occurredAt: d.occurredAt,
      outOfWindow: !inWindow(d.occurredAt),
    })),
    outOfWindow: {
      achievements: achRows
        .filter((row) => !inWindow(row.occurredAt))
        .map((row) => ({ id: row.id, title: row.title, occurredAt: row.occurredAt })),
      feedback: fbRows
        .filter((f) => !inWindow(f.occurredAt))
        .map((f) => ({
          id: f.id,
          fromName: f.fromName,
          kind: f.kind,
          body: f.body,
          occurredAt: f.occurredAt,
        })),
      documents: docRows
        .filter((d) => !inWindow(d.occurredAt))
        .map((d) => ({ id: d.id, title: d.title, occurredAt: d.occurredAt })),
    },
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
    flags: (() => {
      const oow =
        achRows.some((r) => !inWindow(r.occurredAt)) ||
        fbRows.some((f) => !inWindow(f.occurredAt)) ||
        docRows.some((d) => !inWindow(d.occurredAt));
      if (oow) flags.push("out_of_window_evidence");
      return flags;
    })(),
    phaseStatus,
    writingSecondsTotal: (() => {
      try {
        const payload = JSON.parse(manager?.payloadJson ?? "{}") as Record<string, unknown>;
        return typeof payload.writing_seconds_total === "number" ? payload.writing_seconds_total : 0;
      } catch {
        return 0;
      }
    })(),
  };
  return c.json(packet);
});

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
  const links = (body.evidenceLinks ?? []) as EvidenceLinkInput[];
  const prevPayload = existing ? (JSON.parse(existing.payloadJson) as Record<string, unknown>) : {};
  const prevComps = (prevPayload.competencies ?? {}) as Record<string, number>;
  const prevOverall = typeof prevPayload.overall === "number" ? prevPayload.overall : null;
  const nextOverall = typeof body.payload.overall === "number" ? body.payload.overall : null;
  const prevPromo = String(prevPayload.promo_readiness ?? "");
  const nextPromo = String(body.payload.promo_readiness ?? "");
  const locked = existing && (existing.status === "finalized" || existing.status === "shared");

  if (locked && nextStatus !== "draft") {
    return c.json(
      {
        error: "Finalized reviews are immutable. Reopen to draft with a decision reason before editing.",
        code: "review_locked",
      },
      400,
    );
  }
  if (locked && nextStatus === "draft") {
    if (!(body.decisionReason ?? "").trim()) {
      return c.json(
        {
          error: "Decision reason required to reopen a finalized review.",
          code: "decision_reason_required",
        },
        400,
      );
    }
  }

  const ratingChanges = collectRatingChanges({
    prevOverall,
    nextOverall,
    prevComps,
    nextComps: competencies,
    prevPromo,
    nextPromo,
  });
  if (locked && nextStatus === "draft") {
    ratingChanges.push({ field: "status", from: existing!.status, to: "draft" });
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

  if (links.length) {
    const validated = validateEvidenceLinks(db, body.subjectPersonId, links, {
      requireShareable: nextStatus === "finalized" || nextStatus === "shared",
    });
    if (!validated.ok) {
      return c.json(
        {
          error: `Invalid evidence links (missing, not owned, or em_only): ${validated.invalid.join(", ")}`,
          code: "evidence_invalid",
          invalid: validated.invalid,
        },
        400,
      );
    }
  }

  if (nextStatus === "finalized" || nextStatus === "shared") {
    const overall = Number(body.payload.overall ?? MIDDLE_BAND);
    const missing = evidenceDensityErrors(competencies, overall, links, competencyLabel);
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
        frozenTimelineJson: nextStatus === "draft" ? null : existing.frozenTimelineJson,
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

    let snapCount = 0;
    for (const item of cited.values()) {
      const snap = resolveEvidenceSnapshot(db, body.subjectPersonId, item.sourceType, item.sourceId);
      if (!snap) continue;
      // Skip em_only sources from frozen subject-facing citation set
      if (!isShareableVisibility(snap.visibility)) continue;
      const redacted = redactSnapshotForSubject({
        ...snap,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
      });
      if (!redacted) continue;
      db.insert(citationSnapshots)
        .values({
          id: id("csnap"),
          reviewId,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          title: redacted.title,
          excerpt: redacted.excerpt,
          checksum: redacted.checksum,
          createdAt: ts,
        })
        .run();
      snapCount += 1;
    }

    const priorEntries: TimelineEntry[] = [];
    const allCycles = db.select().from(cycles).all();
    for (const cy of allCycles.filter((x) => x.id !== body.cycleId).slice(0, 8)) {
      const mgr = db
        .select()
        .from(reviews)
        .where(
          and(eq(reviews.cycleId, cy.id), eq(reviews.subjectPersonId, body.subjectPersonId), eq(reviews.type, "manager")),
        )
        .all()
        .find((r) => r.status === "finalized" || r.status === "shared");
      if (!mgr) continue;
      const p = JSON.parse(mgr.payloadJson) as Record<string, unknown>;
      priorEntries.push({
        at: cy.windowEnd,
        kind: "prior_review",
        title: `${cy.name} manager review`,
        detail: `Overall ${p.overall ?? "—"}`,
        sourceId: mgr.id,
      });
    }
    const frozenTimeline = buildPersonTimeline(db, body.subjectPersonId, {
      subjectFacing: true,
      priorEntries: priorEntries.slice(0, 3),
    }).slice(0, 40);
    db.update(reviews)
      .set({ frozenTimelineJson: JSON.stringify(frozenTimeline), sharedAt: nextStatus === "shared" ? ts : null })
      .where(eq(reviews.id, reviewId))
      .run();

    logActivity("review.finalize", "review", reviewId, {
      snapshots: snapCount,
      evidenceLinks: links.length,
      timelineEntries: frozenTimeline.length,
    });

    try {
      const person = db.select().from(people).where(eq(people.id, body.subjectPersonId)).all()[0];
      const cycle = db.select().from(cycles).where(eq(cycles.id, body.cycleId)).all()[0];
      indexReviewFts(getSqlite(), {
        reviewId,
        personName: person?.name ?? "",
        cycleName: cycle?.name ?? "",
        body: narrative,
      });
    } catch {
      /* FTS optional */
    }
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
  const custom = bundleFieldsForKind(body.kind);
  const bundle = {
    version: 1,
    kind: body.kind,
    templateKey: custom?.templateKey ?? templateKey,
    templateName: custom?.templateName ?? null,
    blocks: custom?.blocks ?? null,
    cycleId: body.cycleId,
    cycleName: cycle.name,
    subjectPersonId: body.subjectPersonId,
    subjectName: person.name,
    peerAuthorName: body.peerAuthorName ?? null,
    exportedAt: nowIso(),
    fields:
      custom?.fields ??
      (body.kind === "self"
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
          }),
    instructions:
      body.kind === "self"
        ? "Fill fields, save this JSON, and return to your manager for import. Do not rename cycleId/subjectPersonId."
        : "Author hidden in shared packet later — not cryptographically anonymous. Fill and return JSON to the manager.",
  };
  logActivity("bundle.export", "person", body.subjectPersonId, { kind: body.kind });
  const cp = participantFor(body.cycleId, body.subjectPersonId);
  if (cp) {
    writePhaseStatus(cp.id, {
      [body.kind]: "exported",
      [`${body.kind}ExportedAt`]: nowIso(),
    });
  }
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
  const cp = participantFor(cycleId, subjectPersonId);
  if (cp) {
    writePhaseStatus(cp.id, {
      [kind]: "returned",
      [`${kind}ReturnedAt`]: ts,
    });
  }
  return c.json({ bundleId, reviewId });
});

app.get("/api/people/:id/concerns", (c) => {
  const personId = c.req.param("id");
  const db = getDb();
  const rows = db
    .select()
    .from(concernLogs)
    .where(eq(concernLogs.personId, personId))
    .all()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const items: ConcernLogDTO[] = rows.map((r) => ({
    id: r.id,
    personId: r.personId,
    occurredAt: r.occurredAt,
    title: r.title,
    body: r.body,
    expectationText: r.expectationText,
    planText: r.planText,
    status: r.status,
    aiAllowed: Boolean(r.aiAllowed),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
  return c.json({ items });
});

app.post("/api/people/:id/concerns", async (c) => {
  const personId = c.req.param("id");
  const body = await c.req.json<{
    title: string;
    body: string;
    occurredAt?: string;
    expectationText?: string;
    planText?: string;
    aiAllowed?: boolean;
  }>();
  if (!body.title?.trim() || !body.body?.trim()) {
    return c.json({ error: "title and body required" }, 400);
  }
  const db = getDb();
  const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
  if (!person) return c.json({ error: "Not found" }, 404);
  const ts = nowIso();
  const concernId = id("concern");
  db.insert(concernLogs)
    .values({
      id: concernId,
      personId,
      occurredAt: body.occurredAt?.slice(0, 10) || ts.slice(0, 10),
      title: body.title.trim(),
      body: body.body.trim(),
      expectationText: body.expectationText?.trim() || null,
      planText: body.planText?.trim() || null,
      status: "open",
      aiAllowed: body.aiAllowed ? 1 : 0,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  logActivity("concern.create", "person", personId, { concernId, title: body.title.trim() });
  return c.json({ id: concernId });
});

app.patch("/api/concerns/:id", async (c) => {
  const concernId = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    body?: string;
    expectationText?: string | null;
    planText?: string | null;
    status?: string;
    aiAllowed?: boolean;
  }>();
  const db = getDb();
  const row = db.select().from(concernLogs).where(eq(concernLogs.id, concernId)).all()[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  db.update(concernLogs)
    .set({
      title: body.title?.trim() || row.title,
      body: body.body?.trim() || row.body,
      expectationText:
        body.expectationText === undefined ? row.expectationText : body.expectationText?.trim() || null,
      planText: body.planText === undefined ? row.planText : body.planText?.trim() || null,
      status: body.status ?? row.status,
      aiAllowed: body.aiAllowed === undefined ? row.aiAllowed : body.aiAllowed ? 1 : 0,
      updatedAt: nowIso(),
    })
    .where(eq(concernLogs.id, concernId))
    .run();
  logActivity("concern.update", "person", row.personId, { concernId });
  return c.json({ ok: true });
});

app.get("/api/people/:id/dossier", (c) => {
  const personId = c.req.param("id");
  const db = getDb();
  const feedback = db
    .select()
    .from(feedbackItems)
    .where(eq(feedbackItems.toPersonId, personId))
    .all()
    .map((f) => {
      let themes: string[] = [];
      try {
        themes = JSON.parse(f.themesJson || "[]") as string[];
      } catch {
        themes = [];
      }
      return { ...f, themes };
    });
  return c.json({
    goals: db.select().from(goals).where(eq(goals.personId, personId)).all(),
    achievements: db.select().from(achievements).where(eq(achievements.personId, personId)).all(),
    feedback,
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
    themes?: string[];
  }>();
  if (!body.body?.trim()) return c.json({ error: "Feedback body required" }, 400);
  const db = getDb();
  const fbId = id("fb");
  const themes = (body.themes ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 8);
  db.insert(feedbackItems).values({
    id: fbId,
    toPersonId: personId,
    fromName: body.fromName?.trim() || null,
    kind: body.kind ?? "coaching",
    body: body.body.trim(),
    visibility: body.visibility ?? "em_and_subject",
    occurredAt: body.occurredAt ?? nowIso().slice(0, 10),
    createdAt: nowIso(),
    themesJson: JSON.stringify(themes),
  }).run();
  logActivity("feedback.create", "person", personId, { feedbackId: fbId, themes });
  return c.json({ id: fbId });
});

app.get("/api/ai/settings", (c) => {
  const db = getDb();
  const row = db.select().from(aiSettings).where(eq(aiSettings.id, "default")).all()[0];
  const gatewayBaseUrl = resolveCursorBaseUrl(row?.ollamaBaseUrl);
  const provider = normalizeAiProvider(row?.provider, gatewayBaseUrl);
  const hasStoredKey = Boolean(row?.apiKeyEncrypted);
  const hasEnvCursorKey =
    (provider === "cursor" || provider === "openai_compatible") &&
    Boolean(process.env.CURSOR_API_KEY?.trim());
  return c.json({
    enabled: Boolean(row?.enabled),
    provider,
    modelDigest: row?.modelDigest,
    modelDraft: row?.modelDraft,
    localOnly: Boolean(row?.localOnly),
    ollamaBaseUrl:
      provider === "openai_compatible"
        ? gatewayBaseUrl ?? ""
        : provider === "ollama"
          ? (row?.ollamaBaseUrl ?? "http://127.0.0.1:11434")
          : (row?.ollamaBaseUrl ?? "http://127.0.0.1:11434"),
    cursorBaseUrl: provider === "openai_compatible" ? gatewayBaseUrl : null,
    privateNotesEgress: Boolean(row?.privateNotesEgress),
    meetingSummaryEgress: Boolean(row?.meetingSummaryEgress),
    documentExtractEgress: Boolean(row?.documentExtractEgress),
    hasApiKey: hasStoredKey || hasEnvCursorKey,
    apiKeyFromEnv: !hasStoredKey && hasEnvCursorKey,
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

  const provider = body.provider ?? current?.provider ?? "anthropic";
  let ollamaBaseUrl = body.ollamaBaseUrl ?? current?.ollamaBaseUrl;
  // Cloud Agents must not keep a leftover custom gateway URL (legacy cursor+URL → openai_compatible).
  if (provider === "cursor") {
    ollamaBaseUrl = "http://127.0.0.1:11434";
  }

  db.update(aiSettings)
    .set({
      enabled: body.enabled === undefined ? current?.enabled ?? 0 : body.enabled ? 1 : 0,
      provider,
      modelDigest: body.modelDigest ?? current?.modelDigest,
      modelDraft: body.modelDraft ?? current?.modelDraft,
      localOnly: body.localOnly === undefined ? current?.localOnly ?? 0 : body.localOnly ? 1 : 0,
      ollamaBaseUrl,
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

function mapIntegrationSettings(provider: IntegrationProvider): IntegrationSettingsDTO {
  const row = ensureIntegrationRow(provider);
  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(row.extraJson || "{}") as Record<string, unknown>;
  } catch {
    extra = {};
  }
  return {
    id: provider,
    enabled: Boolean(row.enabled),
    baseUrl: row.baseUrl,
    workspaceSlug: row.workspaceSlug,
    authEmail: row.authEmail,
    authUsername: row.authUsername,
    hasToken: Boolean(row.tokenEncrypted),
    extra,
    lastSyncAt: row.lastSyncAt,
    updatedAt: row.updatedAt,
  };
}

function mapExternalLink(row: typeof personExternalLinks.$inferSelect): PersonExternalLinkDTO {
  return {
    id: row.id,
    personId: row.personId,
    provider: row.provider as IntegrationProvider,
    externalAccountId: row.externalAccountId,
    externalDisplayName: row.externalDisplayName,
    externalEmail: row.externalEmail,
    externalUsername: row.externalUsername,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isKnownIntegrationProvider(provider: string): provider is IntegrationProvider {
  return provider === "jira" || provider === "bitbucket" || provider === "github" || provider === "linear";
}

app.get("/api/integrations", (c) => {
  return c.json({
    jira: mapIntegrationSettings("jira"),
    bitbucket: mapIntegrationSettings("bitbucket"),
    github: mapIntegrationSettings("github"),
    linear: mapIntegrationSettings("linear"),
  });
});

app.get("/api/integrations/:provider", (c) => {
  const provider = c.req.param("provider");
  if (!isKnownIntegrationProvider(provider)) return c.json({ error: "Unknown provider" }, 404);
  return c.json(mapIntegrationSettings(provider));
});

app.put("/api/integrations/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!isKnownIntegrationProvider(provider)) return c.json({ error: "Unknown provider" }, 404);
  const body = await c.req.json<{
    enabled?: boolean;
    baseUrl?: string | null;
    workspaceSlug?: string | null;
    authEmail?: string | null;
    authUsername?: string | null;
    token?: string | null;
    extra?: Record<string, unknown>;
  }>();
  const db = getDb();
  const current = ensureIntegrationRow(provider);
  const secret = getWorkspaceSecret();
  let tokenEncrypted = current.tokenEncrypted;
  if (body.token === null) tokenEncrypted = null;
  else if (body.token && secret) tokenEncrypted = encryptSecret(body.token, secret);
  else if (body.token && !secret) return c.json({ error: "Workspace secret unavailable — re-unlock" }, 400);

  const extraJson =
    body.extra === undefined ? current.extraJson : JSON.stringify(body.extra ?? {});
  const ts = nowIso();
  db.update(integrationSettings)
    .set({
      enabled: body.enabled === undefined ? current.enabled : body.enabled ? 1 : 0,
      baseUrl: body.baseUrl === undefined ? current.baseUrl : body.baseUrl?.trim() || null,
      workspaceSlug:
        body.workspaceSlug === undefined ? current.workspaceSlug : body.workspaceSlug?.trim() || null,
      authEmail: body.authEmail === undefined ? current.authEmail : body.authEmail?.trim() || null,
      authUsername:
        body.authUsername === undefined ? current.authUsername : body.authUsername?.trim() || null,
      tokenEncrypted,
      extraJson,
      updatedAt: ts,
    })
    .where(eq(integrationSettings.id, provider))
    .run();
  logActivity("integrations.settings.update", "integration", provider, {
    enabled: body.enabled,
  });
  return c.json(mapIntegrationSettings(provider));
});

app.post("/api/integrations/:provider/test", async (c) => {
  const provider = c.req.param("provider");
  try {
    if (provider === "jira") {
      const cfg = getJiraConfig();
      if (!cfg) return c.json({ error: "Enable Jira and save base URL, email, and API token first" }, 400);
      const result = await jiraTestConnection(cfg);
      return c.json(result);
    }
    if (provider === "bitbucket") {
      const cfg = getBitbucketConfig();
      if (!cfg) {
        return c.json({ error: "Enable Bitbucket and save workspace, username, and app password first" }, 400);
      }
      const result = await bitbucketTestConnection(cfg);
      return c.json(result);
    }
    if (provider === "github") {
      const cfg = getGitHubConfig();
      if (!cfg) return c.json({ error: "Enable GitHub and save a personal access token first" }, 400);
      const result = await githubTestConnection(cfg);
      return c.json(result);
    }
    if (provider === "linear") {
      const cfg = getLinearConfig();
      if (!cfg) return c.json({ error: "Enable Linear and save an API key first" }, 400);
      const viewer = await linearViewer(cfg);
      return c.json({ ok: true, displayName: viewer.name, accountId: viewer.id, email: viewer.email });
    }
    return c.json({ error: "Unknown provider" }, 404);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Connection failed" }, 400);
  }
});

app.get("/api/integrations/:provider/users", async (c) => {
  const provider = c.req.param("provider");
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ error: "q required" }, 400);
  try {
    if (provider === "jira") {
      const cfg = getJiraConfig();
      if (!cfg) return c.json({ error: "Jira not configured" }, 400);
      const users = await jiraSearchUsers(cfg, q);
      const items: IntegrationRemoteUser[] = users.map((u) => ({
        accountId: u.accountId,
        displayName: u.displayName,
        email: u.emailAddress ?? null,
        username: null,
      }));
      return c.json({ items });
    }
    if (provider === "bitbucket") {
      const cfg = getBitbucketConfig();
      if (!cfg) return c.json({ error: "Bitbucket not configured" }, 400);
      const users = await bitbucketSearchMembers(cfg, q);
      const items: IntegrationRemoteUser[] = users.map((u) => ({
        accountId: u.uuid,
        displayName: u.displayName,
        email: u.email ?? null,
        username: u.nickname ?? null,
      }));
      return c.json({ items });
    }
    if (provider === "github") {
      const cfg = getGitHubConfig();
      if (!cfg) return c.json({ error: "GitHub not configured" }, 400);
      const users = await githubSearchUsers(cfg, q);
      const items: IntegrationRemoteUser[] = users.map((u) => ({
        accountId: String(u.id),
        displayName: u.name ?? u.login,
        email: null,
        username: u.login,
      }));
      return c.json({ items });
    }
    if (provider === "linear") {
      const cfg = getLinearConfig();
      if (!cfg) return c.json({ error: "Linear not configured" }, 400);
      const users = await linearSearchUsers(cfg, q);
      return c.json({ items: users });
    }
    return c.json({ error: "Unknown provider" }, 404);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "User search failed" }, 400);
  }
});

app.get("/api/people/:id/external-links", (c) => {
  const personId = c.req.param("id");
  const db = getDb();
  const items = db
    .select()
    .from(personExternalLinks)
    .where(eq(personExternalLinks.personId, personId))
    .all()
    .map(mapExternalLink);
  return c.json({ items });
});

app.put("/api/people/:id/external-links/:provider", async (c) => {
  const personId = c.req.param("id");
  const provider = c.req.param("provider");
  if (!isKnownIntegrationProvider(provider)) return c.json({ error: "Unknown provider" }, 404);
  const body = await c.req.json<{
    externalAccountId: string;
    externalDisplayName?: string | null;
    externalEmail?: string | null;
    externalUsername?: string | null;
  }>();
  if (!body.externalAccountId?.trim()) return c.json({ error: "externalAccountId required" }, 400);
  const db = getDb();
  const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
  if (!person) return c.json({ error: "Not found" }, 404);
  const ts = nowIso();
  const existing = db
    .select()
    .from(personExternalLinks)
    .where(and(eq(personExternalLinks.personId, personId), eq(personExternalLinks.provider, provider)))
    .all()[0];
  if (existing) {
    db.update(personExternalLinks)
      .set({
        externalAccountId: body.externalAccountId.trim(),
        externalDisplayName: body.externalDisplayName?.trim() || null,
        externalEmail: body.externalEmail?.trim() || null,
        externalUsername: body.externalUsername?.trim() || null,
        updatedAt: ts,
      })
      .where(eq(personExternalLinks.id, existing.id))
      .run();
    logActivity("integrations.link.update", "person", personId, { provider });
    const updated = db.select().from(personExternalLinks).where(eq(personExternalLinks.id, existing.id)).all()[0]!;
    return c.json(mapExternalLink(updated));
  }
  const linkId = id("extlink");
  const row = {
    id: linkId,
    personId,
    provider,
    externalAccountId: body.externalAccountId.trim(),
    externalDisplayName: body.externalDisplayName?.trim() || null,
    externalEmail: body.externalEmail?.trim() || null,
    externalUsername: body.externalUsername?.trim() || null,
    createdAt: ts,
    updatedAt: ts,
  };
  db.insert(personExternalLinks).values(row).run();
  logActivity("integrations.link.create", "person", personId, { provider });
  return c.json(mapExternalLink(row));
});

app.delete("/api/people/:id/external-links/:provider", (c) => {
  const personId = c.req.param("id");
  const provider = c.req.param("provider") as IntegrationProvider;
  const db = getDb();
  const existing = db
    .select()
    .from(personExternalLinks)
    .where(and(eq(personExternalLinks.personId, personId), eq(personExternalLinks.provider, provider)))
    .all()[0];
  if (!existing) return c.json({ error: "Not found" }, 404);
  db.delete(personExternalLinks).where(eq(personExternalLinks.id, existing.id)).run();
  logActivity("integrations.link.delete", "person", personId, { provider });
  return c.json({ ok: true });
});

app.post("/api/people/:id/integrations/sync", async (c) => {
  const personId = c.req.param("id");
  const body = await c.req
    .json<{ providers?: IntegrationProvider[]; cycleId?: string; includeComments?: boolean }>()
    .catch(
      () =>
        ({} as { providers?: IntegrationProvider[]; cycleId?: string; includeComments?: boolean }),
    );
  const db = getDb();
  if (!db.select().from(people).where(eq(people.id, personId)).all()[0]) {
    return c.json({ error: "Not found" }, 404);
  }
  try {
    const result: IntegrationSyncResult = await syncPersonIntegrations(personId, body.providers, {
      cycleId: body.cycleId,
      includeComments: body.includeComments,
    });
    return c.json(result);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Sync failed" }, 400);
  }
});

app.post("/api/integrations/sync-all", async (c) => {
  const body = await c.req
    .json<{ providers?: IntegrationProvider[]; cycleId?: string; includeComments?: boolean }>()
    .catch(
      () =>
        ({} as { providers?: IntegrationProvider[]; cycleId?: string; includeComments?: boolean }),
    );
  const db = getDb();
  const links = db.select().from(personExternalLinks).all();
  const personIds = [...new Set(links.map((l) => l.personId))];
  const results: IntegrationSyncResult[] = [];
  for (const personId of personIds) {
    results.push(
      await syncPersonIntegrations(personId, body.providers, {
        cycleId: body.cycleId,
        includeComments: body.includeComments,
      }),
    );
  }
  return c.json({ count: results.length, results });
});

app.get("/api/people/:id/delivery-rollup", (c) => {
  const personId = c.req.param("id");
  const cycleId = c.req.query("cycleId");
  const db = getDb();
  const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
  if (!person) return c.json({ error: "Not found" }, 404);
  const allCycles = db.select().from(cycles).all().sort((a, b) => b.windowEnd.localeCompare(a.windowEnd));
  const cycle = cycleId
    ? allCycles.find((x) => x.id === cycleId)
    : allCycles.find((x) => x.status !== "closed") ?? allCycles[0];
  if (!cycle) return c.json({ error: "No cycle found" }, 404);
  const achRows = db.select().from(achievements).where(eq(achievements.personId, personId)).all();
  const dossierNonIntegrationCount = achRows.filter((a) => !a.sourceProvider).length
    + db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, personId)).all().length
    + db.select().from(documents).where(eq(documents.personId, personId)).all().length
    + db.select().from(goals).where(eq(goals.personId, personId)).all().length;
  return c.json(
    buildDeliveryRollup({
      personId,
      cycleId: cycle.id,
      windowStart: cycle.windowStart.slice(0, 10),
      windowEnd: cycle.windowEnd.slice(0, 10),
      achievements: achRows,
      dossierNonIntegrationCount,
    }),
  );
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
  const mime = file.type || "application/octet-stream";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extOk = ["pdf", "docx", "pptx", "txt", "md", "csv", "png", "jpg", "jpeg"].includes(ext);
  // Extension allowlist is authoritative — do not accept via client Content-Type alone.
  if (!extOk) {
    return c.json({ error: "File type not allowlisted (extension)" }, 400);
  }
  const safeFilename = basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > 25 * 1024 * 1024) return c.json({ error: "Max 25MB" }, 400);

  const title = String(form.title || safeFilename);
  const visibility = String(form.visibility || "em_and_subject");
  const occurredAt = String(form.occurredAt || nowIso().slice(0, 10));
  const saved = writeEncryptedDocument(safeFilename, buf);
  const docId = id("doc");
  db.insert(documents)
    .values({
      id: docId,
      personId,
      title,
      filename: safeFilename,
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
  const safeName = doc.filename.replace(/["\r\n]/g, "_");
  return new Response(data, {
    headers: {
      "content-type": doc.mimeType || "application/octet-stream",
      "content-disposition": `attachment; filename="${safeName}"`,
    },
  });
});

function buildEvidenceContext(personId: string, cycleId?: string) {
  const db = getDb();
  const cfg = getAiConfig();
  const cloudEgress = cfg.enabled && !cfg.localOnly && cfg.provider !== "ollama";
  const allowPrivateNotes = !cloudEgress || cfg.privateNotesEgress;
  const allowMeeting = !cloudEgress || cfg.meetingSummaryEgress;
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
  for (const item of ach) {
    const link = item.externalUrl ? ` ${item.externalUrl}` : "";
    const src = item.sourceProvider ? ` via ${item.sourceProvider}` : "";
    lines.push(
      `Achievement [${item.id}] ${item.occurredAt}${src}: ${item.title}. ${item.description ?? ""}${link}`,
    );
  }
  for (const item of g) lines.push(`Goal [${item.id}] (${item.status}): ${item.title}`);
  for (const item of fb) {
    if (!allowPrivateNotes && item.visibility === "em_only") {
      lines.push(`Feedback [${item.id}]: (held back — enable private notes egress or local-only AI)`);
      continue;
    }
    if (item.visibility === "em_only" && allowPrivateNotes && !dataClassesSent.includes("private_notes")) {
      dataClassesSent.push("private_notes");
    }
    let themes: string[] = [];
    try {
      themes = JSON.parse(item.themesJson || "[]") as string[];
    } catch {
      themes = [];
    }
    const themeBit = themes.length ? ` themes=[${themes.join(", ")}]` : "";
    lines.push(`Feedback [${item.id}] from ${item.fromName ?? "someone"}${themeBit}: ${item.body}`);
  }
  const optedConcerns = db
    .select()
    .from(concernLogs)
    .where(eq(concernLogs.personId, personId))
    .all()
    .filter((r) => r.aiAllowed);
  for (const c of optedConcerns) {
    if (!dataClassesSent.includes("concern_opt_in")) dataClassesSent.push("concern_opt_in");
    lines.push(
      `Concern (AI-opted-in) [${c.id}] ${c.occurredAt} (${c.status}): ${c.title}. ${c.body}` +
        (c.expectationText ? ` Expectation: ${c.expectationText}.` : "") +
        (c.planText ? ` Plan: ${c.planText}.` : ""),
    );
  }
  for (const d of docs) {
    const meetingLike = looksLikeMeetingDoc(d.title, d.filename);
    if (!allowPrivateNotes && d.visibility === "em_only") {
      lines.push(`Document [${d.id}]: (held back — em_only; enable private notes egress or local-only AI)`);
      continue;
    }
    if (meetingLike && !allowMeeting) {
      lines.push(`Document [${d.id}]: (held back — meeting/transcript; enable meeting summary egress or local-only AI)`);
      continue;
    }
    if (d.visibility === "em_only" && allowPrivateNotes && !dataClassesSent.includes("private_notes")) {
      dataClassesSent.push("private_notes");
    }
    if (meetingLike && allowMeeting && !dataClassesSent.includes("meeting_summary")) {
      dataClassesSent.push("meeting_summary");
    }
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
  const mgr = revs.find((r) => r.type === "manager" && r.status !== "superseded");
  if (mgr) {
    const payload = JSON.parse(mgr.payloadJson) as Record<string, unknown>;
    if (allowPrivateNotes && payload.private_notes) {
      lines.push(`Private manager notes: ${String(payload.private_notes)}`);
      if (!dataClassesSent.includes("private_notes")) dataClassesSent.push("private_notes");
    } else if (payload.private_notes && !allowPrivateNotes) {
      lines.push(`Private manager notes: (held back — enable private notes egress or local-only AI)`);
    }
  }
  const citations = [
    ...ach.map((x) => x.id),
    ...g.map((x) => x.id),
    ...fb.filter((x) => allowPrivateNotes || x.visibility !== "em_only").map((x) => x.id),
    ...optedConcerns.map((c) => c.id),
    ...docs
      .filter((d) => (allowPrivateNotes || d.visibility !== "em_only") && (allowMeeting || !looksLikeMeetingDoc(d.title, d.filename)))
      .map((x) => x.id),
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

  const db = getDb();
  const cycle = body.cycleId
    ? db.select().from(cycles).where(eq(cycles.id, body.cycleId)).all()[0]
    : null;
  const achRows = db.select().from(achievements).where(eq(achievements.personId, body.personId)).all();
  const dossierNonIntegrationCount = achRows.filter((a) => !a.sourceProvider).length;
  const rollup = cycle
    ? buildDeliveryRollup({
        personId: body.personId,
        cycleId: cycle.id,
        windowStart: cycle.windowStart.slice(0, 10),
        windowEnd: cycle.windowEnd.slice(0, 10),
        achievements: achRows,
        dossierNonIntegrationCount,
      })
    : null;
  const citeHint =
    rollup && rollup.citeSuggestions.length
      ? `\n\nPrefer citing these Done-in-window items when relevant:\n${rollup.citeSuggestions
          .map((s) => `- ${s.citeToken} ${s.label} (${s.reason})`)
          .join("\n")}`
      : "";

  const localLines = [
    `Subject: ${ctx.person?.name} — role bar: ${ctx.role?.title ?? "unassigned"}${ctx.next ? ` → next: ${ctx.next.title}` : ""}.`,
    ctx.role
      ? `Current-role expectations in play: ${ctx.role.expectations.length} (stable ids).`
      : "Gap: unassigned role.",
    ...(rollup
      ? [
          `Delivery rollup (${rollup.windowStart}→${rollup.windowEnd}): ${rollup.issuesDone} issues done, ${rollup.prsMerged} PRs merged, ${rollup.issuesInProgress} in progress` +
            (rollup.storyPointsDone != null ? `, ${rollup.storyPointsDone} story points` : "") +
            ".",
        ]
      : []),
    ...ctx.ach.slice(0, 5).map((item) => `Achievement [${item.id}]: ${item.title} (${item.occurredAt}).`),
    ...ctx.lines.filter((l) => l.startsWith("Goal") || l.startsWith("Feedback") || l.startsWith("Self") || l.startsWith("Peer") || l.startsWith("Gap") || l.startsWith("Thin")).slice(0, 12),
    ...(rollup?.citeSuggestions.slice(0, 5).map((s) => `Suggested cite ${s.citeToken}: ${s.label}`) ?? []),
  ];

  if (body.useCloud !== false && cfg.enabled && (cfg.hasApiKey || cfg.localOnly || cfg.provider === "ollama")) {
    try {
      const result = await runChat("evidence_digest", [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: `Produce an 8–12 bullet evidence digest for the manager writing desk.\nCite ids like [ach_…]. Prefer Done-in-window delivery items when summarizing shipping work.${citeHint}\n\nEVIDENCE:\n${ctx.lines.join("\n")}`,
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
    citeSuggestions: rollup?.citeSuggestions ?? [],
    dataClassesSent: ctx.dataClassesSent,
    model,
  });
});

app.post("/api/ai/skip-level-talking-points", async (c) => {
  const body = await c.req.json<{ cycleId: string; personId: string; useCloud?: boolean }>();
  const ctx = buildEvidenceContext(body.personId, body.cycleId);
  const cfg = getAiConfig();
  const pack = buildDirectorBriefing(getDb(), {
    cycleId: body.cycleId,
    personId: body.personId,
    loadRole,
    assignmentFor,
  });
  const person = pack?.people[0];
  const citeIds = person?.citedBullets.map((b) => b.citeId).filter(Boolean) as string[] ?? ctx.citations.slice(0, 8);
  const forcedCites = citeIds.slice(0, 6).map((id) => `[${id}]`).join(" ");

  const localLines = [
    `Skip-level talking points — ${ctx.person?.name ?? "subject"} (${pack?.cycleName ?? body.cycleId}).`,
    person
      ? `Overall ${person.overall ?? "—"}/5${person.delta != null ? ` (Δ ${person.delta > 0 ? "+" : ""}${person.delta})` : ""}${person.promoReadiness ? ` · promo ${person.promoReadiness}` : ""}.`
      : null,
    person
      ? `Delivery: ${person.delivery.issuesDone} issues done, ${person.delivery.prsMerged} PRs merged${person.delivery.storyPointsDone != null ? `, ${person.delivery.storyPointsDone} pts` : ""}.`
      : null,
    ...(person?.citedBullets.slice(0, 6).map((b) => `• ${b.text}${b.citeId ? ` [${b.citeId}]` : ""}`) ?? []),
    forcedCites ? `Prefer cites: ${forcedCites}` : null,
    person?.flags.length ? `Flags (share-safe): ${person.flags.join(", ")}` : null,
  ].filter(Boolean) as string[];

  let outputText: string;
  let model = "local-grounded";
  if (body.useCloud !== false && cfg.enabled && (cfg.hasApiKey || cfg.localOnly || cfg.provider === "ollama")) {
    try {
      const result = await runChat("skip_level_talking_points", [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: `Write 6–8 skip-level talking points for a 15-minute 1:1 with the EM's director about this person.
Rules: every substantive bullet MUST include an evidence cite like [ach_…]. Prefer Done-in-window delivery items. Omit private notes and concern bodies. Be candid but share-safe.

Prefer these cites: ${forcedCites || "(use allowlisted ids from evidence)"}

CONTEXT:
${ctx.lines.join("\n")}`,
        },
      ]);
      outputText = result.text;
      model = result.model;
    } catch (e) {
      outputText = `${localLines.join("\n")}\n\n(Cloud draft failed: ${e instanceof Error ? e.message : "error"})`;
    }
  } else {
    outputText = localLines.join("\n");
  }

  const filtered = filterCitationsAgainstAllowlist(outputText, ctx.citations);
  outputText = filtered.text;
  const generationId = storeGeneration({
    feature: "skip_level_talking_points",
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
  const tried =
    cfg.localOnly || cfg.provider === "ollama"
      ? cfg.ollamaBaseUrl
      : cfg.provider === "cursor"
        ? CURSOR_CLOUD_API_BASE
        : cfg.provider === "openai_compatible"
          ? cfg.openaiCompatibleBaseUrl
          : cfg.provider === "openai"
            ? "https://api.openai.com/v1"
            : "https://api.anthropic.com";
  try {
    if (!cfg.enabled) {
      return c.json(
        {
          ok: false,
          error: "AI is disabled — enable AI features, Save, then Test.",
          provider: cfg.provider,
          baseUrlTried: tried,
        },
        400,
      );
    }
    if (cfg.localOnly || cfg.provider === "ollama") {
      const text = await runChat("evidence_digest", [
        { role: "system", content: "Reply with exactly: OK" },
        { role: "user", content: "ping" },
      ]);
      return c.json({
        ok: true,
        model: text.model,
        sample: text.text.slice(0, 80),
        provider: cfg.provider,
        baseUrlTried: tried,
      });
    }
    if (!cfg.hasApiKey) {
      return c.json(
        { ok: false, error: "No API key on file — paste a key, Save, then Test.", provider: cfg.provider, baseUrlTried: tried },
        400,
      );
    }
    // Cloud Agents: validate the key via /v1/me (fast). Full digests launch a no-repo agent.
    if (cfg.provider === "cursor" && cfg.apiKey) {
      const probe = await probeCursorCloudKey(cfg.apiKey);
      return c.json({
        ok: true,
        model: probe.model,
        sample: probe.sample,
        provider: cfg.provider,
        baseUrlTried: probe.baseUrlTried,
      });
    }
    const text = await runChat("evidence_digest", [
      { role: "system", content: "Reply with exactly: OK" },
      { role: "user", content: "ping" },
    ]);
    return c.json({
      ok: true,
      model: text.model,
      sample: text.text.slice(0, 80),
      provider: cfg.provider,
      baseUrlTried: tried,
    });
  } catch (e) {
    return c.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "failed",
        provider: cfg.provider,
        baseUrlTried: tried,
      },
      500,
    );
  }
});

const MAX_CHAT_MESSAGES = 24;
const MAX_CHAT_MESSAGE_CHARS = 4000;

app.post("/api/ai/chat", async (c) => {
  const body = await c.req.json<{
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    personId?: string | null;
    cycleId?: string | null;
    confirmWorkspaceScope?: boolean;
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
  if (!personId && !body.confirmWorkspaceScope) {
    return c.json(
      {
        error:
          "Workspace-wide chat sends multi-person dossier data to the model. Pass confirmWorkspaceScope: true or set personId.",
        code: "workspace_scope_confirmation_required",
      },
      400,
    );
  }
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

  const wantsStream = (c.req.header("accept") || "").includes("text/event-stream");

  if (wantsStream) {
    return streamSSE(c, async (stream) => {
      let eventId = 0;
      let writeChain: Promise<void> = Promise.resolve();
      const send = (event: string, data: unknown) => {
        writeChain = writeChain.then(async () => {
          eventId += 1;
          await stream.writeSSE({
            id: String(eventId),
            event,
            data: JSON.stringify(data),
          });
        });
        return writeChain;
      };
      try {
        await send("status", {
          status: "CREATING",
          detail: "Starting model…",
        });
        const result = await runChat("chat_dossier", packed, {
          onProgress: (p) => {
            if (p.type === "status") {
              void send("status", {
                status: p.status,
                agentId: p.agentId,
                runId: p.runId,
                agentUrl: p.agentUrl,
                detail:
                  p.status === "CREATING"
                    ? "Creating Cursor Cloud Agent…"
                    : p.status === "RUNNING"
                      ? "Cloud Agent is working…"
                      : `Cloud Agent ${p.status.toLowerCase()}`,
              });
            } else if (p.type === "text") {
              void send("delta", { text: p.delta, cumulative: p.cumulative });
            } else if (p.type === "thinking") {
              void send("thinking", { text: p.delta });
            } else if (p.type === "tool_call") {
              void send("tool", {
                name: p.name,
                status: p.status,
                callId: p.callId,
              });
            }
          },
        });
        await writeChain;
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
        await send("done", {
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
        await writeChain.catch(() => undefined);
        await send("error", { error: e instanceof Error ? e.message : "AI failed" });
      }
    });
  }

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
  let allowlist: string[] = [];
  const db = getDb();
  if (body.cycleId && body.personId) {
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
    if (!text && manager) {
      const p = JSON.parse(manager.payloadJson) as Record<string, unknown>;
      text = [p.summary, p.strengths, p.growth_areas, p.dev_plan, p.role_fit].map((x) => String(x ?? "")).join("\n\n");
    }
    if (manager) {
      allowlist = db
        .select()
        .from(evidenceLinks)
        .where(eq(evidenceLinks.reviewId, manager.id))
        .all()
        .map((l) => l.sourceId);
    }
    allowlist.push(
      ...db.select().from(achievements).where(eq(achievements.personId, body.personId)).all().map((a) => a.id),
      ...db.select().from(goals).where(eq(goals.personId, body.personId)).all().map((g) => g.id),
      ...db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, body.personId)).all().map((f) => f.id),
      ...db.select().from(documents).where(eq(documents.personId, body.personId)).all().map((d) => d.id),
      ...db.select().from(meetingSummaries).where(eq(meetingSummaries.personId, body.personId)).all().map((m) => m.id),
    );
    allowlist = [...new Set(allowlist)];
  }
  const findings = mergeLintFindings(
    runBiasToneLint(text),
    runFaithfulnessLint(text, allowlist),
  );
  return c.json({ findings, ephemeral: true, allowlistSize: allowlist.length });
});

app.get("/api/sprint-pulse", (c) => {
  const db = getDb();
  return c.json(
    loadSprintPulse(db, {
      from: c.req.query("from"),
      to: c.req.query("to"),
      preset: c.req.query("preset"),
    }),
  );
});

app.get("/api/people/:id/timeline", (c) => {
  const db = getDb();
  const timeline = loadPersonTimeline(db, c.req.param("id"));
  if (!timeline) return c.json({ error: "Not found" }, 404);
  return c.json(timeline);
});

app.get("/api/rating-trends", (c) => {
  const db = getDb();
  return c.json(loadRatingTrends(db));
});

app.get("/api/cycle-compare", (c) => {
  const db = getDb();
  const result = loadCycleCompare(db, {
    cycleId: c.req.query("cycleId"),
    compareTo: c.req.query("compareTo"),
  });
  if (!result) return c.json({ error: "No cycle found" }, 404);
  return c.json(result);
});

app.get("/api/team-performance", (c) => {
  const cycleId = c.req.query("cycleId");
  const db = getDb();
  const allCycles = db.select().from(cycles).all().sort((a, b) => b.windowStart.localeCompare(a.windowStart));
  const cycle = cycleId ? allCycles.find((x) => x.id === cycleId) : allCycles[0];
  if (!cycle) return c.json({ error: "No cycle found" }, 404);

  const priorCycle =
    allCycles.find((x) => x.windowStart < cycle.windowStart && x.id !== cycle.id) ?? null;
  const priorForTrend = allCycles
    .filter((x) => x.windowStart < cycle.windowStart && x.id !== cycle.id)
    .sort((a, b) => a.windowStart.localeCompare(b.windowStart))
    .slice(-4);

  const participants = db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycle.id)).all();
  const peopleInputs: TeamPerformancePersonInput[] = [];

  for (const cp of participants) {
    const person = db.select().from(people).where(eq(people.id, cp.personId)).all()[0];
    if (!person) continue;

    const achRows = db.select().from(achievements).where(eq(achievements.personId, person.id)).all();
    const fbRows = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, person.id)).all();
    const docs = db.select().from(documents).where(eq(documents.personId, person.id)).all().length;
    const goalsN = db.select().from(goals).where(eq(goals.personId, person.id)).all().length;
    const evidenceCount = achRows.length + fbRows.length + docs + goalsN;
    const themes: string[] = [];
    for (const f of fbRows) {
      try {
        const parsed = JSON.parse(f.themesJson || "[]") as string[];
        for (const t of parsed) if (typeof t === "string" && t.trim()) themes.push(t.trim());
      } catch {
        /* ignore */
      }
    }
    const openConcerns = db
      .select()
      .from(concernLogs)
      .where(eq(concernLogs.personId, person.id))
      .all()
      .filter((row) => row.status === "open").length;

    const manager = db
      .select()
      .from(reviews)
      .where(and(eq(reviews.cycleId, cycle.id), eq(reviews.subjectPersonId, person.id), eq(reviews.type, "manager")))
      .all()
      .find((r) => r.status !== "superseded");

    let overall: number | null = null;
    let competencies: Record<string, number> = {};
    let promoReadiness: string | null = null;
    let writingSeconds = 0;
    let linkedSources = 0;
    let coverageHits = 0;
    let coverageNeed = 0;
    let managerStatus = "not_started";

    if (manager) {
      managerStatus = manager.status;
      try {
        const payload = JSON.parse(manager.payloadJson) as Record<string, unknown>;
        overall = typeof payload.overall === "number" ? payload.overall : null;
        competencies = (payload.competencies ?? {}) as Record<string, number>;
        promoReadiness = typeof payload.promo_readiness === "string" ? payload.promo_readiness : null;
        if (typeof payload.writing_seconds_total === "number") writingSeconds = payload.writing_seconds_total;
        const links = db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, manager.id)).all();
        linkedSources = new Set(links.map((l) => l.sourceId)).size;
        const scored: Array<{ key: string; score: number }> = [
          ...Object.entries(competencies).map(([key, score]) => ({ key, score })),
          ...(overall != null ? [{ key: "overall", score: overall }] : []),
        ];
        for (const s of scored) {
          if (s.score === MIDDLE_BAND) continue;
          coverageNeed += 1;
          const has = links.some(
            (l) =>
              (s.key === "overall" && l.targetType === "overall") ||
              (l.targetType === "competency" && l.targetKey === s.key),
          );
          if (has) coverageHits += 1;
        }
      } catch {
        /* ignore bad payload */
      }
    }

    let priorOverall: number | null = null;
    if (priorCycle) {
      const priorManager = db
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.cycleId, priorCycle.id),
            eq(reviews.subjectPersonId, person.id),
            eq(reviews.type, "manager"),
          ),
        )
        .all()
        .find((r) => r.status !== "superseded");
      if (priorManager) {
        try {
          const payload = JSON.parse(priorManager.payloadJson) as Record<string, unknown>;
          priorOverall = typeof payload.overall === "number" ? payload.overall : null;
        } catch {
          priorOverall = null;
        }
      }
    }

    const dossierNonIntegrationCount =
      achRows.filter((a) => !a.sourceProvider).length + fbRows.length + docs + goalsN;
    const rollup = buildDeliveryRollup({
      personId: person.id,
      cycleId: cycle.id,
      windowStart: cycle.windowStart.slice(0, 10),
      windowEnd: cycle.windowEnd.slice(0, 10),
      achievements: achRows,
      dossierNonIntegrationCount,
    });
    const deliveryTrend = priorForTrend.map((pc) => {
      const r = buildDeliveryRollup({
        personId: person.id,
        cycleId: pc.id,
        windowStart: pc.windowStart.slice(0, 10),
        windowEnd: pc.windowEnd.slice(0, 10),
        achievements: achRows,
        dossierNonIntegrationCount,
      });
      return r.issuesDone + r.prsMerged;
    });

    peopleInputs.push({
      personId: person.id,
      personName: person.name,
      levelKey: person.levelKey,
      overall,
      priorOverall,
      competencies,
      promoReadiness,
      writingSeconds,
      evidenceCount,
      linkedSources,
      thin: evidenceCount < 2,
      managerStatus,
      coverageHits,
      coverageNeed,
      themes,
      openConcerns,
      deliveryDone: rollup.issuesDone + rollup.prsMerged,
      storyPointsDone: rollup.storyPointsDone,
      deliveryTrend,
      thinDeliveryEvidence: rollup.flags.thinDeliveryEvidence,
    });
  }

  const result: TeamPerformanceDTO = buildTeamPerformance({
    cycleId: cycle.id,
    cycleName: cycle.name,
    priorCycle: priorCycle ? { cycleId: priorCycle.id, cycleName: priorCycle.name } : null,
    people: peopleInputs,
  });
  return c.json(result);
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
    prevHash: r.prevHash,
    hash: r.hash,
  }));
  return c.json({ entries });
});

app.get("/api/activity/verify", (c) => {
  const result = verifyActivityChain();
  return c.json(result);
});

app.post("/api/activity/export", (c) => {
  try {
    const pack = exportAuditPack();
    logActivity("activity.export", "workspace", null, {
      count: pack.events.length,
      tipHash: pack.verification.tipHash,
      ok: pack.verification.ok,
    });
    return c.json(pack);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Export failed" }, 500);
  }
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
    const evidenceCount = ach + fb + docs + goalsN;
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
  if (manager.status !== "finalized" && manager.status !== "shared") {
    return c.json(
      { error: "Finalize the manager review before exporting a subject packet.", code: "not_finalized" },
      400,
    );
  }
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
    .map((s) => ({
      title: s.title,
      excerpt: s.excerpt,
      sourceId: s.sourceId,
      sourceType: s.sourceType,
    }));
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

  let timelineSlice: Array<{ at: string; kind: string; title: string; detail?: string | null }> = [];
  if (manager.frozenTimelineJson) {
    try {
      timelineSlice = JSON.parse(manager.frozenTimelineJson) as typeof timelineSlice;
    } catch {
      timelineSlice = [];
    }
  }
  if (!timelineSlice.length) {
    const priorEntries = priorCandidates.slice(0, 3).map((cand) => {
      const p = JSON.parse(cand.review.payloadJson) as Record<string, unknown>;
      return {
        at: cand.cycle.windowEnd,
        kind: "prior_review",
        title: `${cand.cycle.name} manager review`,
        detail: `Overall ${p.overall ?? "—"}`,
        sourceId: cand.review.id,
      };
    });
    timelineSlice = buildPersonTimeline(db, personId, { subjectFacing: true, priorEntries }).slice(0, 24);
  }

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
    notice:
      "Author names for peer input are hidden in this shared packet — not cryptographically anonymous. PDF = browser Print → Save as PDF.",
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

  const citeSnaps = review
    ? db
        .select()
        .from(citationSnapshots)
        .where(eq(citationSnapshots.reviewId, review.id))
        .all()
        .map((s) => ({ title: s.title, citeId: s.sourceId }))
    : [];
  // Fall back to recent achievements as allowlisted cites for committee pack.
  const achCites =
    citeSnaps.length > 0
      ? citeSnaps
      : db
          .select()
          .from(achievements)
          .where(eq(achievements.personId, row.personId))
          .all()
          .slice(0, 10)
          .map((a) => ({ title: a.title, citeId: a.id }));

  const cycle =
    db.select().from(cycles).all().sort((a, b) => b.windowEnd.localeCompare(a.windowEnd))[0] ?? null;
  const achRows = db.select().from(achievements).where(eq(achievements.personId, row.personId)).all();
  const rollup = cycle
    ? buildDeliveryRollup({
        personId: row.personId,
        cycleId: cycle.id,
        windowStart: cycle.windowStart.slice(0, 10),
        windowEnd: cycle.windowEnd.slice(0, 10),
        achievements: achRows,
        dossierNonIntegrationCount: achRows.filter((a) => !a.sourceProvider).length,
      })
    : null;

  let html = renderPromotionPacketHtml({
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
  html = enhancePromotionCommitteeHtml({
    baseHtml: html,
    citedEvidence: achCites,
    deliveryThemes: rollup?.themes ?? [],
  });

  if (format === "json") {
    return c.json({
      personName: person?.name,
      currentRole: current?.title,
      targetRole: target?.title,
      payload,
      assessments,
      citedEvidence: achCites,
      deliveryThemes: rollup?.themes ?? [],
      exportedAt,
    });
  }
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="promo-committee-${(person?.name ?? "case").replace(/\s+/g, "-").toLowerCase()}.html"`,
    },
  });
});

app.get("/api/exports/director-briefing/:cycleId", (c) => {
  const cycleId = c.req.param("cycleId");
  const personId = c.req.query("personId");
  const format = (c.req.query("format") ?? "html").toLowerCase();
  const pack = buildDirectorBriefing(getDb(), {
    cycleId,
    personId,
    loadRole,
    assignmentFor,
  });
  if (!pack) return c.json({ error: "Cycle not found" }, 404);
  logActivity("exports.director_briefing", "cycle", cycleId, {
    personId: personId ?? null,
    people: pack.people.length,
  });
  if (format === "json") return c.json(pack);
  const html = renderDirectorBriefingHtml(pack);
  const name = personId
    ? `director-briefing-${(pack.people[0]?.personName ?? "person").replace(/\s+/g, "-").toLowerCase()}.html`
    : `director-briefing-${pack.cycleName.replace(/\s+/g, "-").toLowerCase()}.html`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${name}"`,
    },
  });
});

app.get("/api/exports/calib-room/:cycleId", (c) => {
  const cycleId = c.req.param("cycleId");
  const format = (c.req.query("format") ?? "html").toLowerCase();
  const db = getDb();
  const cycle = db.select().from(cycles).where(eq(cycles.id, cycleId)).all()[0];
  if (!cycle) return c.json({ error: "Cycle not found" }, 404);

  const distribution = emptyDistribution();
  const cards: Array<{
    personName: string;
    roleTitle: string | null;
    overall: number | null;
    competencies: Record<string, number>;
    flags: string[];
    summaryExcerpt: string;
    evidenceLinkCount: number;
    evidenceGaps: number;
    managerStatus: string;
  }> = [];

  for (const cp of db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycle.id)).all()) {
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
    let overall: number | null = null;
    let comps: Record<string, number> = {};
    let summaryExcerpt = "";
    let flags: string[] = [];
    let evidenceGaps = 0;
    let evidenceLinkCount = 0;
    let managerStatus = "missing";
    if (manager) {
      managerStatus = manager.status;
      const payload = JSON.parse(manager.payloadJson) as Record<string, unknown>;
      overall = typeof payload.overall === "number" ? payload.overall : null;
      comps = (payload.competencies ?? {}) as Record<string, number>;
      summaryExcerpt = String(payload.summary ?? "").slice(0, 280);
      const links = db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, manager.id)).all();
      evidenceLinkCount = links.length;
      const scored: Array<{ key: string; score: number }> = [
        ...Object.entries(comps).map(([key, score]) => ({ key, score })),
        ...(overall != null ? [{ key: "overall", score: overall }] : []),
      ];
      for (const s of scored) {
        if (s.score === MIDDLE_BAND) continue;
        const has = links.some(
          (l) =>
            (s.key === "overall" && l.targetType === "overall") ||
            (l.targetType === "competency" && l.targetKey === s.key),
        );
        if (!has) {
          evidenceGaps += 1;
          flags.push(s.key === "overall" ? "missing_evidence" : `thin:${s.key}`);
        }
      }
      if (overall != null && (overall <= 2 || overall >= 4) && evidenceGaps > 0) flags.push("extreme_overall_thin");
    }
    bumpDistribution(distribution, overall);
    cards.push({
      personName: person.name,
      roleTitle: role?.title ?? null,
      overall,
      competencies: comps,
      flags,
      summaryExcerpt,
      evidenceLinkCount,
      evidenceGaps,
      managerStatus,
    });
  }

  const exportedAt = nowIso();
  logActivity("exports.calib_room", "cycle", cycleId, { cards: cards.length });
  if (format === "json") {
    return c.json({ cycleId, cycleName: cycle.name, exportedAt, distribution, cards });
  }
  const html = renderCalibRoomHtml({ cycleName: cycle.name, exportedAt, distribution, cards });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="calib-room-${cycle.name.replace(/\s+/g, "-").toLowerCase()}.html"`,
    },
  });
});

app.get("/api/director-attention", (c) => {
  const cycleId = c.req.query("cycleId");
  const db = getDb();
  const cycle = cycleId
    ? db.select().from(cycles).where(eq(cycles.id, cycleId)).all()[0]
    : db.select().from(cycles).all().sort((a, b) => b.windowStart.localeCompare(a.windowStart))[0];
  if (!cycle) return c.json({ error: "No cycle found" }, 404);
  const result = buildDirectorAttention(db, { cycleId: cycle.id });
  if (!result) return c.json({ error: "No cycle found" }, 404);
  return c.json(result);
});

app.post("/api/exports/readonly-bundle", async (c) => {
  const body = await c.req.json<{
    cycleId: string;
    personId?: string;
    passphrase: string;
    include?: Array<"director_briefing" | "calib_room" | "promo">;
  }>();
  if (!body.cycleId?.trim()) return c.json({ error: "cycleId required" }, 400);
  if (!body.passphrase || body.passphrase.length < 8) {
    return c.json({ error: "Passphrase must be at least 8 characters" }, 400);
  }
  const include = new Set(body.include?.length ? body.include : ["director_briefing", "calib_room"]);
  const db = getDb();
  const cycle = db.select().from(cycles).where(eq(cycles.id, body.cycleId)).all()[0];
  if (!cycle) return c.json({ error: "Cycle not found" }, 404);

  const parts: Record<string, unknown> = {
    kind: "prm_readonly_bundle",
    version: 1,
    cycleId: cycle.id,
    cycleName: cycle.name,
    exportedAt: nowIso(),
    notice: "Encrypted read-only handoff. Private notes and em_only items are omitted from included packs.",
  };

  if (include.has("director_briefing")) {
    const briefing = buildDirectorBriefing(db, {
      cycleId: cycle.id,
      personId: body.personId,
      loadRole,
      assignmentFor,
    });
    parts.directorBriefing = briefing;
    parts.directorBriefingHtml = briefing ? renderDirectorBriefingHtml(briefing) : null;
  }
  if (include.has("calib_room")) {
    // Reuse JSON shape from calib-room endpoint logic via briefing distribution + consistency-like cards
    const briefing = buildDirectorBriefing(db, { cycleId: cycle.id, loadRole, assignmentFor });
    if (briefing) {
      parts.calibRoom = {
        cycleName: briefing.cycleName,
        distribution: briefing.distribution,
        cards: briefing.people.map((p) => ({
          personName: p.personName,
          roleTitle: p.roleTitle,
          overall: p.overall,
          competencies: p.competencies,
          flags: p.flags,
          summaryExcerpt: p.citedBullets[0]?.text?.slice(0, 280) ?? "",
          evidenceLinkCount: p.citedBullets.length,
          evidenceGaps: p.flags.filter((f) => f.startsWith("thin:") || f === "missing_evidence").length,
          managerStatus: p.managerStatus,
        })),
      };
      parts.calibRoomHtml = renderCalibRoomHtml({
        cycleName: briefing.cycleName,
        exportedAt: briefing.exportedAt,
        distribution: briefing.distribution,
        cards: (parts.calibRoom as { cards: Parameters<typeof renderCalibRoomHtml>[0]["cards"] }).cards,
      });
    }
  }

  const plain = Buffer.from(JSON.stringify(parts), "utf8");
  const sealed = sealReadonlyBundle(plain, body.passphrase);
  logActivity("exports.readonly_bundle", "cycle", cycle.id, {
    bytes: sealed.byteLength,
    include: [...include],
  });
  return new Response(new Uint8Array(sealed), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${readonlyBundleFilename(cycle.name)}"`,
    },
  });
});

registerP1Routes(app, {
  loadRole,
  assignmentFor: (personId) => {
    const a = assignmentFor(personId);
    return a
      ? { roleDefinitionId: a.roleDefinitionId, frameworkVersionId: a.frameworkVersionId }
      : null;
  },
  getPublishedVersion: () => {
    const v = getPublishedVersion();
    if (!v) return null;
    return {
      id: v.id,
      frameworkId: v.frameworkId,
      versionLabel: v.versionLabel,
      sourceFilename: v.sourceFilename,
      ownerName: v.ownerName ?? null,
      effectiveFrom: v.effectiveFrom ?? null,
      effectiveTo: v.effectiveTo ?? null,
    };
  },
  frameworkInsufficient,
});

registerOneOnOneRoutes(app, { buildEvidenceContext });

registerFeatureRoutes(app, {
  buildEvidenceContext,
  buildWorkspaceContext,
});

/** Packaged desktop: serve the Vite UI from PRM_UI_DIR so the webview is same-origin with /api. */
const uiDir = process.env.PRM_UI_DIR?.trim();
if (uiDir) {
  const root = resolve(uiDir);
  const mime: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".json": "application/json",
    ".map": "application/json",
  };
  const inside = (file: string) => {
    const f = resolve(file);
    return f === root || f.startsWith(root + sep);
  };
  app.get("*", async (c) => {
    const urlPath = decodeURIComponent(new URL(c.req.url).pathname);
    if (urlPath.startsWith("/api")) return c.json({ error: "Not found" }, 404);
    const rel =
      !urlPath || urlPath === "/"
        ? "index.html"
        : normalize(urlPath.replace(/^[/\\]+/, "")).replace(/^(\.\.([/\\]|$))+/g, "");
    const candidates = [join(root, rel)];
    if (!extname(rel)) candidates.push(join(root, rel, "index.html"));
    candidates.push(join(root, "index.html"));
    for (const file of candidates) {
      if (!inside(file)) continue;
      try {
        await access(file);
        const body = await readFile(file);
        const type = mime[extname(file).toLowerCase()] ?? "application/octet-stream";
        return new Response(body, { headers: { "content-type": type } });
      } catch {
        /* try next */
      }
    }
    return c.text("Not found", 404);
  });
  console.log(`PRM UI static root: ${root}`);
}

const port = Number(process.env.PRM_PORT ?? 8787);
console.log(`PRM API listening on http://127.0.0.1:${port}`);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
