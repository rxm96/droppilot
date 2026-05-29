# Stats Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dedicated `stats` top-nav view that re-surfaces the already-collected
`stats.json` data — KPI cards, watch-time trend, top-games ranking, activity heatmap —
and extend `StatsData` with a lightweight daily history so trends/heatmap have data over time.

**Architecture:** Additive. The main-process counters and IPC surface stay; one new field
(`daily`) is added to `StatsData`. Pure, electron-free helpers do the date bucketing /
pruning / streak / trend math so they are unit-testable. A new `features/stats/` folder
renders the view. Wiring (nav item, route, props) is done last so the tab only appears
once the view is complete.

**Tech Stack:** Electron (main), React 19, TypeScript, Tailwind 4, Radix UI (`AlertDialog`),
`lucide-react`, Vitest. **No new dependency** — charts are hand-rolled SVG/CSS.

**Spec reference:** [`../specs/2026-05-29-stats-dashboard-design.md`](../specs/2026-05-29-stats-dashboard-design.md)

**Branch:** `feat/design-overhaul` (suggest a `feat/stats-dashboard` branch off it, matching the per-feature branch hygiene used through the overhaul).

### Deviations from spec

1. **Pure-helper extraction for the main process.** `stats.ts` imports `app` from electron
   at module load (`app.getPath("userData")`), which makes it awkward to unit-test. The
   date-bucketing / pruning / normalization logic is therefore extracted into a new
   electron-free module `src/main/core/statsDaily.ts`, and `stats.ts` composes it. This is
   the only structural change beyond the spec and exists purely to make the data logic testable.

---

## File Structure

**New files:**
- `src/main/core/statsDaily.ts` — pure helpers: `RETENTION_DAYS`, `localDateKey`, `addToDaily`, `pruneDaily`, `normalizeDaily`, `DailyMap` type
- `src/main/core/statsDaily.test.ts`
- `src/renderer/features/stats/StatsView.tsx`
- `src/renderer/features/stats/StatsHeader.tsx`
- `src/renderer/features/stats/KpiCards.tsx`
- `src/renderer/features/stats/WatchTimeTrend.tsx`
- `src/renderer/features/stats/TopGamesPanel.tsx`
- `src/renderer/features/stats/ActivityHeatmap.tsx`
- `src/renderer/features/stats/statsDerive.ts` — pure: `computeStreaks`, `buildTrendSeries`, `topGames`, `formatWatchTime`
- `src/renderer/features/stats/statsDerive.test.ts`
- `src/renderer/features/stats/index.ts`

**Modified files:**
- `src/main/core/stats.ts` — add `daily` to `StatsData`, compose `statsDaily` helpers
- `src/renderer/shared/types.ts` — mirror `daily` on `StatsData`; add `"stats"` to `View`
- `src/renderer/shared/utils/ipc.ts` — `isStatsData` validates `daily`
- `src/renderer/shared/utils/ipc.test.ts` — `daily` accept/reject cases
- `src/renderer/shared/lib/icons.ts` — export `LineChart`
- `src/renderer/shared/components/chrome/AppNav.tsx` — `"stats"` in `AppNavView` + `ICON_MAP`
- `src/renderer/App.tsx` — add `stats` nav item; pass `statsProps` to `AppContent`
- `src/renderer/shared/components/AppContent.tsx` — `statsProps` + `view === "stats"` branch
- `src/renderer/shared/hooks/app/useAppModel.ts` — `statsProps` memo; drop `stats`/`resetStats` from `overviewProps`
- `src/renderer/features/overview/OverviewView.tsx` — remove dead `stats`/`resetStats` props
- `src/renderer/features/index.ts` — export `StatsView`
- `src/renderer/shared/i18n.tsx` — `stats.*` keys (EN+DE); migrate `overview.reset*`

---

## Task 1: Pure daily-history helpers (main) + tests

**Files:** new `src/main/core/statsDaily.ts`, `src/main/core/statsDaily.test.ts`

- [ ] **Step 1: Write `statsDaily.ts`**

