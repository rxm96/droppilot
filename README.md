# DropPilot

> **Download:** Grab the latest Windows installer from
> [GitHub Releases](https://github.com/rxm96/droppilot/releases).

DropPilot is a desktop app that automates Twitch Drops — quietly, in the
background, while staying transparent about what it's doing. It tracks your drop
inventory, picks and watches an eligible stream, switches when that stream goes
down, and (optionally) claims drops for you.

## Features

- **Live inventory** — drop progress, claim status, and per-drop ETA in real time.
- **Target + priority** — build a priority list of games; the app focuses on the
  most important actionable game and rotates through the list.
- **Auto-watch** — auto-selects a stream, auto-switches when the current one
  disappears, and recovers from stalls (no watch-time progress) on its own.
- **Auto-claim** (optional) — claims completed drops and keeps an activity audit.
- **Warmup mode** (optional) — briefly watches a stream to discover drops when no
  priority game is currently active.
- **Alerts** — new drops, auto-claim, drop ending soon, watch errors.
- **Browser-based login** — no credentials are stored by the app.
- **Demo mode** — explore the full UI without a live Twitch account.
- **Debug tools** — live logs, a state snapshot, and perf/CPU sampling (off by default).

## Tech stack

Electron 40 · React 19 · Vite 7 · TypeScript · Tailwind CSS v4 · Vitest

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

Releases are published to GitHub Releases (Windows `.exe` + macOS artifacts) and
built by CI when a `v*` tag is pushed. The app auto-updates on Windows and offers
two channels — **stable** and **preview** — selectable in Settings → Updates, which
also shows the in-app release history. See `CONTRIBUTING.md` for how to cut a release.

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

MIT

