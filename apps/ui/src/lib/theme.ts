export type Theme = "dark" | "light";

export const THEME_KEY = "prm_theme";
export const THEME_EVENT = "prm-theme-change";
export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

export function getStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (isTheme(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
  return theme;
}

export function toggleTheme(current: Theme): Theme {
  return setTheme(current === "dark" ? "light" : "dark");
}
