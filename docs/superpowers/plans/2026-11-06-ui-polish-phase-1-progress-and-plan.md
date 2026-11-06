# UI Polish Phase 1 — Progress Truth + Farm Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hero show the active drop's real progress and a clock-time ETA, and add the pure `buildFarmPlan` domain function that phase 2's `plan · today` table will render. No layout change.

**Architecture:** Two small pure helpers go in `features/overview/formatters.ts`: `resolveHeroProgress` and `formatReadyAt`. `HeroPanel` and the Control ETA consume them. The missing `activeDropProgress` prop is threaded through `OverviewView`. `buildFarmPlan` is a new pure module in `shared/domain/` that reuses the engine's own eligibility rules (`canEarnDrop`, `hasHardWatchingBlockers`, `sameGameName`), so the plan predicts what the engine will actually do.

**Tech Stack:** TypeScript, React 19, Vitest (pure-function tests only; no `@testing-library/react`).

**Spec:** `docs/superpowers/specs/2026-11-06-ui-polish-redesign-design.md` (phase 1 of "Suggested phasing").

## Global Constraints

- Tests cover pure functions only. Hooks and components stay thin wrappers.
- Every new or changed i18n key goes in **both** the EN and DE blocks of `src/renderer/shared/i18n.tsx`.
- Every user-facing change gets a line under `## [Unreleased]` in `CHANGELOG.md`, written for users.
- Before each commit: `npx prettier --write` on the changed files. Before the final commit: `npm run lint`, `npm run format:check`, `npm run typecheck` (both configs), `npm test` and `npm run build` must all pass.
- No watch-engine behavior changes.
- Commits follow Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Root cause (verified)

`useAppModel` computes `activeDropProgress` (`useAppModel.ts`, the comment above `heroProps`). But `overviewProps` never includes it, and `OverviewView` never passes it to `HeroPanel`. So `HeroPanel`'s `activeDropProgress ?? targetProgress` always falls back to the game-wide aggregate. In demo data that is (20+45)/(60+45) ≈ 62 %, shown next to a queue row at 33 %.

## Review Focus

- **Nothing being watched** (paused, idle, no target): the hero must show `—`, with no percent and an empty bar. It must never show the game aggregate as if it were the drop's. → Task 1 test `resolveHeroProgress(null) → null`.
- **Active drop with no predictable ETA** (watching an upcoming 0-minute drop, so `eta === null`): the ETA must be `—`, not `00:00` or "in 0 min". → Task 2 test `formatReadyAt(null, now) → null`.
- **Chained drops** (`missing_prerequisite_drops:<ids>` in `blockingReasonHints`): such a drop can only start after its prerequisite is ready, so its `readyAt` is the prerequisite's `readyAt` plus its own remaining minutes. → Task 3 test "chained drop starts after its prerequisite".
- **Campaign ends before the drop could finish**: the row must say so (`wontFinishInTime: true`), and must not pretend the drop will be ready. → Task 3 test "flags drops that cannot finish before endsAt".
- **A ranked game whose only drops are blocked** (e.g. `account_not_linked`): it is listed with `status: "blocked"`, takes no time, and gets no switch row. → Task 3 test "blocked-only game adds rows but no time and no switch".

---

### Task 1: Hero shows the active drop's own progress

**Files:**

- Modify: `src/renderer/features/overview/formatters.ts`
- Test: `src/renderer/features/overview/formatters.test.ts`
- Modify: `src/renderer/features/overview/HeroPanel.tsx`
- Modify: `src/renderer/features/overview/OverviewView.tsx`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (`overviewProps`)
- Modify: `src/renderer/shared/i18n.tsx` (EN + DE)
- Modify: `CHANGELOG.md`

**Interfaces:**

- Produces: `resolveHeroProgress(activeDropProgress: number | null | undefined): number | null`, which clamps to 0–100, rounds, and returns `null` for null, undefined or non-finite input.
- Produces: the `HeroPanelProps.targetProgress` prop is **removed**. `activeDropProgress?: number | null` is now the only progress input. `OverviewProps` gains `activeDropProgress?: number | null`; `targetProgress` stays on `OverviewProps` only if typecheck shows another consumer, otherwise remove it from `OverviewProps` and `overviewProps` too.

- [ ] **Step 1: Write the failing tests** in `formatters.test.ts`:

