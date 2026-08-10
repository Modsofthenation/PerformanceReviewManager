/**
 * Cursor Cloud Agents API client (https://api.cursor.com/v1).
 * Dashboard keys (`crsr_…`) authenticate here — not OpenAI chat completions.
 *
 * PRM uses no-repo agents so digests/drafts can run without a GitHub repo.
 * @see https://cursor.com/docs/cloud-agent/api/endpoints
 */

export const CURSOR_CLOUD_API_BASE = "https://api.cursor.com/v1";

export type CursorCloudRunStatus =
  | "CREATING"
  | "RUNNING"
  | "FINISHED"
  | "ERROR"
  | "CANCELLED"
  | "EXPIRED";

export type CursorCloudAgentCreateResponse = {
  agent: { id: string; name?: string; url?: string; latestRunId?: string };
  run: { id: string; agentId: string; status: CursorCloudRunStatus };
};

export type CursorCloudRun = {
  id: string;
  agentId: string;
  status: CursorCloudRunStatus;
  result?: string | null;
  durationMs?: number | null;
};

export type CursorCloudMe = {
  apiKeyName?: string;
  userEmail?: string | null;
  createdAt?: string;
};

export type CursorCloudDeps = {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const TERMINAL: ReadonlySet<CursorCloudRunStatus> = new Set([
  "FINISHED",
  "ERROR",
  "CANCELLED",
  "EXPIRED",
]);

function authHeaders(apiKey: string): HeadersInit {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  return text.slice(0, 400) || res.statusText;
}

export function formatCloudAgentPrompt(
  messages: Array<{ role: string; content: string }>,
  feature: string,
): string {
  const parts = [
    `You are answering a single request from Performance Review Manager (feature: ${feature}).`,
    "This is a no-repo text task: reply with the final answer only.",
    "Do not invent evidence. Follow any citation / grounding rules in the system instructions.",
    "",
  ];
  for (const m of messages) {
    const label =
      m.role === "system" ? "SYSTEM" : m.role === "assistant" ? "ASSISTANT" : "USER";
    parts.push(`=== ${label} ===`, m.content.trim(), "");
  }
  return parts.join("\n").trim();
}

export async function cursorCloudMe(
  apiKey: string,
  deps: CursorCloudDeps = {},
): Promise<CursorCloudMe> {
  const fetchFn = deps.fetchFn ?? fetch;
  const res = await fetchFn(`${CURSOR_CLOUD_API_BASE}/me`, {
    method: "GET",
    headers: authHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Cursor Cloud Agents auth failed: ${res.status} ${await readError(res)}`);
  }
  return (await res.json()) as CursorCloudMe;
}

async function createNoRepoAgent(
  apiKey: string,
  opts: { prompt: string; model?: string | null; name?: string },
  deps: CursorCloudDeps,
): Promise<CursorCloudAgentCreateResponse> {
  const fetchFn = deps.fetchFn ?? fetch;
  const body: Record<string, unknown> = {
    prompt: { text: opts.prompt },
    name: (opts.name ?? "PRM AI").slice(0, 100),
  };
  const modelId = opts.model?.trim();
  if (modelId) body.model = { id: modelId };

  const res = await fetchFn(`${CURSOR_CLOUD_API_BASE}/agents`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Cursor Cloud Agents create failed: ${res.status} ${await readError(res)}`);
  }
  return (await res.json()) as CursorCloudAgentCreateResponse;
}

async function getRun(
  apiKey: string,
  agentId: string,
  runId: string,
  deps: CursorCloudDeps,
): Promise<CursorCloudRun> {
  const fetchFn = deps.fetchFn ?? fetch;
  const res = await fetchFn(`${CURSOR_CLOUD_API_BASE}/agents/${agentId}/runs/${runId}`, {
    method: "GET",
    headers: authHeaders(apiKey),
  });
  if (!res.ok) {
    throw new Error(`Cursor Cloud Agents run failed: ${res.status} ${await readError(res)}`);
  }
  return (await res.json()) as CursorCloudRun;
}

async function archiveAgent(apiKey: string, agentId: string, deps: CursorCloudDeps): Promise<void> {
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    await fetchFn(`${CURSOR_CLOUD_API_BASE}/agents/${agentId}/archive`, {
      method: "POST",
      headers: authHeaders(apiKey),
    });
  } catch {
    // best-effort cleanup
  }
}

export type RunCursorCloudAgentOpts = {
  apiKey: string;
  messages: Array<{ role: string; content: string }>;
  feature: string;
  /** Cursor model id from GET /v1/models; omit to use account default. */
  model?: string | null;
  /** Polling timeout (ms). Default 180s. */
  timeoutMs?: number;
  /** Poll interval (ms). Default 2s. */
  pollMs?: number;
};

/**
 * Launch a no-repo Cloud Agent, poll until terminal, return assistant text, then archive.
 */
export async function runCursorCloudAgent(
  opts: RunCursorCloudAgentOpts,
  deps: CursorCloudDeps = {},
): Promise<{ text: string; model: string; agentId: string; runId: string; agentUrl?: string }> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const pollMs = opts.pollMs ?? 2_000;
  const prompt = formatCloudAgentPrompt(opts.messages, opts.feature);
  const created = await createNoRepoAgent(
    opts.apiKey,
    {
      prompt,
      model: opts.model,
      name: `PRM ${opts.feature}`.slice(0, 100),
    },
    deps,
  );
  const agentId = created.agent.id;
  const runId = created.run.id;
  const modelLabel = opts.model?.trim() || "default";

  try {
    const deadline = now() + timeoutMs;
    let run = created.run as CursorCloudRun;
    while (!TERMINAL.has(run.status)) {
      if (now() > deadline) {
        throw new Error(
          `Cursor Cloud Agent timed out after ${Math.round(timeoutMs / 1000)}s (status ${run.status}). ` +
            `Open ${created.agent.url ?? "https://cursor.com/agents"} to inspect the run.`,
        );
      }
      await sleep(pollMs);
      run = await getRun(opts.apiKey, agentId, runId, deps);
    }
    if (run.status !== "FINISHED") {
      throw new Error(
        `Cursor Cloud Agent ended with ${run.status}` +
          (run.result ? `: ${String(run.result).slice(0, 200)}` : ""),
      );
    }
    const text = (run.result ?? "").trim();
    if (!text) {
      throw new Error("Cursor Cloud Agent finished with empty result");
    }
    return {
      text,
      model: `cursor-cloud:${modelLabel}`,
      agentId,
      runId,
      agentUrl: created.agent.url,
    };
  } finally {
    await archiveAgent(opts.apiKey, agentId, deps);
  }
}
