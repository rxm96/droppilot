# useChannels Refactor — Design

**Date:** 2026-06-01
**Branch:** `refactor/usechannels-split`
**Status:** Approved (brainstorming) — pending implementation plan

## Goal

`src/renderer/shared/hooks/watch/useChannels.ts` has grown to ~990 lines and accreted
five distinct responsibilities plus a ~100-line forensic-logging apparatus. Split it
into focused, independently understandable units **without changing any runtime
behavior**. The public hook API and its single consumer (`useAppModel.ts`) stay
byte-identical.

This is a **pure structural refactor**: no feature change, no behavior change. Success
is measured by the existing pure-logic tests staying green and a manual smoke of the
watch flow being indistinguishable from `main`.

## Decisions (locked during brainstorming)

| Question                                                                                                          | Decision                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forensic logging (`logChannelPrioritySnapshot` + 5 allowlist-stat helpers, ~100 lines, build debug payloads only) | **Remove entirely** — it was scaffolding for chasing an allowlist-ordering bug. Normal `logInfo`/`logDebug` on fetch success / diff / allowlist-changed stay. |
| Split depth                                                                                                       | **Full split** into 3 behavior hooks (`useChannelFetch`, `useChannelLiveDiff`, `useChannelAutopilot`) over a shared `useChannelStore`.                        |
| Pure-logic location                                                                                               | New `watch/channelEngine.ts`, sibling to the existing `watchEngine.ts` (not a new `domain/channels/` folder).                                                 |
| Allowlist helpers location                                                                                        | Extend the existing `watch/channelAllowlist.ts`.                                                                                                              |
| `hasRecentInventory` (exported, tested, but unused in production)                                                 | **Delete** (dead code).                                                                                                                                       |
| `useReducer` conversion                                                                                           | **No** — tempting but shifts batching timing and adds behavior risk for no required gain. Keep the existing `useState` mutators.                              |

## Architecture

A small shared **store** is the state spine. The 3 behavior hooks the split is named
for all drive that one store — necessary because **fetch and live-diff both write the
same channel list**, and autopilot reads it. Hooks owning separate `useState` could not
share `channels`.

```
useChannels(params)                          ← thin orchestrator (~60 lines); public API unchanged
 ├─ store = useChannelStore(params)          ← state spine
 ├─ fetchChannels =
 │     useChannelFetch({ store, params, shouldTrackChannels, refreshWindowMs })
 ├─ useChannelLiveDiff({ store, params, shouldTrackChannels })
 └─ useChannelAutopilot({ store, params })
 → returns { channels, channelDiff, channelError, channelsLoading,
             channelsRefreshing, autoSwitch, fetchChannels }
```

`shouldTrackChannels` and `TRACKER_REFRESH_WINDOW_MS` (`refreshWindowMs`) are derived
once in the orchestrator (the latter from `trackerMode`) and passed down. The sub-hooks
are invoked in the order **store → fetch → live-diff → autopilot**, matching the order
their effects run today so effect ordering is preserved.

### Responsibility map (where each piece of today's hook goes)

**`useChannelStore`** — owns all returned state + the shared refs + lifecycle resets:

- State: `channels`, `channelDiff`, `channelError`, `channelsLoading`,
  `channelsRefreshing`, `fetchedAt`, `fetchedGame`, `autoSwitch`.
- Refs (shared, updated every render): `channelsRef`, `targetGameRef`,
  `shouldTrackChannelsRef`, `trackerClearedRef`.
- Mutators: `applyChannelsState(next)` (writes `channelsRef` + `setChannels`), plus the
  individual setters (or grouped helpers).
- **Two distinct reset variants** (this distinction is load-bearing — see Behavior
  Preservation): `resetChannelData()` clears list/diff/error/`fetchedAt`/`fetchedGame`
  only; `resetAll()` additionally clears `channelsLoading`/`channelsRefreshing`/
  `autoSwitch`.
- Lifecycle effects: demo-mode reset (`resetAll`) and tracking-disabled cleanup
  (`resetAll` + guarded `trackerClearChannels()` IPC via `trackerClearedRef`).

