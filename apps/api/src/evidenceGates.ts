import { eq } from "drizzle-orm";
import {
  achievements,
  documents,
  feedbackItems,
  goals,
  roleExpectations,
  type Db,
} from "@prm/db";
import { MIDDLE_BAND } from "@prm/shared";
import { checksum, readDocumentFile } from "./store.js";

export type EvidenceLinkInput = {
  targetType: string;
  targetKey: string;
  sourceType: string;
  sourceId: string;
};

export type TimelineEntry = {
  at: string;
  kind: string;
  title: string;
  detail?: string | null;
  sourceId?: string;
};

export type SnapshotResolved = {
  title: string;
  excerpt: string | null;
  checksum: string | null;
  visibility: string;
  fromName: string | null;
};

/** Resolve a live evidence row; null if missing or not owned by subject. */
export function resolveEvidenceSnapshot(
  db: Db,
  personId: string,
  sourceType: string,
  sourceId: string,
): SnapshotResolved | null {
  if (sourceType === "achievement") {
    const row = db.select().from(achievements).where(eq(achievements.id, sourceId)).all()[0];
    if (!row || row.personId !== personId) return null;
    return {
      title: row.title,
      excerpt: row.description,
      checksum: null,
      visibility: "em_and_subject",
      fromName: null,
    };
  }
  if (sourceType === "goal") {
    const row = db.select().from(goals).where(eq(goals.id, sourceId)).all()[0];
    if (!row || row.personId !== personId) return null;
    return {
      title: row.title,
      excerpt: row.description,
      checksum: null,
      visibility: "em_and_subject",
      fromName: null,
    };
  }
  if (sourceType === "feedback") {
    const row = db.select().from(feedbackItems).where(eq(feedbackItems.id, sourceId)).all()[0];
    if (!row || row.toPersonId !== personId) return null;
    return {
      title: `Feedback from ${row.fromName ?? "someone"} (${row.kind})`,
      excerpt: row.body.slice(0, 280),
      checksum: null,
      visibility: row.visibility,
      fromName: row.fromName,
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
    return {
      title: row.title,
      excerpt: row.filename,
      checksum: hash,
      visibility: row.visibility,
      fromName: null,
    };
  }
  if (sourceType === "role_expectation") {
    const row = db.select().from(roleExpectations).where(eq(roleExpectations.id, sourceId)).all()[0];
    if (!row) return null;
    return {
      title: `Expectation (${row.kind})`,
      excerpt: row.text,
      checksum: null,
      visibility: "em_and_subject",
      fromName: null,
    };
  }
  return null;
}

/** Subject-facing snapshot: drop em_only; scrub peer/source names. */
export function redactSnapshotForSubject(snap: {
  title: string;
  excerpt: string | null;
  checksum: string | null;
  sourceType: string;
  sourceId: string;
  visibility?: string;
  fromName?: string | null;
}) {
  if (snap.visibility === "em_only") return null;
  let title = snap.title;
  if (snap.sourceType === "feedback") {
    title = title.replace(/^Feedback from .+? \(/, "Feedback (");
    if (snap.fromName) {
      title = title.split(snap.fromName).join("a colleague");
    }
  }
  return {
    title,
    excerpt: snap.excerpt,
    checksum: snap.checksum,
    sourceId: snap.sourceId,
    sourceType: snap.sourceType,
  };
}

export function validateEvidenceLinks(
  db: Db,
  personId: string,
  links: EvidenceLinkInput[],
  opts?: { requireShareable?: boolean },
): { ok: true } | { ok: false; invalid: string[] } {
  const invalid: string[] = [];
  for (const link of links) {
    const snap = resolveEvidenceSnapshot(db, personId, link.sourceType, link.sourceId);
    if (!snap) {
      invalid.push(`${link.sourceType}:${link.sourceId}`);
      continue;
    }
    if (opts?.requireShareable && !isShareableVisibility(snap.visibility)) {
      invalid.push(`${link.sourceType}:${link.sourceId}(em_only)`);
    }
  }
  if (invalid.length) return { ok: false, invalid };
  return { ok: true };
}

export function uniqueEvidenceSources(links: EvidenceLinkInput[]) {
  return new Set(links.map((l) => `${l.sourceType}:${l.sourceId}`));
}

export function evidenceDensityErrors(
  competencies: Record<string, number>,
  overall: number,
  links: EvidenceLinkInput[],
  labelFor: (key: string) => string,
): string[] {
  const missing: string[] = [];
  for (const [key, score] of Object.entries(competencies)) {
    if (typeof score !== "number") continue;
    if (score === MIDDLE_BAND) continue;
    const has = links.some((l) => l.targetType === "competency" && l.targetKey === key);
    if (!has) missing.push(labelFor(key));
  }
  if (overall !== MIDDLE_BAND && links.length === 0) missing.push("overall rating");
  const distinct = uniqueEvidenceSources(links).size;
  if ((overall === 1 || overall === 5) && distinct < 2) {
    missing.push("extreme overall (1 or 5) needs ≥2 distinct evidence items");
  }
  return missing;
}

/** Rating / promo fields that require a decision reason (including first non-middle set). */
export function collectRatingChanges(opts: {
  prevOverall: number | null;
  nextOverall: number | null;
  prevComps: Record<string, number>;
  nextComps: Record<string, number>;
  prevPromo: string;
  nextPromo: string;
}): Array<{ field: string; from: unknown; to: unknown }> {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  const { prevOverall, nextOverall, prevComps, nextComps, prevPromo, nextPromo } = opts;

  if (nextOverall != null && prevOverall !== nextOverall) {
    if (nextOverall !== MIDDLE_BAND || (prevOverall != null && prevOverall !== MIDDLE_BAND)) {
      changes.push({ field: "overall", from: prevOverall, to: nextOverall });
    }
  }

  for (const [key, score] of Object.entries(nextComps)) {
    if (typeof score !== "number") continue;
    const prev = prevComps[key];
    if (prev === score) continue;
    if (score !== MIDDLE_BAND || (prev != null && prev !== MIDDLE_BAND)) {
      changes.push({ field: `competency:${key}`, from: prev ?? null, to: score });
    }
  }

  if (nextPromo && prevPromo !== nextPromo) {
    if (nextPromo !== "not_applicable" || prevPromo) {
      changes.push({ field: "promo_readiness", from: prevPromo || null, to: nextPromo });
    }
  }

  return changes;
}

export function isShareableVisibility(visibility: string | null | undefined) {
  return visibility !== "em_only";
}

export function looksLikeMeetingDoc(title: string, filename: string) {
  const s = `${title} ${filename}`.toLowerCase();
  return /\b(1:1|1-1|one.on.one|meeting|transcript|standup|retro)\b/.test(s);
}

export function buildPersonTimeline(
  db: Db,
  personId: string,
  opts?: { subjectFacing?: boolean; priorEntries?: TimelineEntry[] },
): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  for (const a of db.select().from(achievements).where(eq(achievements.personId, personId)).all()) {
    timeline.push({
      at: a.occurredAt,
      kind: "achievement",
      title: a.title,
      detail: a.description,
      sourceId: a.id,
    });
  }
  for (const f of db.select().from(feedbackItems).where(eq(feedbackItems.toPersonId, personId)).all()) {
    if (opts?.subjectFacing && !isShareableVisibility(f.visibility)) continue;
    timeline.push({
      at: f.occurredAt,
      kind: "feedback",
      title: opts?.subjectFacing
        ? `Feedback (${f.kind})`
        : `Feedback (${f.kind}) from ${f.fromName ?? "someone"}`,
      detail: f.body.slice(0, 200),
      sourceId: f.id,
    });
  }
  for (const d of db.select().from(documents).where(eq(documents.personId, personId)).all()) {
    if (opts?.subjectFacing && !isShareableVisibility(d.visibility)) continue;
    timeline.push({
      at: d.occurredAt,
      kind: "document",
      title: d.title,
      detail: d.filename,
      sourceId: d.id,
    });
  }
  for (const g of db.select().from(goals).where(eq(goals.personId, personId)).all()) {
    timeline.push({
      at: g.createdAt?.slice(0, 10) ?? g.createdAt,
      kind: "goal",
      title: g.title,
      detail: g.status,
      sourceId: g.id,
    });
  }
  if (opts?.priorEntries) timeline.push(...opts.priorEntries);
  timeline.sort((a, b) => b.at.localeCompare(a.at));
  return timeline;
}