```ts
describe("resolveHeroProgress", () => {
  it("returns null when nothing is being watched", () => {
    expect(resolveHeroProgress(null)).toBeNull();
    expect(resolveHeroProgress(undefined)).toBeNull();
    expect(resolveHeroProgress(Number.NaN)).toBeNull();
  });
  it("rounds and clamps the active drop's percent", () => {
    expect(resolveHeroProgress(33.4)).toBe(33);
    expect(resolveHeroProgress(-5)).toBe(0);
    expect(resolveHeroProgress(140)).toBe(100);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/renderer/features/overview/formatters.test.ts`. Expected: FAIL, `resolveHeroProgress` is not exported.
- [ ] **Step 3: Implement** `resolveHeroProgress` in `formatters.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Wire it up.**
  - In `HeroPanel`: `const progressPct = resolveHeroProgress(activeDropProgress)`. When it is `null`, the bar renders at width 0 and the `Stat` sub shows the new key `hero.stat.noActiveDrop` instead of `hero.stat.percentComplete`.
  - Remove the `targetProgress` prop and its JSDoc fallback sentence.
  - Add `activeDropProgress` to `overviewProps` in `useAppModel.ts`, to `OverviewProps`, and to the `<HeroPanel>` call in `OverviewView`.
  - i18n: `"hero.stat.noActiveDrop": "no active drop"` (EN), `"hero.stat.noActiveDrop": "kein aktiver Drop"` (DE).
- [ ] **Step 6: Add the changelog line** under `## [Unreleased]` › `### Fixed`: `- The overview's progress now shows the drop you are watching, instead of the whole game's progress, so it matches the queue below it.`
- [ ] **Step 7: Verify** with `npm run typecheck` (expected: no errors) and `npx vitest run src/renderer/features/overview` (expected: PASS).
- [ ] **Step 8: Commit**

```bash
npx prettier --write src/renderer/features/overview src/renderer/shared/hooks/app/useAppModel.ts src/renderer/shared/i18n.tsx
git add src/renderer/features/overview src/renderer/shared/hooks/app/useAppModel.ts src/renderer/shared/i18n.tsx CHANGELOG.md
git commit -m "fix(overview): show the active drop's own progress in the hero"
```

---

### Task 2: One ETA format: clock time plus minutes left

**Files:**

- Modify: `src/renderer/features/overview/formatters.ts`
- Test: `src/renderer/features/overview/formatters.test.ts`
- Modify: `src/renderer/features/overview/HeroPanel.tsx`
- Modify: `src/renderer/features/control/useControlViewState.ts` (the `activeEtaText` const)
- Modify: `src/renderer/shared/i18n.tsx` (EN + DE)

**Interfaces:**

- Consumes: `resolveHeroProgress` (Task 1).
- Produces: `formatReadyAt(eta: number | null | undefined, now: number): { clock: string; minutesLeft: number } | null`.
  - `clock` is the local `HH:mm`, zero-padded and 24-hour, built from `Date#getHours`/`getMinutes` (no `toLocaleTimeString`, so tests stay deterministic).
  - `minutesLeft` is `Math.max(0, Math.ceil((eta - now) / 60000))`.
  - Returns `null` for null, undefined or non-finite `eta`.

- [ ] **Step 1: Write the failing tests:**

```ts
describe("formatReadyAt", () => {
  const now = new Date(2026, 10, 6, 14, 14, 0).getTime();
  it("returns clock time and minutes left", () => {
    const eta = new Date(2026, 10, 6, 14, 34, 0).getTime();
    expect(formatReadyAt(eta, now)).toEqual({ clock: "14:34", minutesLeft: 20 });
  });
  it("zero-pads and rounds partial minutes up", () => {
    const eta = new Date(2026, 10, 7, 9, 5, 30).getTime();
    expect(formatReadyAt(eta, now)?.clock).toBe("09:05");
    expect(formatReadyAt(now + 61_000, now)?.minutesLeft).toBe(2);
  });
  it("returns null when there is no predictable ETA", () => {
    expect(formatReadyAt(null, now)).toBeNull();
    expect(formatReadyAt(Number.POSITIVE_INFINITY, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/renderer/features/overview/formatters.test.ts`. Expected: FAIL, `formatReadyAt` is not exported.
