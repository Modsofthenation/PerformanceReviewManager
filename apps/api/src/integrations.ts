import { and, eq } from "drizzle-orm";
import { achievements, integrationSettings, personExternalLinks } from "@prm/db";
import type { IntegrationProvider, IntegrationSyncResult } from "@prm/shared";
import { bitbucketMergedPrsForAuthor, type BitbucketConfig } from "./bitbucket.js";
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
      baseUrl: provider === "jira" ? "https://your-domain.atlassian.net" : null,
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

export async function syncPersonIntegrations(
  personId: string,
  providers?: IntegrationProvider[],
): Promise<IntegrationSyncResult> {
  const db = getDb();
  const want = providers?.length ? providers : (["jira", "bitbucket"] as IntegrationProvider[]);
  const result: IntegrationSyncResult = {
    personId,
    jira: { imported: 0, updated: 0, skipped: true, error: null },
    bitbucket: { imported: 0, updated: 0, skipped: true, error: null },
  };

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
      const issues = await jiraSearchIssuesForAssignee(cfg, link.externalAccountId, { days: 180, maxResults: 50 });
      for (const issue of issues) {
        const desc = [
          `${issue.issueType} · ${issue.status}` + (issue.priority ? ` · ${issue.priority}` : ""),
          issue.projectKey ? `Project: ${issue.projectKey} (${issue.projectName})` : null,
          issue.resolved ? `Resolved: ${issue.resolved}` : `Updated: ${issue.updated}`,
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
      });
      for (const pr of prs) {
        const externalId = `${pr.repoFullName}#${pr.id}`;
        const desc = [
          `Merged PR in ${pr.repoFullName}`,
          `Comments: ${pr.commentCount} · Tasks: ${pr.taskCount}`,
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
      db.update(integrationSettings)
        .set({ lastSyncAt: nowIso(), updatedAt: nowIso() })
        .where(eq(integrationSettings.id, "bitbucket"))
        .run();
    } catch (e) {
      result.bitbucket.error = e instanceof Error ? e.message : "Bitbucket sync failed";
    }
  }

  logActivity("integrations.sync", "person", personId, result as unknown as Record<string, unknown>);
  return result;
}
