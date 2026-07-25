import { competencyLabel } from "@prm/shared";
import type {
  CycleCompareDTO,
  PersonTimelineDTO,
  RatingTrendPointDTO,
  RatingTrendsDTO,
  SprintPulseDTO,
  SprintPulsePersonDTO,
  TimelineEntryDTO,
} from "@prm/shared";

export function isoToday(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function inRange(iso: string, from: string, to: string) {
  const day = iso.slice(0, 10);
  return day >= from && day <= to;
}

export function resolvePulseWindow(opts: {
  from?: string | null;
  to?: string | null;
  preset?: string | null;
  today?: string;
}): { from: string; to: string; preset: string } {
  const today = opts.today ?? isoToday();
  const preset = (opts.preset ?? "last_14").trim() || "last_14";
  if (opts.from && opts.to) {
    return { from: opts.from.slice(0, 10), to: opts.to.slice(0, 10), preset: "custom" };
  }
  if (preset === "last_30") {
    return { from: addDays(today, -29), to: today, preset };
  }
  if (preset === "last_7") {
    return { from: addDays(today, -6), to: today, preset };
  }
  // default last_14
  return { from: addDays(today, -13), to: today, preset: "last_14" };
}

export type PulsePersonInput = {
  personId: string;
  personName: string;
  levelKey: string | null;
  achievements: Array<{ occurredAt: string; sourceProvider?: string | null }>;
  feedback: Array<{ occurredAt: string; themes: string[] }>;
  documents: Array<{ occurredAt: string }>;
  openConcernsInWindow: number;
  /** Linked evidence sources on current manager draft, with source occurredAt when known. */
  linkedSources: Array<{ occurredAt: string | null }>;
};

export function buildSprintPulse(args: {
  from: string;
  to: string;
  preset: string;
  people: PulsePersonInput[];
}): SprintPulseDTO {
  const themeMap = new Map<string, number>();
  const peopleOut: SprintPulsePersonDTO[] = [];
  let achievements = 0;
  let jira = 0;
  let bitbucket = 0;
  let feedback = 0;
  let documents = 0;
  let openConcerns = 0;
  let staleCitePeople = 0;

  for (const p of args.people) {
    const achIn = p.achievements.filter((a) => inRange(a.occurredAt, args.from, args.to));
    const fbIn = p.feedback.filter((f) => inRange(f.occurredAt, args.from, args.to));
    const docIn = p.documents.filter((d) => inRange(d.occurredAt, args.from, args.to));
    const jiraN = achIn.filter((a) => a.sourceProvider === "jira").length;
    const bbN = achIn.filter((a) => a.sourceProvider === "bitbucket").length;
    const themes: string[] = [];
    for (const f of fbIn) {
      for (const t of f.themes) {
        const key = t.trim().toLowerCase();
        if (!key) continue;
        themes.push(key);
        themeMap.set(key, (themeMap.get(key) ?? 0) + 1);
      }
    }

    const allEvidenceDates = [
      ...p.achievements.map((a) => a.occurredAt),
      ...p.feedback.map((f) => f.occurredAt),
      ...p.documents.map((d) => d.occurredAt),
    ];
    const inWindowEvidence = allEvidenceDates.filter((d) => inRange(d, args.from, args.to)).length;
    const olderEvidence = allEvidenceDates.length - inWindowEvidence;

    let linkedInWindow = 0;
    let linkedStale = 0;
    for (const link of p.linkedSources) {
      if (!link.occurredAt) continue;
      if (inRange(link.occurredAt, args.from, args.to)) linkedInWindow += 1;
      else linkedStale += 1;
    }
    const staleOnlyCites = linkedStale > 0 && linkedInWindow === 0 && p.linkedSources.length > 0;

    achievements += achIn.length;
    jira += jiraN;
    bitbucket += bbN;
    feedback += fbIn.length;
    documents += docIn.length;
    openConcerns += p.openConcernsInWindow;
    if (staleOnlyCites) staleCitePeople += 1;

    peopleOut.push({
      personId: p.personId,
      personName: p.personName,
      levelKey: p.levelKey,
      achievements: achIn.length,
      jira: jiraN,
      bitbucket: bbN,
      feedback: fbIn.length,
      documents: docIn.length,
      openConcerns: p.openConcernsInWindow,
      themes: [...new Set(themes)],
      inWindowEvidence,
      olderEvidence,
      linkedInWindow,
      linkedStale,
      staleOnlyCites,
    });
  }

  peopleOut.sort(
    (a, b) =>
      b.achievements + b.feedback + b.documents - (a.achievements + a.feedback + a.documents) ||
      a.personName.localeCompare(b.personName),
  );

  return {
    from: args.from,
    to: args.to,
    preset: args.preset,
    summary: {
      people: args.people.length,
      achievements,
      jira,
      bitbucket,
      feedback,
      documents,
      openConcerns,
      staleCitePeople,
    },
    themes: [...themeMap.entries()]
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme))
      .slice(0, 12),
    people: peopleOut,
  };
}

