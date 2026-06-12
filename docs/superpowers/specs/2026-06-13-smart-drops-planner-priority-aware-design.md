# Smart Drops Planner — Priority-Aware Ordering (Addendum)

**Date:** 2026-06-13
**Status:** Approved (brainstorm), ready for implementation plan
**Branch context:** `feat/smart-drops-planner` (extends PR #59)
**Extends:** `2026-06-13-smart-drops-planner-design.md`

## Problem

The shipped planner sorts **all** games by pure EDF (earliest deadline first), deliberately
ignoring the user's priority list. That conflicts with how the watch engine actually behaves:

- **`obeyPriority` ON (strict):** the engine farms **only** priority-list games, in priority
  order, with **no fallback** (it goes idle if none are actionable).
- **`obeyPriority` OFF (permissive):** the engine farms priority games first (in priority
  order), then falls back to any game with earnable drops.

So when a user runs strict + a priority list, the planner advises "watch game X first" for games
the engine will **never** touch, and orders priority games by deadline rather than the priority
order the engine actually follows. The advice contradicts reality.

## Goal

Make the plan **mirror the engine's actual farming order**, and turn deadlines into a **risk
warning layer** rather than the sort key. The plan answers: *"given how the engine actually
farms (my priority order), which drops will I still finish before they expire?"* — e.g. "Rust is
priority #4 but expires in 2h → you won't reach it."

Still **advisory only**: display-only, reads settings, no engine/IPC/`useAppModel` changes.

## Ordering model (replaces pure-EDF sort)

The plan's game order is the **engine order**:

| `priorityGames` | `obeyPriority` | Games shown | Order |
| --- | --- | --- | --- |
| non-empty | **true** (strict) | priority games only | priority order |
| non-empty | **false** (permissive) | priority games + fallback games | priority order, then fallback (EDF) |
| **empty** | false | all games | pure EDF (unchanged from v1) |
| **empty** | true | none | empty plan |

- A **priority game** = a game group whose `normalizeGameName(gameLabel)` matches a
  `normalizeGameName(priorityGames[i])`. Its `priorityRank` = `i + 1` (1-based; priority order).
  A priority game with no earnable drops simply produces no row (not shown).
- **Fallback games** (permissive only) = the remaining game groups, sorted among themselves by
  the existing EDF rule (`deadlineMs` asc, null last, tiebreak by longest remaining then key).
- The **feasibility walk runs along this combined order** (unchanged mechanics): a cursor
  accumulates `watchMinutes` game by game; each drop is feasible iff it completes before its own
  deadline at its position in the order. A game you won't reach in time is flagged
  `partial`/`lost` and **stays in its priority position** (never re-sorted up).

The v1 tested core is otherwise unchanged: filtering (`isPlannableDrop`), per-game grouping via
`normalizeGameName`, per-drop parallel-deadline feasibility, and `ok`/`partial`/`lost` status.

> **Implementation note (DRY):** the priority-first / strict-no-fallback partition mirrors
> `buildLivePriorityPlan` in `shared/hooks/priority/usePriorityOrchestration.ts`. Reuse
> `normalizeGameName` for matching; if a clean pure ordering helper can be shared with the
> orchestration without dragging in hook state, prefer that over duplicating the rule. Otherwise
> implement the partition inline in the pure planner and keep it consistent with the orchestration
> semantics.

## API change (`dropsPlanner.ts`)

`buildDropsPlan` gains an optional third argument; omitting it preserves v1 behavior (so existing
2-arg call sites and tests are unaffected):

```ts
export type DropsPlanOptions = {
  priorityGames: string[];
  obeyPriority: boolean;
};

export function buildDropsPlan(
  items: InventoryItem[],
  now: number,
  options?: DropsPlanOptions, // default: { priorityGames: [], obeyPriority: false } → pure EDF
): PlanEntry[];
```

`PlanEntry` gains two fields (everything else unchanged):

```ts
  isPriority: boolean;          // on the priority list
  priorityRank: number | null;  // 1-based priority position; null for fallback games
```

## UI (`DropsPlanCard.tsx`)

- The card reads `const { priorityGames, obeyPriority } = useSettingsStore();` and passes them as
  `buildDropsPlan(items, now, { priorityGames, obeyPriority })`. **No new props, no `OverviewView`
  / `useAppModel` plumbing** (it stays mounted as `<DropsPlanCard items={items} />`).
- **Rank cell:** priority games show their priority position — `#{priorityRank}` (e.g. `#1`).
  Fallback games show a `·` marker instead of a number.
- **Fallback divider (permissive only):** when the plan contains at least one priority entry
  **and** at least one fallback entry, render a thin divider row labelled `plan.fallbackDivider`
  immediately before the first fallback entry (rendered as `— {label} —`). In strict mode there
  are no fallback rows, so no divider appears.
- Status pills (`ok`/`partial`/`lost`), the at-risk/lost treatment, progress bar, deadline
  countdown, urgency accent, and the `plan.feasibleCount` header are unchanged from v1.
- Empty state (`plan.empty`) covers the strict-with-no-actionable-priority-game case (the plan is
  simply empty). Surfacing expiring non-priority games as a nudge was explicitly considered and
  declined for this iteration (YAGNI).

## i18n

One new key in **both** EN and DE blocks of `i18n.tsx`:

| key | EN | DE |
| --- | --- | --- |
| `plan.fallbackDivider` | then (fallback) | danach (Fallback) |

(The component wraps it as `— then (fallback) —`; dashes are added in JSX, not the string.)

## Edge cases

- **Empty `priorityGames`, permissive** → no priority groups → pure EDF over all games (v1 behavior preserved).
- **Empty `priorityGames`, strict** → no priority groups and no fallback → empty plan.
- **Priority game not in inventory / no earnable drops** → no row (absent), no error.
- **A priority game that is also expired/excluded/etc.** → already removed by `isPlannableDrop`
  before partitioning.
- **Duplicate or differently-cased priority entries** → matched via `normalizeGameName`; the
  lowest matching index wins for `priorityRank`.

## Testing (`dropsPlanner.test.ts`)

Add to the existing suite (all v1 tests must still pass unchanged):

- Strict mode shows **only** priority games, in priority order (non-priority games excluded).
- Permissive mode: priority games first (priority order), then fallback games EDF-sorted; the
  boundary is detectable via `isPriority` / `priorityRank`.
- `priorityRank` equals the 1-based index in `priorityGames` (and matches via `normalizeGameName`,
  e.g. `"rust"` in the list matches a `"Rust"` game).
- Feasibility along priority order: a later priority game becomes `lost` because earlier
  priority games consume the watch-minute budget (deadline-risk warning), while EDF order would
  have made it feasible — proves order drives feasibility.
- Empty `priorityGames` + permissive → identical result to a v1 (no-options) call (pure EDF).
- Empty `priorityGames` + strict → `[]`.

The card remains untested (project convention); all logic stays in the pure function.

## Files touched

| File | Change |
| --- | --- |
| `src/renderer/shared/domain/dropsPlanner.ts` | add `DropsPlanOptions`, partition/order logic, `isPriority`/`priorityRank` |
| `src/renderer/shared/domain/dropsPlanner.test.ts` | new priority-ordering tests |
| `src/renderer/features/overview/DropsPlanCard.tsx` | read `useSettingsStore`, pass options, priority rank + fallback divider |
| `src/renderer/shared/i18n.tsx` | new `plan.fallbackDivider` (EN + DE) |

No changes to `src/main`, IPC, preload, the watch engine, priority orchestration, `useAppModel`,
`AppContent`, or `OverviewView`.
