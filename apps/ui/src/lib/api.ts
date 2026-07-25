const TOKEN_KEY = "prm_token";

declare global {
  interface Window {
    __PRM_LAUNCH_TOKEN__?: string;
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

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("x-prm-token", token);
  const launch = launchToken();
  if (launch) headers.set("x-prm-launch-token", launch);
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || "Request failed");
  }
  return res.json() as Promise<T>;
}