```ts
export const RETENTION_DAYS = 180;
export type DailyEntry = { minutes: number; claims: number };
export type DailyMap = Record<string, DailyEntry>;

// "YYYY-MM-DD" in LOCAL time (so streaks align to the user's day)
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const clampInt = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));

export function normalizeDaily(input: unknown): DailyMap {
  if (!input || typeof input !== "object") return {};
  const out: DailyMap = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!KEY_RE.test(k) || !v || typeof v !== "object") continue;
    const minutes = clampInt((v as DailyEntry).minutes);
    const claims = clampInt((v as DailyEntry).claims);
    if (minutes > 0 || claims > 0) out[k] = { minutes, claims };
  }
  return out;
}

export function addToDaily(
  daily: DailyMap,
  now: number,
  delta: { minutes?: number; claims?: number },
): DailyMap {
  const key = localDateKey(now);
  const cur = daily[key] ?? { minutes: 0, claims: 0 };
  return {
    ...daily,
    [key]: {
      minutes: cur.minutes + clampInt(delta.minutes),
      claims: cur.claims + clampInt(delta.claims),
    },
  };
}

export function pruneDaily(daily: DailyMap, now: number, retentionDays = RETENTION_DAYS): DailyMap {
  const cutoff = localDateKey(now - retentionDays * 86_400_000);
  const out: DailyMap = {};
  for (const [k, v] of Object.entries(daily)) if (k >= cutoff) out[k] = v;
  return out;
}
```

- [ ] **Step 2: Write `statsDaily.test.ts`** covering:
  - `localDateKey` is stable for a known timestamp (use a fixed local date).
  - `addToDaily` creates a bucket and accumulates a second delta on the same day.
  - `addToDaily` with `claims` only leaves `minutes` at 0.
  - `pruneDaily` drops keys older than `RETENTION_DAYS`, keeps the cutoff day and newer.
  - `normalizeDaily` drops bad keys (`"foo"`, `"2026-1-1"`), clamps negatives, drops all-zero entries.

- [ ] **Step 3: Verify** — `npm test -- statsDaily` → all pass. `npx tsc --noEmit` clean for the new file.

- [ ] **Step 4: Commit** — `feat(stats): add pure daily-history helpers for main process`

---

## Task 2: Wire `daily` into `StatsData` + `stats.ts`

**Files:** `src/main/core/stats.ts`

- [ ] **Step 1:** Add `daily: DailyMap` to the `StatsData` type; import the helpers + `DailyMap` from `./statsDaily`. Add `daily: {}` to `defaultStats`.

- [ ] **Step 2:** In `loadStats`, set `daily: normalizeDaily((parsed as StatsData)?.daily)`.

- [ ] **Step 3:** In `saveStats`, set `daily: data.daily !== undefined ? normalizeDaily(data.daily) : current.daily`.

- [ ] **Step 4:** In `bumpStats`, after computing the new totals, set
  `daily: pruneDaily(addToDaily(current.daily, Date.now(), { minutes: delta.minutes, claims }), Date.now())`.
  (Use the same `claims`/`delta.minutes` already computed in the function.)

- [ ] **Step 5:** In `resetStats`, add `daily: {}` to the base object.

- [ ] **Step 6: Verify** — `npx tsc --noEmit` clean; `npm test` (existing stats-related tests still green).

- [ ] **Step 7: Commit** — `feat(stats): record daily watch/claim history in stats.json`

---

## Task 3: Renderer type mirror + IPC validation

**Files:** `src/renderer/shared/types.ts`, `src/renderer/shared/utils/ipc.ts`, `src/renderer/shared/utils/ipc.test.ts`

- [ ] **Step 1:** In `types.ts`, add `daily: Record<string, { minutes: number; claims: number }>` to the renderer `StatsData` (mirror of main).

- [ ] **Step 2:** In `ipc.ts` `isStatsData`, after the `claimsByGame` check, validate `daily`: it must be an object whose values are `{ minutes: number; claims: number }`. Reject non-numeric values (mirror the existing `claimsByGame` stringly-typed rejection).

- [ ] **Step 3:** In `ipc.test.ts`, extend the stats test: a valid payload includes `daily: { "2026-05-29": { minutes: 12, claims: 1 } }` → `true`; a malformed `daily: { "2026-05-29": { minutes: "12", claims: 1 } }` → `false`. Also ensure a payload with `daily: {}` passes.

- [ ] **Step 4: Verify** — `npm test -- ipc` pass; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `feat(stats): validate daily history over IPC`

---

## Task 4: Renderer derivation helpers + tests

