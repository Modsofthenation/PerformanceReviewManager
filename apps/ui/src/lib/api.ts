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