**`useChannelFetch`** — populates the store:

- `fetchChannels(gameName, { force })`, deduped across demo/real branches via a shared
  private `applyFetchedChannels(prevList, rawList, gameName, now)`.
- Request lifecycle: in-flight dedup (`inFlightGamesRef`), request sequencing
  (`requestSeqRef`, `latestAppliedRequestRef`), stale-response guard, and
  `clearTrackerIfTrackingDisabled`.
- Local `isFresh(game, now)`, built on the pure `isFreshCache` over
  `store.fetchedAt`/`store.fetchedGame` plus `refreshWindowMs`.
- Effects: target-game-change reset (`lastTrackedGameRef` + `resetChannelData` +
  `trackerClearChannels`), fetch-on-active, interval refresh, and allowlist-change
  (re-prioritize current list + force refetch + `allowlistKeyRef` + the normal
  "allowlist changed" `logInfo`).

**`useChannelLiveDiff`** — applies WebSocket diffs to the store:

- The `onChannelsDiff` subscription, `applyPayload`, and the viewer-update debounce
  (`pendingViewerDiffRef`, `viewerFlushTimerRef`, `flushViewerDiff`, 350 ms coalesce).

**`useChannelAutopilot`** — reads channels, drives watching:

- Auto-select effect (`shouldAutoSelectChannel` → `setWatchingFromChannel`).
- Auto-switch effect (`computeAutoSwitchAction` + `isManualPriorityOverrideActive` →
  `setWatchingFromChannel`/`clearWatching` + `store.setAutoSwitch`).

## File Layout

| File                             | Change      | Contents                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `watch/channelEngine.ts`         | **new**     | Pure channel-list logic moved verbatim: `sameChannel`, `mergeChannelList`, `sortChannelsByViewers`, `applyLiveDiff`, `mergeViewerLiveDiff`, `buildChannelDiff`, `isFreshCache`, `shouldAutoSelectChannel`, `computeAutoSwitchAction`, `isManualPriorityOverrideActive`, `shouldClearTrackerAfterStaleResponse`. **`hasRecentInventory` deleted.** |
| `watch/channelAllowlist.ts`      | **extend**  | Add `normalizeAllowlist`, `prioritizeChannelsByAllowlist`, `buildAllowlistKey` (allowlist logic; file already owns `DropChannelRestriction`).                                                                                                                                                                                                     |
| `watch/channelEngine.test.ts`    | **moved**   | Today's `useChannels.test.ts`, imports repointed to `./channelEngine`; the `hasRecentInventory` assertion dropped. Other assertions unchanged.                                                                                                                                                                                                    |
| `watch/channelAllowlist.test.ts` | **extend**  | Add cases for the relocated `prioritizeChannelsByAllowlist` / `buildAllowlistKey` / `normalizeAllowlist`.                                                                                                                                                                                                                                         |
| `watch/useChannelStore.ts`       | **new**     | State-spine hook (above).                                                                                                                                                                                                                                                                                                                         |
| `watch/useChannelFetch.ts`       | **new**     | Fetch hook (above).                                                                                                                                                                                                                                                                                                                               |
| `watch/useChannelLiveDiff.ts`    | **new**     | Live-diff hook (above).                                                                                                                                                                                                                                                                                                                           |
| `watch/useChannelAutopilot.ts`   | **new**     | Autopilot hook (above).                                                                                                                                                                                                                                                                                                                           |
| `watch/useChannels.ts`           | **slimmed** | Thin orchestrator only; still the public export.                                                                                                                                                                                                                                                                                                  |
| `watch/index.ts`                 | **verify**  | Still `export * from "./useChannels"`. If any external module imports the moved pure fns through the barrel, re-export them from `channelEngine`/`channelAllowlist` to preserve those paths.                                                                                                                                                      |

**Deleted entirely** (~100 lines): `logChannelPrioritySnapshot`, `getAllowlistMatchKind`,
`countAllowlistedChannels`, `findFirstAllowlistedIndex`, `buildChannelPrioritySample`,
`isWatchingAllowlisted`, and all three `logChannelPrioritySnapshot(...)` call sites.

