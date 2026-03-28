# Watch Engine

This document describes the suppression reducer in `src/renderer/shared/hooks/watch/watchEngine.ts`
and how `useAppModel` drives it.

For the end-to-end runtime sequence (priority, channels, ping, stall recovery),
see `docs/watch-flow.puml`.

## Purpose

`watchEngine` prevents unstable auto-watch behavior when users stop manually or when
stall recovery needs a temporary visibility hold.

Core goals:

- avoid immediate re-selection of a game that was just stopped or stalled
- keep priority progression moving to the next game
- keep suppression state aligned with what the UI should hide
- avoid deciding recovery strategy inside the suppression reducer

## State

`WatchEngineState` has three fields:

- `suppressedTargetGame`: currently suppressed game (empty string means none)
- `suppressionReason`: `"manual-stop" | "stall-stop" | null`
- `suppressedAt`: timestamp used for suppression hold timing (`null` when unsuppressed)

## Events

`watchEngine` is event-driven:

- `target/manual_set`: user picked a target manually; clears suppression
- `watch/manual_start`: user started watching; clears only if it matches suppressed game
- `watch/stop`: manual stop on active target; sets suppression with reason `manual-stop`
- `watch/stall_stop`: stall-recovery stop; records the suppression hold with reason `stall-stop`
- `sync`: periodic reconciliation from current target + current watching game

## Suppression Rules

### manual-stop

- Suppression starts immediately on `watch/stop`.
- Hold window is `MANUAL_STOP_SUPPRESSION_HOLD_MS` (currently `120_000` ms).
- It clears on:
  - manual target selection (`target/manual_set`)
  - manual start of same game (`watch/manual_start`)
  - `sync` once a different game is actively watched
  - `sync` after the hold window expires while idle or still on the same game

The manual-stop hold exists to prevent bounce-back while the user is idle, but it
still allows a later re-target once the window has passed.

### stall-stop

Suppression starts on `watch/stall_stop`.
Hold window is `STALL_STOP_SUPPRESSION_HOLD_MS` (currently `60_000` ms).
During hold, suppression always remains.
After hold:

- if the same stalled game is still being watched, suppression remains
- if watch state is idle (`watchingGame === ""`) or a different game is watched, suppression clears

This policy keeps the target hidden long enough to avoid bounce-back, but it does
not decide whether recovery should retry the same game or escalate elsewhere.

## Stall Recovery

Stall recovery is driven by `src/renderer/shared/hooks/watch/watchStallRecovery.ts`.
It owns the explicit recovery state machine and the same-game-first decision flow.

Phases:

- `healthy`
- `suspect_no_progress`
- `confirming_stall`
- `same_game_retry`
- `same_game_cooloff`
- `escalate_to_next_game`

Policy:

1. Detect likely no-progress without acting immediately.
2. Request a confirmation probe.
3. Retry inside the same game first, preferring another eligible channel.
4. Cool off after each same-game action.
5. Escalate to the next priority game only after same-game recovery is exhausted.

`watchEngine` only owns suppression visibility and hold timing. Recovery decisions
and escalation timing stay in the stall-recovery machine and `useAppModel`.

## Integration in `useAppModel`

`useAppModel` dispatches events and uses selectors:

- visibility: `selectVisibleTargetGame(...)`
- safety clear: `shouldForceClearWatchingOnSuppressedTarget(...)`
- reconciliation: `sync` events on relevant state changes
- hold expiry: a timeout dispatches a `sync` event when stall hold expires, so
  suppression can resolve even without unrelated React state changes

When stall recovery escalates, `useAppModel` emits `watch/stall_stop` so the
reducer can hold the suppressed target visible until the hold expires.

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
