import { and, eq } from "drizzle-orm";
import { achievements, cycles, integrationSettings, personExternalLinks } from "@prm/db";
import type { IntegrationProvider, IntegrationSyncResult } from "@prm/shared";
import { bitbucketMergedPrsForAuthor, bitbucketReviewsGiven, type BitbucketConfig } from "./bitbucket.js";
import { githubMergedPrsForAuthor, githubReviewsGiven, type GitHubConfig } from "./github.js";
import { jiraSearchIssuesForAssignee, type JiraConfig } from "./jira.js";
import {
  decryptSecret,
  getDb,
  getWorkspaceSecret,
  id,
  logActivity,
  nowIso,
} from "./store.js";

export function getIntegrationRow(provider: IntegrationProvider) {
  const db = getDb();
  return db.select().from(integrationSettings).where(eq(integrationSettings.id, provider)).all()[0];
}

export function ensureIntegrationRow(provider: IntegrationProvider) {
  const db = getDb();
  const existing = getIntegrationRow(provider);
  if (existing) return existing;
  const ts = nowIso();
  db.insert(integrationSettings)
    .values({
      id: provider,
      enabled: 0,
      baseUrl:
        provider === "jira"
          ? "https://your-domain.atlassian.net"
          : provider === "github"
            ? "https://api.github.com"
            : null,
      workspaceSlug: null,
      authEmail: null,
      authUsername: null,
      tokenEncrypted: null,
      extraJson: "{}",
      lastSyncAt: null,
      updatedAt: ts,
    })
    .run();
  return getIntegrationRow(provider)!;
}

export function resolveIntegrationToken(provider: IntegrationProvider): string | null {
  const row = getIntegrationRow(provider);
  if (!row?.tokenEncrypted) return null;
  const secret = getWorkspaceSecret();
  if (!secret) throw new Error("Workspace locked — unlock before using integrations");
  return decryptSecret(row.tokenEncrypted, secret);
}

export function getJiraConfig(): JiraConfig | null {
  const row = getIntegrationRow("jira");
  if (!row?.enabled || !row.baseUrl || !row.authEmail) return null;
  const token = resolveIntegrationToken("jira");
  if (!token) return null;
  return { baseUrl: row.baseUrl, email: row.authEmail, apiToken: token };
}

export function getBitbucketConfig(): BitbucketConfig | null {
  const row = getIntegrationRow("bitbucket");
  if (!row?.enabled || !row.workspaceSlug || !row.authUsername) return null;
  const token = resolveIntegrationToken("bitbucket");
  if (!token) return null;
  return { workspace: row.workspaceSlug, username: row.authUsername, appPassword: token };
}

export function getGitHubConfig(): GitHubConfig | null {
  const row = getIntegrationRow("github");
  if (!row?.enabled) return null;
  const token = resolveIntegrationToken("github");
  if (!token) return null;
  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(row.extraJson || "{}") as Record<string, unknown>;
  } catch {
    extra = {};
  }
  return {
    token,
    org: typeof extra.org === "string" ? extra.org : row.workspaceSlug,
    apiBase: row.baseUrl || "https://api.github.com",
  };
}

function upsertAchievement(input: {
  personId: string;
  provider: IntegrationProvider;
  externalId: string;
  title: string;
  description: string;
  occurredAt: string;
  externalUrl: string;
  payload: Record<string, unknown>;
}) {
  const db = getDb();
  const existing = db
    .select()
    .from(achievements)
    .where(
      and(
        eq(achievements.personId, input.personId),
        eq(achievements.sourceProvider, input.provider),
        eq(achievements.externalId, input.externalId),
      ),
    )
    .all()[0];
  const payloadJson = JSON.stringify(input.payload);
  if (existing) {
    db.update(achievements)
      .set({
        title: input.title,
        description: input.description,
        occurredAt: input.occurredAt,
        externalUrl: input.externalUrl,
        externalPayloadJson: payloadJson,
      })
      .where(eq(achievements.id, existing.id))
      .run();
    return { id: existing.id, created: false };
  }
  const achId = id("ach");
  db.insert(achievements)
    .values({
      id: achId,
      personId: input.personId,
      title: input.title,
      description: input.description,
      occurredAt: input.occurredAt,
      createdAt: nowIso(),
      sourceProvider: input.provider,
      externalId: input.externalId,
      externalUrl: input.externalUrl,
      externalPayloadJson: payloadJson,
    })
    .run();
  return { id: achId, created: true };
}

function resolveCycleWindow(cycleId?: string | null): {
  cycleId: string | null;
  windowStart: string | null;
  windowEnd: string | null;
} {
  const db = getDb();
  const cycle = cycleId
    ? db.select().from(cycles).where(eq(cycles.id, cycleId)).all()[0]
    : db
        .select()
        .from(cycles)
        .all()
        .filter((c) => c.status !== "closed")
        .sort((a, b) => b.windowEnd.localeCompare(a.windowEnd))[0];
  if (!cycle) return { cycleId: null, windowStart: null, windowEnd: null };
  return { cycleId: cycle.id, windowStart: cycle.windowStart.slice(0, 10), windowEnd: cycle.windowEnd.slice(0, 10) };
}

