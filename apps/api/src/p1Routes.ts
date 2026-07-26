import type { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import {
  achievements,
  cycleParticipants,
  cycles,
  documents,
  evidenceLinks,
  feedbackItems,
  goals,
  meetingSummaries,
  people,
  reviews,
  roleAssignments,
  roleDefinitions,
  roleExpectations,
  roleFrameworkVersions,
  roleFrameworks,
} from "@prm/db";
import type {
  BiasFinding,
  CalibBundleDTO,
  CalibDecisionInput,
  DueThisWeekItem,
  ReviewSearchHit,
  StagnationHint,
  Visibility,
} from "@prm/shared";
import { summarizeTranscriptLocally, toMeetingSummaryDto } from "./meetingSummary.js";
import { computeStagnationHints } from "./stagnation.js";
import { rebuildReviewsFts, searchReviewsFts } from "./reviewSearch.js";
import { applyFaithfulnessFix, mergeLintFindings, runFaithfulnessLint } from "./faithfulness.js";
import { runBiasToneLint } from "./bias.js";
import { getAiConfig, runChat, storeGeneration } from "./ai.js";
import { getDb, getSqlite, id, logActivity, nowIso, writeEncryptedDocument } from "./store.js";

type RoleLite = {
  id: string;
  title: string;
  key: string;
  expectations: Array<{ id: string; kind: string; text: string }>;
  nextRoleKeys: string[];
} | null;

type Helpers = {
  loadRole: (id: string | null | undefined) => RoleLite;
  assignmentFor: (personId: string) => { roleDefinitionId: string; frameworkVersionId: string } | null;
  getPublishedVersion: () => {
    id: string;
    frameworkId: string;
    versionLabel: string;
    sourceFilename: string | null;
    ownerName: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
  } | null;
  frameworkInsufficient: (versionId: string) => string[];
};

function phaseStatus(json: string): Record<string, string> {
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

function evidenceAllowlist(personId: string, cycleId?: string): string[] {
  const db = getDb();
  const ids = [
    ...db.select().from(achievements).where(eq(achievements.personId, personId)).all().map((a) => a.id),
    ...db.select().from(goals).where(eq(goals.personId, personId)).all().map((g) => g.id),
    ...db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, personId)).all().map((f) => f.id),
    ...db.select().from(documents).where(eq(documents.personId, personId)).all().map((d) => d.id),
    ...db.select().from(meetingSummaries).where(eq(meetingSummaries.personId, personId)).all().map((m) => m.id),
  ];
  if (cycleId) {
    const manager = db
      .select()
      .from(reviews)
      .where(
        and(eq(reviews.cycleId, cycleId), eq(reviews.subjectPersonId, personId), eq(reviews.type, "manager")),
      )
      .all()
      .find((r) => r.status !== "superseded");
    if (manager) {
      ids.push(
        ...db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, manager.id)).all().map((l) => l.sourceId),
      );
    }
  }
  return [...new Set(ids)];
}

