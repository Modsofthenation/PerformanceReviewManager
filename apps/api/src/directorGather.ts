import { and, eq } from "drizzle-orm";
import {
  achievements,
  citationSnapshots,
  concernLogs,
  cycleParticipants,
  cycles,
  documents,
  evidenceLinks,
  feedbackItems,
  goals,
  people,
  reviews,
} from "@prm/db";
import type { Db } from "@prm/db";
import { MIDDLE_BAND, type DirectorAttentionDTO, type DirectorAttentionItem, type DirectorBriefingDTO } from "@prm/shared";
import { buildDeliveryRollup } from "./deliveryRollup.js";
import {
  buildCitedBullets,
  bumpDistribution,
  emptyDistribution,
} from "./directorPacks.js";
import { computeStagnationHints } from "./stagnation.js";
import { nowIso } from "./store.js";

type RoleLoader = (id: string | null | undefined) => { title: string } | null | undefined;
type AssignmentLoader = (personId: string) => { roleDefinitionId?: string | null; roleTitle?: string | null } | null | undefined;

function priorOverallFor(db: Db, personId: string, cycleId: string, windowStart: string): number | null {
  const prior = db
    .select()
    .from(cycles)
    .all()
    .filter((c) => c.id !== cycleId && c.windowStart < windowStart)
    .sort((a, b) => b.windowStart.localeCompare(a.windowStart))[0];
  if (!prior) return null;
  const mgr = db
    .select()
    .from(reviews)
    .where(and(eq(reviews.cycleId, prior.id), eq(reviews.subjectPersonId, personId), eq(reviews.type, "manager")))
    .all()
    .find((r) => r.status !== "superseded");
  if (!mgr) return null;
  try {
    const p = JSON.parse(mgr.payloadJson) as Record<string, unknown>;
    return typeof p.overall === "number" ? p.overall : null;
  } catch {
    return null;
  }
}

function evidenceFlags(args: {
  overall: number | null;
  competencies: Record<string, number>;
  links: Array<{ targetType: string; targetKey: string | null }>;
  thinDossier: boolean;
  thinDelivery: string | null;
}): string[] {
  const flags: string[] = [];
  if (args.thinDossier) flags.push("thin_dossier");
  if (args.thinDelivery === "jira_rich_dossier_thin") flags.push("thin_delivery_vs_jira");
  if (args.thinDelivery === "dossier_rich_integrations_empty_window") flags.push("integrations_empty_window");
  const scored: Array<{ key: string; score: number }> = [
    ...Object.entries(args.competencies).map(([key, score]) => ({ key, score })),
    ...(args.overall != null ? [{ key: "overall", score: args.overall }] : []),
  ];
  let gaps = 0;
  for (const s of scored) {
    if (s.score === MIDDLE_BAND) continue;
    const has = args.links.some(
      (l) =>
        (s.key === "overall" && l.targetType === "overall") ||
        (l.targetType === "competency" && l.targetKey === s.key),
    );
    if (!has) {
      gaps += 1;
      if (s.key === "overall") flags.push("missing_evidence");
      else flags.push(`thin:${s.key}`);
    }
  }
  if (args.overall != null && (args.overall <= 2 || args.overall >= 4) && gaps > 0) {
    flags.push("extreme_overall_thin");
  }
  return [...new Set(flags)];
}

