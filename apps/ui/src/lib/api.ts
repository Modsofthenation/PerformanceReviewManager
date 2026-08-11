const TOKEN_KEY = "prm_token";

declare global {
  interface Window {
    __PRM_LAUNCH_TOKEN__?: string;
    /** Absolute API origin injected by the Tauri shell (e.g. http://127.0.0.1:8787). */
    __PRM_API_BASE_URL__?: string;
    /** Packaged desktop marker. */
    __PRM_DESKTOP__?: boolean;
    /** Path to desktop-api.log on packaged builds. */
    __PRM_DESKTOP_LOG__?: string;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Injected by the Tauri shell when PRM_LAUNCH_TOKEN is active. */
function launchToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.__PRM_LAUNCH_TOKEN__?.trim() || null;
}

/** Headers for authenticated API fetches outside `api()` (downloads, FormData). */
export function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const token = getToken();
  if (token) headers.set("x-prm-token", token);
  const launch = launchToken();
  if (launch) headers.set("x-prm-launch-token", launch);
  return headers;
}

/** Packaged desktop sets this; browser/Vite leaves it empty so `/api` stays relative (proxy). */
export function apiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.__PRM_API_BASE_URL__?.trim().replace(/\/$/, "") || "";
}

/** Resolve an API path for fetch (absolute in Tauri, relative under Vite). */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = apiBaseUrl();
  return base ? `${base}${normalized}` : normalized;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until the local API answers /api/health (desktop sidecar warmup). */
export async function waitForApi(opts?: { attempts?: number; delayMs?: number }): Promise<boolean> {
  const attempts = opts?.attempts ?? (apiBaseUrl() ? 40 : 1);
  const delayMs = opts?.delayMs ?? 250;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(apiUrl("/api/health"), { method: "GET" });
      if (res.ok) return true;
    } catch {
      /* still starting */
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  return false;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = authHeaders(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(apiUrl(path), { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || "Request failed");
  }
  return res.json() as Promise<T>;
}

export type ChatStreamHandlers = {
  onStatus?: (payload: {
    status?: string;
    detail?: string;
    agentId?: string;
    runId?: string;
    agentUrl?: string;
  }) => void;
  onDelta?: (payload: { text: string; cumulative: string }) => void;
  onTool?: (payload: { name: string; status: string; callId?: string }) => void;
  onThinking?: (payload: { text: string }) => void;
};

export type ChatStreamResult = {
  reply: string;
  model: string;
  scopeLabel?: string;
  generationId?: string;
  provider?: string;
};

/**
 * POST /api/ai/chat with SSE. Falls back to JSON if the server does not stream.
 */
export async function streamChat(
  body: unknown,
  handlers: ChatStreamHandlers = {},
): Promise<ChatStreamResult> {
  const headers = authHeaders({
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });
  const res = await fetch(apiUrl("/api/ai/chat"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || "Request failed");
  }

  if (!contentType.includes("text/event-stream") || !res.body) {
    const json = (await res.json()) as ChatStreamResult & { error?: string };
    if (json.error) throw new Error(json.error);
    return json;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state: { done: ChatStreamResult | null; error: string | null } = {
    done: null,
    error: null,
  };

  const handleBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let event = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
    } catch {
      return;
    }
    if (event === "status") {
      handlers.onStatus?.({
        status: typeof data.status === "string" ? data.status : undefined,
        detail: typeof data.detail === "string" ? data.detail : undefined,
        agentId: typeof data.agentId === "string" ? data.agentId : undefined,
        runId: typeof data.runId === "string" ? data.runId : undefined,
        agentUrl: typeof data.agentUrl === "string" ? data.agentUrl : undefined,
      });
    } else if (event === "delta") {
      handlers.onDelta?.({
        text: String(data.text ?? ""),
        cumulative: String(data.cumulative ?? data.text ?? ""),
      });
    } else if (event === "thinking") {
      handlers.onThinking?.({ text: String(data.text ?? "") });
    } else if (event === "tool") {
      handlers.onTool?.({
        name: String(data.name ?? "tool"),
        status: String(data.status ?? "running"),
        callId: typeof data.callId === "string" ? data.callId : undefined,
      });
    } else if (event === "done") {
      state.done = {
        reply: String(data.reply ?? ""),
        model: String(data.model ?? ""),
        scopeLabel: typeof data.scopeLabel === "string" ? data.scopeLabel : undefined,
        generationId: typeof data.generationId === "string" ? data.generationId : undefined,
        provider: typeof data.provider === "string" ? data.provider : undefined,
      };
    } else if (event === "error") {
      state.error = String(data.error ?? "Chat failed");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const match = buffer.match(/\r?\n\r?\n/);
      if (!match || match.index === undefined) break;
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      handleBlock(block);
    }
  }
  if (buffer.trim()) handleBlock(buffer);

  if (state.error) throw new Error(state.error);
  if (!state.done?.reply) throw new Error("Chat stream ended without a reply");
  return state.done;
}
