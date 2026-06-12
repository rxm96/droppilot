# Smart Drops Planner — Design

**Date:** 2026-06-13
**Status:** Approved (brainstorm), ready for implementation plan
**Branch context:** `main` (new feature branch to be created)

> Revised after an adversarial multi-agent spec review (algorithm / consistency /
> convention-fit / scope lenses). Notable corrections folded in: feasibility is now computed
> **per drop** (the earlier min-deadline + max-remaining pairing was incorrect for tiered
> drops); grouping uses `normalizeGameName`; the filter also drops `excluded` / expired drops;
> data-flow and the live tick are corrected to the real `OverviewView` / `useVisibleTick`
> conventions.

## Problem

DropPilot tracks per-drop progress (`requiredMinutes` / `earnedMinutes`) and campaign
deadlines (`endsAt`), and it auto-selects/switches streams to farm them. But the user has
no at-a-glance answer to the question that actually matters during a farming session:
**"which drops can I still finish before they expire, and in what order should I watch
them?"** Campaigns end at different times; a drop that needs 40 more minutes and expires in
an hour is urgent, while one that expires in nine days can wait. Today the user has to eyeball
the inventory and do this math in their head.

The Smart Drops Planner surfaces a computed, **deadline-ordered** plan so the answer is
visible without manual reasoning. It is **advisory only** — it changes nothing about how the
watch engine selects channels; it reads existing inventory data and presents a recommendation.

## Goal & scope

A new **Plan-Queue card** in the existing Overview view that renders an Earliest-Deadline-First
(EDF) plan over the user's earnable drops, **grouped by game**, with per-entry watch-time, a
deadline countdown, and a feasibility flag (`ok` / `partial` / `lost`).

### In scope (v1)

- Pure planning function `buildDropsPlan(items, now)` → ordered `PlanEntry[]`.
- `DropsPlanCard` in `features/overview/` rendering the queue (Layout "A · Plan-Queue").
- Live countdown (minute granularity) via the existing `useVisibleTick`.
- Empty-state, urgency coloring, infeasible / partial treatment.
- i18n keys in **EN + DE**.

### Explicitly out of scope (YAGNI)

- **Driving the watch engine / auto-reordering the priority list.** Advisory only. No change
  to `shared/hooks/watch/`, priority orchestration, IPC, the Twitch layer, or `useAppModel`.
- **Priority-list weighting.** The plan is *pure EDF* by deliberate decision — earliest deadline
  wins regardless of the user's priority order. (Priority remains what the watch engine obeys;
  the planner is a separate, deadline-focused lens.)
- **Deadline-Timeline / Gantt visualization** (the rejected Layout "B"). The compact queue is v1.
- **Click-to-jump from a plan row to the Inventory view.** Nice-to-have, deferred.
- **A dedicated top-nav "Planner" view.** It lives as a card in Overview.
- **Projected wall-clock completion time as a visible field.** The completion timestamp is
  computed internally for feasibility but not rendered (the pill shows remaining *duration*).

## Data flow

No new data, no new IPC. The card consumes the **already-unwrapped `items: InventoryItem[]`**
that `OverviewView` derives from its `inventory: InventoryState` prop
(`OverviewView.tsx:73-78` — the same `items` it hands to `QueuePanel`). The card is mounted in
`OverviewView`'s left column and passed `items={items}`; it owns its own clock tick (see *Live
countdown*). It does **not** call `useInventory` itself and does **not** require any
`useAppModel` / `AppContent` plumbing.

> Correction vs. the naïve assumption: `useInventory` and `OverviewView` expose `inventory` as
> an `InventoryState` discriminated union (`{ status: "idle" | "loading" | "ready" | "error";
> items? }`), **not** a bare `InventoryItem[]`. The unwrapping already exists in `OverviewView`;
> the card just reuses the local `items`.

`InventoryItem` (renderer mirror in `src/renderer/shared/types.ts`) already carries every field
the planner needs: `id`, `game`, `title`, `requiredMinutes`, `earnedMinutes`, `status`,
`startsAt?`, `endsAt?`, `blocked?`, `isClaimable?`, `excluded?`, `campaignStatus?`,
`blockingReasonHints?`.

## The planner (`src/renderer/shared/domain/dropsPlanner.ts`)

A single pure, exported function. No React, no I/O, clock injected via `now`. Sibling test
`dropsPlanner.test.ts`. It builds on the existing `InventoryDrop` domain class
(`shared/domain/dropDomain.ts`) for renderer-safe `remainingMinutes` / `isExpired(now)`, and
parses `endsAt` with a finite guard mirroring `InventoryDrop.isExpired` (`Date.parse` +
`Number.isFinite`) — never raw `Date.parse` into arithmetic.

### Types

