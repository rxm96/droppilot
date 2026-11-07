# UI Polish Phase 4 — Games View Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Executed inline (autonomous run).

**Goal:** Rebuild the games view (view key `priorities`, label "games"): title + one-line
explanation, a "your order" panel (ranked rows with ▲ ▼ ✕, `● farming` / `needs link` pills,
mono meta line, inline "add any game by name" field), an "other games with drops" panel with
`+ add` per game (replaces the "add from your drops" dropdown), and the fallback rule as two
radio options (Wait / Farm other games meanwhile) mapped to `obeyPriority` (replaces the
"strict priority order" checkbox). The header stat strip goes.

**Spec:** `docs/superpowers/specs/2026-11-06-ui-polish-redesign-design.md` (games). **Mockup:** `PolGames` board.

## Global constraints

Same as phases 1–3: pure-function tests only, EN + DE keys, CHANGELOG lines, prettier,
Conventional Commits with the `Co-Authored-By` trailer, no watch-engine behavior change.

## Engine facts the copy must match

Checked in `usePriorityOrchestration.ts`:

- `obeyPriority = true` ("Wait"): `computePriorityOrder` returns only the user's games;
  `computeBestActionableGame` returns `""` when none is actionable, the target clears and
  `stopWatching()` runs. → "Stay idle until one of your games has drops again." is true.
- `obeyPriority = false` ("Farm other games meanwhile"): the order is the user's games, then
  every other game with drops. `computeNextActiveTargetGame` keeps the current target while it
  still has drops (no preemption, except right after a list edit). So the mockup's "switch back
  as soon as yours are ready" is **not** true; the copy says DropPilot goes back to your games
  once that game is finished.
- Moving on when no channel with drops is live happens through stall handling
  (`decideIdleNoFarmable` / retarget), so the intro line is true.

## Row rules

- **Ranked rows** (`priorityGames`, stored spelling, so ▲ ▼ ✕ act on the stored names):
  rank `01…`, code tile (`gameCode`, campaign image when there is one), name, meta.
- **Meta:** `N drops left` (drops whose `classifyDrop` bucket is neither claimed nor expired),
  `ends in X` (earliest future `endsAt` of those drops, `formatEndsIn`), `N live` only for the
  game whose channel list is loaded (`channelsGame`, channels with drops), else omitted.
  No open drops → `no drops right now`.
- **`● farming`:** the game of the stream being watched (`watching.game`), so nothing is marked
  while paused or idle — matches the drops view's `watching` rows.
- **`needs link`:** some farm-plan row of the game has `planRowStatus === "needs-link"` (same
  rule as the plan table and the drops view).
- **Other games:** inventory games with open drops that are not in the list
  (`sameGameName`), by name, same meta (`N drops`), `+ add` → `addGameByName`. The title
  says "not farmed" under Wait and "only farmed meanwhile" under Farm other games meanwhile;
  a game being farmed meanwhile gets the `● farming` pill there.
- **▲ ▼:** `adjacentGame(list, game, ±1)` → `movePriorityGame(game, neighbour)` (adjacent
  `arrayMove` = swap). Drag and drop (dnd-kit, already there and working) stays behind a
  hover grip.

## File map

| File                                                                                                                                                | Change                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `features/priority/gamesModel.ts` (+test)                                                                                                           | New: `buildGamesView`, `adjacentGame`, `fallbackRuleFor`, `obeyPriorityFor`. |
| `features/priority/PriorityView.tsx`                                                                                                                | Rewritten: title, two panels, fallback fieldset.                             |
| `features/priority/GamesOrderPanel.tsx`                                                                                                             | New: ranked rows (▲ ▼ ✕, grip, pills, meta) + add field.                     |
| `features/priority/OtherGamesPanel.tsx`                                                                                                             | New: other games with `+ add`, empty line.                                   |
| `features/priority/FallbackRuleFieldset.tsx`                                                                                                        | New: two radio options.                                                      |
| `shared/components/GameTile.tsx`                                                                                                                    | Tile extracted from `DropGroup.tsx` (shared by drops and games).             |
| `features/priority/PriorityHeader.tsx`, `PriorityAddPanel.tsx`, `PriorityList.tsx`, `PriorityRow.tsx`, `priorityHelpers.ts`, `PriorityView.test.ts` | Deleted (old test intents ported to `gamesModel.test.ts`).                   |
| `shared/hooks/priority/usePriorityActions.ts`, `shared/hooks/app/useAppActions.ts`, `useSettingsStore.ts`                                           | `addGameFromSelect` / `selectedGame` removed (only the dropdown used them).  |
| `shared/hooks/app/useAppModel.ts`                                                                                                                   | `priorityProps`: items, farm plan, farming game, live channels.              |
| `shared/i18n.tsx`, `CHANGELOG.md`                                                                                                                   | New `games.*` keys (EN + DE), dead `priorities.*` keys removed, changelog.   |

## Tasks

- [ ] 1. `gamesModel.ts` (TDD).
- [ ] 2. `GameTile` extraction; components; PriorityView rewrite; useAppModel wiring.
- [ ] 3. Delete dead code, `selectedGame`/`addGameFromSelect`, dead keys.
- [ ] 4. CHANGELOG; verification (lint, format, typecheck, test, build). No visual check (no windows this run).

## Tests (names)

`gamesModel.test.ts`:

- `fallbackRuleFor` / `obeyPriorityFor`: "Wait is obeyPriority on", "farm other games is
  obeyPriority off", "round-trips".
- `adjacentGame`: "previous game for up", "next game for down", "null at the ends and for
  unknown games".
- `buildGamesView`:
  - "ranks the user's games in their order with padded ranks and codes"
  - "counts open drops and the earliest end, skipping claimed and expired drops"
  - "says no drops when a ranked game has none open"
  - "shows live channels only for the game whose channels are loaded"
  - "marks the watched game as farming, matching names case-insensitively"
  - "marks games with a link-blocked plan row as needing a link"
  - "lists other games with open drops by name, without the user's games"
  - "keeps games that are not in the list" / "is empty when every game with drops is listed"
    (ported from `PriorityView.test.ts`)
  - "leaves games with only claimed or expired drops out of the other games"
  - "uses the campaign image for the tile when there is one"
