# Stats Dashboard — Design

**Date:** 2026-05-29
**Status:** Approved (brainstorm), ready for implementation plan
**Branch context:** `feat/design-overhaul`

## Problem

Droppilot already maintains `stats.json` (`src/main/core/stats.ts`) with lifetime
counters and a per-game claim map. The data is fully wired through IPC → `useStats`
→ `useAppModel` and handed to `OverviewView` — but the design overhaul dropped the
display: `OverviewView` declares `stats` / `resetStats` props and never renders them.
So accumulated farming data is collected and then thrown away at the UI boundary.

This feature re-surfaces that data as a dedicated **Statistics** dashboard, and extends
the data model with a lightweight daily history so the dashboard can show trends and an
activity heatmap (not just running totals).

## Goal & scope

A new top-nav view `stats` rendering four panels:

1. **KPI cards** — lifetime totals (watch time, drops claimed, games farmed, current streak). Filled immediately from existing data.
2. **Watch-time trend** — minutes watched per day, area chart, 7d / 30d / 90d range toggle (default 30d). Needs new history.
3. **Top games ranking** — horizontal bars from `claimsByGame`. Filled immediately.
4. **Activity heatmap** — GitHub-style calendar of active days + longest streak. Needs new history.

### Explicitly out of scope for v1 (YAGNI)

- **Claims-per-day chart** — the `daily` model tracks `claims` so this is a pure UI
  add-on later; no data change needed.
- **"Recent activity" panel** — overlaps the existing Activity feed on the Overview.
- **Any new charting dependency** — charts are hand-rolled SVG.

## Data model

`StatsData` (in `src/main/core/stats.ts` and the renderer mirror in
`src/renderer/shared/types.ts`) gains one field:

```ts
daily: Record<string /* "YYYY-MM-DD", local time */, { minutes: number; claims: number }>;
```

- **Local date key**, not UTC, so streaks align with the user's perceived day.
- `bumpStats(delta)` additionally adds `delta.minutes` / `delta.claims` to the bucket for
  today's local date, then **prunes** any key older than `RETENTION_DAYS = 180`
  (covers the 90d trend + 18-week heatmap with margin; file stays tiny — ≤180 small entries).
- `loadStats()` normalizes `daily`: drop non-`YYYY-MM-DD` keys, clamp `minutes`/`claims`
  to `>= 0` integers, coerce missing field to `{}`.
- `saveStats()` validates `daily` the same way when present.
- `resetStats()` clears `daily` along with the other counters and sets `lastReset`.

### Migration

Free. Existing `stats.json` has no `daily`; `loadStats` defaults it to `{}`. History
starts empty and accumulates from first run after the update. Lifetime totals
(`totalMinutes`, `totalClaims`, `claimsByGame`) and the KPI cards / ranking are populated
immediately. No version bump or migration step required.

### Validation surface

`isStatsData` (`src/renderer/shared/utils/ipc.ts`) extends to accept and validate the
`daily` shape, mirroring the existing `claimsByGame` validation (the test in
`ipc.test.ts` that rejects a stringly-typed `claimsByGame` gets a sibling case for `daily`).

## Renderer integration

- `View` (`src/renderer/shared/types.ts`) and `AppNavView` (`chrome/AppNav.tsx`) gain
  `"stats"`. Nav item inserted **between `overview` and `inventory`**, icon `LineChart`.
  - `LineChart` must be added to the icon barrel `src/renderer/shared/lib/icons.ts`
    (currently not exported) and to `ICON_MAP` in `AppNav.tsx`.
  - The nav `items` list (built in `useAppModel` / wherever `AppNavItem[]` is assembled)
    gets a `stats` entry with an i18n label.
- `AppContent.tsx`: add `statsProps` to `AppContentProps` and a
  `view === "stats" && renderWithPerf("StatsView", <StatsView {...statsProps} />)` branch.
- `useAppModel` already produces `stats` + `resetStats`. Route them into a new
  `statsProps` memo instead of `overviewProps`. **Remove** the dead `stats` /
  `resetStats` props from `OverviewView`'s type and from `overviewProps`.

## Components

New feature folder `src/renderer/features/stats/`:

