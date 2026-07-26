/** Thin Bitbucket Cloud REST helpers (Basic auth: username + app password). */

export type BitbucketConfig = {
  workspace: string;
  username: string;
  appPassword: string;
};

export type BitbucketRemoteUser = {
  uuid: string;
  displayName: string;
  nickname?: string;
  accountId?: string;
  email?: string;
};

export type BitbucketPullRequest = {
  id: number;
  title: string;
  state: string;
  repoFullName: string;
  authorUuid: string | null;
  authorDisplay: string | null;
  createdOn: string;
  updatedOn: string;
  mergedOn: string | null;
  url: string;
  commentCount: number;
  taskCount: number;
  /** Lines added (when diffstat available). */
  linesAdded: number | null;
  linesRemoved: number | null;
  filesChanged: number | null;
  /** Coarse size band — not a performance score. */
  sizeBand: "XS" | "S" | "M" | "L" | "XL" | null;
  daysToMerge: number | null;
  looksLikeRevert: boolean;
  reviewParticipation: {
    approvals: number;
    reviewers: number;
  } | null;
};

function authHeader(cfg: BitbucketConfig) {
  const token = Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString("base64");
  return `Basic ${token}`;
}

async function bbFetch<T>(cfg: BitbucketConfig, path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `https://api.bitbucket.org/2.0${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: authHeader(cfg),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bitbucket ${res.status}: ${body.slice(0, 240) || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function bitbucketTestConnection(cfg: BitbucketConfig) {
  const me = await bbFetch<{ display_name?: string; uuid?: string; username?: string }>(cfg, "/user");
  const ws = await bbFetch<{ name?: string; slug?: string }>(
    cfg,
    `/workspaces/${encodeURIComponent(cfg.workspace)}`,
  );
  return {
    ok: true as const,
    displayName: me.display_name ?? null,
    uuid: me.uuid ?? null,
    username: me.username ?? cfg.username,
    workspaceName: ws.name ?? cfg.workspace,
  };
}

export async function bitbucketSearchMembers(
  cfg: BitbucketConfig,
  query: string,
  max = 20,
): Promise<BitbucketRemoteUser[]> {
  const q = query.trim();
  const data = await bbFetch<{
    values?: Array<{
      user?: {
        uuid?: string;
        display_name?: string;
        nickname?: string;
        account_id?: string;
      };
    }>;
  }>(
    cfg,
    `/workspaces/${encodeURIComponent(cfg.workspace)}/members?pagelen=50${
      q ? `&q=${encodeURIComponent(`user.display_name~"${q.replace(/"/g, "")}"`)}` : ""
    }`,
  );
  const out: BitbucketRemoteUser[] = [];
  for (const row of data.values ?? []) {
    const u = row.user;
    if (!u?.uuid) continue;
    out.push({
      uuid: u.uuid,
      displayName: u.display_name ?? u.nickname ?? u.uuid,
      nickname: u.nickname,
      accountId: u.account_id,
    });
    if (out.length >= max) break;
  }
  return out;
}

async function listWorkspaceRepos(cfg: BitbucketConfig, maxRepos = 30): Promise<Array<{ fullName: string; slug: string }>> {
  const repos: Array<{ fullName: string; slug: string }> = [];
  let url: string | null =
    `/repositories/${encodeURIComponent(cfg.workspace)}?pagelen=50&role=member`;
  while (url && repos.length < maxRepos) {
    const page: {
      values?: Array<{ full_name?: string; slug?: string }>;
      next?: string;
    } = await bbFetch(cfg, url);
    for (const r of page.values ?? []) {
      if (!r.full_name || !r.slug) continue;
      repos.push({ fullName: r.full_name, slug: r.slug });
      if (repos.length >= maxRepos) break;
    }
    url = page.next ?? null;
  }
  return repos;
}

function sizeBand(files: number | null, churn: number | null): BitbucketPullRequest["sizeBand"] {
  const f = files ?? 0;
  const c = churn ?? 0;
  if (f <= 2 && c <= 40) return "XS";
  if (f <= 8 && c <= 200) return "S";
  if (f <= 20 && c <= 600) return "M";
  if (f <= 40 && c <= 1500) return "L";
  if (f > 0 || c > 0) return "XL";
  return null;
}

async function enrichPrQuality(
  cfg: BitbucketConfig,
  repo: { fullName: string; slug: string },
  pr: BitbucketPullRequest,
): Promise<BitbucketPullRequest> {
  let linesAdded: number | null = null;
  let linesRemoved: number | null = null;
  let filesChanged: number | null = null;
  let reviewParticipation: BitbucketPullRequest["reviewParticipation"] = null;
  try {
    const diff = await bbFetch<{
      values?: Array<{ lines_added?: number; lines_removed?: number }>;
      size?: number;
    }>(
      cfg,
      `/repositories/${encodeURIComponent(cfg.workspace)}/${encodeURIComponent(repo.slug)}/pullrequests/${pr.id}/diffstat?pagelen=100`,
    );
    let add = 0;
    let rem = 0;
    let files = 0;
    for (const row of diff.values ?? []) {
      files += 1;
      add += row.lines_added ?? 0;
      rem += row.lines_removed ?? 0;
    }
    linesAdded = add;
    linesRemoved = rem;
    filesChanged = files || diff.size || null;
  } catch {
    /* optional */
  }
  try {
    const detail = await bbFetch<{
      participants?: Array<{ role?: string; approved?: boolean }>;
    }>(
      cfg,
      `/repositories/${encodeURIComponent(cfg.workspace)}/${encodeURIComponent(repo.slug)}/pullrequests/${pr.id}`,
    );
    const reviewers = (detail.participants ?? []).filter((p) => p.role === "REVIEWER");
    reviewParticipation = {
      reviewers: reviewers.length,
      approvals: reviewers.filter((p) => p.approved).length,
    };
  } catch {
    /* optional */
  }

  let daysToMerge: number | null = null;
  if (pr.createdOn && pr.mergedOn) {
    const a = Date.parse(pr.createdOn);
    const b = Date.parse(pr.mergedOn);
    if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) {
      daysToMerge = Math.round((b - a) / (1000 * 60 * 60 * 24));
    }
  }
  const looksLikeRevert = /\brevert\b/i.test(pr.title);

  return {
    ...pr,
    linesAdded,
    linesRemoved,
    filesChanged,
    sizeBand: sizeBand(filesChanged, (linesAdded ?? 0) + (linesRemoved ?? 0)),
    daysToMerge,
    looksLikeRevert,
    reviewParticipation,
  };
}

export async function bitbucketMergedPrsForAuthor(
  cfg: BitbucketConfig,
  authorUuid: string,
  opts: { maxRepos?: number; maxPrs?: number; windowStart?: string; windowEnd?: string } = {},
): Promise<BitbucketPullRequest[]> {
  const maxRepos = opts.maxRepos ?? 25;
  const maxPrs = opts.maxPrs ?? 50;
  const repos = await listWorkspaceRepos(cfg, maxRepos);
  const results: BitbucketPullRequest[] = [];
  const uuid = authorUuid.includes("{") ? authorUuid : `{${authorUuid}}`;

  for (const repo of repos) {
    if (results.length >= maxPrs) break;
    const q = `state="MERGED" AND author.uuid="${uuid}"`;
    try {
      const data = await bbFetch<{
        values?: Array<{
          id: number;
          title?: string;
          state?: string;
          created_on?: string;
          updated_on?: string;
          merged_on?: string | null;
          comment_count?: number;
          task_count?: number;
          links?: { html?: { href?: string } };
          author?: { uuid?: string; display_name?: string };
        }>;
      }>(
        cfg,
        `/repositories/${encodeURIComponent(cfg.workspace)}/${encodeURIComponent(repo.slug)}/pullrequests?q=${encodeURIComponent(q)}&pagelen=50`,
      );
      for (const pr of data.values ?? []) {
        const mergedOn = pr.merged_on
          ? pr.merged_on.slice(0, 10)
          : (pr.updated_on ?? "").slice(0, 10) || null;
        if (opts.windowStart && mergedOn && mergedOn < opts.windowStart) continue;
        if (opts.windowEnd && mergedOn && mergedOn > opts.windowEnd) continue;
        let row: BitbucketPullRequest = {
          id: pr.id,
          title: pr.title ?? `PR #${pr.id}`,
          state: pr.state ?? "MERGED",
          repoFullName: repo.fullName,
          authorUuid: pr.author?.uuid ?? null,
          authorDisplay: pr.author?.display_name ?? null,
          createdOn: (pr.created_on ?? "").slice(0, 10),
          updatedOn: (pr.updated_on ?? "").slice(0, 10),
          mergedOn,
          url: pr.links?.html?.href ?? `https://bitbucket.org/${repo.fullName}/pull-requests/${pr.id}`,
          commentCount: pr.comment_count ?? 0,
          taskCount: pr.task_count ?? 0,
          linesAdded: null,
          linesRemoved: null,
          filesChanged: null,
          sizeBand: null,
          daysToMerge: null,
          looksLikeRevert: /\brevert\b/i.test(pr.title ?? ""),
          reviewParticipation: null,
        };
        row = await enrichPrQuality(cfg, repo, row);
        results.push(row);
        if (results.length >= maxPrs) break;
      }
    } catch {
      /* skip repos we can't read */
    }
  }

  results.sort((a, b) => (b.mergedOn ?? "").localeCompare(a.mergedOn ?? ""));
  return results;
}