export async function syncPersonIntegrations(
  personId: string,
  providers?: IntegrationProvider[],
  opts?: { cycleId?: string; includeComments?: boolean },
): Promise<IntegrationSyncResult> {
  const db = getDb();
  const want = providers?.length
    ? providers
    : (["jira", "bitbucket", "github"] as IntegrationProvider[]);
  const window = resolveCycleWindow(opts?.cycleId);
  const result: IntegrationSyncResult = {
    personId,
    cycleId: window.cycleId,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    jira: { imported: 0, updated: 0, skipped: true, error: null },
    bitbucket: { imported: 0, updated: 0, skipped: true, error: null },
    github: { imported: 0, updated: 0, skipped: true, error: null },
  };

  const jiraExtra = (() => {
    try {
      return JSON.parse(getIntegrationRow("jira")?.extraJson || "{}") as { includeComments?: boolean };
    } catch {
      return {};
    }
  })();
  const includeComments = opts?.includeComments ?? Boolean(jiraExtra.includeComments);

  if (want.includes("jira")) {
    result.jira.skipped = false;
    try {
      const cfg = getJiraConfig();
      if (!cfg) throw new Error("Jira is not configured or enabled");
      const link = db
        .select()
        .from(personExternalLinks)
        .where(and(eq(personExternalLinks.personId, personId), eq(personExternalLinks.provider, "jira")))
        .all()[0];
      if (!link) throw new Error("No Jira account linked for this person");
      const issues = await jiraSearchIssuesForAssignee(cfg, link.externalAccountId, {
        windowStart: window.windowStart ?? undefined,
        windowEnd: window.windowEnd ?? undefined,
        days: window.windowStart ? undefined : 180,
        maxResults: 80,
        includeComments,
        includeChangelog: true,
      });
      for (const issue of issues) {
        const desc = [
          `${issue.issueType} · ${issue.status}` + (issue.priority ? ` · ${issue.priority}` : ""),
          issue.projectKey ? `Project: ${issue.projectKey} (${issue.projectName})` : null,
          issue.storyPoints != null ? `Story points: ${issue.storyPoints}` : null,
          issue.epicKey ? `Epic: ${issue.epicKey}${issue.epicName ? ` — ${issue.epicName}` : ""}` : null,
          issue.labels.length ? `Labels: ${issue.labels.join(", ")}` : null,
          issue.reporterName ? `Reporter: ${issue.reporterName}` : null,
          issue.blockedHours != null ? `Blocked ~${issue.blockedHours}h` : null,
          issue.resolved ? `Resolved: ${issue.resolved}` : `Updated: ${issue.updated}`,
          issue.commentHighlights.length ? `Comments:\n- ${issue.commentHighlights.join("\n- ")}` : null,
          `Cite as [${issue.key}] via achievement id after sync`,
          issue.url,
        ]
          .filter(Boolean)
          .join("\n");
        const up = upsertAchievement({
          personId,
          provider: "jira",
          externalId: issue.key,
          title: `[Jira ${issue.key}] ${issue.summary}`,
          description: desc,
          occurredAt: issue.resolved ?? issue.updated,
          externalUrl: issue.url,
          payload: issue as unknown as Record<string, unknown>,
        });
        if (up.created) result.jira.imported += 1;
        else result.jira.updated += 1;
      }
      db.update(integrationSettings)
        .set({ lastSyncAt: nowIso(), updatedAt: nowIso() })
        .where(eq(integrationSettings.id, "jira"))
        .run();
    } catch (e) {
      result.jira.error = e instanceof Error ? e.message : "Jira sync failed";
    }
  }

  if (want.includes("bitbucket")) {
    result.bitbucket.skipped = false;
    try {
      const cfg = getBitbucketConfig();
      if (!cfg) throw new Error("Bitbucket is not configured or enabled");
      const link = db
        .select()
        .from(personExternalLinks)
        .where(and(eq(personExternalLinks.personId, personId), eq(personExternalLinks.provider, "bitbucket")))
        .all()[0];
      if (!link) throw new Error("No Bitbucket account linked for this person");
      const prs = await bitbucketMergedPrsForAuthor(cfg, link.externalAccountId, {
        maxRepos: 25,
        maxPrs: 50,
        windowStart: window.windowStart ?? undefined,
        windowEnd: window.windowEnd ?? undefined,
      });
      for (const pr of prs) {
        const externalId = `${pr.repoFullName}#${pr.id}`;
        const desc = [
          `Merged PR in ${pr.repoFullName}`,
          pr.sizeBand ? `Size band: ${pr.sizeBand} (files/LOC bands — not a score)` : null,
          pr.daysToMerge != null ? `Time to merge: ${pr.daysToMerge}d` : null,
          pr.reviewParticipation
            ? `Reviewers: ${pr.reviewParticipation.reviewers} · Approvals: ${pr.reviewParticipation.approvals}`
            : null,
          `Comments: ${pr.commentCount} · Tasks: ${pr.taskCount}`,
          pr.looksLikeRevert ? "Looks like a revert" : null,
          pr.mergedOn ? `Merged: ${pr.mergedOn}` : null,
          pr.url,
        ]
          .filter(Boolean)
          .join("\n");
        const up = upsertAchievement({
          personId,
          provider: "bitbucket",
          externalId,
          title: `[BB PR #${pr.id}] ${pr.title}`,
          description: desc,
          occurredAt: pr.mergedOn ?? pr.updatedOn ?? nowIso().slice(0, 10),
          externalUrl: pr.url,
          payload: pr as unknown as Record<string, unknown>,
        });
        if (up.created) result.bitbucket.imported += 1;
        else result.bitbucket.updated += 1;
      }
      const given = await bitbucketReviewsGiven(cfg, link.externalAccountId, {
        windowStart: window.windowStart ?? undefined,
        windowEnd: window.windowEnd ?? undefined,
      });
      for (const rev of given) {
        const externalId = `review:${rev.repoFullName}#${rev.id}`;
        const up = upsertAchievement({
          personId,
          provider: "bitbucket",
          externalId,
          title: `[BB review] ${rev.title}`,
          description: `Reviewed PR in ${rev.repoFullName}\n${rev.url}`,
          occurredAt: rev.updatedOn || nowIso().slice(0, 10),
          externalUrl: rev.url,
          payload: { ...rev, kind: "review_given" },
        });
        if (up.created) result.bitbucket.imported += 1;
        else result.bitbucket.updated += 1;
      }
      db.update(integrationSettings)
        .set({ lastSyncAt: nowIso(), updatedAt: nowIso() })
        .where(eq(integrationSettings.id, "bitbucket"))
        .run();
    } catch (e) {
      result.bitbucket.error = e instanceof Error ? e.message : "Bitbucket sync failed";
    }
  }

  if (want.includes("github")) {
    result.github.skipped = false;
    try {
      const cfg = getGitHubConfig();
      if (!cfg) throw new Error("GitHub is not configured or enabled");
      const link = db
        .select()
        .from(personExternalLinks)
        .where(and(eq(personExternalLinks.personId, personId), eq(personExternalLinks.provider, "github")))
        .all()[0];
      if (!link) throw new Error("No GitHub account linked for this person");
      const login = link.externalUsername || link.externalAccountId;
      const prs = await githubMergedPrsForAuthor(cfg, login, {
        maxPrs: 50,
        windowStart: window.windowStart ?? undefined,
        windowEnd: window.windowEnd ?? undefined,
      });
      for (const pr of prs) {
        const externalId = `${pr.repoFullName}#${pr.number}`;
        const desc = [
          `Merged PR in ${pr.repoFullName}`,
          pr.sizeBand ? `Size band: ${pr.sizeBand}` : null,
          pr.daysToMerge != null ? `Time to merge: ${pr.daysToMerge}d` : null,
          pr.reviewCount != null ? `Reviews on PR: ${pr.reviewCount}` : null,
          pr.looksLikeRevert ? "Looks like a revert" : null,
          pr.mergedOn ? `Merged: ${pr.mergedOn}` : null,
          pr.url,
        ]
          .filter(Boolean)
          .join("\n");
        const up = upsertAchievement({
          personId,
          provider: "github",
          externalId,
          title: `[GH PR #${pr.number}] ${pr.title}`,
          description: desc,
          occurredAt: pr.mergedOn ?? pr.updatedOn ?? nowIso().slice(0, 10),
          externalUrl: pr.url,
          payload: pr as unknown as Record<string, unknown>,
        });
        if (up.created) result.github.imported += 1;
        else result.github.updated += 1;
      }
      const given = await githubReviewsGiven(cfg, login, {
        windowStart: window.windowStart ?? undefined,
        windowEnd: window.windowEnd ?? undefined,
      });
      for (const rev of given) {
        const externalId = `review:${rev.repoFullName}#${rev.number}`;
        const up = upsertAchievement({
          personId,
          provider: "github",
          externalId,
          title: `[GH review] ${rev.title}`,
          description: `Reviewed PR in ${rev.repoFullName}\n${rev.url}`,
          occurredAt: rev.updatedOn || nowIso().slice(0, 10),
          externalUrl: rev.url,
          payload: { ...rev, kind: "review_given" },
        });
        if (up.created) result.github.imported += 1;
        else result.github.updated += 1;
      }
      db.update(integrationSettings)
        .set({ lastSyncAt: nowIso(), updatedAt: nowIso() })
        .where(eq(integrationSettings.id, "github"))
        .run();
    } catch (e) {
      result.github.error = e instanceof Error ? e.message : "GitHub sync failed";
    }
  }

  logActivity("integrations.sync", "person", personId, result as unknown as Record<string, unknown>);
  return result;
}
