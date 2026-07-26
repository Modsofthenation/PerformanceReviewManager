import { useEffect, useState } from "react";
import {
  ACCENT_EVENT,
  ACCENT_KEY,
  applyTheme,
  getStoredAccent,
  getStoredColorMode,
  isAccent,
  isColorMode,
  resolveTheme,
  setAccent as persistAccent,
  setColorMode as persistColorMode,
  THEME_EVENT,
  THEME_KEY,
  type Accent,
  type ColorMode,
  type ResolvedTheme,
} from "../lib/theme";

/** Color mode + accent. Persisted in localStorage; system mode follows OS preference. */
export function useTheme() {
  const [colorMode, setColorModeState] = useState<ColorMode>(() => getStoredColorMode());
  const [accent, setAccentState] = useState<Accent>(() => getStoredAccent());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(getStoredColorMode()));

  useEffect(() => {
    applyTheme(colorMode, accent);
    setResolved(resolveTheme(colorMode));
  }, [colorMode, accent]);

  useEffect(() => {
    function syncResolved() {
      setResolved(resolveTheme(getStoredColorMode()));
      applyTheme(getStoredColorMode(), getStoredAccent());
    }
    function onThemeChange(event: Event) {
      const next = (event as CustomEvent<unknown>).detail;
      if (isColorMode(next)) setColorModeState(next);
    }
    function onAccentChange(event: Event) {
      const next = (event as CustomEvent<unknown>).detail;
      if (isAccent(next)) setAccentState(next);
    }
    function onStorage(event: StorageEvent) {
      if (event.key === THEME_KEY) {
        if (isColorMode(event.newValue)) setColorModeState(event.newValue);
        else if (event.newValue == null) setColorModeState("system");
      }
      if (event.key === ACCENT_KEY) {
        if (isAccent(event.newValue)) setAccentState(event.newValue);
        else if (event.newValue == null) setAccentState("teal");
      }
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", syncResolved);
    window.addEventListener(THEME_EVENT, onThemeChange);
    window.addEventListener(ACCENT_EVENT, onAccentChange);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", syncResolved);
      window.removeEventListener(THEME_EVENT, onThemeChange);
      window.removeEventListener(ACCENT_EVENT, onAccentChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function setColorMode(next: ColorMode) {
    persistColorMode(next);
    setColorModeState(next);
  }

  function setAccent(next: Accent) {
    persistAccent(next);
    setAccentState(next);
  }

  function setTheme(next: ColorMode) {
    setColorMode(next);
  }

  function toggle() {
    const next: ColorMode = resolved === "dark" ? "light" : "dark";
    setColorMode(next);
  }

  return {
    theme: colorMode,
    colorMode,
    accent,
    resolved,
    setTheme,
    setColorMode,
    setAccent,
    toggle,
  };
}
