# README overhaul + brand assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a resolution-independent SVG logo (droplet + heading) and a fresher, cooler README with a full hero, download CTA, and an icon-backed feature grid.

**Architecture:** Pure docs + brand-assets change. All visual richness lives in committed SVG files (one banner per theme, eight feature icons, one mark) because GitHub strips inline CSS/`style`/`class` from markdown. The README references them via `<picture>`, `<img>`, shields badges, and a markdown/HTML table. No application source code changes.

**Tech Stack:** Hand-authored SVG, GitHub-flavoured Markdown with the safe HTML subset (`<div align>`, `<picture>`, `<table>`, `<img>`), shields.io.

---

## Why no unit tests here

The project's testing convention (`CLAUDE.md`) covers pure functions only — there is nothing executable in this change. `format:check` globs only `src/**/*.{ts,tsx,css}` and `scripts/release-notes/**/*.mjs`, so it does **not** touch `README.md`, `docs/**`, or `icons/**` — no Prettier gate applies to these files. Verification per task is therefore: (a) the SVG/HTML is well-formed XML, and (b) it renders as intended. Well-formedness check (Windows PowerShell, zero deps):

```powershell
[xml](Get-Content -Raw <path>); 'OK'
```

It prints `OK` on success and throws on malformed markup.

## File structure

Create:

- `icons/logo.svg` — the mark only (droplet + white arrow). Single source of truth for future app-icon/tray raster.
- `docs/brand/banner-dark.svg`, `docs/brand/banner-light.svg` — hero lockup (mark above wordmark), one per theme.
- `docs/brand/feat-inventory.svg`, `feat-priority.svg`, `feat-watching.svg`, `feat-autoclaim.svg`, `feat-alerts.svg`, `feat-discord.svg`, `feat-login.svg`, `feat-demo.svg` — eight monoline feature icons.

Modify:

- `README.md` — new hero, download CTA, feature table, light copy pass.

Leave untouched: `icons/icon.png` and `icons/tray/` (app-icon/tray regeneration is a later, separate step).

---

### Task 1: The mark — `icons/logo.svg`

**Files:**
- Create: `icons/logo.svg`

- [ ] **Step 1: Create the file**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256" role="img" aria-label="DropPilot">
  <path d="M12 2C12 2 5 9 5 14a7 7 0 1 0 14 0C19 9 12 2 12 2Z" fill="#a78bfa" />
  <path d="M12 9L15.5 18.5L12 16L8.5 18.5Z" fill="#ffffff" />
</svg>
```

- [ ] **Step 2: Verify it is well-formed**

Run: `[xml](Get-Content -Raw icons/logo.svg); 'OK'`
Expected: prints `OK`, no exception.

- [ ] **Step 3: Eyeball it**

Open `icons/logo.svg` in a browser (or VS Code SVG preview). Expected: a violet teardrop with a crisp white upward navigation arrow centered in the bulb. No clipping, no stray fills.

- [ ] **Step 4: Commit**

```bash
git add icons/logo.svg
git commit -m "feat(brand): add vector logo mark (icons/logo.svg)"
```

---

### Task 2: Hero banners — `docs/brand/banner-{dark,light}.svg`

**Files:**
- Create: `docs/brand/banner-dark.svg`
- Create: `docs/brand/banner-light.svg`

- [ ] **Step 1: Create `docs/brand/banner-dark.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 140" width="320" height="140" role="img" aria-label="DropPilot">
  <g transform="translate(126.4,14) scale(2.8)">
    <path d="M12 2C12 2 5 9 5 14a7 7 0 1 0 14 0C19 9 12 2 12 2Z" fill="#a78bfa" />
    <path d="M12 9L15.5 18.5L12 16L8.5 18.5Z" fill="#ffffff" />
  </g>
  <text x="160" y="120" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" font-size="40" font-weight="700" letter-spacing="-1">
    <tspan fill="#e6edf3">Drop</tspan><tspan fill="#a78bfa">Pilot</tspan>
  </text>
</svg>
```

- [ ] **Step 2: Create `docs/brand/banner-light.svg`** (same geometry, light-theme colors)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 140" width="320" height="140" role="img" aria-label="DropPilot">
  <g transform="translate(126.4,14) scale(2.8)">
    <path d="M12 2C12 2 5 9 5 14a7 7 0 1 0 14 0C19 9 12 2 12 2Z" fill="#7c5fe6" />
    <path d="M12 9L15.5 18.5L12 16L8.5 18.5Z" fill="#ffffff" />
  </g>
  <text x="160" y="120" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" font-size="40" font-weight="700" letter-spacing="-1">
    <tspan fill="#1a1c1f">Drop</tspan><tspan fill="#7c5fe6">Pilot</tspan>
  </text>
</svg>
```

- [ ] **Step 3: Verify both are well-formed**

