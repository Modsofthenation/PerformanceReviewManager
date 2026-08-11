/**
 * Cursor Cloud Agents API client (https://api.cursor.com/v1).
 * Dashboard keys (`crsr_…`) authenticate here — not OpenAI chat completions.
 *
 * PRM uses no-repo agents so digests/drafts can run without a GitHub repo.
 * Prefers the run SSE stream for live text; falls back to polling when needed.
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

/** Progress events for UI / callers while a Cloud Agent run is in flight. */
export type CursorCloudProgress =
  | {
      type: "status";
      status: CursorCloudRunStatus;
      agentId: string;
      runId: string;
      agentUrl?: string;
    }
  | { type: "text"; delta: string; cumulative: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_call"; name: string; status: string; callId?: string };

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

function authHeaders(apiKey: string, extra?: HeadersInit): HeadersInit {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  return text.slice(0, 400) || res.statusText;
}

function formatEmptyResultError(opts: {
  agentId: string;
  runId: string;
  agentUrl?: string;
  durationMs?: number | null;
  assistantChars: number;
  status: string;
}): string {
  const parts = [
    `Cursor Cloud Agent finished with empty result (status ${opts.status}`,
    `agent ${opts.agentId}`,
    `run ${opts.runId}`,
  ];
  if (opts.durationMs != null) parts.push(`${Math.round(opts.durationMs / 1000)}s`);
  if (opts.assistantChars > 0) {
    parts.push(`streamed ${opts.assistantChars} assistant chars that did not resolve to a final reply`);
  }
  const tip = opts.agentUrl
    ? ` Open ${opts.agentUrl} to inspect the transcript.`
    : " Open https://cursor.com/agents to inspect the run.";
  return `${parts.join(", ")}).${tip}`;
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

type StreamOutcome = {
  status: CursorCloudRunStatus;
  /** Final reply from the `result` SSE event when present. */
  resultText: string;
  /** Concatenated `assistant` SSE deltas (useful when result.text is empty). */
  assistantText: string;
  durationMs?: number | null;
};

function parseSseBlock(block: string): { event?: string; data?: string; id?: string } | null {
  const lines = block.split(/\r?\n/);
  let event: string | undefined;
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("id:")) id = line.slice(3).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!event && dataLines.length === 0) return null;
  return { event, id, data: dataLines.join("\n") };
}

/**
 * Consume GET /v1/agents/{id}/runs/{runId}/stream until result/done/error.
 * Returns null when the stream endpoint is unavailable (caller should poll).
 */
