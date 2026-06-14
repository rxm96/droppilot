<div align="center">

<img src="icons/icon.png" width="120" alt="DropPilot" />

<h1>DropPilot</h1>

<p><strong>Automate Twitch Drops — quietly in the background, transparent about what it's doing.</strong></p>

<p>
<a href="https://github.com/rxm96/droppilot/actions/workflows/build.yml"><img src="https://github.com/rxm96/droppilot/actions/workflows/build.yml/badge.svg" alt="Build" /></a>
<a href="https://github.com/rxm96/droppilot/releases/latest"><img src="https://img.shields.io/github/v/release/rxm96/droppilot?sort=semver" alt="Latest release" /></a>
<img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS-blue" alt="Platforms" />
<a href="LICENSE"><img src="https://img.shields.io/github/license/rxm96/droppilot" alt="License: MIT" /></a>
</p>

<p><a href="https://github.com/rxm96/droppilot/releases/latest"><strong>⬇&nbsp; Download the latest Windows installer</strong></a></p>

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

- **Live inventory** — drop progress, claim status, and per-drop ETA in real time.
- **Target + priority** — build a priority list of games; the app focuses on the
  most important actionable game and rotates through the list.
- **Auto-watch** — auto-selects a stream, auto-switches when the current one
  disappears, and recovers from stalls (no watch-time progress) on its own.
- **Auto-claim** (optional) — claims completed drops and keeps an activity audit.
- **Warmup mode** (optional) — briefly watches a stream to discover drops when no
  priority game is currently active.
- **Engine transparency** — a live engine-status rail (Standby → Scanning →
  Watching → Recovering → Hold), a claim-retry countdown, and a session-expired
  banner with one-click re-login instead of a silent logout.
- **Alerts** — desktop notifications for new drops, auto-claim, auto-switch,
  "drop ending soon," and watch errors.
- **Discord / webhook notifications** — push those same alerts to a Discord
  webhook (or any compatible endpoint), independent of desktop notifications.
  HTTPS-only with an SSRF guard, plus a one-click test send.
- **Browser-based login** — no credentials are stored by the app.
- **Demo mode** — explore the full UI without a live Twitch account.
- **Debug tools** — live logs, a state snapshot, and perf/CPU sampling (off by default).

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