Run:
```powershell
[xml](Get-Content -Raw docs/brand/banner-dark.svg); [xml](Get-Content -Raw docs/brand/banner-light.svg); 'OK'
```
Expected: prints `OK`.

- [ ] **Step 4: Eyeball both**

Open each in a browser. Expected: mark centered on top, "Drop" + "Pilot" wordmark centered beneath (Pilot in violet), wordmark not clipped by the 320-wide viewBox. The light banner should be legible on a white page, the dark on a near-black page.

- [ ] **Step 5: Commit**

```bash
git add docs/brand/banner-dark.svg docs/brand/banner-light.svg
git commit -m "feat(brand): add dark/light README hero banners"
```

---

### Task 3: Feature icons — `docs/brand/feat-*.svg`

All eight share root attributes `fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` so a single mid-tone violet line reads on both GitHub themes. Discord eye-dots override with a solid fill.

**Files:**
- Create: `docs/brand/feat-inventory.svg`, `feat-priority.svg`, `feat-watching.svg`, `feat-autoclaim.svg`, `feat-alerts.svg`, `feat-discord.svg`, `feat-login.svg`, `feat-demo.svg`

- [ ] **Step 1: `feat-inventory.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Live inventory">
  <path d="M4 6h11" />
  <path d="M4 12h11" />
  <path d="M4 18h7" />
  <path d="M15 17l2 2 4-4" />
</svg>
```

- [ ] **Step 2: `feat-priority.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Priority list">
  <path d="M5 7l3-3 3 3" />
  <path d="M8 4v16" />
  <path d="M19 17l-3 3-3-3" />
  <path d="M16 20V4" />
</svg>
```

- [ ] **Step 3: `feat-watching.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Hands-off watching">
  <path d="M7 5v14l11-7z" />
</svg>
```

- [ ] **Step 4: `feat-autoclaim.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Auto-claim">
  <circle cx="12" cy="12" r="9" />
  <path d="M8.5 12.5l2.5 2.5 4.5-5" />
</svg>
```

- [ ] **Step 5: `feat-alerts.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Desktop alerts">
  <path d="M10 5a2 2 0 0 1 4 0 7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6" />
  <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
</svg>
```

- [ ] **Step 6: `feat-discord.svg`** (eye-dots get a solid violet fill)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Discord / webhook">
  <circle cx="9" cy="12" r="1" fill="#a78bfa" stroke="none" />
  <circle cx="15" cy="12" r="1" fill="#a78bfa" stroke="none" />
  <path d="M7.5 7.5c3.5-1 5.5-1 9 0" />
  <path d="M7 16.5c3.5 1 6.5 1 10 0" />
  <path d="M15.5 17c0 1 1.5 3 2 3 1.5 0 2.8-1.7 3.5-3 .7-1.7 .5-5.8-1.5-11.5-1.5-1-3-1.3-4.5-1.5l-1 2.5" />
  <path d="M8.5 17c0 1-1.4 3-1.8 3-1.4 0-2.7-1.7-3.3-3-.6-1.7-.5-5.8 1.4-11.5 1.4-1 2.8-1.3 4.2-1.5l1 2.5" />
</svg>
```

- [ ] **Step 7: `feat-login.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Browser-based login">
  <rect x="3" y="5" width="18" height="14" rx="2" />
  <path d="M3 9h18" />
</svg>
```

- [ ] **Step 8: `feat-demo.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Demo mode">
  <path d="M8.5 3h7" />
  <path d="M9 3v6l-4.5 8a1.8 1.8 0 0 0 1.6 2.7h11.8a1.8 1.8 0 0 0 1.6-2.7l-4.5-8v-6" />
  <path d="M6.5 15h11" />