```ts
export type PlanDrop = {
  id: string;
  title: string;
  remainingMinutes: number;
  deadlineMs: number | null;   // finite-parsed endsAt; null = no/!finite deadline
  feasible: boolean;           // finishes before its OWN deadline in plan order
};

export type PlanEntry = {
  gameKey: string;             // normalizeGameName(game) — grouping identity
  gameLabel: string;           // original-cased name for display
  watchMinutes: number;        // minutes you'd actually spend here (see step 4)
  deadlineMs: number | null;   // earliest drop deadline in the game → EDF sort + countdown
  status: "ok" | "partial" | "lost";
  feasibleDropCount: number;
  totalDropCount: number;
  drops: PlanDrop[];           // per-drop detail (display + tests), sorted by remaining asc
};

export function buildDropsPlan(items: InventoryItem[], now: number): PlanEntry[];
```

### Algorithm

1. **Filter** to genuinely earnable drops. Keep `item` iff **all** hold:
   - `canEarnDrop(item, { allowUpcoming: true })` — from `shared/domain/inventory/inventoryRules.ts`.
     On **real** data this already excludes `claimed`, `blocked`, `isClaimable`, hard-watching-
     blocked (incl. `campaign_not_started` / `campaign_expired` hints), and completed
     (`earned >= required`) drops.
   - `item.excluded !== true` — `canEarnDrop` does **not** check `excluded`; user-excluded drops
     must not appear.
   - `!new InventoryDrop(item).isExpired(now)` — guards `campaignStatus === "EXPIRED"` and
     past-`endsAt` even when no blocker hint is present.
   - `startsAt` absent **or** finite-parsed `startsAt <= now`.

   > Why the last three are needed even though `canEarnDrop` looks sufficient: they are
   > load-bearing for **demo mode** and clock-skew. Demo inventory (`demoData.ts`) carries no
   > `blockingReasonHints` / `blocked` / `isClaimable`, so future-start, excluded, and
   > status-expired demo drops would otherwise slip through `canEarnDrop`. (The "same data
   > shape" convenience claim is therefore softened: demo lacks the blocker metadata real data
   > has; these explicit checks compensate so demo and production plans agree.)

2. **Group** the surviving drops by `normalizeGameName(item.game)` (`shared/domain/gameName.ts`)
   — **not** the raw string, which would split e.g. `"Marvel Rivals"` from `"marvel rivals "`
   into two entries. Keep one original-cased `gameLabel` per group (first seen) for display.

3. **Per-game aggregates:**
   - `deadlineMs` = the **minimum** finite-parsed `endsAt` over the game's drops; `null` if none
     have a finite deadline. Drives EDF ordering and the countdown.
   - Each drop keeps its **own** `deadlineMs` for feasibility (step 4) — deadlines are *not*
     collapsed into the aggregate for the feasibility test.

