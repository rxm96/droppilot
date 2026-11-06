# UI Polish Phase 3 — Drops View Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Executed inline (autonomous run).

**Goal:** Rebuild the drops view (view key `inventory`): title + mono subline, search, refresh, a
segmented filter `all · farming · needs you · claimed · not farmed` with counts, drops grouped by
game in farm order, one status-pill vocabulary shared with the overview plan, expired campaigns
in a collapsed section at the bottom. The row-click drawer stays.

**Spec:** `docs/superpowers/specs/2026-11-06-ui-polish-redesign-design.md` (drops). **Mockup:** `PolDrops` board.

## Global constraints

Same as phases 1–2: pure-function tests only, EN + DE keys, CHANGELOG lines, prettier,
Conventional Commits with the `Co-Authored-By` trailer, no watch-engine behavior change.

## Buckets (exact definitions)

Every drop gets exactly one bucket and one status. `classifyDrop` checks, in order:

| #   | Condition                                                                                         | Bucket       | Status                                |
| --- | ------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------- |
| 1   | `status === "claimed"`                                                                            | `claimed`    | `claimed` (expired campaign: section) |
| 2   | `isClaimable === true` (earned, not claimed; also inside an expired campaign's claim window)      | `needs-you`  | `claim`                               |
| 3   | campaign expired (`campaign_expired` hint, `campaignStatus` EXPIRED, or `endsAt` < now)           | expired      | `expired`                             |
| 4   | has a farm-plan row with a ready time                                                             | `farming`    | the plan's `watching`/`next`/`queued` |
| 5   | has a blocked farm-plan row that needs an account link (same rule as the plan table)              | `needs-you`  | `needs-link`                          |
| 6   | has a blocked farm-plan row for any other reason                                                  | `not-farmed` | `blocked` (reason in the note)        |
| 7   | fully watched (`required > 0`, `earned >= required`) but not claimable yet                        | `farming`    | `queued` (note: waiting for Twitch)   |
| 8   | anything else: game not in the farm sequence, no minutes to watch, not earnable for other reasons | `not-farmed` | `not-farmed`                          |

The farm plan (`buildFarmPlan`, same input as the overview) decides 4–6, so "farming" means
exactly "the engine will watch for this drop", including games farmed meanwhile when the
fallback rule allows it. Blocked rows only exist for ranked games, so "needs link" (5) appears
only for games in the user's list, like the overview's needs-you panel. Expired drops get no
bucket; they are listed in the collapsed expired section (shown under `all` only).

## Order

- Groups: games in the order they first appear in the farm plan, then ranked games without
  plan rows (rank order), then all other games by name.
- Rows in a group: plan rows with a ready time in plan order; then `claim`, `needs-link`,
  `queued` (fully watched), `blocked`, `not-farmed`, `claimed`; ties by required minutes, title, id.

## File map

| File                                                                                                                                       | Change                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `shared/domain/dropStatus.ts`                                                                                                              | New: `DropStatus` union, the one pill vocabulary.                                                      |
| `shared/components/DropStatusPill.tsx`                                                                                                     | New: the shared pill (classes + i18n keys). Plan panel and drops view both use it.                     |
| `features/overview/planTable.ts` (+test)                                                                                                   | Extract `planRowStatus` and `planDropNote`; `PlanTableStatus` becomes a `DropStatus` subset.           |
| `features/overview/PlanPanel.tsx`                                                                                                          | Uses `DropStatusPill`.                                                                                 |
| `features/inventory/dropsModel.ts` (+test)                                                                                                 | `classifyDrop`, `orderGames`, `gameCode`, `formatRank`, `buildDropsView`.                              |
| `features/inventory/InventoryView.tsx`                                                                                                     | Rewritten: header, filter, groups, expired section, drawer.                                            |
| `features/inventory/DropsHeader.tsx`                                                                                                       | New (replaces `InventoryHeader.tsx`).                                                                  |
| `features/inventory/DropsFilter.tsx`                                                                                                       | New segmented control (replaces `InventoryFilterStrip.tsx`).                                           |
| `features/inventory/DropGroup.tsx`                                                                                                         | New: group header + rows (replaces `InventoryTable.tsx`).                                              |
| `features/inventory/InventoryDrawer.tsx`                                                                                                   | Status pill from the row; i18n blocking reason.                                                        |
| `features/inventory/useInventoryViewState.ts`                                                                                              | search, selected drop, expired open (sort + paging gone).                                              |
| `features/inventory/inventoryFilters.ts`, `InventoryView.test.ts`, `InventoryTable.tsx`, `InventoryFilterStrip.tsx`, `InventoryHeader.tsx` | Deleted (intents of the old tests ported to `dropsModel.test.ts`).                                     |
| `features/inventory/inventoryFormatters.ts`                                                                                                | Only `dropTitleFallback` + `pickDisplayBlockingReason` stay.                                           |
| `shared/types.ts`                                                                                                                          | `FilterKey` = `all · farming · needs-you · claimed · not-farmed`.                                      |
| `shared/hooks/app/useAppModel.ts`                                                                                                          | `inventoryProps` get the farm plan, ranked games, live active drop, channel name; game filter removed. |
| `shared/i18n.tsx`, `CHANGELOG.md`                                                                                                          | New `drops.*` / `dropStatus.*` keys (EN + DE), dead keys removed, changelog lines.                     |

## Tasks

- [ ] 1. `DropStatus` + `DropStatusPill`; extract `planRowStatus`/`planDropNote` (TDD), PlanPanel uses the pill.
- [ ] 2. `dropsModel.ts` (TDD): `classifyDrop`, `orderGames`, `gameCode`, `formatRank`, `buildDropsView`.
- [ ] 3. Components: header, filter, group, expired section, drawer; InventoryView rewrite.
- [ ] 4. useAppModel wiring, `FilterKey`, delete dead code and keys.
- [ ] 5. CHANGELOG; verification (lint, format, typecheck, test, build). No visual check (no windows this run).

## Tests (names)

`planTable.test.ts`: `planRowStatus` — "maps a blocked row with account_not_linked to needs-link",
"keeps timed rows' plan status"; `planDropNote` — "ends-first beats ends-soon", "null for blocked rows".

`dropsModel.test.ts`:

- `classifyDrop`: "claimed drops are claimed", "claimable drops need you, even after the campaign
  ended", "expired campaigns go to the expired section", "plan rows with a ready time are farming
  with the plan's status", "blocked plan rows that need a link need you", "other blocked plan rows
  are not farmed", "fully watched but not claimable is farming/queued", "games outside the farm
  sequence are not farmed", "zero-minute drops stay visible as not farmed".
- `orderGames`: "plan order first, then ranked games, then the rest by name", "matches game names
  case-insensitively".
- `gameCode`: "three letters for one word", "initials for several words".
- `formatRank`: "English ordinals", "German ordinal dot".
- `buildDropsView`: "groups by game in farm order with rank and campaign meta", "filters by bucket
  and counts every bucket", "search matches drop, game and campaign", "hides groups without
  visible rows", "expired drops only in the expired section", "uses live minutes for the watched
  drop", "marks groups that need a link with the campaign's link url", "orders rows inside a game".
