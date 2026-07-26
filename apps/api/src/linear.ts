/** Linear GraphQL client — assigned issues → dossier achievements. */

export type LinearConfig = {
  apiKey: string;
  apiBase?: string;
};

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  completedAt: string | null;
  updatedAt: string;
  stateName: string;
  projectName: string | null;
  priorityLabel: string | null;
};

export async function linearViewer(cfg: LinearConfig): Promise<{ id: string; name: string; email?: string }> {
  const data = await linearGql<{ viewer: { id: string; name: string; email?: string } }>(
    cfg,
    `query { viewer { id name email } }`,
  );
  return data.viewer;
}

export async function linearSearchUsers(
  cfg: LinearConfig,
  query: string,
): Promise<Array<{ accountId: string; displayName: string; email?: string | null; username?: string | null }>> {
  const data = await linearGql<{
    users: { nodes: Array<{ id: string; name: string; email?: string; displayName?: string }> };
  }>(
    cfg,
    `query($q: String!) {
      users(filter: { or: [{ name: { containsIgnoreCase: $q } }, { email: { containsIgnoreCase: $q } }] }, first: 20) {
        nodes { id name email displayName }
      }
    }`,
    { q: query || "a" },
  );
  return (data.users?.nodes ?? []).map((u) => ({
    accountId: u.id,
    displayName: u.displayName || u.name,
    email: u.email ?? null,
    username: u.email?.split("@")[0] ?? null,
  }));
}

export async function linearIssuesForAssignee(
  cfg: LinearConfig,
  assigneeId: string,
  opts?: { windowStart?: string; windowEnd?: string; maxResults?: number },
): Promise<LinearIssue[]> {
  const max = opts?.maxResults ?? 80;
  const filterParts = [`assignee: { id: { eq: "${assigneeId}" } }`];
  // Linear filter for updatedAt range when window provided
  if (opts?.windowStart) {
    filterParts.push(`updatedAt: { gte: "${opts.windowStart}" }`);
  }
  const filter = `{ ${filterParts.join(", ")} }`;
  const data = await linearGql<{
    issues: {
      nodes: Array<{
        id: string;
        identifier: string;
        title: string;
        url: string;
        completedAt: string | null;
        updatedAt: string;
        state: { name: string } | null;
        project: { name: string } | null;
        priorityLabel: string | null;
      }>;
    };
  }>(
    cfg,
    `query {
      issues(filter: ${filter}, first: ${max}, orderBy: updatedAt) {
        nodes {
          id identifier title url completedAt updatedAt
          state { name }
          project { name }
          priorityLabel
        }
      }
    }`,
  );
  let nodes = data.issues?.nodes ?? [];
  if (opts?.windowEnd) {
    const end = opts.windowEnd;
    nodes = nodes.filter((n) => (n.completedAt || n.updatedAt).slice(0, 10) <= end);
  }
  return nodes.map((n) => ({
    id: n.id,
    identifier: n.identifier,
    title: n.title,
    url: n.url,
    completedAt: n.completedAt,
    updatedAt: n.updatedAt,
    stateName: n.state?.name ?? "Unknown",
    projectName: n.project?.name ?? null,
    priorityLabel: n.priorityLabel,
  }));
}

async function linearGql<T>(cfg: LinearConfig, query: string, variables?: Record<string, unknown>): Promise<T> {
  const base = (cfg.apiBase || "https://api.linear.app/graphql").replace(/\/$/, "");
  const res = await fetch(base, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: cfg.apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear error: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Linear GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Linear returned no data");
  return json.data;
}
