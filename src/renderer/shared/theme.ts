import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_FONT_PAIR_ID,
  ensureFontPairLoaded,
  getFontPair,
  isValidFontPairId,
  type FontPairId,
} from "./fontPairs";

export type ThemePreference = "light" | "dark";

const STORAGE_KEY = "droppilot:theme";
const ACCENT_STORAGE_KEY = "droppilot:accent";
const FONT_PAIR_STORAGE_KEY = "droppilot:fontPair";
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

// =============================================================================
// Durable UI prefs — persisted in the main-process settings.json (crash-safe).
// localStorage above is only a synchronous first-paint cache; settings.json is
// the source of truth that survives updates (file:// localStorage is not
// reliably persisted by Chromium across relaunches).
// =============================================================================

type DurableUiPrefs = {
  theme?: ThemePreference;
  accent: string | null;
  fontPair?: FontPairId;
  migrated: boolean;
};

let durablePrefsPromise: Promise<DurableUiPrefs> | null = null;

/** Reads the durable UI prefs from settings.json once (cached for the session). */
function loadDurableUiPrefs(): Promise<DurableUiPrefs> {
  if (durablePrefsPromise) return durablePrefsPromise;
  durablePrefsPromise = (async () => {
    try {
      const s = await window.electronAPI?.settings?.get?.();
      return {
        theme: s?.theme === "light" || s?.theme === "dark" ? s.theme : undefined,
        accent: typeof s?.accent === "string" && isValidHex(s.accent) ? s.accent : null,
        fontPair: isValidFontPairId(s?.fontPair) ? s.fontPair : undefined,
        migrated: s?.uiPrefsMigrated === true,
      };
    } catch {
      return { accent: null, migrated: false };
    }
  })();
  return durablePrefsPromise;
}

/** Persists UI prefs to the durable store (fire-and-forget; localStorage holds the cache). */
function persistUiPref(patch: {
  theme?: ThemePreference;
  accent?: string | null;
  fontPair?: FontPairId;
  uiPrefsMigrated?: boolean;
}) {
  try {
    void window.electronAPI?.settings?.save?.(patch);
  } catch {
    /* best effort — the localStorage cache still holds the value */
  }
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
  const mounted = useRef(false);

  useEffect(() => {
    applyTheme(theme);
    setStoredTheme(theme);
    // Skip the mount run — the reconcile effect below owns the initial durable
    // sync; only persist genuine user changes.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    persistUiPref({ theme });
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    void loadDurableUiPrefs().then((d) => {
      if (cancelled) return;
      if (d.migrated) {
        if (d.theme && d.theme !== theme) setTheme(d.theme);
      } else {
        persistUiPref({ theme, uiPrefsMigrated: true });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const mounted = useRef(false);

  useEffect(() => {
    applyAccent(accent);
    setStoredAccent(accent);
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    persistUiPref({ accent });
  }, [accent]);

  useEffect(() => {
    let cancelled = false;
    void loadDurableUiPrefs().then((d) => {
      if (cancelled) return;
      if (d.migrated) {
        if (d.accent !== accent) setAccent(d.accent);
      } else {
        persistUiPref({ accent, uiPrefsMigrated: true });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    accent,
    setAccent,
  };
}

// =============================================================================
// Font pair — overrides --font-sans + --font-mono with one of FONT_PAIRS
// =============================================================================

export function getStoredFontPair(): FontPairId {
  if (typeof window === "undefined") return DEFAULT_FONT_PAIR_ID;
  const stored = window.localStorage.getItem(FONT_PAIR_STORAGE_KEY);
  if (isValidFontPairId(stored)) return stored;
  return DEFAULT_FONT_PAIR_ID;
}

function setStoredFontPair(value: FontPairId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FONT_PAIR_STORAGE_KEY, value);
}

/**
 * Applies a font pair to `:root` via inline custom properties + lazy-loads
 * the Google Fonts stylesheet for the pair (no-op for the default + system
 * pairs which need no network).
 */
export function applyFontPair(id: FontPairId) {
  if (typeof document === "undefined") return;
  const pair = getFontPair(id);
  ensureFontPairLoaded(pair);
  const root = document.documentElement;
  root.style.setProperty("--font-sans", pair.sans);
  root.style.setProperty("--font-mono", pair.mono);
}

export function initFontPair() {
  applyFontPair(getStoredFontPair());
}

export function useFontPair() {
  const [fontPair, setFontPair] = useState<FontPairId>(() => getStoredFontPair());
  const mounted = useRef(false);

  useEffect(() => {
    applyFontPair(fontPair);
    setStoredFontPair(fontPair);
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    persistUiPref({ fontPair });
  }, [fontPair]);

  useEffect(() => {
    let cancelled = false;
    void loadDurableUiPrefs().then((d) => {
      if (cancelled) return;
      if (d.migrated) {
        if (d.fontPair && d.fontPair !== fontPair) setFontPair(d.fontPair);
      } else {
        persistUiPref({ fontPair, uiPrefsMigrated: true });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    fontPair,
    setFontPair,
  };
}
