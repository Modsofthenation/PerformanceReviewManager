import { and, eq } from "drizzle-orm";
import {
  achievements,
  activityEvents,
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
import type {
  CycleCompareDTO,
  PersonTimelineDTO,
  RatingTrendsDTO,
  SprintPulseDTO,
  TimelineEntryDTO,
} from "@prm/shared";
import {
  buildCycleCompare,
  buildPersonTimeline,
  buildRatingTrends,
  buildSprintPulse,
  resolvePulseWindow,
  type CycleRatingSnapshot,
  type PulsePersonInput,
} from "./analytics.js";
import { getDb } from "./store.js";

type Db = ReturnType<typeof getDb>;

function parseThemes(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]") as string[];
    return parsed.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
  } catch {
    return [];
  }
}

function managerPayload(review: { payloadJson: string } | undefined) {
  if (!review) return { overall: null as number | null, competencies: {} as Record<string, number> };
  try {
    const payload = JSON.parse(review.payloadJson) as Record<string, unknown>;
    return {
      overall: typeof payload.overall === "number" ? payload.overall : null,
      competencies: (payload.competencies ?? {}) as Record<string, number>,
    };
  } catch {
    return { overall: null, competencies: {} };
  }
}

function sourceOccurredAt(
  db: Db,
  sourceType: string,
  sourceId: string,
): string | null {
  if (sourceType === "achievement") {
    return db.select().from(achievements).where(eq(achievements.id, sourceId)).all()[0]?.occurredAt ?? null;
  }
  if (sourceType === "feedback") {
    return db.select().from(feedbackItems).where(eq(feedbackItems.id, sourceId)).all()[0]?.occurredAt ?? null;
  }
  if (sourceType === "document") {
    return db.select().from(documents).where(eq(documents.id, sourceId)).all()[0]?.occurredAt ?? null;
  }
  if (sourceType === "goal") {
    const g = db.select().from(goals).where(eq(goals.id, sourceId)).all()[0];
    return g?.createdAt?.slice(0, 10) ?? null;
  }
  return null;
}

function evidenceCountFor(db: Db, personId: string) {
  const ach = db.select().from(achievements).where(eq(achievements.personId, personId)).all().length;
  const fb = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, personId)).all().length;
  const docs = db.select().from(documents).where(eq(documents.personId, personId)).all().length;
  const goalsN = db.select().from(goals).where(eq(goals.personId, personId)).all().length;
  return ach + fb + docs + goalsN;
}

function cycleSnapshot(db: Db, cycle: { id: string; name: string; windowEnd: string }): CycleRatingSnapshot {
  const participants = db.select().from(cycleParticipants).where(eq(cycleParticipants.cycleId, cycle.id)).all();
  const peopleRows = [];
  for (const cp of participants) {
    const person = db.select().from(people).where(eq(people.id, cp.personId)).all()[0];
    if (!person) continue;
    const manager = db
      .select()
      .from(reviews)
      .where(and(eq(reviews.cycleId, cycle.id), eq(reviews.subjectPersonId, person.id), eq(reviews.type, "manager")))
      .all()
      .find((r) => r.status !== "superseded");
    const { overall, competencies } = managerPayload(manager);
    const fbRows = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, person.id)).all();
    const themes = fbRows.flatMap((f) => parseThemes(f.themesJson));
    peopleRows.push({
      personId: person.id,
      personName: person.name,
      overall,
      competencies,
      thin: evidenceCountFor(db, person.id) < 2,
      themes,
    });
  }
  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    windowEnd: cycle.windowEnd,
    people: peopleRows,
  };
}

export function loadSprintPulse(
  db: Db,
  opts: { from?: string | null; to?: string | null; preset?: string | null },
): SprintPulseDTO {
  const window = resolvePulseWindow(opts);
  const directs = db
    .select()
    .from(people)
    .all()
    .filter((p) => p.managerId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const inputs: PulsePersonInput[] = directs.map((person) => {
    const ach = db.select().from(achievements).where(eq(achievements.personId, person.id)).all();
    const fb = db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, person.id)).all();
    const docs = db.select().from(documents).where(eq(documents.personId, person.id)).all();
    const openConcernsInWindow = db
      .select()
      .from(concernLogs)
      .where(eq(concernLogs.personId, person.id))
      .all()
      .filter((c) => c.status === "open" && c.occurredAt.slice(0, 10) >= window.from && c.occurredAt.slice(0, 10) <= window.to)
      .length;

    // Prefer active/latest cycle manager draft for freshness of cites
    const allCycles = db.select().from(cycles).all().sort((a, b) => b.windowStart.localeCompare(a.windowStart));
    const latest = allCycles[0];
    let linkedSources: Array<{ occurredAt: string | null }> = [];
    if (latest) {
      const manager = db
        .select()
        .from(reviews)
        .where(
          and(eq(reviews.cycleId, latest.id), eq(reviews.subjectPersonId, person.id), eq(reviews.type, "manager")),
        )
        .all()
        .find((r) => r.status !== "superseded");
      if (manager) {
        const links = db.select().from(evidenceLinks).where(eq(evidenceLinks.reviewId, manager.id)).all();
        linkedSources = links.map((l) => ({
          occurredAt: sourceOccurredAt(db, l.sourceType, l.sourceId),
        }));
      }
    }

    return {
      personId: person.id,
      personName: person.name,
      levelKey: person.levelKey,
      achievements: ach.map((a) => ({ occurredAt: a.occurredAt, sourceProvider: a.sourceProvider })),
      feedback: fb.map((f) => ({ occurredAt: f.occurredAt, themes: parseThemes(f.themesJson) })),
      documents: docs.map((d) => ({ occurredAt: d.occurredAt })),
      openConcernsInWindow,
      linkedSources,
    };
  });

  return buildSprintPulse({ ...window, people: inputs });
}

