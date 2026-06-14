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