4. **Sort & feasibility walk.** Sort games EDF by `deadlineMs` ascending (`null` → `+Infinity`,
   sorted last), tiebreak by `watchMinutes` ascending then `gameLabel`. Walk the sorted games
   with a `cursor` (watch minutes elapsed before this game; start `0`). For each game:
   - `cursorStart = cursor`.
   - For each drop `d` (sorted by `remainingMinutes` asc): let
     `completionMs = now + (cursorStart + d.remainingMinutes) * 60_000`;
     `d.feasible = d.deadlineMs == null || completionMs <= d.deadlineMs`.
   - `feasibleDrops = drops.filter(feasible)`;
     `watchMinutes = feasibleDrops.length ? max(d.remainingMinutes over feasibleDrops) : 0`.
   - `status = allFeasible ? "ok" : feasibleDrops.length ? "partial" : "lost"`.
   - `cursor = cursorStart + watchMinutes`.

   **Why per-drop, not min-deadline vs. max-remaining:** within one game all drops progress in
   parallel while you watch it, so each drop finishes at `cursorStart + its own remaining`, and
   each is feasible against *its own* deadline. Pairing the game's earliest deadline with its
   longest remaining (the prior design) asked a question matching no real drop — a short
   low-tier (40 min deadline) plus a long high-tier (9-day deadline) would be wrongly flagged
   "lost". `watchMinutes` counts only the time needed to harvest the *still-achievable* drops:
   a fully-`lost` game consumes `0` (you'd skip it), so later games stay plannable — the EDF
   "skip-don't-block" property, now correct at drop granularity.

5. **Return** the `PlanEntry[]` in EDF order. `lost` / `partial` entries stay in their
   deadline-sorted position (they are **not** re-sorted to the bottom); the UI de-emphasizes
   them visually.

### Edge cases (covered in the pure function + tests)

- **Empty / all-filtered input** → `[]`.
- **No `endsAt` anywhere** → all `deadlineMs = null`, every drop feasible, `status = "ok"`,
  games sorted by `watchMinutes`.
- **Malformed / non-finite `endsAt`** → finite guard yields `null` (treated as no deadline);
  never `NaN` poisoning `min`/comparisons.
- **Past `endsAt` or `campaignStatus === "EXPIRED"`** → excluded at the filter (step 1); does
  not reach the plan.
- **Single game, mixed-deadline tiers** → one entry; per-drop feasibility may produce
  `status = "partial"` (some tiers reachable, some not).

## UI (`src/renderer/features/overview/DropsPlanCard.tsx`)

A card consuming `items` and a `now` tick; all logic stays in `buildDropsPlan`.

- **Header:** title + reachable count `plan.feasibleCount` = "{count} of {total} reachable",
  where `total = plan.length` (all entries) and `count` = entries with `status === "ok"`.
- **Row (per `PlanEntry`):** rank badge · `gameLabel` + representative drop title · progress bar
  (`earned/required` of the representative — the longest open drop) · remaining-duration pill
  (`plan.remaining` = "{time} left", from `watchMinutes`) · deadline countdown (`plan.endsIn` =
  "ends in {time}", from `deadlineMs - now`).
- **Urgency:** rows with `deadlineMs - now < 2h` use `--dp-signal-*` (red) accents; others neutral.
- **`partial` rows:** amber accent + badge `plan.atRisk` = "{count} of {total} drops won't make
  it" (`count = totalDropCount - feasibleDropCount`, `total = totalDropCount`).
- **`lost` rows:** struck-through title + badge `plan.lost` = "won't make it"; no remaining pill.
  The ⚠ glyph is prepended by the component, not baked into the i18n string (keeps EN/DE
  symmetric).
- **Empty state:** `plan.empty` = "No open drops scheduled".
- Styled with `--dp-*` tokens and `dp-*` component variants per the design-system convention.

### Live countdown

Deadlines/ETAs tick. The card sources `now` from the existing
`useVisibleTick(60_000)` (`shared/hooks/useVisibleTick.ts`) — which already **pauses while the
window is hidden**, avoiding background re-renders — and recomputes `buildDropsPlan` via
`useMemo([items, now])`. Per-row countdowns may additionally render through the `TimeText`
leaf (`shared/components/TimeText.tsx`) so time-driven re-renders stay scoped to the countdown
leaves rather than the whole card. The bespoke `setInterval` from the first draft is dropped.
`DropsPlanCard` deliberately owns this tick — a small, isolated exception to the otherwise
prop-driven, stateless Overview panels — which is why no `useAppModel` plumbing is needed.

## i18n

New flat dotted keys (matching `i18n.tsx`'s existing style; `format()` interpolates `/\{(\w+)\}/g`)
added to **both** the `en` and `de` blocks of `src/renderer/shared/i18n.tsx`. Descriptive
placeholder tokens only (`{time}`, `{count}`, `{total}`) — consistent with the file's existing
keys (no single-letter tokens). There is no existing `plan.*` namespace, so all keys are new in
both blocks:

| key | EN | DE |
| --- | --- | --- |
| `plan.title` | Plan | Plan |
| `plan.empty` | No open drops scheduled | Keine offenen Drops eingeplant |
| `plan.remaining` | {time} left | noch {time} |
| `plan.endsIn` | ends in {time} | endet in {time} |
| `plan.feasibleCount` | {count} of {total} reachable | {count} von {total} schaffbar |
| `plan.atRisk` | {count} of {total} drops won't make it | {count} von {total} Drops nicht schaffbar |
| `plan.lost` | won't make it | nicht schaffbar |

Phrasing is plural-agnostic ("{count} of {total}", "noch {time}"), so flat keys are acceptable
here rather than `.one`/`.other` variants. `{time}` is a preformatted duration/countdown string
produced by the existing time-formatting util the card uses for the pill and countdown.

## Testing

`dropsPlanner.test.ts` (Vitest, pure — no rendered components, per project convention):

- **Per-game grouping** via `normalizeGameName`: differently-cased/whitespaced `game` strings of
  the same logical game collapse into one entry.
- **Per-drop feasibility** (regression guard for the corrected model): a game with a short
  low-tier (near deadline) and a long high-tier (far deadline) is `status: "ok"` with both drops
  feasible — *not* wrongly `lost`.
- **`partial` status**: a game where one tier is reachable and another is not.
- **EDF ordering**, including `null`-deadline entries last and the `watchMinutes` tiebreak.
- **Feasibility walk**: cumulative `cursor`, `lost` games consuming `0` so later games stay
  feasible; exact values for a hand-computed scenario.
- **Filtering**: `claimed` / `blocked` / `isClaimable` / completed / `excluded` /
  `campaignStatus === "EXPIRED"` / future-`startsAt` drops excluded.
- **Malformed `endsAt`** → treated as no deadline (feasible), never `NaN`.
- **Empty input** → `[]`.

The `DropsPlanCard` component is not unit-tested (no `@testing-library/react`); all behavior
lives in the pure function.

## Files touched

| File | Change |
| --- | --- |
| `src/renderer/shared/domain/dropsPlanner.ts` | **new** — `buildDropsPlan` + types |
| `src/renderer/shared/domain/dropsPlanner.test.ts` | **new** — unit tests |
| `src/renderer/features/overview/DropsPlanCard.tsx` | **new** — Plan-Queue card |
| `src/renderer/features/overview/OverviewView.tsx` | mount `<DropsPlanCard items={items} />` |
| `src/renderer/shared/i18n.tsx` | new EN + DE `plan.*` keys |

No changes to `src/main`, IPC, preload, the watch engine, priority logic, `useAppModel`, or
`AppContent`.