async function streamRun(
  apiKey: string,
  agentId: string,
  runId: string,
  agentUrl: string | undefined,
  onProgress: ((p: CursorCloudProgress) => void) | undefined,
  deps: CursorCloudDeps,
  timeoutMs: number,
  now: () => number,
): Promise<StreamOutcome | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  const res = await fetchFn(`${CURSOR_CLOUD_API_BASE}/agents/${agentId}/runs/${runId}/stream`, {
    method: "GET",
    headers: authHeaders(apiKey, { Accept: "text/event-stream" }),
  });

  // Stream expired or unsupported → fall back to polling.
  if (res.status === 404 || res.status === 410 || res.status === 405) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Cursor Cloud Agents stream failed: ${res.status} ${await readError(res)}`);
  }
  if (!res.body) {
    return null;
  }

  const deadline = now() + timeoutMs;
  let assistantText = "";
  let resultText = "";
  let status: CursorCloudRunStatus = "CREATING";
  let durationMs: number | null | undefined;
  let finished = false;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleEvent = (raw: { event?: string; data?: string }) => {
    const eventName = (raw.event || "message").trim();
    if (eventName === "heartbeat" || eventName === "done") {
      if (eventName === "done") finished = true;
      return;
    }

    let payload: Record<string, unknown> = {};
    if (raw.data) {
      try {
        payload = JSON.parse(raw.data) as Record<string, unknown>;
      } catch {
        payload = { text: raw.data };
      }
    }

    if (eventName === "status") {
      const next = String(payload.status || status) as CursorCloudRunStatus;
      status = next;
      onProgress?.({ type: "status", status: next, agentId, runId, agentUrl });
      return;
    }

    if (eventName === "assistant") {
      const delta = typeof payload.text === "string" ? payload.text : "";
      if (delta) {
        assistantText += delta;
        onProgress?.({ type: "text", delta, cumulative: assistantText });
      }
      return;
    }

    if (eventName === "thinking") {
      const delta = typeof payload.text === "string" ? payload.text : "";
      if (delta) onProgress?.({ type: "thinking", delta });
      return;
    }

    if (eventName === "tool_call") {
      onProgress?.({
        type: "tool_call",
        name: String(payload.name || "tool"),
        status: String(payload.status || "running"),
        callId: typeof payload.callId === "string" ? payload.callId : undefined,
      });
      return;
    }

    if (eventName === "result") {
      const next = String(payload.status || "FINISHED") as CursorCloudRunStatus;
      status = next;
      if (typeof payload.text === "string") resultText = payload.text;
      if (typeof payload.durationMs === "number") durationMs = payload.durationMs;
      onProgress?.({ type: "status", status: next, agentId, runId, agentUrl });
      finished = true;
      return;
    }

    if (eventName === "error") {
      const message = String(payload.message || payload.code || "stream error");
      throw new Error(`Cursor Cloud Agent stream error: ${message}`);
    }

    // Ignore interaction_update and unknown events (assistant/text already covered).
  };

  try {
    while (!finished) {
      if (now() > deadline) {
        throw new Error(
          `Cursor Cloud Agent timed out after ${Math.round(timeoutMs / 1000)}s (status ${status}). ` +
            `Open ${agentUrl ?? "https://cursor.com/agents"} to inspect the run.`,
        );
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by a blank line.
      while (true) {
        const match = buffer.match(/\r?\n\r?\n/);
        if (!match || match.index === undefined) break;
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const parsed = parseSseBlock(block);
        if (parsed) handleEvent(parsed);
        if (finished) break;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  return { status, resultText, assistantText, durationMs };
}

async function pollRun(
  apiKey: string,
  agentId: string,
  runId: string,
  agentUrl: string | undefined,
  onProgress: ((p: CursorCloudProgress) => void) | undefined,
  deps: CursorCloudDeps,
  timeoutMs: number,
  pollMs: number,
  now: () => number,
  sleep: (ms: number) => Promise<void>,
  initial: CursorCloudRun,
): Promise<CursorCloudRun> {
  const deadline = now() + timeoutMs;
  let run = initial;
  onProgress?.({ type: "status", status: run.status, agentId, runId, agentUrl });
  while (!TERMINAL.has(run.status)) {
    if (now() > deadline) {
      throw new Error(
        `Cursor Cloud Agent timed out after ${Math.round(timeoutMs / 1000)}s (status ${run.status}). ` +
          `Open ${agentUrl ?? "https://cursor.com/agents"} to inspect the run.`,
      );
    }
    await sleep(pollMs);
    run = await getRun(apiKey, agentId, runId, deps);
    onProgress?.({ type: "status", status: run.status, agentId, runId, agentUrl });
  }
  return run;
}

export type RunCursorCloudAgentOpts = {
  apiKey: string;
  messages: Array<{ role: string; content: string }>;
  feature: string;
  /** Cursor model id from GET /v1/models; omit to use account default. */
  model?: string | null;
  /** Polling/stream timeout (ms). Default 180s. */
  timeoutMs?: number;
  /** Poll interval (ms) when SSE is unavailable. Default 2s. */
  pollMs?: number;
  /** Live status / text / tool updates (Cloud Agents SSE). */
  onProgress?: (event: CursorCloudProgress) => void;
};

/**
 * Launch a no-repo Cloud Agent, stream (or poll) until terminal, return assistant text, then archive.
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
  const agentUrl = created.agent.url;
  const modelLabel = opts.model?.trim() || "default";

  opts.onProgress?.({
    type: "status",
    status: created.run.status,
    agentId,
    runId,
    agentUrl,
  });

  try {
    let text = "";
    let status: CursorCloudRunStatus = created.run.status;
    let durationMs: number | null | undefined;
    let assistantChars = 0;

    const streamed = await streamRun(
      opts.apiKey,
      agentId,
      runId,
      agentUrl,
      opts.onProgress,
      deps,
      timeoutMs,
      now,
    ).catch(async (err) => {
      // Network / parse failures → try polling instead of failing hard mid-run.
      if (err instanceof Error && /timed out|stream error/i.test(err.message)) throw err;
      return null;
    });

    if (streamed) {
      status = streamed.status;
      durationMs = streamed.durationMs;
      assistantChars = streamed.assistantText.trim().length;
      text = (streamed.resultText || streamed.assistantText || "").trim();
      // If SSE ended without a clear final reply, refresh via GET.
      if (!text || !TERMINAL.has(status)) {
        const run = await getRun(opts.apiKey, agentId, runId, deps);
        status = run.status;
        durationMs = run.durationMs ?? durationMs;
        if (!text) text = (run.result ?? "").trim();
      }
    } else {
      const run = await pollRun(
        opts.apiKey,
        agentId,
        runId,
        agentUrl,
        opts.onProgress,
        deps,
        timeoutMs,
        pollMs,
        now,
        sleep,
        created.run as CursorCloudRun,
      );
      status = run.status;
      durationMs = run.durationMs;
      text = (run.result ?? "").trim();
    }

    if (status !== "FINISHED") {
      throw new Error(
        `Cursor Cloud Agent ended with ${status}` +
          (text ? `: ${text.slice(0, 200)}` : "") +
          (agentUrl ? ` — ${agentUrl}` : ""),
      );
    }
    if (!text) {
      throw new Error(
        formatEmptyResultError({
          agentId,
          runId,
          agentUrl,
          durationMs,
          assistantChars,
          status,
        }),
      );
    }
    return {
      text,
      model: `cursor-cloud:${modelLabel}`,
      agentId,
      runId,
      agentUrl,
    };
  } finally {
    await archiveAgent(opts.apiKey, agentId, deps);
  }
}
