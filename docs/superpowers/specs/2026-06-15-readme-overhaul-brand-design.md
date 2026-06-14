# README overhaul + brand assets — design

**Date:** 2026-06-15
**Branch:** `docs/readme-overhaul`
**Status:** approved (brainstorm), pending implementation plan

## Goal

Give DropPilot a "stable" logo and a fresher, cooler-looking README. "Stable"
means resolution-independent: one SVG source the mark is drawn from, so it stays
crisp from a 16px tray icon to a 1024px app icon to the README header, and stays
visually consistent everywhere. The README gets a full hero, a download CTA, and
a feature grid, with the copy tightened.

App-icon (`icon.png`) and tray-icon regeneration are **explicitly out of scope**
for this pass — handled later as its own step. This pass produces the vector
sources so that follow-up is a pure raster step.

## The mark

A water **droplet** (the "Drop") with a white **navigation arrow** inside it (the
"Pilot" / heading). Filled execution — the most robust at tiny sizes and on any
background, including a transparent tray.

Canonical geometry (24×24 viewBox), reused verbatim everywhere:

```
droplet:  M12 2 C12 2 5 9 5 14 a7 7 0 1 0 14 0 C19 9 12 2 12 2 Z
arrow:    M12 9 L15.5 18.5 L12 16 L8.5 18.5 Z
```

Colors (from the app's `--dp-*` tokens):

| Use          | Dark                           | Light                           |
| ------------ | ------------------------------ | ------------------------------- |
| Droplet fill | `#a78bfa` (`--dp-accent` dark) | `#7c5fe6` (`--dp-accent` light) |
| Arrow fill   | `#ffffff`                      | `#ffffff`                       |

The arrow is a solid white fill on top of the droplet in both themes (white reads
on both violets). No gradients, no filters — flat fills only, so it rasterizes
cleanly later.

## Wordmark

"Drop" + "Pilot" as a two-tone wordmark:

- "Drop" → `#e6edf3` (dark) / `#1a1c1f` (light)
- "Pilot" → `#a78bfa` (dark) / `#7c5fe6` (light)
- Weight 500, slight negative letter-spacing (~-0.5px). Font: the SVG bakes in a
  generic sans (`font-family` system stack) since GitHub won't load a webfont
  into an `<img>`-referenced SVG.

## New asset files

- `icons/logo.svg` — the mark only (droplet + arrow), dark-theme colors, square
  viewBox. Single source of truth; the future app-icon/tray raster derives from
  this.
- `docs/brand/banner-dark.svg` and `docs/brand/banner-light.svg` — the hero
  lockup: mark above the "DropPilot" wordmark, centered (matches the approved
  mockup). One file per theme. `alt="DropPilot"`.
- `docs/brand/feat-*.svg` — eight monoline feature icons (24×24, stroke
  `#a78bfa`, `stroke-width` 2, round caps, no fill — a mid-tone violet line reads
  on both GitHub themes). One file per feature (see grid below). Tabler-outline
  shapes are the visual reference.

## README structure

Centered hero (HTML `<div align="center">`, the only HTML GitHub reliably
renders):

1. **Banner** via `<picture>` so GitHub swaps dark/light automatically:
   ```html
   <picture>
     <source media="(prefers-color-scheme: dark)" srcset="docs/brand/banner-dark.svg" />
     <img src="docs/brand/banner-light.svg" width="360" alt="DropPilot" />
   </picture>
   ```
2. **Tagline** (markdown text, stays selectable/SEO): "Automate Twitch Drops —
   quietly in the background, transparent about what it's doing."
3. **Badges** — keep the existing shields (build, latest release, platforms,
   license).
4. **Download CTA** — a shields `for-the-badge` styled link to the latest
   release, e.g. `https://img.shields.io/badge/⬇_Download_for_Windows-7c5fe6?style=for-the-badge` linking to `/releases/latest`. Looks like a button, no CSS needed.
5. **Screenshot** — the existing `docs/screenshots/overview.png`.

Then the body sections.

### Features — table + mini-icons

A 2-column markdown table; each cell = `<img ... width="20">` mini-icon + **bold
title** + one line. Markdown tables and per-cell `<img>` both render on GitHub;
the icons carry their own styling internally (so no stripped CSS). Eight
features, 4 rows × 2:

| #   | Title               | One-liner                                                        | Icon ref      |
| --- | ------------------- | ---------------------------------------------------------------- | ------------- |
| 1   | Live inventory      | Every drop's progress, claim status and time left, in real time. | list-check    |
| 2   | Priority list       | Rank your games; it works the highest one it can progress now.   | arrows-sort   |
| 3   | Hands-off watching  | Picks a stream, switches on offline, recovers on stall.          | player-play   |
| 4   | Auto-claim          | Claims finished drops and keeps a record of everything.          | circle-check  |
| 5   | Desktop alerts      | New drops, auto-claims, switches, drops ending, errors.          | bell          |
| 6   | Discord / webhook   | The same alerts in Discord or any compatible webhook.            | brand-discord |
| 7   | Browser-based login | Sign in on Twitch's own page; credentials never stored.          | browser       |
| 8   | Demo mode           | Explore the whole UI with sample data, no account needed.        | flask         |

"Stays transparent", "Debug tools", and Windows auto-update remain as prose /
their existing sections (transparency is already carried by the tagline +
intro). Warmup mode stays gone.

### Remaining sections

Keep the current set (Quick start, How it works, Releases & updates,
Configuration & data, Debug tools, Troubleshooting, Tech stack,
Acknowledgements, License). Light copy pass only: tighten wording, kill
redundancy, verify facts (Electron 42 / React 19 / Vite 7 are already correct).
The "Contents" TOC is updated if anchors change.

## GitHub rendering constraints (the load-bearing decisions)

- GitHub **strips `style` attributes, `class`, and `<style>`** in markdown — the
  card aesthetic from the mockup therefore comes from **committed SVGs + a
  markdown table**, never inline CSS.
- `<picture>` with `prefers-color-scheme` **is** supported and gives the dark/light
  banner swap.
- SVG referenced via `<img src>` renders (served through GitHub's camo proxy);
  inline `<svg>` in markdown is stripped — so all SVG lives in committed files.
- Mini-icons must be single-color mid-tone (violet) so one file works on both
  GitHub themes without a `<picture>` per icon.

## Out of scope

- Regenerating `icon.png` and the tray icons from the new mark (separate raster
  step, later).
- Translating the README (stays English; UI chrome i18n is unaffected).
- Any app/source-code change — this pass touches docs + brand assets only.

## Verification

- `npm run format:check` passes (Prettier gates CI; run `format` on any new
  files — note SVG/MD formatting).
- README renders correctly on GitHub: banner swaps with theme, badges and the
  download button resolve, screenshot loads, the feature table shows icons, all
  internal links/anchors resolve.
- Eyeball the banner + mark at small sizes (the scale test already validated the
  geometry).
- No broken relative paths to the new `docs/brand/*` assets.
