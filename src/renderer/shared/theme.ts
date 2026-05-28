import { useEffect, useState } from "react";

export type ThemePreference = "light" | "dark";

const STORAGE_KEY = "droppilot:theme";
const ACCENT_STORAGE_KEY = "droppilot:accent";
const DARK_CLASS = "dark";

/**
 * Default accent values matching the CSS token defaults in app.css:
 * - dark mode: #a78bfa (soft violet 400)
 * - light mode: #7c5fe6 (violet 500)
 *
 * Stored accent overrides apply on TOP of these defaults — set to null to
 * clear and fall back to the CSS values.
 */
export const ACCENT_DEFAULTS = {
  dark: "#a78bfa",
  light: "#7c5fe6",
} as const;

/** Hex regex for user-input validation: #rgb / #rrggbb (no alpha — accent is a solid color). */
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}

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

  return {
    theme,
    setTheme,
  };
}

// =============================================================================
// Accent — user-overrideable --dp-accent + derived hover/soft/glow
// =============================================================================

export function getStoredAccent(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
  if (stored && isValidHex(stored)) return stored;
  return null;
}

function setStoredAccent(value: string | null) {
  if (typeof window === "undefined") return;
  if (value === null) {
    window.localStorage.removeItem(ACCENT_STORAGE_KEY);
  } else if (isValidHex(value)) {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, value);
  }
}

/**
 * Applies an accent color override to `:root` via inline custom properties.
 *
 * Derives the three companion tokens from the base color via `color-mix()`:
 * - `--dp-accent-hover` = base mixed 15% with white (slightly lighter for hover)
 * - `--dp-accent-soft`  = base at 12% alpha (used for tint backgrounds)
 * - `--dp-accent-glow`  = base at 40% alpha (used for box-shadow glows)
 *
 * Passing `null` removes the inline overrides so the CSS-default tokens (from
 * `:root` / `:root:not(.dark)` blocks in app.css) take effect again.
 */
export function applyAccent(value: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (value === null || !isValidHex(value)) {
    root.style.removeProperty("--dp-accent");
    root.style.removeProperty("--dp-accent-hover");
    root.style.removeProperty("--dp-accent-soft");
    root.style.removeProperty("--dp-accent-glow");
    return;
  }
  root.style.setProperty("--dp-accent", value);
  root.style.setProperty("--dp-accent-hover", `color-mix(in srgb, ${value} 85%, white 15%)`);
  root.style.setProperty("--dp-accent-soft", `color-mix(in srgb, ${value} 12%, transparent)`);
  root.style.setProperty("--dp-accent-glow", `color-mix(in srgb, ${value} 40%, transparent)`);
}

export function initAccent() {
  const initial = getStoredAccent();
  applyAccent(initial);
}

export function useAccent() {
  // null means "no override" — fall back to the CSS token defaults.
  const [accent, setAccent] = useState<string | null>(() => getStoredAccent());

  useEffect(() => {
    applyAccent(accent);
    setStoredAccent(accent);
  }, [accent]);

  return {
    accent,
    setAccent,
  };
}
