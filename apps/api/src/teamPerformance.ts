import { competencyLabel } from "@prm/shared";
import type { TeamPerformanceDTO, TeamPerformancePersonDTO } from "@prm/shared";

export type TeamPerformancePersonInput = {
  personId: string;
  personName: string;
  levelKey: string | null;
  overall: number | null;
  priorOverall: number | null;
  competencies: Record<string, number>;
  promoReadiness: string | null;
  writingSeconds: number;
  evidenceCount: number;
  linkedSources: number;
  thin: boolean;
  managerStatus: string;
  coverageHits: number;
  coverageNeed: number;
  themes: string[];
  openConcerns: number;
  deliveryDone: number;
  storyPointsDone: number | null;
  deliveryTrend: number[];
  thinDeliveryEvidence: string | null;
};

const PROMO_KEYS = ["ready", "not_yet", "too_early", "not_applicable", "unset"] as const;

const WRITING_BUCKETS: Array<{ id: string; label: string; match: (sec: number) => boolean }> = [
  { id: "none", label: "No time logged", match: (s) => s <= 0 },
  { id: "under15", label: "≤15 min", match: (s) => s > 0 && s <= 15 * 60 },
  { id: "under45", label: "16–45 min", match: (s) => s > 15 * 60 && s <= 45 * 60 },
  { id: "over45", label: ">45 min", match: (s) => s > 45 * 60 },
];

export function buildTeamPerformance(args: {
  cycleId: string;
  cycleName: string;
  priorCycle: { cycleId: string; cycleName: string } | null;
  people: TeamPerformancePersonInput[];
}): TeamPerformanceDTO {
  const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, unset: 0 };
  const promoReadiness: Record<string, number> = Object.fromEntries(PROMO_KEYS.map((k) => [k, 0]));
  const writingBuckets = WRITING_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: 0 }));
  const levelMap = new Map<string, number>();
  const themeMap = new Map<string, number>();
  const compSums = new Map<string, { sum: number; n: number }>();

  let ratedSum = 0;
  let ratedCount = 0;
  let coverageHits = 0;
  let coverageNeed = 0;
  let linkedTotal = 0;
  let draftCount = 0;
  let thin = 0;
  let openConcerns = 0;

  const peopleOut: TeamPerformancePersonDTO[] = [];

  for (const p of args.people) {
    if (p.overall != null && p.overall >= 1 && p.overall <= 5) {
      distribution[String(Math.round(p.overall))] += 1;
      ratedSum += p.overall;
      ratedCount += 1;
    } else {
      distribution.unset += 1;
    }

    const promo = p.promoReadiness && PROMO_KEYS.includes(p.promoReadiness as (typeof PROMO_KEYS)[number])
      ? p.promoReadiness
      : "unset";
    promoReadiness[promo] += 1;

    for (let i = 0; i < WRITING_BUCKETS.length; i++) {
      if (WRITING_BUCKETS[i].match(p.writingSeconds)) {
        writingBuckets[i].count += 1;
        break;
      }
    }

    const levelKey = p.levelKey?.trim() || "Unleveled";
    levelMap.set(levelKey, (levelMap.get(levelKey) ?? 0) + 1);

    for (const theme of p.themes) {
      const t = theme.trim().toLowerCase();
      if (!t) continue;
      themeMap.set(t, (themeMap.get(t) ?? 0) + 1);
    }

    for (const [key, score] of Object.entries(p.competencies)) {
      if (typeof score !== "number") continue;
      const cur = compSums.get(key) ?? { sum: 0, n: 0 };
      cur.sum += score;
      cur.n += 1;
      compSums.set(key, cur);
    }

    coverageHits += p.coverageHits;
    coverageNeed += p.coverageNeed;
    const hasDraft = p.managerStatus !== "missing" && p.managerStatus !== "not_started";
    if (hasDraft) {
      draftCount += 1;
      linkedTotal += p.linkedSources;
    }
    if (p.thin) thin += 1;
    openConcerns += p.openConcerns;

    peopleOut.push({
      personId: p.personId,
      personName: p.personName,
      levelKey: p.levelKey,
      overall: p.overall,
      priorOverall: p.priorOverall,
      competencies: p.competencies,
      promoReadiness: p.promoReadiness,
      writingSeconds: p.writingSeconds,
      evidenceCount: p.evidenceCount,
      linkedSources: p.linkedSources,
      thin: p.thin,
      managerStatus: p.managerStatus,
      deliveryDone: p.deliveryDone,
      storyPointsDone: p.storyPointsDone,
      deliveryTrend: p.deliveryTrend,
      thinDeliveryEvidence: p.thinDeliveryEvidence,
    });
  }

  peopleOut.sort(
    (a, b) => (b.overall ?? -1) - (a.overall ?? -1) || a.personName.localeCompare(b.personName),
  );

  const competencies = [...compSums.entries()]
    .map(([key, { sum, n }]) => ({
      key,
      label: competencyLabel(key),
      avg: n ? Math.round((sum / n) * 10) / 10 : null,
      ratedCount: n,
    }))
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0) || a.label.localeCompare(b.label));

  const levels = [...levelMap.entries()]
    .map(([levelKey, count]) => ({ levelKey, count }))
    .sort((a, b) => b.count - a.count || a.levelKey.localeCompare(b.levelKey));

  const themes = [...themeMap.entries()]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme))
    .slice(0, 12);

  return {
    cycleId: args.cycleId,
    cycleName: args.cycleName,
    priorCycle: args.priorCycle,
    participantCount: args.people.length,
    ratedCount,
    avgOverall: ratedCount ? Math.round((ratedSum / ratedCount) * 10) / 10 : null,
    distribution,
    competencies,
    promoReadiness,
    writingBuckets,
    evidence: {
      coveragePct: coverageNeed ? Math.round((coverageHits / coverageNeed) * 100) : 100,
      avgLinkedSources: draftCount ? Math.round((linkedTotal / draftCount) * 10) / 10 : 0,
      thinDossierCount: thin,
    },
    levels,
    themes,
    openConcerns,
    people: peopleOut,
  };
}