export function buildDirectorBriefing(
  db: Db,
  opts: {
    cycleId: string;
    personId?: string | null;
    loadRole: RoleLoader;
    assignmentFor: AssignmentLoader;
  },
): DirectorBriefingDTO | null {
  const cycle = db.select().from(cycles).where(eq(cycles.id, opts.cycleId)).all()[0];
  if (!cycle) return null;
  const participants = db
    .select()
    .from(cycleParticipants)
    .where(eq(cycleParticipants.cycleId, cycle.id))
    .all()
    .filter((p) => !opts.personId || p.personId === opts.personId);

  const distribution = emptyDistribution();
  const peopleOut: DirectorBriefingDTO["people"] = [];

  for (const cp of participants) {
    const person = db.select().from(people).where(eq(people.id, cp.personId)).all()[0];
    if (!person) continue;
    const a = opts.assignmentFor(person.id);
    const role = opts.loadRole(cp.roleDefinitionId ?? a?.roleDefinitionId);
    const manager = db
      .select()
      .from(reviews)
      .where(and(eq(reviews.cycleId, cycle.id), eq(reviews.subjectPersonId, person.id), eq(reviews.type, "manager")))
      .all()
      .find((r) => r.status !== "superseded");

    let overall: number | null = null;
    let competencies: Record<string, number> = {};
    let promoReadiness: string | null = null;
    let summary = "";
    let strengths = "";
    let growth = "";
    let managerStatus = "missing";
    let links: Array<{ targetType: string; targetKey: string | null }> = [];
    let citeIds: string[] = [];

    if (manager) {
      managerStatus = manager.status;
      try {
        const payload = JSON.parse(manager.payloadJson) as Record<string, unknown>;
        // Share-safe: never include private_notes
        overall = typeof payload.overall === "number" ? payload.overall : null;
        competencies = (payload.competencies ?? {}) as Record<string, number>;
        promoReadiness = typeof payload.promo_readiness === "string" ? payload.promo_readiness : null;
        summary = String(payload.summary ?? "");
        strengths = String(payload.strengths ?? "");
        growth = String(payload.growth_areas ?? "");
      } catch {
        /* ignore */
      }
      links = db
        .select()
        .from(evidenceLinks)
        .where(eq(evidenceLinks.reviewId, manager.id))
        .all()
        .map((l) => ({ targetType: l.targetType, targetKey: l.targetKey }));
      citeIds = db
        .select()
        .from(citationSnapshots)
        .where(eq(citationSnapshots.reviewId, manager.id))
        .all()
        .map((s) => s.sourceId);
    }

    const achRows = db.select().from(achievements).where(eq(achievements.personId, person.id)).all();
    const shareableAch = achRows.filter((a) => !a.sourceProvider || a.sourceProvider);
    if (!citeIds.length) {
      citeIds = shareableAch
        .filter((a) => {
          const d = a.occurredAt.slice(0, 10);
          return d >= cycle.windowStart.slice(0, 10) && d <= cycle.windowEnd.slice(0, 10);
        })
        .slice(0, 8)
        .map((a) => a.id);
    }

    const fb = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, person.id)).all();
    const docs = db.select().from(documents).where(eq(documents.personId, person.id)).all();
    const goalsN = db.select().from(goals).where(eq(goals.personId, person.id)).all().length;
    // Count only shareable dossier items for "thin" (exclude em_only)
    const shareableFb = fb.filter((f) => f.visibility !== "em_only").length;
    const shareableDocs = docs.filter((d) => d.visibility !== "em_only").length;
    const dossierNonIntegration =
      achRows.filter((a) => !a.sourceProvider).length + shareableFb + shareableDocs + goalsN;
    const evidenceCount = achRows.length + shareableFb + shareableDocs + goalsN;
    const rollup = buildDeliveryRollup({
      personId: person.id,
      cycleId: cycle.id,
      windowStart: cycle.windowStart.slice(0, 10),
      windowEnd: cycle.windowEnd.slice(0, 10),
      achievements: achRows,
      dossierNonIntegrationCount: dossierNonIntegration,
    });

    const openConcernCount = db
      .select()
      .from(concernLogs)
      .where(eq(concernLogs.personId, person.id))
      .all()
      .filter((r) => r.status === "open").length;

    const priorOverall = priorOverallFor(db, person.id, cycle.id, cycle.windowStart);
    const flags = evidenceFlags({
      overall,
      competencies,
      links,
      thinDossier: evidenceCount < 2,
      thinDelivery: rollup.flags.thinDeliveryEvidence,
    });
    if (openConcernCount > 0) flags.push(`open_concerns:${openConcernCount}`);

    bumpDistribution(distribution, overall);
    peopleOut.push({
      personId: person.id,
      personName: person.name,
      title: person.title,
      roleTitle: role?.title ?? a?.roleTitle ?? null,
      overall,
      priorOverall,
      delta: overall != null && priorOverall != null ? overall - priorOverall : null,
      competencies,
      promoReadiness,
      citedBullets: buildCitedBullets({ summary, strengths, growth, citeIds, max: 8 }),
      delivery: {
        issuesDone: rollup.issuesDone,
        prsMerged: rollup.prsMerged,
        storyPointsDone: rollup.storyPointsDone,
        reviewsGiven: rollup.reviewsGiven,
      },
      flags,
      openConcernCount,
      managerStatus,
    });
  }

  peopleOut.sort(
    (a, b) => (b.overall ?? -1) - (a.overall ?? -1) || a.personName.localeCompare(b.personName),
  );

  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    windowStart: cycle.windowStart.slice(0, 10),
    windowEnd: cycle.windowEnd.slice(0, 10),
    exportedAt: nowIso(),
    notice:
      "Director / skip-level briefing. Private manager notes and em_only dossier items are omitted. Concern bodies are not included — counts only. Not a subject-facing packet.",
    people: peopleOut,
    distribution,
  };
}