export function buildPersonTimeline(args: {
  personId: string;
  personName: string;
  entries: TimelineEntryDTO[];
}): PersonTimelineDTO {
  const entries = [...args.entries].sort((a, b) => b.at.localeCompare(a.at) || a.title.localeCompare(b.title));
  return { personId: args.personId, personName: args.personName, entries };
}

export type CycleRatingSnapshot = {
  cycleId: string;
  cycleName: string;
  windowEnd: string;
  people: Array<{
    personId: string;
    personName: string;
    overall: number | null;
    competencies: Record<string, number>;
    thin: boolean;
    themes: string[];
  }>;
};

export function buildRatingTrends(cycles: CycleRatingSnapshot[]): RatingTrendsDTO {
  const ordered = [...cycles].sort((a, b) => a.windowEnd.localeCompare(b.windowEnd));
  const cycleMeta = ordered.map((c) => ({
    cycleId: c.cycleId,
    cycleName: c.cycleName,
    windowEnd: c.windowEnd,
  }));

  const personMap = new Map<
    string,
    {
      personId: string;
      personName: string;
      overall: RatingTrendPointDTO[];
      competencies: Record<string, RatingTrendPointDTO[]>;
    }
  >();
  const teamCompKeys = new Set<string>(["overall"]);

  for (const cycle of ordered) {
    for (const p of cycle.people) {
      let row = personMap.get(p.personId);
      if (!row) {
        row = {
          personId: p.personId,
          personName: p.personName,
          overall: [],
          competencies: {},
        };
        personMap.set(p.personId, row);
      }
      row.overall.push({
        cycleId: cycle.cycleId,
        cycleName: cycle.cycleName,
        windowEnd: cycle.windowEnd,
        value: p.overall,
      });
      for (const [key, value] of Object.entries(p.competencies)) {
        teamCompKeys.add(key);
        if (!row.competencies[key]) row.competencies[key] = [];
        row.competencies[key].push({
          cycleId: cycle.cycleId,
          cycleName: cycle.cycleName,
          windowEnd: cycle.windowEnd,
          value,
        });
      }
    }
    // Fill missing people points as null for alignment
    for (const row of personMap.values()) {
      if (!row.overall.some((pt) => pt.cycleId === cycle.cycleId)) {
        row.overall.push({
          cycleId: cycle.cycleId,
          cycleName: cycle.cycleName,
          windowEnd: cycle.windowEnd,
          value: null,
        });
      }
    }
  }

  const people = [...personMap.values()].sort((a, b) => a.personName.localeCompare(b.personName));
  for (const row of people) {
    row.overall.sort((a, b) => a.windowEnd.localeCompare(b.windowEnd));
    for (const pts of Object.values(row.competencies)) {
      pts.sort((a, b) => a.windowEnd.localeCompare(b.windowEnd));
    }
  }

  const team = [...teamCompKeys].map((key) => {
    const points: RatingTrendPointDTO[] = ordered.map((cycle) => {
      const vals = cycle.people
        .map((p) => (key === "overall" ? p.overall : p.competencies[key] ?? null))
        .filter((v): v is number => typeof v === "number");
      const avg = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
      return {
        cycleId: cycle.cycleId,
        cycleName: cycle.cycleName,
        windowEnd: cycle.windowEnd,
        value: avg,
      };
    });
    return {
      key,
      label: key === "overall" ? "Overall" : competencyLabel(key),
      points,
    };
  });

  team.sort((a, b) => (a.key === "overall" ? -1 : b.key === "overall" ? 1 : a.label.localeCompare(b.label)));

  return { cycles: cycleMeta, team, people };
}

