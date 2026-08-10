import type { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import {
  achievements,
  cycleParticipants,
  cycles,
  documents,
  feedbackItems,
  goals,
  integrationSettings,
  people,
  reviews,
  roleAssignments,
  workspace,
} from "@prm/db";
import { buildAiEstimate } from "./aiEstimate.js";
import { buildSystemPrompt, buildChatSystemPrompt, getAiConfig, type ChatMessage } from "./ai.js";
import {
  cloneTemplate,
  deleteTemplate,
  emptyFieldsFromTemplate,
  getTemplate,
  listTemplates,
  saveTemplate,
} from "./templates.js";
import {
  cyclesEligibleForPurge,
  purgeEligibleCycles,
  readWorkspaceSettings,
  writeWorkspaceSettings,
  type OnboardingStep,
  type RetentionPolicy,
} from "./workspaceSettings.js";
import { getDb, id, logActivity, nowIso } from "./store.js";

type Helpers = {
  buildEvidenceContext: (
    personId: string,
    cycleId?: string,
  ) => { lines: string[]; citations: string[]; dataClassesSent: string[]; person?: { name: string } | null };
  buildWorkspaceContext: (cycleId?: string) => {
    lines: string[];
    citations: string[];
    dataClassesSent: string[];
    scopeLabel: string;
  };
};

export function registerFeatureRoutes(app: Hono<any>, helpers: Helpers) {
  app.get("/api/workspace/settings", (c) => {
    const s = readWorkspaceSettings();
    const eligible = s.legalHold ? [] : cyclesEligibleForPurge();
    return c.json({
      ...s,
      retentionLabel:
        s.retention === "current_plus_previous"
          ? "Keep current + previous cycle"
          : s.retention === "current_only"
            ? "Keep current cycle only"
            : "Keep all cycles",
      purgeEligible: eligible,
    });
  });

  app.put("/api/workspace/settings", async (c) => {
    const body = await c.req.json<{
      retention?: RetentionPolicy;
      legalHold?: boolean;
      onboarding?: { completed?: boolean; step?: string; skipped?: Partial<Record<string, boolean>> };
    }>();
    if (body.retention && !["current_plus_previous", "current_only", "keep_all"].includes(body.retention)) {
      return c.json({ error: "Invalid retention policy" }, 400);
    }
    const next = writeWorkspaceSettings({
      retention: body.retention,
      legalHold: body.legalHold,
      onboarding: body.onboarding,
    });
    return c.json(next);
  });

  app.post("/api/workspace/purge-old-cycles", async (c) => {
    try {
      const result = purgeEligibleCycles();
      return c.json({ ok: true, ...result, remainingEligible: cyclesEligibleForPurge() });
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "legal_hold") {
        return c.json({ error: err.message, code: "legal_hold" }, 403);
      }
      return c.json({ error: err.message }, 400);
    }
  });

  app.post("/api/ai/estimate", async (c) => {
    const body = await c.req.json<{
      feature: string;
      cycleId?: string;
      personId?: string;
      section?: string;
      messages?: ChatMessage[];
      confirmWorkspaceScope?: boolean;
    }>();
    const cfg = getAiConfig();
    if (!cfg.enabled && body.feature !== "bias_lint") {
      return c.json({ error: "AI disabled — enable in Settings → AI" }, 400);
    }

    let messages: ChatMessage[] = body.messages ?? [];
    let dataClassesSent: string[] = [];

    if (!messages.length) {
      if (body.feature === "chat_dossier") {
        const ctx = helpers.buildWorkspaceContext(body.cycleId);
        dataClassesSent = ctx.dataClassesSent;
        messages = [
          { role: "system", content: buildChatSystemPrompt() },
          {
            role: "user",
            content: `WORKSPACE EVIDENCE (${ctx.scopeLabel}):\n${ctx.lines.join("\n")}\n\nUser question: (preview — actual question sent on confirm)`,
          },
        ];
      } else if (body.personId && body.cycleId) {
        const ctx = helpers.buildEvidenceContext(body.personId, body.cycleId);
        dataClassesSent = ctx.dataClassesSent;
        const userPrompt =
          body.feature === "draft_section"
            ? `Draft the "${body.section ?? "strengths"}" section.\n\nEVIDENCE:\n${ctx.lines.join("\n")}`
            : body.feature === "peer_synthesize"
              ? `Synthesize peer themes.\n\nEVIDENCE:\n${ctx.lines.join("\n")}`
              : body.feature === "skip_level_talking_points"
                ? `Skip-level talking points.\n\nEVIDENCE:\n${ctx.lines.join("\n")}`
                : `Evidence digest.\n\nEVIDENCE:\n${ctx.lines.join("\n")}`;
        messages = [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userPrompt },
        ];
      } else {
        return c.json({ error: "personId+cycleId or messages required" }, 400);
      }
    }

    return c.json(buildAiEstimate({ feature: body.feature, messages, dataClassesSent }));
  });

  app.get("/api/templates", (c) => c.json({ templates: listTemplates() }));

  app.get("/api/templates/:key", (c) => {
    const tpl = getTemplate(c.req.param("key"));
    if (!tpl) return c.json({ error: "Not found" }, 404);
    return c.json(tpl);
  });

  app.post("/api/templates/clone", async (c) => {
    const body = await c.req.json<{ sourceKey: string; newKey: string; name?: string }>();
    try {
      const tpl = cloneTemplate(body.sourceKey, body.newKey, body.name);
      return c.json(tpl);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Clone failed" }, 400);
    }
  });

  app.put("/api/templates/:key", async (c) => {
    const key = c.req.param("key");
    const body = await c.req.json<{ name?: string; blocks?: unknown[] }>();
    const existing = getTemplate(key);
    if (!existing) return c.json({ error: "Not found" }, 404);
    const saved = saveTemplate({
      ...existing,
      name: body.name ?? existing.name,
      blocks: (body.blocks as typeof existing.blocks) ?? existing.blocks,
    });
    return c.json(saved);
  });

  app.delete("/api/templates/:key", (c) => {
    try {
      deleteTemplate(c.req.param("key"));
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Delete failed" }, 400);
    }
  });

  app.patch("/api/people/:id", async (c) => {
    const personId = c.req.param("id");
    const body = await c.req.json<{
      name?: string;
      email?: string | null;
      title?: string | null;
      levelKey?: string | null;
      managerId?: string | null;
      hireDate?: string | null;
      status?: string;
    }>();
    const db = getDb();
    const row = db.select().from(people).where(eq(people.id, personId)).all()[0];
    if (!row) return c.json({ error: "Not found" }, 404);
    if (body.managerId === personId) return c.json({ error: "Person cannot manage themselves" }, 400);
    if (body.managerId) {
      const mgr = db.select().from(people).where(eq(people.id, body.managerId)).all()[0];
      if (!mgr) return c.json({ error: "Manager not found" }, 400);
    }
    const prevManager = row.managerId;
    db.update(people)
      .set({
        name: body.name ?? row.name,
        email: body.email !== undefined ? body.email : row.email,
        title: body.title !== undefined ? body.title : row.title,
        levelKey: body.levelKey !== undefined ? body.levelKey : row.levelKey,
        managerId: body.managerId !== undefined ? body.managerId : row.managerId,
        hireDate: body.hireDate !== undefined ? body.hireDate : row.hireDate,
        status: body.status ?? row.status,
      })
      .where(eq(people.id, personId))
      .run();
    if (body.managerId !== undefined && body.managerId !== prevManager) {
      logActivity("person.manager_change", "person", personId, {
        from: prevManager,
        to: body.managerId,
      });
    }
    const updated = db.select().from(people).where(eq(people.id, personId)).all()[0];
    return c.json(updated);
  });

  app.post("/api/cycles/:cycleId/participants/:personId/reassign-manager", async (c) => {
    const { cycleId, personId } = c.req.param();
    const body = await c.req.json<{ newManagerPersonId: string; reason?: string }>();
    const db = getDb();
    const cycle = db.select().from(cycles).where(eq(cycles.id, cycleId)).all()[0];
    const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
    const newMgr = db.select().from(people).where(eq(people.id, body.newManagerPersonId)).all()[0];
    if (!cycle || !person || !newMgr) return c.json({ error: "Not found" }, 404);

    const cp = db
      .select()
      .from(cycleParticipants)
      .where(and(eq(cycleParticipants.cycleId, cycleId), eq(cycleParticipants.personId, personId)))
      .all()[0];
    if (!cp) return c.json({ error: "Not a cycle participant" }, 404);

    const prevManagerId = cp.managerPersonId;
    db.update(cycleParticipants)
      .set({ managerPersonId: body.newManagerPersonId })
      .where(eq(cycleParticipants.id, cp.id))
      .run();

    // Supersede active manager reviews authored under prior manager snapshot
    const mgrReviews = db
      .select()
      .from(reviews)
      .where(
        and(
          eq(reviews.cycleId, cycleId),
          eq(reviews.subjectPersonId, personId),
          eq(reviews.type, "manager"),
        ),
      )
      .all()
      .filter((r) => r.status !== "superseded");

    const superseded: string[] = [];
    for (const r of mgrReviews) {
      if (r.status === "finalized" || r.status === "shared" || r.status === "draft") {
        db.update(reviews).set({ status: "superseded", updatedAt: nowIso() }).where(eq(reviews.id, r.id)).run();
        superseded.push(r.id);
      }
    }

    // Seed a fresh draft for the new manager contribution
    const draftId = id("rev");
    const seedPayload =
      mgrReviews[0]?.payloadJson ??
      JSON.stringify({
        competencies: {},
        overall: null,
        strengths: "",
        growth: "",
        summary: "",
        private_notes: "",
      });
    db.insert(reviews)
      .values({
        id: draftId,
        cycleId,
        subjectPersonId: personId,
        authorPersonId: body.newManagerPersonId,
        authorName: newMgr.name,
        type: "manager",
        status: "draft",
        payloadJson: seedPayload,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      .run();

    // Also update roster manager for ongoing dossier ownership
    db.update(people).set({ managerId: body.newManagerPersonId }).where(eq(people.id, personId)).run();

    logActivity("cycle.manager_reassign", "cycle_participant", cp.id, {
      cycleId,
      personId,
      from: prevManagerId,
      to: body.newManagerPersonId,
      superseded,
      newDraftId: draftId,
      reason: body.reason ?? null,
    });

    return c.json({
      ok: true,
      participantId: cp.id,
      supersededReviewIds: superseded,
      newDraftReviewId: draftId,
      previousManagerPersonId: prevManagerId,
      newManagerPersonId: body.newManagerPersonId,
    });
  });

  app.get("/api/people/:id/documents-for-transcript", (c) => {
    const personId = c.req.param("id");
    const db = getDb();
    const docs = db
      .select()
      .from(documents)
      .where(eq(documents.personId, personId))
      .all()
      .filter((d) => /\.(txt|md|vtt|text)$/i.test(d.filename) || /transcript|meet|notes/i.test(d.filename))
      .map((d) => ({
        id: d.id,
        filename: d.filename,
        createdAt: d.createdAt,
        visibility: d.visibility,
      }));
    return c.json({ documents: docs });
  });

  // Empty-workspace onboarding status helper
  app.get("/api/onboarding", (c) => {
    const db = getDb();
    const ws = db.select().from(workspace).limit(1).all()[0];
    const allPeople = db.select().from(people).all();
    const directs = allPeople.filter((p) => p.managerId);
    const cycleCount = db.select().from(cycles).all().filter((x) => x.status !== "purged").length;
    const settings = readWorkspaceSettings();
    const ai = getAiConfig();

    let unassignedRoleCount = 0;
    let thinEvidenceCount = 0;
    for (const p of directs) {
      const active = db
        .select()
        .from(roleAssignments)
        .where(and(eq(roleAssignments.personId, p.id), isNull(roleAssignments.effectiveTo)))
        .all()[0];
      if (!active) unassignedRoleCount += 1;
      const ach = db.select().from(achievements).where(eq(achievements.personId, p.id)).all().length;
      const fb = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, p.id)).all().length;
      const docs = db.select().from(documents).where(eq(documents.personId, p.id)).all().length;
      const goalsN = db.select().from(goals).where(eq(goals.personId, p.id)).all().length;
      if (ach + fb + docs + goalsN < 2) thinEvidenceCount += 1;
    }

    const integrationsEnabled = db
      .select()
      .from(integrationSettings)
      .all()
      .filter((r) => r.enabled)
      .map((r) => r.id);

    const skipped = settings.onboarding?.skipped ?? {};
    const inferredStep = (): OnboardingStep => {
      if (allPeople.length === 0 || directs.length === 0) return "team";
      if (unassignedRoleCount > 0 && !skipped.roles) return "roles";
      if (!ai.hasApiKey && !ai.enabled && !skipped.ai) return "ai";
      if (integrationsEnabled.length === 0 && !skipped.integrations) return "integrations";
      if (thinEvidenceCount > 0 && !skipped.backfill) return "backfill";
      return "done";
    };

    const step = (settings.onboarding?.step as OnboardingStep | undefined) ?? inferredStep();
    const neverStarted = settings.onboarding === undefined;
    const completed =
      Boolean(settings.onboarding?.completed) || (neverStarted && allPeople.length > 0);

    return c.json({
      completed,
      step: completed ? "done" : step,
      skipped,
      personCount: allPeople.length,
      directCount: directs.length,
      unassignedRoleCount,
      thinEvidenceCount,
      cycleCount,
      hasAiKey: ai.hasApiKey,
      aiEnabled: ai.enabled,
      integrationsEnabled,
      workspaceName: ws?.name ?? null,
    });
  });

  app.put("/api/onboarding", async (c) => {
    const body = await c.req.json<{
      completed?: boolean;
      step?: string;
      skipped?: Partial<Record<string, boolean>>;
    }>();
    const next = writeWorkspaceSettings({
      onboarding: {
        completed: body.completed,
        step: body.step,
        skipped: body.skipped,
      },
    });
    return c.json({ ok: true, onboarding: next.onboarding });
  });
}

/** Used by bundle export to prefer custom template fields. */
export function bundleFieldsForKind(kind: "self" | "peer") {
  const key = kind === "self" ? "ic_self" : "peer";
  const tpl = getTemplate(key);
  if (tpl) return { templateKey: tpl.key, templateName: tpl.name, fields: emptyFieldsFromTemplate(tpl), blocks: tpl.blocks };
  return null;
}