- [ ] **Step 3: Implement** `formatReadyAt` in `formatters.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Use it in the hero.**
  - The ETA `Stat` label uses the new key `hero.stat.readyAt` (EN `ready at`, DE `fertig um`).
  - Its value (inside the existing `TimeText`) is `formatReadyAt(activeDropEta, now)?.clock ?? "—"`.
  - Its sub is the new key `hero.stat.readyIn` with `{min}` and `{pct}` (EN `in {min} min · {pct}%`, DE `in {min} Min. · {pct} %`). When `formatReadyAt` returns null it falls back to `hero.stat.noActiveDrop` (when the progress is also null) or `{pct}% complete`.
  - Remove `formatRemainingFromEta` and `formatHMS` only if nothing else imports them (check with grep).
- [ ] **Step 6: Use it on Control.** In `useControlViewState.ts`, `activeEtaText` becomes `formatReadyAt(liveProgress.activeEta, Date.now())?.clock ?? null` instead of `toLocaleTimeString()` (which printed seconds).
- [ ] **Step 7: Add the changelog line** under `## [Unreleased]` › `### Changed`: `- The time a drop is ready is now shown as a clock time with the minutes left, the same way on every screen.`
- [ ] **Step 8: Verify** with `npm run typecheck` and `npx vitest run src/renderer/features`. Expected: both pass.
- [ ] **Step 9: Commit**

```bash
npx prettier --write src/renderer/features/overview src/renderer/features/control/useControlViewState.ts src/renderer/shared/i18n.tsx
git add src/renderer/features/overview src/renderer/features/control/useControlViewState.ts src/renderer/shared/i18n.tsx CHANGELOG.md
git commit -m "feat(overview): show drop ETA as clock time with minutes left"
```

---

### Task 3: `buildFarmPlan` domain function

**Files:**

- Create: `src/renderer/shared/domain/farmPlan.ts`
- Test: `src/renderer/shared/domain/farmPlan.test.ts`

**Interfaces:**

- Consumes:
  - `canEarnDrop` and `hasHardWatchingBlockers` from `@renderer/shared/domain/inventory`
  - `sameGameName` from `@renderer/shared/domain/gameName`
  - `InventoryItem` from `@renderer/shared/types`
- Produces (used by phase 2):

```ts
export type FarmPlanStatus = "watching" | "next" | "queued" | "blocked";
export type FarmPlanDropRow = {
  kind: "drop";
  dropId: string;
  game: string;
  title: string;
  campaignId?: string;
  earnedMinutes: number;
  requiredMinutes: number;
  readyAt: number | null; // null when blocked
  status: FarmPlanStatus;
  blockedReason?: string; // first entry of blockingReasonHints, or "blocked"
  wontFinishInTime: boolean; // readyAt is after the campaign's endsAt
};
export type FarmPlanSwitchRow = { kind: "switch"; game: string; at: number };
export type FarmPlanRow = FarmPlanDropRow | FarmPlanSwitchRow;
export type FarmPlan = { rows: FarmPlanRow[]; doneAt: number | null };
export type FarmPlanInput = {
  withCategories: Array<{ item: InventoryItem; category: string }>;
  gameOrder: string[]; // output of computePriorityOrder (user ranking)
  fallbackOrder: string[]; // output of computeFallbackOrder
  obeyPriority: boolean;
  activeTargetGame: string;
  activeDrop: { id: string; eta: number | null } | null;
  allowUpcoming: boolean;
  now: number;
};
export function buildFarmPlan(input: FarmPlanInput): FarmPlan;
```

**Rules the tests pin.** These are domain decisions, not obvious from the types:

1. **Game sequence:** `activeTargetGame` first (if set), then `gameOrder`, then (only when `!obeyPriority`) `fallbackOrder`. Games are matched with `sameGameName` and de-duplicated. A game with no earnable and no blocked drops is skipped.
2. **Earnable drops** are those that pass `canEarnDrop(item, { category, allowUpcoming })`. **Blocked rows** are listed only for games in `gameOrder` (or the active game): drops that are not claimed, have no `campaign_expired` hint, and fail `canEarnDrop`.
3. **Time model:** Twitch credits all time-based drops of the watched game at once. So inside one game, every earnable drop's `readyAt = gameStart + (required − earned) min`. For the active drop, `readyAt = activeDrop.eta` when it is non-null.
4. **Chains:** a drop with a `missing_prerequisite_drops:<id,id>` hint that points at earnable drops in the plan is treated as earnable (it unlocks during this session). Its `readyAt = max(prerequisite readyAt) + required min`. Without a matching prerequisite, it is blocked.
5. **The game ends** at the max `readyAt` of its earnable rows. The next game starts there, and a `{ kind: "switch", game, at }` row is placed before its first drop row. There is no switch row for the first game or for blocked-only games.
6. **Status:** the `activeDrop.id` row is `watching`. The first earnable non-watching row in the whole plan is `next`, the other earnable rows are `queued`, and blocked rows are `blocked`. Within a game, rows are sorted by `readyAt` ascending, with blocked rows last.
7. **`wontFinishInTime`** is `readyAt !== null && endsAt` parses and `readyAt > Date.parse(endsAt)`.
8. **`doneAt`** is the last earnable `readyAt`, or `null` when there are none.

