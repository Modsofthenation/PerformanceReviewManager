/** Thin Jira Cloud REST helpers (Basic auth: email + API token). */

export type JiraConfig = {
  baseUrl: string;
  email: string;
  apiToken: string;
};

export type JiraRemoteUser = {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active?: boolean;
};

export type JiraIssue = {
  id: string;
  key: string;
  summary: string;
  status: string;
  issueType: string;
  priority: string | null;
  projectKey: string;
  projectName: string;
  updated: string;
  resolved: string | null;
  url: string;
  assigneeAccountId: string | null;
};

function authHeader(cfg: JiraConfig) {
  const token = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");
  return `Basic ${token}`;
}

function normalizeBase(url: string) {
  return url.replace(/\/+$/, "");
}

async function jiraFetch<T>(cfg: JiraConfig, path: string, init?: RequestInit): Promise<T> {
  const base = normalizeBase(cfg.baseUrl);
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(cfg),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira ${res.status}: ${body.slice(0, 240) || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function jiraTestConnection(cfg: JiraConfig) {
  const me = await jiraFetch<{ displayName?: string; accountId?: string }>(cfg, "/rest/api/3/myself");
  return {
    ok: true as const,
    displayName: me.displayName ?? null,
    accountId: me.accountId ?? null,
  };
}

export async function jiraSearchUsers(cfg: JiraConfig, query: string, max = 20): Promise<JiraRemoteUser[]> {
  const q = encodeURIComponent(query.trim());
  const rows = await jiraFetch<
    Array<{ accountId: string; displayName: string; emailAddress?: string; active?: boolean }>
  >(cfg, `/rest/api/3/user/search?query=${q}&maxResults=${max}`);
  return (rows ?? []).map((u) => ({
    accountId: u.accountId,
    displayName: u.displayName,
    emailAddress: u.emailAddress,
    active: u.active,
  }));
}

export async function jiraSearchIssuesForAssignee(
  cfg: JiraConfig,
  accountId: string,
  opts: { days?: number; maxResults?: number } = {},
): Promise<JiraIssue[]> {
  const days = opts.days ?? 180;
  const maxResults = Math.min(opts.maxResults ?? 50, 100);
  const jql = `assignee = "${accountId.replace(/"/g, '\\"')}" AND updated >= -${days}d ORDER BY updated DESC`;
  const data = await jiraFetch<{
    issues?: Array<{
      id: string;
      key: string;
      fields?: {
        summary?: string;
        status?: { name?: string };
        issuetype?: { name?: string };
        priority?: { name?: string };
        project?: { key?: string; name?: string };
        updated?: string;
        resolutiondate?: string;
        assignee?: { accountId?: string };
      };
    }>;
  }>(
    cfg,
    `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,status,issuetype,priority,project,updated,resolutiondate,assignee`,
  );

  const base = normalizeBase(cfg.baseUrl);
  return (data.issues ?? []).map((issue) => {
    const f = issue.fields ?? {};
    return {
      id: issue.id,
      key: issue.key,
      summary: f.summary ?? issue.key,
      status: f.status?.name ?? "Unknown",
      issueType: f.issuetype?.name ?? "Issue",
      priority: f.priority?.name ?? null,
      projectKey: f.project?.key ?? "",
      projectName: f.project?.name ?? "",
      updated: (f.updated ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      resolved: f.resolutiondate ? f.resolutiondate.slice(0, 10) : null,
      url: `${base}/browse/${issue.key}`,
      assigneeAccountId: f.assignee?.accountId ?? null,
    };
  });
}