**Files:** new `src/renderer/features/stats/statsDerive.ts`, `statsDerive.test.ts`

- [ ] **Step 1:** Implement pure helpers:
  - `computeStreaks(daily): { current: number; longest: number }` — walk dates; a day is "active" if `minutes > 0`. **current** = consecutive active days counting back from today; if today has no entry, start from yesterday (today may legitimately still be 0). **longest** = max consecutive active run in the map.
  - `buildTrendSeries(daily, rangeDays, now = Date.now()): { date: string; minutes: number }[]` — dense, zero-filled series for the last `rangeDays` ending today (uses `localDateKey`).
  - `topGames(claimsByGame, limit = 5): { name: string; claims: number }[]` — entries sorted by claims desc, sliced to `limit`.
  - `formatWatchTime(minutes): string` — `"312h 40m"` / `"40m"`; locale-neutral, no plural fragments.

  Reuse `localDateKey` logic (duplicate a tiny local copy or import from a shared spot — keep renderer free of electron imports, so copy the 5-line helper rather than importing `statsDaily.ts`).

- [ ] **Step 2:** Tests:
  - current streak: 3 active days ending today → 3; today missing but 3 ending yesterday → 3; a gap breaks it.
  - longest streak across a map with two runs.
  - empty `daily` → `{ current: 0, longest: 0 }`.
  - `buildTrendSeries` length === `rangeDays`, gaps zero-filled, ordered oldest→newest.
  - `topGames` ordering + limit.
  - `formatWatchTime` for 0, 40, 700 minutes.

- [ ] **Step 3: Verify** — `npm test -- statsDerive` pass.

- [ ] **Step 4: Commit** — `feat(stats): add pure derivation helpers (streaks, trend, ranking)`

---

## Task 5: Stats panel components + StatsView

**Files:** new `features/stats/*.tsx` + `index.ts`. Use `--dp-*` tokens and existing primitives. Components are presentational, driven by props; not yet routed.

- [ ] **Step 1: `KpiCards.tsx`** — props `{ totalMinutes, totalClaims, gamesCount, currentStreak }`; renders 4 tiles (mono numbers, uppercase mono labels). `formatWatchTime` for the first tile.

- [ ] **Step 2: `WatchTimeTrend.tsx`** — props `{ daily }`. Local `range` state (`7|30|90`, default `30`) with a small toggle. Computes `buildTrendSeries`, renders an SVG `<polyline>` over a gradient fill normalized to max; absolute-date axis ends ("today" + start date), no "X days ago".

- [ ] **Step 3: `TopGamesPanel.tsx`** — props `{ claimsByGame }`; `topGames(...,5)`, flexbox bars (width = claims / max), name + count. Empty state when no claims.

- [ ] **Step 4: `ActivityHeatmap.tsx`** — props `{ daily, longestStreak }`; CSS-grid calendar (7 rows × ~18 weeks), cell opacity scaled to that day's minutes; renders "longest streak" readout beside it.

- [ ] **Step 5: `StatsHeader.tsx`** — props `{ lastReset, onReset }`. Title + "counting since {formatted lastReset} · {n} days". Reset button opens the `AlertDialog` primitive (`ui/alert-dialog.tsx`); **`onReset` fires only from the confirm action**, cancel is a no-op; confirm uses the destructive button variant. Copy from migrated `stats.resetConfirm*` keys (Task 6).

- [ ] **Step 6: `StatsView.tsx`** — props `{ stats: StatsState; resetStats: () => void }`. Handle `idle`/`loading`/`error`/`ready`. On `ready`, derive `currentStreak`/`longest` via `computeStreaks`, compose: `StatsHeader` → `KpiCards` → grid(`WatchTimeTrend` 1.7fr, `TopGamesPanel` 1fr) → `ActivityHeatmap`. `gamesCount = Object.keys(claimsByGame).length`.

- [ ] **Step 7: Confirm gate by construction (no rendering test).** The repo's test setup is node-env, `include: src/**/*.test.ts` only, with no `jsdom` / `@testing-library` — so a rendering component test is not runnable. Instead **guarantee the gate structurally**: `onReset` is wired ONLY to the `AlertDialogAction`'s handler; the trigger merely opens the dialog, and cancel / overlay-dismiss do nothing. This is verified manually in Task 7/8. Do NOT add a `.test.tsx` file or pull in a new test dependency.