export function registerP1Routes(app: Hono<any>, helpers: Helpers) {
  const { loadRole, assignmentFor, getPublishedVersion, frameworkInsufficient } = helpers;

  app.get("/api/people/:id/meeting-summaries", (c) => {
    const personId = c.req.param("id");
    const rows = getDb()
      .select()
      .from(meetingSummaries)
      .where(eq(meetingSummaries.personId, personId))
      .all()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return c.json(rows.map(toMeetingSummaryDto));
  });

  app.post("/api/people/:id/meeting-summaries", async (c) => {
    const personId = c.req.param("id");
    const db = getDb();
    const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
    if (!person) return c.json({ error: "Person not found" }, 404);

    const body = await c.req.json<{
      title?: string;
      occurredAt?: string;
      transcript?: string;
      summaryText?: string;
      themes?: string[];
      visibility?: Visibility;
      consentNoted?: boolean;
      useAi?: boolean;
      sourceDocumentId?: string;
    }>();

    if (!body.consentNoted) {
      return c.json(
        {
          error:
            "Consent required: confirm the participant knows notes may be stored in your local EM vault (private by default; not a legal privilege).",
          code: "meeting_consent_required",
        },
        400,
      );
    }

    const transcript = (body.transcript ?? "").trim();
    let sourceDocumentId = body.sourceDocumentId ?? null;
    const title = (body.title ?? "1:1 / meeting summary").trim() || "1:1 / meeting summary";
    const occurredAt = body.occurredAt ?? nowIso().slice(0, 10);
    let summaryText = (body.summaryText ?? "").trim();
    let themes = body.themes ?? [];

    if (!summaryText) {
      if (!transcript) return c.json({ error: "Provide transcript text or summaryText" }, 400);
      if (body.useAi) {
        const cfg = getAiConfig();
        if (!cfg.enabled) return c.json({ error: "AI is disabled — paste a summary or turn AI on" }, 400);
        if (!cfg.localOnly && !cfg.meetingSummaryEgress) {
          return c.json(
            {
              error:
                "Meeting summary cloud egress is off. Enable it in Settings → AI, use local-only, or save a manual summary.",
            },
            400,
          );
        }
        try {
          const result = await runChat("meeting_summary", [
            {
              role: "system",
              content:
                "You summarize 1:1 / meeting transcripts for a solo engineering manager. Return concise bullet highlights, decisions, and follow-ups. Do not invent facts.",
            },
            {
              role: "user",
              content: `Person: ${person.name}\nTitle: ${title}\nTranscript:\n${transcript.slice(0, 80_000)}`,
            },
          ]);
          summaryText = result.text.trim();
          themes = summarizeTranscriptLocally(transcript).themes;
          storeGeneration({
            feature: "meeting_summary",
            subjectPersonId: personId,
            outputText: summaryText,
            model: result.model,
            citations: [],
            dataClassesSent: ["meeting_summary"],
          });
        } catch (e) {
          return c.json({ error: e instanceof Error ? e.message : "AI summary failed" }, 500);
        }
      } else {
        const local = summarizeTranscriptLocally(transcript);
        summaryText = local.summaryText;
        themes = local.themes;
      }
    }

    if (transcript && !sourceDocumentId) {
      const filename = `meeting-${occurredAt}.txt`;
      const saved = writeEncryptedDocument(filename, Buffer.from(transcript, "utf8"));
      const docId = id("doc");
      db.insert(documents)
        .values({
          id: docId,
          personId,
          title: `${title} (raw transcript)`,
          filename,
          mimeType: "text/plain",
          storagePath: saved.storagePath,
          visibility: "em_only",
          occurredAt,
          scanStatus: "allowlist_ok",
          createdAt: nowIso(),
        })
        .run();
      sourceDocumentId = docId;
    }

    const ts = nowIso();
    const mid = id("meet");
    db.insert(meetingSummaries)
      .values({
        id: mid,
        personId,
        sourceDocumentId,
        occurredAt,
        title,
        summaryText,
        themesJson: JSON.stringify(themes),
        visibility: body.visibility ?? "em_only",
        consentNoted: 1,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    logActivity("meeting_summary.create", "meeting_summary", mid, {
      personId,
      visibility: body.visibility ?? "em_only",
    });
    return c.json(
      toMeetingSummaryDto(db.select().from(meetingSummaries).where(eq(meetingSummaries.id, mid)).all()[0]!),
    );
  });

  app.get("/api/due-this-week", (c) => {
    const db = getDb();
    const withinDays = Math.min(30, Math.max(1, Number(c.req.query("days") ?? 7)));
    const today = nowIso().slice(0, 10);
    const items: DueThisWeekItem[] = [];
    for (const cycle of db.select().from(cycles).all()) {
      if (cycle.status === "closed") continue;
      const daysUntilDue = Math.ceil(
        (Date.parse(cycle.windowEnd) - Date.parse(today)) / (24 * 60 * 60 * 1000),
      );
      if (Number.isNaN(daysUntilDue) || daysUntilDue < 0 || daysUntilDue > withinDays) continue;
      for (const cp of db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycle.id)).all()) {
        const person = db.select().from(people).where(eq(people.id, cp.personId)).all()[0];
        if (!person) continue;
        const phase = phaseStatus(cp.phaseStatusJson);
        const manager = db
          .select()
          .from(reviews)
          .where(
            and(eq(reviews.cycleId, cycle.id), eq(reviews.subjectPersonId, cp.personId), eq(reviews.type, "manager")),
          )
          .all()
          .find((r) => r.status !== "superseded");
        const selfStatus = phase.self ?? "pending";
        const peerStatus = phase.peer ?? "pending";
        items.push({
          personId: person.id,
          personName: person.name,
          cycleId: cycle.id,
          cycleName: cycle.name,
          windowEnd: cycle.windowEnd,
          daysUntilDue,
          missingSelf: selfStatus !== "returned" && selfStatus !== "waived",
          missingPeer: peerStatus !== "returned" && peerStatus !== "waived",
          managerStatus: manager?.status ?? "missing",
        });
      }
    }
    items.sort((a, b) => a.daysUntilDue - b.daysUntilDue || a.personName.localeCompare(b.personName));
    return c.json({ withinDays, items });
  });

  app.post("/api/calib/export", async (c) => {
    const body = await c.req.json<{ cycleId: string; personIds?: string[] }>();
    const db = getDb();
    const cycle = db.select().from(cycles).where(eq(cycles.id, body.cycleId)).all()[0];
    if (!cycle) return c.json({ error: "Cycle not found" }, 404);
    const want = body.personIds?.length ? new Set(body.personIds) : null;
    const cards: CalibBundleDTO["cards"] = [];
    for (const cp of db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycle.id)).all()) {
      if (want && !want.has(cp.personId)) continue;
      const person = db.select().from(people).where(eq(people.id, cp.personId)).all()[0];
      if (!person) continue;
      const a = assignmentFor(cp.personId);
      const role = loadRole(cp.roleDefinitionId ?? a?.roleDefinitionId);
      const manager = db
        .select()
        .from(reviews)
        .where(
          and(eq(reviews.cycleId, cycle.id), eq(reviews.subjectPersonId, cp.personId), eq(reviews.type, "manager")),
        )
        .all()
        .find((r) => r.status !== "superseded");
      const payload = manager ? (JSON.parse(manager.payloadJson) as Record<string, unknown>) : {};
      const overall = typeof payload.overall === "number" ? payload.overall : null;
      const comps = (payload.competencies ?? {}) as Record<string, number>;
      const links = manager
        ? db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, manager.id)).all()
        : [];
      const flags: string[] = [];
      let evidenceGaps = 0;
      const scored: Array<{ key: string; score: number }> = [
        ...Object.entries(comps).map(([key, score]) => ({ key, score })),
        ...(overall != null ? [{ key: "overall", score: overall }] : []),
      ];
      for (const s of scored) {
        if (s.score === 3) continue;
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
      cards.push({
        personId: person.id,
        personName: person.name,
        title: person.title,
        roleTitle: role?.title ?? null,
        overall,
        competencies: comps,
        evidenceLinkCount: links.length,
        evidenceGaps,
        managerStatus: manager?.status ?? "missing",
        flags,
        summaryExcerpt: String(payload.summary ?? "").slice(0, 280),
      });
    }
    const bundle: CalibBundleDTO = {
      version: 1,
      kind: "calib",
      cycleId: cycle.id,
      cycleName: cycle.name,
      exportedAt: nowIso(),
      cards,
    };
    logActivity("calib.export", "cycle", cycle.id, { cardCount: cards.length });
    return c.json(bundle);
  });

  app.post("/api/calib/import", async (c) => {
    const body = await c.req.json<{ bundle: CalibBundleDTO; decisions: CalibDecisionInput[] }>();
    if (!body.bundle || body.bundle.kind !== "calib") return c.json({ error: "Invalid calib bundle" }, 400);
    const db = getDb();
    const cycle = db.select().from(cycles).where(eq(cycles.id, body.bundle.cycleId)).all()[0];
    if (!cycle) return c.json({ error: "Cycle not found for this calib bundle" }, 404);

    let applied = 0;
    for (const decision of body.decisions ?? []) {
      const manager = db
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.cycleId, cycle.id),
            eq(reviews.subjectPersonId, decision.personId),
            eq(reviews.type, "manager"),
          ),
        )
        .all()
        .find((r) => r.status !== "superseded");
      if (!manager || manager.status === "finalized" || manager.status === "shared") continue;
      const payload = JSON.parse(manager.payloadJson) as Record<string, unknown>;
      if (decision.overall != null) payload.overall = decision.overall;
      if (decision.competencies) {
        payload.competencies = { ...(payload.competencies as object), ...decision.competencies };
      }
      if (decision.note?.trim()) {
        payload.private_notes = `${String(payload.private_notes ?? "")}\n[Calib] ${decision.note.trim()}`.trim();
      }
      db.update(reviews)
        .set({ payloadJson: JSON.stringify(payload), updatedAt: nowIso() })
        .where(eq(reviews.id, manager.id))
        .run();
      logActivity("calib.decision", "review", manager.id, {
        personId: decision.personId,
        overall: decision.overall ?? null,
      });
      applied += 1;
    }
    return c.json({ applied, cycleId: cycle.id });
  });

  app.patch("/api/roles/framework", async (c) => {
    const body = await c.req.json<{
      ownerName?: string | null;
      effectiveFrom?: string | null;
      effectiveTo?: string | null;
      versionLabel?: string;
      frameworkName?: string;
    }>();
    const version = getPublishedVersion();
    if (!version) return c.json({ error: "No published framework" }, 404);
    const db = getDb();
    db.update(roleFrameworkVersions)
      .set({
        ownerName: body.ownerName === undefined ? version.ownerName : body.ownerName,
        effectiveFrom: body.effectiveFrom === undefined ? version.effectiveFrom : body.effectiveFrom,
        effectiveTo: body.effectiveTo === undefined ? version.effectiveTo : body.effectiveTo,
        versionLabel: body.versionLabel?.trim() || version.versionLabel,
      })
      .where(eq(roleFrameworkVersions.id, version.id))
      .run();
    if (body.frameworkName?.trim()) {
      db.update(roleFrameworks)
        .set({ name: body.frameworkName.trim() })
        .where(eq(roleFrameworks.id, version.frameworkId))
        .run();
    }
    logActivity("framework.update_meta", "framework_version", version.id, {});
    return c.json({ ok: true, insufficient: frameworkInsufficient(version.id) });
  });

  app.post("/api/roles/framework/migrate", async (c) => {
    const body = await c.req.json<{
      versionLabel: string;
      keyMap?: Record<string, string>;
      ownerName?: string;
      effectiveFrom?: string;
      effectiveTo?: string;
    }>();
    if (!body.versionLabel?.trim()) return c.json({ error: "versionLabel required" }, 400);
    const from = getPublishedVersion();
    if (!from) return c.json({ error: "No published framework to migrate from" }, 404);
    const db = getDb();
    const keyMap = body.keyMap ?? {};
    const ts = nowIso();
    const newVersionId = id("fwv");

    db.update(roleFrameworkVersions)
      .set({ status: "superseded" })
      .where(eq(roleFrameworkVersions.id, from.id))
      .run();

    db.insert(roleFrameworkVersions)
      .values({
        id: newVersionId,
        frameworkId: from.frameworkId,
        versionLabel: body.versionLabel.trim(),
        status: "published",
        publishedAt: ts,
        sourceFilename: from.sourceFilename,
        ownerName: body.ownerName ?? from.ownerName,
        effectiveFrom: body.effectiveFrom ?? ts.slice(0, 10),
        effectiveTo: body.effectiveTo ?? null,
      })
      .run();

    const oldRoles = db
      .select()
      .from(roleDefinitions)
      .where(eq(roleDefinitions.frameworkVersionId, from.id))
      .all();
    const idMap = new Map<string, string>();
    for (const role of oldRoles) {
      const newRoleId = id("role");
      idMap.set(role.id, newRoleId);
      const nextKeys = (JSON.parse(role.nextRoleKeysJson) as string[]).map((k) => keyMap[k] ?? k);
      db.insert(roleDefinitions)
        .values({
          id: newRoleId,
          frameworkVersionId: newVersionId,
          key: keyMap[role.key] ?? role.key,
          title: role.title,
          track: role.track,
          levelKey: role.levelKey,
          summary: role.summary,
          nextRoleKeysJson: JSON.stringify(nextKeys),
          competencyKeysJson: role.competencyKeysJson,
        })
        .run();
      for (const exp of db
        .select()
        .from(roleExpectations)
        .where(eq(roleExpectations.roleDefinitionId, role.id))
        .all()) {
        db.insert(roleExpectations)
          .values({
            id: id("rexp"),
            roleDefinitionId: newRoleId,
            kind: exp.kind,
            text: exp.text,
            sortOrder: exp.sortOrder,
          })
          .run();
      }
    }

    let remappedAssignments = 0;
    for (const a of db.select().from(roleAssignments).where(eq(roleAssignments.frameworkVersionId, from.id)).all()) {
      const newRoleId = idMap.get(a.roleDefinitionId);
      if (!newRoleId) continue;
      db.update(roleAssignments)
        .set({
          roleDefinitionId: newRoleId,
          frameworkVersionId: newVersionId,
          targetNextRoleDefinitionId: a.targetNextRoleDefinitionId
            ? idMap.get(a.targetNextRoleDefinitionId) ?? null
            : null,
        })
        .where(eq(roleAssignments.id, a.id))
        .run();
      remappedAssignments += 1;
    }

    logActivity("framework.migrate", "framework_version", newVersionId, {
      fromVersionId: from.id,
      remappedAssignments,
    });
    return c.json({
      versionId: newVersionId,
      remappedAssignments,
      insufficient: frameworkInsufficient(newVersionId),
    });
  });

  app.get("/api/search/reviews", (c) => {
    const q = c.req.query("q")?.trim() ?? "";
    if (!q) return c.json({ hits: [] as ReviewSearchHit[] });
    const db = getDb();
    const hits: ReviewSearchHit[] = [];
    for (const hit of searchReviewsFts(getSqlite(), q)) {
      const review = db.select().from(reviews).where(eq(reviews.id, hit.reviewId)).all()[0];
      if (!review || (review.status !== "finalized" && review.status !== "shared")) continue;
      const person = db.select().from(people).where(eq(people.id, review.subjectPersonId)).all()[0];
      const cycle = db.select().from(cycles).where(eq(cycles.id, review.cycleId)).all()[0];
      const payload = JSON.parse(review.payloadJson) as Record<string, unknown>;
      hits.push({
        reviewId: review.id,
        personId: review.subjectPersonId,
        personName: person?.name ?? hit.personName,
        cycleId: review.cycleId,
        cycleName: cycle?.name ?? hit.cycleName,
        status: review.status,
        overall: typeof payload.overall === "number" ? payload.overall : null,
        snippet: hit.snippet,
        updatedAt: review.updatedAt,
      });
    }
    return c.json({ hits });
  });

  app.post("/api/search/reviews/reindex", (c) => {
    const db = getDb();
    const rows: Array<{ reviewId: string; personName: string; cycleName: string; body: string }> = [];
    for (const review of db.select().from(reviews).all()) {
      if (review.status !== "finalized" && review.status !== "shared") continue;
      const person = db.select().from(people).where(eq(people.id, review.subjectPersonId)).all()[0];
      const cycle = db.select().from(cycles).where(eq(cycles.id, review.cycleId)).all()[0];
      const payload = JSON.parse(review.payloadJson) as Record<string, unknown>;
      rows.push({
        reviewId: review.id,
        personName: person?.name ?? "",
        cycleName: cycle?.name ?? "",
        body: [payload.summary, payload.strengths, payload.growth_areas, payload.dev_plan, payload.role_fit]
          .map((x) => String(x ?? ""))
          .join("\n"),
      });
    }
    rebuildReviewsFts(getSqlite(), rows);
    return c.json({ indexed: rows.length });
  });

  app.get("/api/stagnation", (c) => {
    const db = getDb();
    const rows: Array<{
      personId: string;
      personName: string;
      overall: number | null;
      evidenceLinkCount: number;
      cycleEnd: string;
    }> = [];
    for (const review of db.select().from(reviews).all()) {
      if (review.type !== "manager") continue;
      if (review.status !== "finalized" && review.status !== "shared") continue;
      const person = db.select().from(people).where(eq(people.id, review.subjectPersonId)).all()[0];
      const cycle = db.select().from(cycles).where(eq(cycles.id, review.cycleId)).all()[0];
      if (!person || !cycle) continue;
      const payload = JSON.parse(review.payloadJson) as Record<string, unknown>;
      rows.push({
        personId: person.id,
        personName: person.name,
        overall: typeof payload.overall === "number" ? payload.overall : null,
        evidenceLinkCount: db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, review.id)).all()
          .length,
        cycleEnd: cycle.windowEnd,
      });
    }
    const hints: StagnationHint[] = computeStagnationHints(rows);
    return c.json({ hints });
  });

  app.post("/api/ai/apply-faithfulness-fix", async (c) => {
    const body = await c.req.json<{ text: string; finding: Pick<BiasFinding, "excerpt" | "suggestedFix"> }>();
    const next = applyFaithfulnessFix(body.text, body.finding);
    if (next == null) return c.json({ error: "Excerpt not found in text" }, 400);
    return c.json({ text: next });
  });

  app.post("/api/ai/apply-all-faithfulness-fixes", async (c) => {
    const body = await c.req.json<{
      fields: Record<string, string>;
      cycleId?: string;
      personId?: string;
    }>();
    const fields = { ...body.fields };
    const allowlist =
      body.personId != null ? evidenceAllowlist(body.personId, body.cycleId) : [];
    const findings = mergeLintFindings(
      runBiasToneLint(Object.values(fields).join("\n\n")),
      runFaithfulnessLint(Object.values(fields).join("\n\n"), allowlist),
    );
    let applied = 0;
    for (const finding of findings) {
      if (!finding.suggestedFix || !finding.excerpt) continue;
      for (const [key, value] of Object.entries(fields)) {
        const next = applyFaithfulnessFix(value, finding);
        if (next != null) {
          fields[key] = next;
          applied += 1;
          break;
        }
      }
    }
    return c.json({
      fields,
      applied,
      findings: mergeLintFindings(
        runBiasToneLint(Object.values(fields).join("\n\n")),
        runFaithfulnessLint(Object.values(fields).join("\n\n"), allowlist),
      ),
    });
  });
}
