# Contributing

Local dev, conventions, and the release process for DropPilot. For the high-level
overview and feature list, see [`README.md`](README.md). For an agent-oriented map
of the codebase, see [`CLAUDE.md`](CLAUDE.md).

## Prerequisites

- **Node 20+** (CI builds on Node 20).
- npm (the repo ships a `package-lock.json`).

## Setup & dev loop

```bash
npm install
npm run dev      # Vite + Electron with hot reload
```

- `npm run build` — production build: renderer → `dist/`, main + preload → `dist-electron/`.
- `npm run preview` — preview the built renderer.

## Quality gates

Run these before pushing — they mirror what CI enforces:

```bash
npm test               # Vitest, full suite
npm run lint           # ESLint
npm run format:check   # Prettier (run `npm run format` to auto-fix)
npm run build          # must succeed
```

Run a single test while iterating:

```bash
npx vitest run src/shared/releaseHistory.test.ts          # one file
npx vitest run src/shared/releaseHistory.test.ts -t "name" # one test
npm run test:watch                                         # watch mode
```

### Things CI does *not* do (verify locally)

- CI (`.github/workflows/build.yml`) runs **only on pushes to `main` and on `v*`
  tags — not on pull requests**. A PR gets no automated CI, so run the gates above
  yourself before merging.
- CI has **no `tsc --noEmit` step**. Some pre-existing type errors live in the tree
  and do not block CI; when you run `tsc`, scope the output to the files you changed
  rather than expecting a globally clean typecheck.
- ESLint **warnings** do not fail CI (it exits 0 on warnings). Don't add new ones
  regardless.

## Testing conventions

- `@testing-library/react` is **not** a dependency — tests do not render hooks or
  components. Instead, extract logic into **pure, exported functions** and unit-test
  those; keep the hook/component a thin wrapper. See `watchEngine.test.ts`,
  `statsDaily.test.ts`, `releaseHistory.test.ts`, `inventoryClaimEngine.test.ts`.
- For main-process logic that needs I/O (network, timers), inject the dependency
  (e.g. pass `fetch` / `now` in) so the core stays pure and testable, and keep the
  IPC handler a thin shell. `src/shared/releaseHistory.ts` is the reference pattern.

## Code conventions

- **Design system:** use the `--dp-*` CSS tokens (defined in `src/renderer/app.css`)
  and the `dp-*` Button/Pill variants for new UI. A legacy shadcn token set still
  exists but looks off-palette — prefer `--dp-*`.
- **i18n:** strings live in `src/renderer/shared/i18n.tsx` as flat key→string
  dictionaries for English and German. Add every new key to **both** locales.
- **IPC:** add network/privileged work as a handler in `src/main/ipc/index.ts`,
  expose it on the `api` object in `src/preload/index.ts`, and call it via
  `window.electronAPI.*`. Because `ElectronAPI = typeof api`, adding to the preload
  object types it on the renderer automatically — no separate type declaration.

## Commits & branches

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`,
  `chore(release):`. Keep changes focused.
- Branch off `main`; `main` is protected (changes land via pull request).

## Releases

Releases are driven by version tags. The release scripts bump the version, create a
`chore(release): vX` commit + tag, and push with `--follow-tags`:

```bash
npm run release:patch   # 3.0.5 -> 3.0.6
npm run release:minor   # 3.0.x -> 3.1.0
npm run release:major   # 3.x.x -> 4.0.0
npm run release:rc      # prerelease on the rc preid
npm run release:test    # prerelease on the test preid (draft)
```

Pushing the `v*` tag triggers CI to build Windows + macOS artifacts with
electron-builder and publish a GitHub Release (notes are generated from the tag
range). Stable tags publish a normal release; `rc`/`beta`/`alpha` publish a
pre-release; `test` publishes a draft. Windows clients auto-update per their channel
(stable/preview) via electron-updater.

## Documentation

- `README.md` — user/overview.
- `CLAUDE.md` — codebase map for AI agents.
- `docs/watch-engine.md` + `docs/watch-flow.puml` — the watch engine.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design specs and
  implementation plans for larger features.