export function loadPersonTimeline(db: Db, personId: string): PersonTimelineDTO | null {
  const person = db.select().from(people).where(eq(people.id, personId)).all()[0];
  if (!person) return null;

  const entries: TimelineEntryDTO[] = [];

  for (const a of db.select().from(achievements).where(eq(achievements.personId, personId)).all()) {
    const provider = a.sourceProvider ? ` · ${a.sourceProvider}` : "";
    entries.push({
      at: a.occurredAt,
      kind: a.sourceProvider === "jira" || a.sourceProvider === "bitbucket" || a.sourceProvider === "github" ? a.sourceProvider : "achievement",
      title: a.title + provider,
      detail: a.description,
      sourceId: a.id,
    });
  }
  for (const f of db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, personId)).all()) {
    const themes = parseThemes(f.themesJson);
    entries.push({
      at: f.occurredAt,
      kind: "feedback",
      title: `Feedback (${f.kind}) from ${f.fromName ?? "someone"}`,
      detail: themes.length ? `${f.body.slice(0, 160)} · themes: ${themes.join(", ")}` : f.body.slice(0, 200),
      sourceId: f.id,
    });
  }
  for (const d of db.select().from(documents).where(eq(documents.personId, personId)).all()) {
    entries.push({
      at: d.occurredAt,
      kind: "document",
      title: d.title,
      detail: d.filename,
      sourceId: d.id,
    });
  }
  for (const g of db.select().from(goals).where(eq(goals.personId, personId)).all()) {
    entries.push({
      at: g.createdAt?.slice(0, 10) ?? g.createdAt,
      kind: "goal",
      title: g.title,
      detail: g.status,
      sourceId: g.id,
    });
  }
  for (const c of db.select().from(concernLogs).where(eq(concernLogs.personId, personId)).all()) {
    entries.push({
      at: c.occurredAt,
      kind: "concern",
      title: `Concern (${c.status}): ${c.title}`,
      detail: c.body.slice(0, 200),
      sourceId: c.id,
    });
  }

  const managerReviews = db
    .select()
    .from(reviews)
    .where(and(eq(reviews.subjectPersonId, personId), eq(reviews.type, "manager")))
    .all()
    .filter((r) => r.status !== "superseded");
  for (const r of managerReviews) {
    const cycle = db.select().from(cycles).where(eq(cycles.id, r.cycleId)).all()[0];
    const { overall, competencies } = managerPayload(r);
    const compBit = Object.entries(competencies)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    entries.push({
      at: (r.updatedAt || r.createdAt).slice(0, 10),
      kind: "review",
      title: `${cycle?.name ?? "Cycle"} manager review (${r.status})`,
      detail: overall != null ? `Overall ${overall}${compBit ? ` · ${compBit}` : ""}` : r.status,
      sourceId: r.id,
    });
  }

  const decisions = db
    .select()
    .from(activityEvents)
    .all()
    .filter((e) => {
      if (e.action !== "review.decision" && e.action !== "promo.decision") return false;
      try {
        const detail = JSON.parse(e.detailJson || "{}") as Record<string, unknown>;
        return detail.subjectPersonId === personId || detail.personId === personId;
      } catch {
        return false;
      }
    });
  for (const e of decisions) {
    let detailText = e.action;
    try {
      const detail = JSON.parse(e.detailJson || "{}") as Record<string, unknown>;
      const reason = typeof detail.reason === "string" ? detail.reason : null;
      const changes = Array.isArray(detail.changes) ? detail.changes : [];
      detailText = reason
        ? reason
        : changes.length
          ? JSON.stringify(changes).slice(0, 200)
          : e.action;
    } catch {
      /* ignore */
    }
    entries.push({
      at: e.createdAt.slice(0, 10),
      kind: "decision",
      title: e.action === "promo.decision" ? "Promotion decision" : "Rating decision",
      detail: detailText,
      sourceId: e.id,
    });
  }

  return buildPersonTimeline({ personId, personName: person.name, entries });
}

export function loadRatingTrends(db: Db): RatingTrendsDTO {
  const allCycles = db.select().from(cycles).all().sort((a, b) => a.windowEnd.localeCompare(b.windowEnd));
  return buildRatingTrends(allCycles.map((c) => cycleSnapshot(db, c)));
}

export function loadCycleCompare(
  db: Db,
  opts: { cycleId?: string | null; compareTo?: string | null },
): CycleCompareDTO | null {
  const allCycles = db.select().from(cycles).all().sort((a, b) => b.windowStart.localeCompare(a.windowStart));
  if (!allCycles.length) return null;
  const current = opts.cycleId ? allCycles.find((c) => c.id === opts.cycleId) : allCycles[0];
  if (!current) return null;
  const prior =
    (opts.compareTo ? allCycles.find((c) => c.id === opts.compareTo) : null) ??
    allCycles.find((c) => c.windowStart < current.windowStart && c.id !== current.id) ??
    null;
  return buildCycleCompare({
    current: cycleSnapshot(db, current),
    prior: prior ? cycleSnapshot(db, prior) : null,
  });
}