- [ ] **Step 8: `index.ts`** — `export { StatsView } from "./StatsView";`

- [ ] **Step 9: Verify** — `npx tsc --noEmit` clean. (No new test file in this task; the pure derivation tests live in Task 4.)

- [ ] **Step 10: Commit** — `feat(stats): add stats dashboard view + panels`

---

## Task 6: i18n keys (EN + DE)

**Files:** `src/renderer/shared/i18n.tsx`

- [ ] **Step 1:** Add `nav.stats` ("Stats" / "Stats").

- [ ] **Step 2:** Add `stats.*` keys (both locales): `stats.title`, `stats.countingSince`, `stats.days`, KPI labels (`stats.kpi.watchTime`/`.claims`/`.games`/`.streak`), units (`stats.unit.h`/`.m`/`.d`), `stats.trend.title`, range labels (`stats.range.7`/`.30`/`.90`), `stats.topGames.title`, `stats.topGames.empty`, `stats.heatmap.title`, `stats.heatmap.longest`, `stats.empty`, `stats.loading`, `stats.error`.

- [ ] **Step 3:** Migrate the dead reset keys: rename `overview.reset` → `stats.reset`, `overview.resetConfirmTitle` → `stats.resetConfirmTitle`, `overview.resetConfirmDesc` → `stats.resetConfirmDesc`, `overview.resetCancel` → `stats.resetCancel`, `overview.resetConfirmAction` → `stats.resetConfirmAction` (both EN+DE). Grep to confirm no remaining `overview.reset` references before deleting.

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; grep shows zero `overview.reset` usages.

- [ ] **Step 5: Commit** — `feat(stats): add stats i18n keys, migrate reset copy`

---

## Task 7: Wire up nav, route, and props

**Files:** `types.ts`, `lib/icons.ts`, `chrome/AppNav.tsx`, `App.tsx`, `AppContent.tsx`, `useAppModel.ts`, `features/index.ts`, `OverviewView.tsx`

- [ ] **Step 1:** `types.ts` — add `"stats"` to the `View` union (between `overview` and `inventory`).

- [ ] **Step 2:** `lib/icons.ts` — add `LineChart` to the navigation export block.

- [ ] **Step 3:** `AppNav.tsx` — add `"stats"` to `AppNavView` and `LineChart` to `ICON_MAP`.

- [ ] **Step 4:** `features/index.ts` — export `StatsView`.

- [ ] **Step 5:** `useAppModel.ts` — add a `statsProps = { stats, resetStats }` object near the other view-props (~line 1395); add `statsProps` to the returned object (~line 1602). Remove `stats` and `resetStats` from `overviewProps`.

- [ ] **Step 6:** `OverviewView.tsx` — remove `stats` / `resetStats` from the props type and (unused) destructure/import of `StatsState`.

- [ ] **Step 7:** `AppContent.tsx` — import `StatsView`; add `statsProps: ComponentProps<typeof StatsView>` to `AppContentProps`; add `{view === "stats" && renderWithPerf("StatsView", <StatsView {...statsProps} />)}`.

- [ ] **Step 8:** `App.tsx` — add `{ key: "stats", label: t("nav.stats") }` to `navItems` (after overview, ~line 84); pass `statsProps={...}` to `<AppContent>`.

- [ ] **Step 9: Verify (build + manual run):**
  - `npx tsc --noEmit` clean; `npm run lint` clean.
  - `npm run dev`: the `stats` tab appears between overview and inventory; clicking it renders the dashboard with current data (KPI + ranking populated, trend/heatmap may be sparse on a fresh history).
  - Reset button: opens a confirmation dialog; **cancel leaves stats intact, confirm clears them**.
  - Overview still renders unchanged.

- [ ] **Step 10: Commit** — `feat(stats): wire stats dashboard into nav and routing`

---

## Task 8: Full verification

- [ ] `npm test` — entire suite green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — clean.
- [ ] Manual smoke (`npm run dev`): watch a stream for a minute → `daily` today bucket grows (verify in `stats.json` under userData) → trend/heatmap reflect it; claim a drop → ranking + KPI update.
- [ ] After all green, use **superpowers:finishing-a-development-branch** to integrate.
