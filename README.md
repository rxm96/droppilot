# DropPilot

## What it does
DropPilot focuses on keeping Twitch drops simple and hands-off while still transparent.

- Tracks drop inventory, claim status, and progress in real time.
- Surfaces a target game view with per-drop progress, ETA, and remaining time.
- Builds and respects a priority list so the app can focus on what matters most.
- Auto-selects a channel and auto-switches when the current stream disappears.
- Auto-claims drops (optional) and keeps a clear audit of what happened.
- Configurable refresh cadence to balance responsiveness vs. load.
- Alerting for key events (new drops, auto-claim, drop ending, watch errors).
- Demo mode for exploring the UI without a live account.
- Debug tools for live logs, state snapshot, perf and CPU sampling (off by default).

## Tech stack
- Electron 30
- React 18 + Vite 5
- TypeScript
- Tailwind CSS

## Getting started
Install dependencies and run the dev app:

```bash
npm install
npm run dev
```

Build a production bundle:

```bash
npm run build
```

Preview the built renderer:

```bash
npm run preview
```

## Scripts
- `npm run dev` - start Vite dev server
- `npm run build` - build renderer and Electron bundles
- `npm run preview` - preview the renderer build

## Releases
Releases are published on GitHub Releases. You can download the Windows `.exe` installer there.

## Contributing
See `CONTRIBUTING.md` for local dev and release details.

## Project structure
- `src/main` - Electron main process (IPC, settings, app lifecycle)
- `src/renderer` - React UI
- `src/preload` - Electron preload bridge
- `icons` - app icons
- `dist` / `dist-electron` - build output

## Debug tools
The Debug tab is disabled by default to keep background work minimal.

Enable it:
1. Go to Settings
2. Turn on **Debug tools** / **Debug tab**

Notes:
- Debug logs are gated and only collected when Debug tools are enabled.
- Perf and CPU snapshots are visible in the Debug snapshot.

## Configuration
Settings are stored in the user data directory as `settings.json` and are managed
through the in-app Settings view.

## Troubleshooting
- If the app feels slow, disable the Debug tab and restart.
- If you need verbose logs, enable Debug tools in Settings.

## License
MIT
