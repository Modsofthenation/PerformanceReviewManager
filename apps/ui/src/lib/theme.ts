export type ColorMode = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";
export type Accent = "teal" | "ocean" | "forest" | "slate";

/** @deprecated Prefer ColorMode; kept for callers that only mean resolved dark/light. */
export type Theme = ResolvedTheme;

export const THEME_KEY = "prm_theme";
export const ACCENT_KEY = "prm_accent";
export const THEME_EVENT = "prm-theme-change";
export const ACCENT_EVENT = "prm-accent-change";

export const DEFAULT_COLOR_MODE: ColorMode = "system";
export const DEFAULT_ACCENT: Accent = "teal";
export const DEFAULT_THEME: ResolvedTheme = "dark";

export const ACCENTS: Array<{ id: Accent; label: string }> = [
  { id: "teal", label: "Teal" },
  { id: "ocean", label: "Ocean" },
  { id: "forest", label: "Forest" },
  { id: "slate", label: "Slate" },
];

export function isColorMode(value: unknown): value is ColorMode {
  return value === "dark" || value === "light" || value === "system";
}

/** Accept legacy dark|light or new system. */
export function isTheme(value: unknown): value is ColorMode {
  return isColorMode(value);
}

export function isAccent(value: unknown): value is Accent {
  return value === "teal" || value === "ocean" || value === "forest" || value === "slate";
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(mode: ColorMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function getStoredColorMode(): ColorMode {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (isColorMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_COLOR_MODE;
}

/** @deprecated use getStoredColorMode */
export function getStoredTheme(): ColorMode {
  return getStoredColorMode();
}

export function getStoredAccent(): Accent {
  try {
    const raw = localStorage.getItem(ACCENT_KEY);
    if (isAccent(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCENT;
}

export function applyTheme(mode: ColorMode, accent: Accent = getStoredAccent()) {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-color-mode", mode);
  document.documentElement.setAttribute("data-accent", accent);
  document.documentElement.style.colorScheme = resolved;
}

export function setColorMode(mode: ColorMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* ignore */
  }
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: mode }));
  return mode;
}

/** @deprecated use setColorMode */
export function setTheme(theme: ColorMode) {
  return setColorMode(theme);
}

export function setAccent(accent: Accent) {
  try {
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    /* ignore */
  }
  applyTheme(getStoredColorMode(), accent);
  window.dispatchEvent(new CustomEvent(ACCENT_EVENT, { detail: accent }));
  return accent;
}

/** Flip resolved appearance and persist an explicit dark/light preference. */
export function toggleTheme(currentMode: ColorMode): ColorMode {
  const next: ResolvedTheme = resolveTheme(currentMode) === "dark" ? "light" : "dark";
  return setColorMode(next);
}
