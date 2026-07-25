import { useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  isTheme,
  setTheme as persistTheme,
  THEME_EVENT,
  type Theme,
} from "../lib/theme";

/** Theme preference (defaults dark). Persisted in localStorage and synced across mounts. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    function onThemeChange(event: Event) {
      const next = (event as CustomEvent<unknown>).detail;
      if (isTheme(next)) setThemeState(next);
    }
    function onStorage(event: StorageEvent) {
      if (event.key !== "prm_theme") return;
      if (isTheme(event.newValue)) setThemeState(event.newValue);
      else if (event.newValue == null) setThemeState("dark");
    }
    window.addEventListener(THEME_EVENT, onThemeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, onThemeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function setTheme(next: Theme) {
    persistTheme(next);
    setThemeState(next);
  }

  function toggle() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return { theme, setTheme, toggle };
}
