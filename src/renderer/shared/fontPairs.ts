/**
 * Font pair presets for Settings → Appearance → Typography.
 *
 * Each pair defines a sans family and a mono family + the CSS value to assign
 * to `--font-sans` / `--font-mono` (full stack with fallbacks).
 *
 * The default pair (id = "pro-console") matches the CSS defaults in app.css —
 * IBM Plex Sans + IBM Plex Mono are loaded by the top-of-file @import. The
 * other 3 pairs lazy-load Google Fonts on demand via `ensureFontPairLoaded`,
 * so users who stay on the default pay zero extra bytes.
 *
 * System pair (id = "system") needs no network — it falls back to the OS UI
 * fonts directly.
 */

export type FontPairId = "pro-console" | "modern" | "geist" | "system";

export type FontPair = {
  id: FontPairId;
  /** i18n key path for the display name in the picker. */
  nameKey: string;
  sans: string;
  mono: string;
  /** Google Fonts CSS URL to inject when this pair is picked. Empty when no network needed. */
  googleFontsHref?: string;
};

export const FONT_PAIRS: FontPair[] = [
  {
    id: "pro-console",
    nameKey: "settings.row.fontPair.preset.proConsole",
    sans: `"IBM Plex Sans", "Segoe UI", system-ui, sans-serif`,
    mono: `"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace`,
    // Already loaded by app.css top-level @import; no lazy load needed.
  },
  {
    id: "modern",
    nameKey: "settings.row.fontPair.preset.modern",
    sans: `"Inter", "Segoe UI", system-ui, sans-serif`,
    mono: `"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace`,
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
  },
  {
    id: "geist",
    nameKey: "settings.row.fontPair.preset.geist",
    sans: `"Geist", "Segoe UI", system-ui, sans-serif`,
    mono: `"Geist Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace`,
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap",
  },
  {
    id: "system",
    nameKey: "settings.row.fontPair.preset.system",
    sans: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
    mono: `ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace`,
    // No network — system fonts only.
  },
];

export const DEFAULT_FONT_PAIR_ID: FontPairId = "pro-console";

export function getFontPair(id: FontPairId | null | undefined): FontPair {
  if (!id) return FONT_PAIRS[0];
  return FONT_PAIRS.find((p) => p.id === id) ?? FONT_PAIRS[0];
}

export function isValidFontPairId(value: unknown): value is FontPairId {
  return value === "pro-console" || value === "modern" || value === "geist" || value === "system";
}

/**
 * Lazily injects the Google Fonts `<link>` for a pair the first time it's
 * picked. No-op for pairs without a `googleFontsHref` (default + system).
 * Idempotent — checks for an existing link with the same href before adding.
 */
export function ensureFontPairLoaded(pair: FontPair) {
  if (typeof document === "undefined") return;
  if (!pair.googleFontsHref) return;
  const existing = document.head.querySelector<HTMLLinkElement>(
    `link[data-droppilot-font-pair="${pair.id}"]`,
  );
  if (existing) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = pair.googleFontsHref;
  link.dataset.droppilotFontPair = pair.id;
  document.head.appendChild(link);
}
