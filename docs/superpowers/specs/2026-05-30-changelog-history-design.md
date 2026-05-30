# Changelog History — Design

**Date:** 2026-05-30
**Branch:** `feat/changelog-history`
**Status:** Approved (brainstorming) — pending implementation plan

## Goal

Surface a browsable history of DropPilot releases inside the app, so users can see
what changed across versions — not just the single "What's new" overlay for the
latest update.

## Decisions (locked during brainstorming)

| Question | Decision |
|----------|----------|
| Data source | **Live GitHub Releases API** (`api.github.com`, repo is public → no token) |
| Placement | **Settings → Updates**, new "Release history" subsection |
| Release filter | **Match the user's update channel**: stable channel → stable releases only; preview channel → include prereleases |
| Notes language | Shown **as-is (English)**; only UI chrome is localized (en/de) |

## Architecture & Data Flow

Fetching happens in the **main process** (Node), not the renderer — avoids CORS and
mirrors how Twitch calls are already made.

1. **New IPC handler `app/releaseHistory`** (in `src/main/ipc/index.ts`):
   - Fetches `GET https://api.github.com/repos/rxm96/droppilot/releases?per_page=100`
     with header `Accept: application/vnd.github+json` (unauthenticated).
   - Reads `settings.updateChannel` and filters via the existing
     `allowsPrereleaseBuilds(updateChannel)` helper (`src/shared/updateChannels.ts`):
     - stable channel → keep only `prerelease === false`
     - preview channel → keep all published releases
   - Drafts are never returned by the unauthenticated API, so `test` (draft) releases
     are naturally excluded.
   - Normalizes each release to the shape below and returns newest-first.

2. **In-memory cache in main**: keyed by channel, ~30 min TTL (GitHub unauth limit is
   60 req/h). On a fetch error, return the last cached payload with `stale: true` so
   the UI can show "showing last known". No disk cache (YAGNI).

3. **Renderer hook `useReleaseHistory`** (`src/renderer/shared/hooks/app/`):
   - Lazily fetches when the Updates settings section becomes visible (not on app boot).
   - Exposes state: `loading | ready | error`, the release list, and a `stale` flag.
   - Re-fetches when the update channel changes.

### Normalized release shape

```ts
type ReleaseEntry = {
  version: string;        // e.g. "3.0.5" (tag without leading "v")
  tag: string;            // e.g. "v3.0.5"
  date: number;           // published_at as epoch ms
  prerelease: boolean;
  notes: string[];        // "What's new for users" bullets (parsed from body)
  fullChangelog: string;  // remaining "Full changelog" markdown (raw text)
  url: string;            // html_url to the GitHub release
};

type ReleaseHistoryResult =
  | { status: "ready"; releases: ReleaseEntry[]; stale: boolean }
  | { status: "error"; message: string };
```

### Notes parsing

Release bodies are produced by our own CI in a known format:

```
## What's new for users

- bullet
- bullet

## Full changelog

...technical changelog...
```

`parseReleaseNotes(body)` splits on the `## Full changelog` marker:
- everything under "What's new for users" → `notes` (bullet lines, `- ` stripped)
- the remainder → `fullChangelog` (raw)

No markdown library is pulled in. If a body doesn't match the expected format
(older releases), fall back to: `notes = []`, `fullChangelog = entire body`.

## UI — Settings → Updates "Release history" subsection

Rendered below the existing update channel / status / actions block in
`UpdatesSection.tsx`, fully in the `--dp-*` design system (elevated cards, dp border/
radius), consistent with the rest of Settings.

- **List, newest first.** Each entry is a card showing:
  - **Version + date** + a **prerelease badge** (Pill, when applicable).
  - A **"Current" pill** (accent) on the entry matching the installed version
    (`app/getVersion`).
  - The **"What's new" bullets** rendered directly as a list.
  - The **"Full changelog"** behind a per-release expander (collapsed by default).
- **Cap:** show the newest ~30 entries; the rest behind a "Show older" toggle
  (the repo has ~94 releases — avoid an unbounded list).
- **States:**
  - loading → skeleton / "Loading releases…"
  - error → message line + **Retry** button
  - stale (cached after a failed refresh) → subtle "Couldn't refresh — showing last
    known" note above the list
  - empty (no releases in this channel) → friendly empty state

## Edge Cases

- **Offline / fetch failure:** show cached list with a stale note, or the error state
  with retry if no cache exists.
- **English notes in a German UI:** accepted by design. Only labels/headings/badges
  are localized; release notes render as authored.
- **Rate limiting:** mitigated by the 30 min main-process cache; fetch is on-demand
  (section visible), not on every render or app boot.
- **Malformed/old release bodies:** parser falls back to showing the full body.

## Testing

Following the repo convention (test pure functions, don't render hooks):

- `filterReleasesByChannel(releases, allowPrerelease)` — stable hides prereleases;
  preview keeps all.
- `parseReleaseNotes(body)` — splits What's-new vs full; fallback when no marker.
- `normalizeRelease(apiRelease)` — maps GitHub API shape → `ReleaseEntry`, strips
  leading `v`, handles missing fields.
- Main fetch + cache: a small test with a mocked `fetch` verifying TTL reuse and
  stale-on-error behavior.

## Out of Scope (YAGNI)

- No on-disk cache.
- No markdown rendering library.
- No translation of release notes.
- No dedicated top-level nav tab (lives in Settings).
- No in-app "download this specific old version" — the existing update flow handles
  installing the latest only.

## Affected / New Files

- `src/main/ipc/index.ts` — new `app/releaseHistory` handler + cache.
- `src/shared/` — normalize/parse/filter helpers (pure, shared + testable) +
  their `*.test.ts`.
- `src/preload/index.ts` — expose `app.releaseHistory()`.
- `src/renderer/shared/hooks/app/useReleaseHistory.ts` — fetch hook.
- `src/renderer/features/settings/sections/UpdatesSection.tsx` — render the subsection
  (or a new `ReleaseHistory.tsx` component it composes).
- `src/renderer/shared/i18n.tsx` — new strings (en + de).