function emptyDist(): Record<string, number> {
  return { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, unset: 0 };
}

function distAndAvg(people: CycleRatingSnapshot["people"]) {
  const distribution = emptyDist();
  let sum = 0;
  let rated = 0;
  for (const p of people) {
    if (p.overall != null && p.overall >= 1 && p.overall <= 5) {
      distribution[String(Math.round(p.overall))] += 1;
      sum += p.overall;
      rated += 1;
    } else distribution.unset += 1;
  }
  return {
    distribution,
    avgOverall: rated ? Math.round((sum / rated) * 10) / 10 : null,
    ratedCount: rated,
    thinCount: people.filter((p) => p.thin).length,
  };
}

function themeCounts(people: CycleRatingSnapshot["people"]) {
  const map = new Map<string, number>();
  for (const p of people) {
    for (const t of p.themes) {
      const key = t.trim().toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
}

export function buildCycleCompare(args: {
  current: CycleRatingSnapshot;
  prior: CycleRatingSnapshot | null;
}): CycleCompareDTO {
  const curStats = distAndAvg(args.current.people);
  const curThemes = themeCounts(args.current.people);
  const current = {
    cycleId: args.current.cycleId,
    cycleName: args.current.cycleName,
    ...curStats,
    themes: curThemes.slice(0, 12),
  };

  if (!args.prior) {
    return {
      current,
      prior: null,
      movers: [],
      repeatThin: [],
      themeDrift: { appeared: [], disappeared: [], grew: [], shrank: [] },
    };
  }

  const priorStats = distAndAvg(args.prior.people);
  const priorThemes = themeCounts(args.prior.people);
  const prior = {
    cycleId: args.prior.cycleId,
    cycleName: args.prior.cycleName,
    ...priorStats,
    themes: priorThemes.slice(0, 12),
  };

  const priorById = new Map(args.prior.people.map((p) => [p.personId, p]));
  const movers = args.current.people
    .map((p) => {
      const prev = priorById.get(p.personId);
      const from = prev?.overall ?? null;
      const to = p.overall;
      const delta = from != null && to != null ? to - from : null;
      return {
        personId: p.personId,
        personName: p.personName,
        from,
        to,
        delta,
      };
    })
    .filter((m) => m.delta != null && m.delta !== 0)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || a.personName.localeCompare(b.personName));

  const repeatThin = args.current.people
    .filter((p) => p.thin && priorById.get(p.personId)?.thin)
    .map((p) => ({ personId: p.personId, personName: p.personName }))
    .sort((a, b) => a.personName.localeCompare(b.personName));

  const curThemeMap = new Map(curThemes.map((t) => [t.theme, t.count]));
  const priorThemeMap = new Map(priorThemes.map((t) => [t.theme, t.count]));
  const appeared: string[] = [];
  const disappeared: string[] = [];
  const grew: Array<{ theme: string; from: number; to: number }> = [];
  const shrank: Array<{ theme: string; from: number; to: number }> = [];
  for (const [theme, count] of curThemeMap) {
    const prev = priorThemeMap.get(theme);
    if (prev == null) appeared.push(theme);
    else if (count > prev) grew.push({ theme, from: prev, to: count });
    else if (count < prev) shrank.push({ theme, from: prev, to: count });
  }
  for (const theme of priorThemeMap.keys()) {
    if (!curThemeMap.has(theme)) disappeared.push(theme);
  }

  return {
    current,
    prior,
    movers,
    repeatThin,
    themeDrift: {
      appeared: appeared.sort(),
      disappeared: disappeared.sort(),
      grew: grew.sort((a, b) => b.to - b.from - (a.to - a.from)),
      shrank: shrank.sort((a, b) => a.to - a.from - (b.to - b.from)),
    },
  };
}