/** PRs where this user participated as a reviewer (gave reviews). */
export async function bitbucketReviewsGiven(
  cfg: BitbucketConfig,
  reviewerUuid: string,
  opts: { maxRepos?: number; maxPrs?: number; windowStart?: string; windowEnd?: string } = {},
): Promise<Array<{ id: number; title: string; repoFullName: string; url: string; updatedOn: string }>> {
  const maxRepos = opts.maxRepos ?? 15;
  const maxPrs = opts.maxPrs ?? 30;
  const repos = await listWorkspaceRepos(cfg, maxRepos);
  const uuid = reviewerUuid.includes("{") ? reviewerUuid : `{${reviewerUuid}}`;
  const out: Array<{ id: number; title: string; repoFullName: string; url: string; updatedOn: string }> = [];
  for (const repo of repos) {
    if (out.length >= maxPrs) break;
    const q = `reviewers.uuid="${uuid}" AND state="MERGED"`;
    try {
      const data = await bbFetch<{
        values?: Array<{
          id: number;
          title?: string;
          updated_on?: string;
          links?: { html?: { href?: string } };
        }>;
      }>(
        cfg,
        `/repositories/${encodeURIComponent(cfg.workspace)}/${encodeURIComponent(repo.slug)}/pullrequests?q=${encodeURIComponent(q)}&pagelen=30`,
      );
      for (const pr of data.values ?? []) {
        const updatedOn = (pr.updated_on ?? "").slice(0, 10);
        if (opts.windowStart && updatedOn && updatedOn < opts.windowStart) continue;
        if (opts.windowEnd && updatedOn && updatedOn > opts.windowEnd) continue;
        out.push({
          id: pr.id,
          title: pr.title ?? `PR #${pr.id}`,
          repoFullName: repo.fullName,
          url: pr.links?.html?.href ?? `https://bitbucket.org/${repo.fullName}/pull-requests/${pr.id}`,
          updatedOn,
        });
        if (out.length >= maxPrs) break;
      }
    } catch {
      /* skip */
    }
  }
  return out;
}
