import { useEffect, useMemo, useState } from "react";

export type ThemePreference = "light" | "dark";

const STORAGE_KEY = "droppilot:theme";
const DARK_CLASS = "dark";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark";
}

export function getSystemTheme(): ThemePreference {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isThemePreference(stored)) return stored;
  // Migrate legacy "system"/missing values to an explicit theme once.
  return getSystemTheme();
}

function setStoredTheme(value: ThemePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value);
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle(DARK_CLASS, preference === "dark");
  root.dataset.theme = preference;
}

export function initTheme() {
  const initialTheme = getStoredTheme();
  applyTheme(initialTheme);
  setStoredTheme(initialTheme);
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    setStoredTheme(theme);
  }, [theme]);

  const resolvedTheme = useMemo(() => theme, [theme]);

  return {
    theme,
    setTheme,
    resolvedTheme,
  };
}