- [ ] **Step 1: Write the failing tests** in `farmPlan.test.ts`.
  - Use a small `item(partial)` factory with defaults `{ status: "progress", requiredMinutes: 60, earnedMinutes: 0, linked: true }`.
  - Use `now = new Date(2026, 10, 6, 14, 14).getTime()` and `const MIN = 60_000`.
  - The test cases:
    - `"active drop uses its live eta and is 'watching'"`: game Valorant, `activeDrop { id: "pv", eta: now + 20*MIN }`. The row `pv` has `readyAt` `now + 20*MIN` and status `watching`.
    - `"drops of one game progress at once"`: Valorant drops `pv` 40/60 and `pc` 0/120, no activeDrop. `pv.readyAt = now + 20*MIN`, `pc.readyAt = now + 120*MIN`, `pc` is `queued`, and `pv` is `next`.
    - `"next game starts when the previous one is done and gets a switch row"`: gameOrder `["Valorant","Apex Legends"]`, Apex drop `ls` 90/120. The rows contain `{ kind: "switch", game: "Apex Legends", at: now + 120*MIN }`, followed by `ls.readyAt = now + 150*MIN`, and `doneAt === now + 150*MIN`.
    - `"chained drop starts after its prerequisite"`: `b` has `status: "locked"`, `blockingReasonHints: ["missing_prerequisite_drops:a"]` and requires 30; `a` is 0/60. Then `b.readyAt = now + 90*MIN`.
    - `"flags drops that cannot finish before endsAt"`: `endsAt` = ISO of `now + 30*MIN` on a 0/60 drop gives `wontFinishInTime: true`.
    - `"blocked-only game adds rows but no time and no switch"`: Rust is in gameOrder with one drop that has `linked: false`, `status: "locked"` and `blockingReasonHints: ["account_not_linked"]`, and `allowUpcoming` is false. The row has status `blocked`, `blockedReason: "account_not_linked"` and `readyAt: null`. No switch row has `game: "Rust"`, and `doneAt` is unaffected.
    - `"strict mode ignores fallback games"`: with `obeyPriority: true`, a fallback-only game produces no rows. With `false`, its rows follow the ranked games.
    - `"claimed and expired drops are left out"`: `status: "claimed"`, and the hint `campaign_expired`, give no rows.
    - `"game names match case-insensitively"`: activeTargetGame `"valorant"` with items in `"Valorant"` is treated as one game, not two.
- [ ] **Step 2: Run** `npx vitest run src/renderer/shared/domain/farmPlan.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `buildFarmPlan` in `farmPlan.ts` following rules 1–8. Keep helpers module-private. Add a header comment stating the time model (rule 3) and that the output is an estimate assuming continuous watching.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/shared/domain/farmPlan.ts src/renderer/shared/domain/farmPlan.test.ts
git add src/renderer/shared/domain/farmPlan.ts src/renderer/shared/domain/farmPlan.test.ts
git commit -m "feat(domain): add buildFarmPlan for the upcoming plan view"
```

(Not user-facing yet, so no changelog line. Phase 2 renders it.)

---

### Task 4: Full verification

- [ ] **Step 1:** `npm run lint`. Expected: exit 0 (warnings allowed).
- [ ] **Step 2:** `npm run format:check`. Expected: "All matched files use Prettier code style!"
- [ ] **Step 3:** `npm run typecheck`. Expected: no output, exit 0.
- [ ] **Step 4:** `npm test`. Expected: all test files pass, including the new `farmPlan.test.ts` and `formatters.test.ts` cases.
- [ ] **Step 5:** `npm run build`. Expected: renderer, main and preload built without errors.
- [ ] **Step 6: Behavior check in the app.** Run in demo mode with an isolated profile, either with `npm run dev`, or with a static serve of `dist/renderer` plus `VITE_DEV_SERVER_URL` and `--user-data-dir`. On overview, the hero percentage must equal the active row in the queue (33–34 %, not 62 %), and the ETA must read as a clock time like `14:34` with `in N min · P%`. On control, the ETA shows `HH:mm` with no seconds.
