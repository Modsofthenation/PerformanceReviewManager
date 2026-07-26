import { eq } from "drizzle-orm";
import { cycles, workspace } from "@prm/db";
import { getDb, id, logActivity, nowIso } from "./store.js";

export type RetentionPolicy = "current_plus_previous" | "current_only" | "keep_all";

export type WorkspaceSettings = {
  retention: RetentionPolicy;
  legalHold: boolean;
  templates?: Record<string, unknown>;
  onboarding?: { completed?: boolean; step?: string };
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  retention: "current_plus_previous",
  legalHold: false,
};

export function readWorkspaceSettings(): WorkspaceSettings {
  const db = getDb();
  const row = db.select().from(workspace).limit(1).all()[0];
  if (!row) return { ...DEFAULT_WORKSPACE_SETTINGS };
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(row.settingsJson || "{}") as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const retention =
    parsed.retention === "current_only" || parsed.retention === "keep_all" || parsed.retention === "current_plus_previous"
      ? parsed.retention
      : DEFAULT_WORKSPACE_SETTINGS.retention;
  return {
    retention,
    legalHold: Boolean(parsed.legalHold),
    templates: (parsed.templates as Record<string, unknown> | undefined) ?? undefined,
    onboarding: (parsed.onboarding as WorkspaceSettings["onboarding"]) ?? undefined,
  };
}

export function writeWorkspaceSettings(patch: Partial<WorkspaceSettings>): WorkspaceSettings {
  const db = getDb();
  const row = db.select().from(workspace).limit(1).all()[0];
  if (!row) throw new Error("Workspace not initialized");
  const current = readWorkspaceSettings();
  const next: WorkspaceSettings = {
    ...current,
    ...patch,
    templates: patch.templates !== undefined ? patch.templates : current.templates,
    onboarding: patch.onboarding !== undefined ? { ...current.onboarding, ...patch.onboarding } : current.onboarding,
  };
  // Preserve unrelated settingsJson keys
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(row.settingsJson || "{}") as Record<string, unknown>;
  } catch {
    raw = {};
  }
  raw.retention = next.retention;
  raw.legalHold = next.legalHold;
  if (next.templates !== undefined) raw.templates = next.templates;
  if (next.onboarding !== undefined) raw.onboarding = next.onboarding;
  db.update(workspace)
    .set({ settingsJson: JSON.stringify(raw) })
    .where(eq(workspace.id, row.id))
    .run();
  logActivity("workspace.settings", "workspace", row.id, {
    retention: next.retention,
    legalHold: next.legalHold,
  });
  return next;
}

/** Cycles eligible for purge under current retention (never touches open cycles). */
export function cyclesEligibleForPurge(): Array<{ id: string; name: string; windowEnd: string }> {
  const settings = readWorkspaceSettings();
  if (settings.retention === "keep_all") return [];
  const db = getDb();
  const all = db
    .select()
    .from(cycles)
    .all()
    .slice()
    .sort((a, b) => b.windowEnd.localeCompare(a.windowEnd));
  const closed = all.filter((c) => c.status === "closed");
  if (settings.retention === "current_only") {
    // Keep newest non-closed if any; else newest closed. Purge older closed.
    const keepIds = new Set(all.filter((c) => c.status !== "closed").map((c) => c.id));
    if (keepIds.size === 0 && closed[0]) keepIds.add(closed[0].id);
    return closed.filter((c) => !keepIds.has(c.id)).map((c) => ({ id: c.id, name: c.name, windowEnd: c.windowEnd }));
  }
  // current_plus_previous: keep all open + two most recent closed
  const keepClosed = closed.slice(0, 2).map((c) => c.id);
  const keep = new Set([...all.filter((c) => c.status !== "closed").map((c) => c.id), ...keepClosed]);
  return closed.filter((c) => !keep.has(c.id)).map((c) => ({ id: c.id, name: c.name, windowEnd: c.windowEnd }));
}

export function assertNotLegalHold() {
  if (readWorkspaceSettings().legalHold) {
    const err = new Error("Legal hold is on — purge and destructive retention actions are blocked.");
    (err as Error & { code?: string }).code = "legal_hold";
    throw err;
  }
}

export function purgeEligibleCycles(): { purged: string[]; blocked: boolean } {
  assertNotLegalHold();
  const eligible = cyclesEligibleForPurge();
  const db = getDb();
  const purged: string[] = [];
  for (const c of eligible) {
    // Soft-delete: mark purged in name/status rather than cascading hard deletes of reviews
    // (keeps audit trail; removes from active lists via status).
    db.update(cycles)
      .set({ status: "purged", name: `${c.name} (purged)` })
      .where(eq(cycles.id, c.id))
      .run();
    logActivity("cycle.purge", "cycle", c.id, { name: c.name });
    purged.push(c.id);
  }
  return { purged, blocked: false };
}

export function newId(prefix: string) {
  return id(prefix);
}

export { nowIso };