export function buildDirectorAttention(
  db: Db,
  opts: { cycleId: string },
): DirectorAttentionDTO | null {
  const briefing = buildDirectorBriefing(db, {
    cycleId: opts.cycleId,
    loadRole: () => null,
    assignmentFor: () => null,
  });
  if (!briefing) return null;

  const stagRows: Array<{
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
    stagRows.push({
      personId: person.id,
      personName: person.name,
      overall: typeof payload.overall === "number" ? payload.overall : null,
      evidenceLinkCount: db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, review.id)).all()
        .length,
      cycleEnd: cycle.windowEnd,
    });
  }
  const stagnantIds = new Set(computeStagnationHints(stagRows).map((h) => h.personId));

  const items: DirectorAttentionItem[] = [];
  for (const p of briefing.people) {
    const reasons: string[] = [];
    const stagnant = stagnantIds.has(p.personId);
    const promoReady = p.promoReadiness === "ready";
    const thinDossier = p.flags.includes("thin_dossier");
    if (stagnant) reasons.push("stagnant_ratings");
    if (thinDossier) reasons.push("thin_dossier");
    if (p.flags.includes("thin_delivery_vs_jira")) reasons.push("jira_rich_dossier_thin");
    if (p.flags.includes("integrations_empty_window")) reasons.push("integrations_empty_window");
    if (promoReady) reasons.push("promo_ready");
    if (p.openConcernCount > 0) reasons.push("open_concerns");
    if (p.flags.includes("extreme_overall_thin") || p.flags.includes("missing_evidence")) {
      reasons.push("evidence_gaps");
    }
    if (!reasons.length) continue;
    items.push({
      personId: p.personId,
      personName: p.personName,
      reasons,
      overall: p.overall,
      priorOverall: p.priorOverall,
      promoReadiness: p.promoReadiness,
      openConcernCount: p.openConcernCount,
      thinDeliveryEvidence: p.flags.includes("thin_delivery_vs_jira")
        ? "jira_rich_dossier_thin"
        : p.flags.includes("integrations_empty_window")
          ? "dossier_rich_integrations_empty_window"
          : null,
      thinDossier,
      stagnant,
      promoReady,
    });
  }
  items.sort((a, b) => b.reasons.length - a.reasons.length || a.personName.localeCompare(b.personName));
  return { cycleId: briefing.cycleId, cycleName: briefing.cycleName, items };
}