</svg>
```

- [ ] **Step 9: Verify all eight are well-formed**

Run:
```powershell
Get-ChildItem docs/brand/feat-*.svg | ForEach-Object { [xml](Get-Content -Raw $_.FullName) | Out-Null; "$($_.Name) OK" }
```
Expected: one `<name> OK` line per file, no exception.

- [ ] **Step 10: Eyeball the set**

Open the eight files (or drag the `docs/brand` folder into a browser). Expected: each is a recognizable violet line icon at 24px — list+check, two sort arrows, play triangle, circled check, bell, Discord mark with two solid eyes, browser window, flask. Each must still read at 20px (the README render size).

- [ ] **Step 11: Commit**

```bash
git add docs/brand/feat-inventory.svg docs/brand/feat-priority.svg docs/brand/feat-watching.svg docs/brand/feat-autoclaim.svg docs/brand/feat-alerts.svg docs/brand/feat-discord.svg docs/brand/feat-login.svg docs/brand/feat-demo.svg
git commit -m "feat(brand): add eight monoline feature icons"
```

---

### Task 4: README — hero, download CTA, feature grid, copy pass

**Files:**
- Modify: `README.md` (replace the whole file with the content below)

- [ ] **Step 1: Replace `README.md` with this exact content**

````markdown
<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/banner-dark.svg" />
  <img src="docs/brand/banner-light.svg" width="360" alt="DropPilot" />
</picture>

<p><strong>Automate Twitch Drops — quietly in the background, transparent about what it's doing.</strong></p>

<p>
<a href="https://github.com/rxm96/droppilot/actions/workflows/build.yml"><img src="https://github.com/rxm96/droppilot/actions/workflows/build.yml/badge.svg" alt="Build" /></a>
<a href="https://github.com/rxm96/droppilot/releases/latest"><img src="https://img.shields.io/github/v/release/rxm96/droppilot?sort=semver" alt="Latest release" /></a>
<img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS-blue" alt="Platforms" />
<a href="LICENSE"><img src="https://img.shields.io/github/license/rxm96/droppilot" alt="License: MIT" /></a>
</p>

<p>
<a href="https://github.com/rxm96/droppilot/releases/latest"><img src="https://img.shields.io/badge/%E2%AC%87%20Download%20for%20Windows-7c5fe6?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows" /></a>
</p>

</div>

---

DropPilot is a desktop app that automates Twitch Drops. It tracks your drop
inventory, picks and watches an eligible stream, switches when that stream goes
down, and (optionally) claims drops for you — all in the background, while
staying transparent about what it's doing.

[![Overview](docs/screenshots/overview.png)](docs/screenshots/overview.png)

## Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Releases & updates](#releases--updates)
- [Configuration & data](#configuration--data)
- [Debug tools](#debug-tools)
- [Troubleshooting](#troubleshooting)
- [Tech stack](#tech-stack)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Features

<table>
<tr>
<td width="50%"><img src="docs/brand/feat-inventory.svg" width="20" /> <strong>Live inventory</strong><br />Every drop's progress, claim status and time left, in real time.</td>
<td width="50%"><img src="docs/brand/feat-priority.svg" width="20" /> <strong>Priority list</strong><br />Rank your games; DropPilot works the highest one it can progress right now.</td>
</tr>
<tr>
<td><img src="docs/brand/feat-watching.svg" width="20" /> <strong>Hands-off watching</strong><br />Picks an eligible stream, switches when one goes offline, and recovers when progress stalls.</td>
<td><img src="docs/brand/feat-autoclaim.svg" width="20" /> <strong>Auto-claim</strong><br />Optionally claims finished drops for you and keeps a record of everything it's done.</td>
</tr>
<tr>
<td><img src="docs/brand/feat-alerts.svg" width="20" /> <strong>Desktop alerts</strong><br />New drops, auto-claims, stream switches, drops about to end, and watch errors.</td>
<td><img src="docs/brand/feat-discord.svg" width="20" /> <strong>Discord / webhook</strong><br />The same alerts in Discord (or any compatible webhook), with a one-click test send.</td>
</tr>
<tr>
<td><img src="docs/brand/feat-login.svg" width="20" /> <strong>Browser-based login</strong><br />Sign in through Twitch's own page; DropPilot never stores your credentials.</td>
<td><img src="docs/brand/feat-demo.svg" width="20" /> <strong>Demo mode</strong><br />Explore the whole interface with sample data — no Twitch account needed.</td>
</tr>
</table>

DropPilot also stays out of your way while it works: a live status readout
(scanning, watching, recovering…), claim-retry countdowns, and a one-click prompt
to sign back in when your Twitch session expires. A **Debug** tab (off by
default) adds live logs and a state snapshot for when you need to dig in.

## Screenshots

> Dark theme with demo data. (Overview is shown above.)

| Stats | Inventory | Control |
| --- | --- | --- |
| [![Stats](docs/screenshots/stats.png)](docs/screenshots/stats.png) | [![Inventory](docs/screenshots/inventory.png)](docs/screenshots/inventory.png) | [![Control](docs/screenshots/control.png)](docs/screenshots/control.png) |

## Quick start

```bash
npm install
npm run dev      # launches the app (Vite + Electron, hot reload)
```

The most common scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run the app in development (hot reload) |
| `npm run build` | Build the renderer (`dist/`) + main & preload (`dist-electron/`) |
| `npm test` | Run the test suite (Vitest); `npm run test:watch` to watch |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (`format:check` to verify) |

For local-dev details, testing conventions, commit style, and the release process,
see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## How it works

DropPilot is a standard three-layer Electron app:

- **`src/main`** — Electron main process: app lifecycle, the IPC handlers, JSON
  persistence in the user-data directory, and the entire Twitch integration
  (`src/main/twitch`: GQL client, high-level service, live PubSub events, channel
  tracking, watch-minute pings). **All network calls happen here**, never in the
  renderer.
- **`src/preload`** — the context-bridge that exposes `window.electronAPI`.
- **`src/renderer`** — the React UI. `shared/hooks/app/useAppModel.ts` is the
  central hook that composes auth, inventory, channels, watch ping, priority, and
  stats into the app state the views render.

The trickiest subsystem is the **watch engine** (auto-select / auto-switch / stall
recovery / target suppression). It's documented in
[`docs/watch-engine.md`](docs/watch-engine.md), with an end-to-end sequence diagram
in [`docs/watch-flow.puml`](docs/watch-flow.puml).

## Releases & updates

Releases are published to GitHub Releases (Windows `.exe` + a macOS `.dmg`) and
built by CI when a `v*` tag is pushed. The app auto-updates on Windows and offers
two channels — **stable** and **preview** — selectable in Settings → Updates, which
also shows the in-app release history. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for
how to cut a release.

## Configuration & data

Settings and stats are stored as JSON in the Electron user-data directory
(`settings.json`, `stats.json`) and managed through the in-app Settings view.

## Debug tools

The Debug tab is **off by default** to keep background work minimal. Enable it in
Settings → **Debug tools**. Debug logs are only collected while it's on; perf and
CPU snapshots appear in the Debug snapshot.

## Troubleshooting

- **"Not logged in"** → use **Login with browser** in the top bar.
- **App feels slow** → disable the Debug tab and restart.
- **Need verbose logs** → enable Debug tools in Settings.

## Tech stack

Electron 42 · React 19 · Vite 7 · TypeScript · Tailwind CSS v4 · Vitest

## Acknowledgements

DropPilot's drop-mining approach is heavily informed by
[**Twitch Drops Miner**](https://github.com/DevilXD/TwitchDropsMiner) by
[DevilXD](https://github.com/DevilXD). Much of the core behavior — stream-less
watch pings, drop/campaign validation, automatic channel switching, and
PubSub-based status tracking — is derived from that project. Huge thanks to
DevilXD and the Twitch Drops Miner contributors.

Twitch Drops Miner is MIT-licensed (Copyright © 2024 DevilXD); its license is
reproduced in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## License

MIT — see [`LICENSE`](LICENSE).
````

- [ ] **Step 2: Verify all referenced local assets exist**

Run:
```powershell
'docs/brand/banner-dark.svg','docs/brand/banner-light.svg','docs/brand/feat-inventory.svg','docs/brand/feat-priority.svg','docs/brand/feat-watching.svg','docs/brand/feat-autoclaim.svg','docs/brand/feat-alerts.svg','docs/brand/feat-discord.svg','docs/brand/feat-login.svg','docs/brand/feat-demo.svg','docs/screenshots/overview.png','docs/screenshots/stats.png','docs/screenshots/inventory.png','docs/screenshots/control.png' | ForEach-Object { if (Test-Path $_) { "$_ OK" } else { throw "MISSING $_" } }
```
Expected: one `... OK` per path; throws if any asset is missing.

- [ ] **Step 3: Verify the old logo reference is gone and the new one is in**

Use Grep: search `README.md` for `icons/icon.png` → expect **zero** matches. Search for `banner-dark.svg` → expect **one** match. Search for `docs/brand/feat-` → expect **eight** matches.

- [ ] **Step 4: Render-check the README**

Preview `README.md` (VS Code "Open Preview", or push the branch and view on GitHub — GitHub is the source of truth for `<picture>`/SVG-`<img>`/table rendering). Expected:
  - Banner renders and swaps with the OS/GitHub light/dark theme.
  - The four shields badges + the violet "Download for Windows" button all resolve and the button links to `/releases/latest`.
  - The overview screenshot loads.
  - The Features table shows two columns, each row with a violet icon + bold title + one line.
  - The "Contents" links all jump to their sections (anchors unchanged).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): new SVG hero, download CTA, and icon feature grid"
```

---

## Self-review (completed during planning)

- **Spec coverage:** mark → Task 1; banners + `<picture>` swap → Task 2 + README Step 1; eight feature icons → Task 3; hero/badges/download CTA → README Step 1; feature table + mini-icons → README Step 1; copy pass + retained sections → README Step 1; out-of-scope (icon.png/tray, translation, source) → not touched. No gaps.
- **Placeholder scan:** none — every SVG and the full README are spelled out.
- **Type/name consistency:** every `docs/brand/feat-*.svg` filename created in Task 3 matches exactly the eight `<img src>` paths in README Step 1; banner filenames match the `<picture>` sources; `icons/logo.svg` is created but intentionally not yet referenced by README (it is the source for the later app-icon step).
- **GitHub-safety:** no inline `style`/`class` anywhere; visuals are committed SVGs + shields + a table; `<picture>`/`align`/`width` are within GitHub's allowed HTML subset.
