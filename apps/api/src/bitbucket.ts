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

export async function bitbucketMergedPrsForAuthor(
  cfg: BitbucketConfig,
  authorUuid: string,
  opts: { maxRepos?: number; maxPrs?: number } = {},
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
        results.push({
          id: pr.id,
          title: pr.title ?? `PR #${pr.id}`,
          state: pr.state ?? "MERGED",
          repoFullName: repo.fullName,
          authorUuid: pr.author?.uuid ?? null,
          authorDisplay: pr.author?.display_name ?? null,
          createdOn: (pr.created_on ?? "").slice(0, 10),
          updatedOn: (pr.updated_on ?? "").slice(0, 10),
          mergedOn: pr.merged_on ? pr.merged_on.slice(0, 10) : (pr.updated_on ?? "").slice(0, 10) || null,
          url: pr.links?.html?.href ?? `https://bitbucket.org/${repo.fullName}/pull-requests/${pr.id}`,
          commentCount: pr.comment_count ?? 0,
          taskCount: pr.task_count ?? 0,
        });
        if (results.length >= maxPrs) break;
      }
    } catch {
      /* skip repos we can't read */
    }
  }

  results.sort((a, b) => (b.mergedOn ?? "").localeCompare(a.mergedOn ?? ""));
  return results;
}
