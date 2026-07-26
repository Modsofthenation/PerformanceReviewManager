import type { DeliveryRollupDTO, DeliveryCiteSuggestion } from "@prm/shared";

type AchRow = {
  id: string;
  title: string;
  description: string | null;
  occurredAt: string;
  sourceProvider: string | null;
  externalId: string | null;
  externalUrl: string | null;
  externalPayloadJson: string | null;
};

function inWindow(date: string | null | undefined, start: string, end: string) {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= start && d <= end;
}

function parsePayload(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Aggregate synced integration achievements into a cycle-window delivery rollup. */
export function buildDeliveryRollup(args: {
  personId: string;
  cycleId: string | null;
  windowStart: string;
  windowEnd: string;
  achievements: AchRow[];
  dossierNonIntegrationCount: number;
}): DeliveryRollupDTO {
  const { personId, cycleId, windowStart, windowEnd, achievements, dossierNonIntegrationCount } = args;

  let issuesDone = 0;
  let issuesInProgress = 0;
  let openBugs = 0;
  let storyPointsDone = 0;
  let storyPointsKnown = false;
  let prsMerged = 0;
  let reviewsGiven = 0;
  let reverts = 0;
  let blockedHours = 0;
  const sizeBands: Record<string, number> = {};
  const citeSuggestions: DeliveryCiteSuggestion[] = [];
  const themes = new Map<string, number>();

  let jiraCount = 0;
  let bitbucketCount = 0;
  let githubCount = 0;

  for (const ach of achievements) {
    const provider = ach.sourceProvider;
    if (!provider) continue;
    const payload = parsePayload(ach.externalPayloadJson);
    const occurred = ach.occurredAt?.slice(0, 10) ?? "";
    const inWin = inWindow(occurred, windowStart, windowEnd);

    if (provider === "jira") {
      jiraCount += 1;
      if (!inWin) continue;
      const isDone = Boolean(payload.isDone) || Boolean(payload.resolved);
      const isInProgress = Boolean(payload.isInProgress);
      const isBug = Boolean(payload.isBug) || /bug/i.test(String(payload.issueType ?? ""));
      const pts = typeof payload.storyPoints === "number" ? payload.storyPoints : null;
      if (isDone) {
        issuesDone += 1;
        if (pts != null) {
          storyPointsDone += pts;
          storyPointsKnown = true;
        }
        citeSuggestions.push({
          achievementId: ach.id,
          label: ach.externalId ? `Jira ${ach.externalId}` : ach.title.slice(0, 40),
          reason: "Done in review window",
          citeToken: `[${ach.id}]`,
        });
      } else if (isInProgress) {
        issuesInProgress += 1;
      }
      if (isBug && !isDone) openBugs += 1;
      if (typeof payload.blockedHours === "number") blockedHours += payload.blockedHours;
      for (const label of (payload.labels as string[]) ?? []) {
        themes.set(label, (themes.get(label) ?? 0) + 1);
      }
      if (payload.epicName || payload.epicKey) {
        const t = String(payload.epicName ?? payload.epicKey);
        themes.set(t, (themes.get(t) ?? 0) + 1);
      }
    } else if (provider === "bitbucket" || provider === "github") {
      if (provider === "bitbucket") bitbucketCount += 1;
      else githubCount += 1;
      if (String(payload.kind ?? "") === "review_given") {
        if (inWin) reviewsGiven += 1;
        continue;
      }
      if (!inWin) continue;
      prsMerged += 1;
      if (payload.looksLikeRevert) reverts += 1;
      const band = typeof payload.sizeBand === "string" ? payload.sizeBand : null;
      if (band) sizeBands[band] = (sizeBands[band] ?? 0) + 1;
      citeSuggestions.push({
        achievementId: ach.id,
        label: ach.title.replace(/^\[(BB|GH)[^\]]*\]\s*/, "").slice(0, 48),
        reason: "Merged PR in review window",
        citeToken: `[${ach.id}]`,
      });
    }
  }

  const integrationInWindow = issuesDone + issuesInProgress + prsMerged + openBugs;
  const thinDeliveryEvidence =
    dossierNonIntegrationCount < 2 && integrationInWindow >= 3
      ? "jira_rich_dossier_thin"
      : dossierNonIntegrationCount >= 4 && integrationInWindow === 0 && (jiraCount > 0 || bitbucketCount > 0 || githubCount > 0)
        ? "dossier_rich_integrations_empty_window"
        : null;

  return {
    personId,
    cycleId,
    windowStart,
    windowEnd,
    issuesDone,
    issuesInProgress,
    openBugs,
    storyPointsDone: storyPointsKnown ? storyPointsDone : null,
    prsMerged,
    reviewsGiven,
    reverts,
    blockedHours: blockedHours > 0 ? Math.round(blockedHours * 10) / 10 : null,
    sizeBands,
    themes: [...themes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([theme, count]) => ({ theme, count })),
    citeSuggestions: citeSuggestions.slice(0, 12),
    flags: {
      thinDeliveryEvidence,
      integrationCounts: { jira: jiraCount, bitbucket: bitbucketCount, github: githubCount },
    },
  };
}
