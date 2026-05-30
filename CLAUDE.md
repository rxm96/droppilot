# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

DropPilot is a Windows-first Electron desktop app that automates Twitch Drops (track inventory, auto-select/switch streams, auto-claim, respect a priority list). Electron 40 + React 19 + TypeScript + Vite 7 + Tailwind v4. (The README's "Electron 30 / React 18 / Vite 5" is stale — trust `package.json`.)

## Commands

```bash
npm run dev            # Vite dev server + Electron (hot reload)
npm run build          # builds renderer (dist/) + main & preload (dist-electron/)
npm test               # vitest run — full suite
npm run test:watch     # vitest watch
npx vitest run <path>  # single test file, e.g. src/shared/releaseHistory.test.ts
npx vitest run <path> -t "name"   # single test by name
npm run lint           # eslint (warnings do NOT fail; exit 0 on warnings-only)
npm run format         # prettier --write
npm run format:check   # prettier --check (this DOES gate CI)
npx tsc --noEmit -p tsconfig.json   # typecheck (see gotcha below)
```

Releases: `npm run release:patch` (also `:minor`, `:major`, and prerelease `:rc` / `:test`). Each bumps the version, creates a `chore(release): vX` commit + tag, and pushes with `--follow-tags`. The tag push triggers CI to build Win/macOS artifacts and publish a GitHub Release with AI-generated notes.

## CI / verification gotchas (important)

- **CI (`.github/workflows/build.yml`) runs only on push to `main` and on `v*` tags — NOT on pull requests.** A PR gets no automated CI; verify locally before merging.
- CI steps are: lint → `format:check` → `npm test` → `npm run build` → package. **There is no `tsc --noEmit` step.** As a result, some pre-existing type errors exist in the tree (e.g. a `warmupEnabled` error in `useAppModel.ts`) that do not block CI. When you run `tsc`, scope your check to the files you touched (`... | grep <yourfile>`) — don't assume a clean global typecheck.
- A clean `format:check` is required — run `prettier --write` on new/changed files before committing or CI fails.
- `main` is protected (PRs required) but release pushes bypass it. Commit messages follow Conventional Commits (`feat`, `fix`, `docs`, `style`, `refactor`, `chore(release)`).

## Architecture

Three Electron layers under `src/`:

- **`src/main`** — Node/Electron main process. App lifecycle + window/tray (`index.ts`), all IPC handlers (`ipc/index.ts`), persistence (`core/`: `settings.ts`, `stats.ts`+`statsDaily.ts`, `session.ts` → JSON files in `app.getPath("userData")`), and the Twitch integration (`twitch/`). Auto-update (electron-updater) is Windows-only with `stable`/`preview` channels (`allowsPrereleaseBuilds`).
- **`src/preload`** — context-bridge. Exposes a single `api` object as `window.electronAPI`. **`ElectronAPI = typeof api`**, and the renderer types it via `src/renderer/global.d.ts` — so adding a method to the preload `api` object automatically types it on the renderer side (no separate type declaration needed).
- **`src/renderer`** — React UI. Feature folders in `features/` (control, inventory, overview, priority, settings, stats, debug); shared code in `shared/` (hooks, domain logic, UI components, i18n, utils).

**All network calls go through the main process, never the renderer** (avoids CORS, centralizes auth/cookies). The renderer calls `window.electronAPI.*` → IPC → a handler in `src/main/ipc/index.ts`. Code shared by both processes lives in `src/shared/` (e.g. `updateChannels.ts`, `releaseHistory.ts`) and is imported via relative paths like `../../../../shared/...`.

### Twitch layer (`src/main/twitch`)

- `client.ts` — low-level GQL/persisted-query + cookie/integrity handling.
- `service.ts` — high-level operations (inventory, channels, `claimDrop`, `sendWatchPing`). Claim success is determined by GQL status codes (`ELIGIBLE_FOR_ALL`, `ALREADY_CLAIMED`, …).
- `userPubSub.ts` — live drop-progress / drop-claim events over WebSocket.
- `tracker.ts` — live channel list tracking; `spade.ts` — watch-minute pings.

### Renderer orchestration

`src/renderer/shared/hooks/app/useAppModel.ts` is the central composition hook — it wires together auth, settings, inventory, channels, watch ping, priority orchestration, stats, and alerts, and is the single source the top-level `App.tsx`/views consume. It's large; most subsystem logic is factored into sibling hooks (`useStats`, `useUpdateActions`, …) and into `shared/domain/` and `shared/hooks/{watch,inventory,priority}/`.

The **watch engine** (auto-select / auto-switch / stall recovery / target suppression) is the most subtle subsystem. Read `docs/watch-engine.md` and `docs/watch-flow.puml` before changing anything in `shared/hooks/watch/` — the suppression reducer (`watchEngine.ts`) and stall recovery have non-obvious bounce-prevention rules.

### Design system

`src/renderer/app.css` defines `--dp-*` design tokens (bg/border/text/accent/signal/radius) for light+dark themes. **Use `--dp-*` tokens and the `dp-*` Button/Pill variants** for new UI — a legacy shadcn token set (`background`, `border`, `muted-foreground`, generic button variants) still exists but produces an off-palette look; prefer `--dp-*`. Tailwind v4 (config via `app.css` + `postcss.config.cjs`).

### i18n

`src/renderer/shared/i18n.tsx` holds flat key→string dictionaries for **English and German**. Add every new key to **both** locale blocks. User-facing release notes from GitHub render as-is (English) — only UI chrome is translated.

## Testing convention

Tests are Vitest and cover **pure functions, not rendered hooks/components** — `@testing-library/react` is not a dependency. When adding logic, extract it into a pure, exported function (in `shared/domain/`, `shared/` , or a `*.ts` helper next to the hook) and unit-test that; keep the hook/component a thin wrapper. Existing examples: `watchEngine.test.ts`, `statsDaily.test.ts`, `releaseHistory.test.ts`, `inventoryClaimEngine.test.ts`.

## Process

Feature work uses a spec → plan → implementation flow with documents under `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Working style

- **Plan non-trivial work first.** For anything with 3+ steps or an architectural choice, write the approach down before coding (use the spec → plan flow above). If a task goes sideways, stop and re-plan instead of pushing through.
- **Prove it works before calling it done.** Run the tests, read the output/logs, and for behavioral changes diff against the previous behavior — don't claim success on assertions alone. Remember the CI gotchas above: CI won't catch type errors or PR regressions for you, so verify locally.
- **Fix root causes, not symptoms.** No temporary patches or papered-over failures. Given a bug, trace the logs/failing tests and resolve it rather than asking for hand-holding.
- **Keep changes minimal and focused.** Touch only what the task needs; don't bundle unrelated refactors. Prefer the simplest change that's correct.
- **Aim for elegance on non-trivial changes** — pause and ask whether there's a cleaner approach — but don't over-engineer simple, obvious fixes.
