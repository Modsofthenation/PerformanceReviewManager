/** Richer Jira Cloud REST helpers (Basic auth: email + API token). */

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
  statusCategory: string | null;
  issueType: string;
  priority: string | null;
  projectKey: string;
  projectName: string;
  updated: string;
  resolved: string | null;
  created: string | null;
  url: string;
  assigneeAccountId: string | null;
  reporterAccountId: string | null;
  reporterName: string | null;
  creatorAccountId: string | null;
  creatorName: string | null;
  labels: string[];
  epicKey: string | null;
  epicName: string | null;
  storyPoints: number | null;
  commentHighlights: string[];
  blockedHours: number | null;
  isBug: boolean;
  isDone: boolean;
  isInProgress: boolean;
  noiseFiltered: boolean;
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

function extractAdfText(node: unknown, depth = 0): string {
  if (depth > 8 || node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((n) => extractAdfText(n, depth + 1)).join(" ");
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (o.content) return extractAdfText(o.content, depth + 1);
  }
  return "";
}

function parseStoryPoints(fields: Record<string, unknown>): number | null {
  const candidates = [
    fields.customfield_10016,
    fields.customfield_10026,
    fields.story_points,
    fields.storyPoints,
  ];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function isNoiseIssue(issueType: string, summary: string, labels: string[]): boolean {
  const type = issueType.toLowerCase();
  if (type.includes("sub-task") || type.includes("subtask") || type === "subtask") return true;
  if (/\b(bot|dependabot|renovate|automation)\b/i.test(summary)) return true;
  if (labels.some((l) => /^(bot|automation|spam)$/i.test(l))) return true;
  return false;
}

function blockedHoursFromChangelog(
  histories: Array<{
    created?: string;
    items?: Array<{ field?: string; fromString?: string | null; toString?: string | null }>;
  }>,
): number | null {
  let entered: string | null = null;
  let hours = 0;
  const sorted = [...histories].sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""));
  for (const h of sorted) {
    for (const item of h.items ?? []) {
      if (item.field !== "status") continue;
      const to = (item.toString ?? "").toLowerCase();
      const from = (item.fromString ?? "").toLowerCase();
      if (to.includes("block") && !entered) entered = h.created ?? null;
      if (entered && from.includes("block") && !to.includes("block")) {
        const start = Date.parse(entered);
        const end = Date.parse(h.created ?? "");
        if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
          hours += (end - start) / (1000 * 60 * 60);
        }
        entered = null;
      }
    }
  }
  return hours > 0 ? Math.round(hours * 10) / 10 : null;
}

export type JiraSearchOpts = {
  /** Inclusive window start YYYY-MM-DD (preferred over days). */
  windowStart?: string;
  windowEnd?: string;
  days?: number;
  maxResults?: number;
  includeComments?: boolean;
  includeChangelog?: boolean;
};

