/** GitHub REST helpers (PAT: classic or fine-grained with repo + PR read). */

export type GitHubConfig = {
  token: string;
  /** Optional org login to scope searches; if null, search user-authored PRs across orgs. */
  org?: string | null;
  apiBase?: string;
};

export type GitHubRemoteUser = {
  login: string;
  id: number;
  name: string | null;
  htmlUrl: string;
};

export type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  state: string;
  repoFullName: string;
  authorLogin: string | null;
  createdOn: string;
  updatedOn: string;
  mergedOn: string | null;
  url: string;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  sizeBand: "XS" | "S" | "M" | "L" | "XL" | null;
  daysToMerge: number | null;
  looksLikeRevert: boolean;
  reviewCount: number | null;
};

function apiBase(cfg: GitHubConfig) {
  return (cfg.apiBase ?? "https://api.github.com").replace(/\/+$/, "");
}

async function ghFetch<T>(cfg: GitHubConfig, path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${apiBase(cfg)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 240) || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function githubTestConnection(cfg: GitHubConfig) {
  const me = await ghFetch<{ login?: string; name?: string; id?: number }>(cfg, "/user");
  return {
    ok: true as const,
    login: me.login ?? null,
    name: me.name ?? null,
    id: me.id ?? null,
  };
}

export async function githubSearchUsers(cfg: GitHubConfig, query: string, max = 20): Promise<GitHubRemoteUser[]> {
  const q = encodeURIComponent(query.trim());
  const data = await ghFetch<{
    items?: Array<{ login: string; id: number; html_url?: string }>;
  }>(cfg, `/search/users?q=${q}&per_page=${max}`);
  return (data.items ?? []).map((u) => ({
    login: u.login,
    id: u.id,
    name: null,
    htmlUrl: u.html_url ?? `https://github.com/${u.login}`,
  }));
}

function sizeBand(files: number | null, churn: number | null): GitHubPullRequest["sizeBand"] {
  const f = files ?? 0;
  const c = churn ?? 0;
  if (f <= 2 && c <= 40) return "XS";
  if (f <= 8 && c <= 200) return "S";
  if (f <= 20 && c <= 600) return "M";
  if (f <= 40 && c <= 1500) return "L";
  if (f > 0 || c > 0) return "XL";
  return null;
}

export async function githubMergedPrsForAuthor(
  cfg: GitHubConfig,
  authorLogin: string,
  opts: { maxPrs?: number; windowStart?: string; windowEnd?: string } = {},
): Promise<GitHubPullRequest[]> {
  const maxPrs = opts.maxPrs ?? 50;
  const parts = [`is:pr`, `is:merged`, `author:${authorLogin}`];
  if (cfg.org) parts.push(`org:${cfg.org}`);
  if (opts.windowStart) parts.push(`merged:>=${opts.windowStart}`);
  if (opts.windowEnd) parts.push(`merged:<=${opts.windowEnd}`);
  const q = encodeURIComponent(parts.join(" "));
  const data = await ghFetch<{
    items?: Array<{
      id: number;
      number: number;
      title?: string;
      html_url?: string;
      repository_url?: string;
      created_at?: string;
      updated_at?: string;
      closed_at?: string | null;
      pull_request?: { merged_at?: string | null; url?: string };
      user?: { login?: string };
    }>;
  }>(cfg, `/search/issues?q=${q}&per_page=${Math.min(maxPrs, 50)}&sort=updated`);

  const out: GitHubPullRequest[] = [];
  for (const item of data.items ?? []) {
    const repoFullName = (item.repository_url ?? "").replace("https://api.github.com/repos/", "");
    const mergedOn = item.pull_request?.merged_at
      ? item.pull_request.merged_at.slice(0, 10)
      : item.closed_at
        ? item.closed_at.slice(0, 10)
        : null;
    let additions: number | null = null;
    let deletions: number | null = null;
    let changedFiles: number | null = null;
    let reviewCount: number | null = null;
    if (repoFullName && item.number) {
      try {
        const detail = await ghFetch<{
          additions?: number;
          deletions?: number;
          changed_files?: number;
        }>(cfg, `/repos/${repoFullName}/pulls/${item.number}`);
        additions = detail.additions ?? null;
        deletions = detail.deletions ?? null;
        changedFiles = detail.changed_files ?? null;
      } catch {
        /* optional */
      }
      try {
        const reviews = await ghFetch<Array<{ id: number }>>(
          cfg,
          `/repos/${repoFullName}/pulls/${item.number}/reviews`,
        );
        reviewCount = reviews.length;
      } catch {
        /* optional */
      }
    }
    const createdOn = (item.created_at ?? "").slice(0, 10);
    let daysToMerge: number | null = null;
    if (createdOn && mergedOn) {
      const a = Date.parse(createdOn);
      const b = Date.parse(mergedOn);
      if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) {
        daysToMerge = Math.round((b - a) / (1000 * 60 * 60 * 24));
      }
    }
    out.push({
      id: item.id,
      number: item.number,
      title: item.title ?? `PR #${item.number}`,
      state: "MERGED",
      repoFullName,
      authorLogin: item.user?.login ?? authorLogin,
      createdOn,
      updatedOn: (item.updated_at ?? "").slice(0, 10),
      mergedOn,
      url: item.html_url ?? `https://github.com/${repoFullName}/pull/${item.number}`,
      additions,
      deletions,
      changedFiles,
      sizeBand: sizeBand(changedFiles, (additions ?? 0) + (deletions ?? 0)),
      daysToMerge,
      looksLikeRevert: /\brevert\b/i.test(item.title ?? ""),
      reviewCount,
    });
  }
  return out;
}

export async function githubReviewsGiven(
  cfg: GitHubConfig,
  reviewerLogin: string,
  opts: { maxPrs?: number; windowStart?: string; windowEnd?: string } = {},
): Promise<Array<{ number: number; title: string; repoFullName: string; url: string; updatedOn: string }>> {
  const maxPrs = opts.maxPrs ?? 30;
  const parts = [`is:pr`, `is:merged`, `reviewed-by:${reviewerLogin}`];
  if (cfg.org) parts.push(`org:${cfg.org}`);
  if (opts.windowStart) parts.push(`merged:>=${opts.windowStart}`);
  if (opts.windowEnd) parts.push(`merged:<=${opts.windowEnd}`);
  const q = encodeURIComponent(parts.join(" "));
  const data = await ghFetch<{
    items?: Array<{
      number: number;
      title?: string;
      html_url?: string;
      repository_url?: string;
      updated_at?: string;
    }>;
  }>(cfg, `/search/issues?q=${q}&per_page=${Math.min(maxPrs, 50)}`);
  return (data.items ?? []).map((item) => ({
    number: item.number,
    title: item.title ?? `PR #${item.number}`,
    repoFullName: (item.repository_url ?? "").replace("https://api.github.com/repos/", ""),
    url: item.html_url ?? "",
    updatedOn: (item.updated_at ?? "").slice(0, 10),
  }));
}
