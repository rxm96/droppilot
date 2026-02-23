# Watch Engine

This document describes the suppression reducer in `src/renderer/shared/hooks/watch/watchEngine.ts`
and how `useAppModel` drives it.

For the end-to-end runtime sequence (priority, channels, ping, stall recovery),
see `docs/watch-flow.puml`.

## Purpose

`watchEngine` prevents unstable auto-watch behavior when users stop manually or when
stall recovery detects no progress.

Core goals:

- avoid immediate re-selection of a game that was just stopped or stalled
- keep priority progression moving to the next game
- prevent bounce loops back to a recently stalled game

## State

`WatchEngineState` has three fields:

- `suppressedTargetGame`: currently suppressed game (empty string means none)
- `suppressionReason`: `"manual-stop" | "stall-stop" | null`
- `suppressedAt`: timestamp used by stall hold logic (`null` when unsuppressed)

## Events

`watchEngine` is event-driven:

- `target/manual_set`: user picked a target manually; clears suppression
- `watch/manual_start`: user started watching; clears only if it matches suppressed game
- `watch/stop`: manual stop on active target; sets suppression with reason `manual-stop`
- `watch/stall_stop`: stall-recovery stop; sets suppression with reason `stall-stop`
- `sync`: periodic reconciliation from current target + current watching game

## Suppression Rules

### manual-stop

- Suppression starts immediately on `watch/stop`.
- It clears on:
  - manual target selection (`target/manual_set`)
  - manual start of same game (`watch/manual_start`)
  - `sync` once a different game is actively watched

### stall-stop

- Suppression starts on `watch/stall_stop`.
- Hold window is `STALL_STOP_SUPPRESSION_HOLD_MS` (currently `60_000` ms).
- During hold, suppression always remains.
- After hold:
  - if the same stalled game is still being watched, suppression remains
  - if watch state is idle (`watchingGame === ""`) or a different game is watched, suppression clears

This policy avoids bounce-back while still allowing stalled games to re-enter
priority flow after stabilization.

## Integration in `useAppModel`

`useAppModel` dispatches events and uses selectors:

- visibility: `selectVisibleTargetGame(...)`
- safety clear: `shouldForceClearWatchingOnSuppressedTarget(...)`
- reconciliation: `sync` events on relevant state changes
- hold expiry: a timeout dispatches a `sync` event when stall hold expires, so
  suppression can resolve even without unrelated React state changes

Stall recovery flow:

1. detect no progress window
2. try channel-level recovery first
3. limit channel-level retries (`STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS` in `useAppModel`)
4. if retries are exhausted (or no channel is viable), retarget to next priority candidate
5. apply `watch/stall_stop` suppression

## Priority Interaction

Retargeting uses a rotated priority order:

- first try next actionable game
- if none is actionable, fall back to next priority entry anyway

This ensures the priority list is still worked through instead of stalling on
"no actionable game found right now".

## Observability

Useful log keys:

- `watch-engine: event`
- `watch-engine: suppression`
- `watch-engine: retarget`

These logs include suppression transitions and retarget reasons for debugging.

## Tests

Primary tests:

- `src/renderer/shared/hooks/watch/watchEngine.test.ts`
- `src/renderer/shared/hooks/watch/watchStallRecovery.test.ts`
- `src/renderer/shared/hooks/priority/usePriorityOrchestration.test.ts`