export async function jiraSearchIssuesForAssignee(
  cfg: JiraConfig,
  accountId: string,
  opts: JiraSearchOpts = {},
): Promise<JiraIssue[]> {
  const maxResults = Math.min(opts.maxResults ?? 80, 100);
  const id = accountId.replace(/"/g, '\\"');
  let jql: string;
  if (opts.windowStart && opts.windowEnd) {
    jql = `(assignee = "${id}" OR reporter = "${id}" OR creator = "${id}") AND ((resolved >= "${opts.windowStart}" AND resolved <= "${opts.windowEnd}") OR (updated >= "${opts.windowStart}" AND updated <= "${opts.windowEnd}")) ORDER BY updated DESC`;
  } else {
    const days = opts.days ?? 180;
    jql = `(assignee = "${id}" OR reporter = "${id}") AND updated >= -${days}d ORDER BY updated DESC`;
  }

  const fields = [
    "summary",
    "status",
    "issuetype",
    "priority",
    "project",
    "updated",
    "created",
    "resolutiondate",
    "assignee",
    "reporter",
    "creator",
    "labels",
    "parent",
    "customfield_10016",
    "customfield_10026",
    "customfield_10014", // epic link (classic)
    "comment",
  ].join(",");

  const expand: string[] = [];
  if (opts.includeChangelog !== false) expand.push("changelog");

  const data = await jiraFetch<{
    issues?: Array<{
      id: string;
      key: string;
      fields?: Record<string, unknown>;
      changelog?: {
        histories?: Array<{
          created?: string;
          items?: Array<{ field?: string; fromString?: string | null; toString?: string | null }>;
        }>;
      };
    }>;
  }>(
    cfg,
    `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=${encodeURIComponent(fields)}${
      expand.length ? `&expand=${expand.join(",")}` : ""
    }`,
  );

  const base = normalizeBase(cfg.baseUrl);
  const out: JiraIssue[] = [];

  for (const issue of data.issues ?? []) {
    const f = (issue.fields ?? {}) as Record<string, unknown>;
    const statusObj = f.status as { name?: string; statusCategory?: { name?: string; key?: string } } | undefined;
    const status = statusObj?.name ?? "Unknown";
    const statusCategory = statusObj?.statusCategory?.name ?? statusObj?.statusCategory?.key ?? null;
    const issueType =
      (f.issuetype as { name?: string } | undefined)?.name ??
      (f.issueType as { name?: string } | undefined)?.name ??
      "Issue";
    const labels = Array.isArray(f.labels) ? (f.labels as string[]) : [];
    const summary = String(f.summary ?? issue.key);
    const noise = isNoiseIssue(issueType, summary, labels);
    if (noise) continue;

    const parent = f.parent as { key?: string; fields?: { summary?: string } } | undefined;
    const epicLink = typeof f.customfield_10014 === "string" ? f.customfield_10014 : null;

    let commentHighlights: string[] = [];
    if (opts.includeComments) {
      const comments = (f.comment as { comments?: Array<{ body?: unknown; author?: { displayName?: string } }> })
        ?.comments;
      commentHighlights = (comments ?? [])
        .slice(-3)
        .map((c) => {
          const text = extractAdfText(c.body).replace(/\s+/g, " ").trim().slice(0, 180);
          const who = c.author?.displayName ?? "Someone";
          return text ? `${who}: ${text}` : "";
        })
        .filter(Boolean);
    }

    const cat = (statusCategory ?? "").toLowerCase();
    const statusLower = status.toLowerCase();
    const isDone =
      cat.includes("done") ||
      /^(done|closed|resolved|complete|shipped)$/i.test(statusLower);
    const isInProgress =
      !isDone &&
      (cat.includes("progress") || /progress|review|qa|testing|develop/i.test(statusLower));
    const isBug = /bug|defect|incident/i.test(issueType);

    const reporter = f.reporter as { accountId?: string; displayName?: string } | undefined;
    const creator = f.creator as { accountId?: string; displayName?: string } | undefined;
    const assignee = f.assignee as { accountId?: string } | undefined;

    out.push({
      id: issue.id,
      key: issue.key,
      summary,
      status,
      statusCategory,
      issueType,
      priority: (f.priority as { name?: string } | undefined)?.name ?? null,
      projectKey: (f.project as { key?: string } | undefined)?.key ?? "",
      projectName: (f.project as { name?: string } | undefined)?.name ?? "",
      updated: String(f.updated ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      resolved: f.resolutiondate ? String(f.resolutiondate).slice(0, 10) : null,
      created: f.created ? String(f.created).slice(0, 10) : null,
      url: `${base}/browse/${issue.key}`,
      assigneeAccountId: assignee?.accountId ?? null,
      reporterAccountId: reporter?.accountId ?? null,
      reporterName: reporter?.displayName ?? null,
      creatorAccountId: creator?.accountId ?? null,
      creatorName: creator?.displayName ?? null,
      labels,
      epicKey: epicLink ?? parent?.key ?? null,
      epicName: parent?.fields?.summary ?? null,
      storyPoints: parseStoryPoints(f),
      commentHighlights,
      blockedHours: blockedHoursFromChangelog(issue.changelog?.histories ?? []),
      isBug,
      isDone,
      isInProgress,
      noiseFiltered: false,
    });
  }

  return out;
}