## Cleanups folded in (still zero behavior change)

- **`fetchChannels` de-duplication.** The demo branch (today ~576–612) and real branch
  (~613–680) repeat the same `prioritize → stale-guard → buildChannelDiff → merge →
setState → setFetchedAt/Game` tail almost verbatim, and the stale-response guard
  appears three times. Extract one `applyFetchedChannels(...)` both branches call and
  one stale-guard helper. ~40 lines removed; sequence preserved exactly.
- **Dead code.** `hasRecentInventory` removed.

## Behavior Preservation (non-negotiable)

`docs/watch-engine.md` flags this as the subtle subsystem. Guardrails:

1. **Two reset variants must stay distinct.** Today the target-game-change path clears
   list/diff/error/fetch-meta but leaves `autoSwitch` and the loading flags intact,
   whereas demo-reset and tracking-disabled cleanup clear everything. Collapsing these
   into one reset would be a behavior change — keep `resetChannelData()` vs
   `resetAll()` separate.
2. **Shared refs passed by ref object**, not by value, so latest-value reads inside
   callbacks/subscriptions behave identically.
3. **Effect order preserved** via the store → fetch → live-diff → autopilot call order
   in the orchestrator.
4. **`applyFetchedChannels` mirrors the exact current sequence** — in particular setting
   `latestAppliedRequestRef = requestId` _before_ applying state, and keeping the
   stale-guard checks (`gameName !== targetGameRef.current || requestId < latestApplied`)
   in the same positions.
5. **No `useReducer`** (see Decisions) — keep `useState` to avoid batching-timing drift.

## Testing & Verification

Per repo convention (test pure functions, not rendered hooks — no `@testing-library`):

- `channelEngine.test.ts` (moved) must stay green — proves the pure logic is identical.
- `channelAllowlist.test.ts` gains coverage for the relocated allowlist helpers.
- The 4 new hooks stay thin wrappers around the pure engine; no hook-render tests.
- Full local gate (CI does not run on PRs): `npm test` → `npm run typecheck` →
  `npm run lint` → `npm run format:check`.
- Manual smoke via `npm run dev`, diffed against `main`: auto-select, auto-switch on
  channel-offline, allowlist priority ordering, demo-mode toggle, live viewer updates.

## Risks

- **Effect-ordering / extra-render regressions** in the subtle watch subsystem →
  mitigated by guardrails 2–3 above and the manual smoke.
- **Stale-closure drift** if a shared ref is dropped or duplicated → centralize the
  shared refs in the store; keep every `ref.current = …` assignment.
- **Scope creep** (e.g. "while we're here, also reduce re-renders") → out of scope;
  behavior stays identical, performance work is a separate task.

## Out of Scope (YAGNI)

- No `useReducer` migration.
- No render/perf optimization beyond what falls out of the split.
- No change to the WS protocol, IPC surface, or the watch engine reducer
  (`watchEngine.ts`) / stall recovery.
- No new features or UI changes.

## Affected / New Files

- `src/renderer/shared/hooks/watch/useChannels.ts` — slimmed to orchestrator.
- `src/renderer/shared/hooks/watch/channelEngine.ts` — **new** (pure logic).
- `src/renderer/shared/hooks/watch/useChannelStore.ts` — **new**.
- `src/renderer/shared/hooks/watch/useChannelFetch.ts` — **new**.
- `src/renderer/shared/hooks/watch/useChannelLiveDiff.ts` — **new**.
- `src/renderer/shared/hooks/watch/useChannelAutopilot.ts` — **new**.
- `src/renderer/shared/hooks/watch/channelAllowlist.ts` — extended (allowlist helpers).
- `src/renderer/shared/hooks/watch/channelEngine.test.ts` — **new** (moved from
  `useChannels.test.ts`, which is deleted).
- `src/renderer/shared/hooks/watch/channelAllowlist.test.ts` — extended.
- `src/renderer/shared/hooks/watch/index.ts` — verify barrel exports.