| File | Responsibility |
|------|----------------|
| `StatsView.tsx` | Layout composition: header → KPI row → (trend + ranking) → heatmap. Owns the range-toggle state. Handles `loading` / `error` / `ready` from `StatsState`. |
| `StatsHeader.tsx` | Title + "counting since {date} · {n} days" + reset button gated behind a confirmation dialog (see Reset confirmation below). |
| `KpiCards.tsx` | Four stat tiles. |
| `WatchTimeTrend.tsx` | SVG area chart + 7d/30d/90d toggle. |
| `TopGamesPanel.tsx` | Ranked horizontal bars from `claimsByGame`. |
| `ActivityHeatmap.tsx` | SVG/grid calendar heatmap + longest-streak readout. |

All panels use the existing `--dp-*` tokens and primitives (mono for numbers, sans for
labels, violet accent), consistent with the rest of the overhaul.

### Reset confirmation (required)

Resetting stats is destructive and irreversible, so the reset button **must not** call
`resetStats()` directly. It opens a confirmation dialog and only invokes `resetStats()`
when the user confirms the destructive action; cancelling is a no-op.

- Built on the existing `AlertDialog` primitive at
  `src/renderer/shared/components/ui/alert-dialog.tsx` (currently unused but present —
  this is the same primitive the pre-overhaul Overview reset relied on).
- Copy comes from the migrated `stats.resetConfirm*` keys (title, description, cancel,
  confirm action), so the warning text is bilingual.
- The destructive confirm action is visually distinct (destructive button variant).

### Charts

Hand-rolled SVG, no dependency:
- **Trend:** single `<polyline>` over a gradient fill, normalized to the selected window.
- **Ranking:** flexbox bars (no SVG needed).
- **Heatmap:** CSS grid of cells, opacity scaled to that day's minutes.

This is sufficient for three simple visualizations and matches the lean ethos.

## Derivation helpers

Pure, React-free, unit-tested — `src/renderer/features/stats/statsDerive.ts`:

- `computeStreaks(daily): { current: number; longest: number }` — current = consecutive
  active days (minutes > 0) ending today **or yesterday** (today may legitimately still be
  0 early in the day); longest = max run within the retained window.
- `buildTrendSeries(daily, rangeDays): { date: string; minutes: number }[]` — dense series
  (zero-filled gaps) for the last `rangeDays`.
- `topGames(claimsByGame, limit): { name: string; claims: number }[]` — sorted desc.
- `formatWatchTime(minutes): string` — `"312h 40m"` style, locale-neutral.

## i18n

- New `stats.*` keys (EN + DE): nav label, panel titles, KPI labels, units, range-toggle
  labels, heatmap legend, "counting since"/"longest streak", empty/loading/error states.
- **Migrate** the now-dead `overview.reset*` / `overview.resetConfirm*` keys to `stats.*`
  (the reset UI moved off the Overview during the overhaul; these are unused today).
- Constraint: the time-fragment plurals noted as locked-out for v1 (needs ICU plurals) stay
  out. Chart axis labels use absolute dates or neutral labels, not "X days ago".

## Testing

- `statsDerive.test.ts`: streak edge cases (today still 0, single-day gaps break a streak,
  empty `daily`, all-active window), trend zero-filling, `topGames` ordering, `formatWatchTime`.
- `stats.ts` (main): `bumpStats` writes to the correct local-date bucket and accumulates;
  pruning drops keys older than `RETENTION_DAYS`; `resetStats` clears `daily`;
  `loadStats` normalizes malformed `daily`.
- `ipc.test.ts`: `isStatsData` accepts valid `daily`, rejects malformed.
- `StatsHeader` (component test): clicking reset does **not** call `resetStats` until the
  dialog's confirm action is activated; cancelling leaves stats untouched.

## Files touched (summary)

**Main:** `src/main/core/stats.ts` (model + bucketing + pruning + reset).
**Shared/renderer plumbing:** `shared/types.ts`, `shared/utils/ipc.ts`,
`shared/lib/icons.ts`, `chrome/AppNav.tsx`, `components/AppContent.tsx`,
`hooks/app/useAppModel.ts`, `features/index.ts`, `shared/i18n.tsx`.
**New:** `features/stats/` (view + 5 panels + `statsDerive.ts` + tests).
**Cleanup:** remove dead `stats` / `resetStats` from `OverviewView.tsx`.
