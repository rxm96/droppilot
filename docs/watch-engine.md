# Watch Engine

How DropPilot decides **what to watch, when to switch, and when to give up** on a
game. Two pieces work together:

- **Suppression reducer** — `src/renderer/shared/hooks/watch/watchEngine.ts`. A pure
  state machine that prevents the auto-watcher from immediately re-picking a game the
  user just stopped or that just stalled.
- **Stall recovery** — driven by `useAppModel` (`src/renderer/shared/hooks/app/useAppModel.ts`)
  with helpers in `watchStallRecovery.ts`. Detects "no watch-time progress" and
  decides whether to switch channels or retarget to the next priority game.

For the end-to-end runtime sequence (priority → channels → ping → stall), see
[`watch-flow.puml`](watch-flow.puml).

## Why it exists

Without suppression, the auto-watcher bounces: you stop game A, the next render
re-selects A, you stop it again, forever. The suppression reducer encodes three goals:

- don't immediately re-select a game that was just stopped or stalled,
- keep priority progression moving to the next game,
- don't loop back to a recently stalled game.

## Suppression state

`WatchEngineState` (in `watchEngine.ts`):

| Field | Meaning |
| --- | --- |
| `suppressedTargetGame` | The game currently hidden from auto-selection (`""` = none). |
| `suppressionReason` | `"manual-stop"` \| `"stall-stop"` \| `null`. |
| `suppressedAt` | Timestamp the suppression started (`null` when unsuppressed); drives the hold windows. |

## Events

The reducer is event-driven. `useAppModel` dispatches:

| Event | Effect |
| --- | --- |
| `target/manual_set` | User picked a target manually → clears suppression. |
| `watch/manual_start` | User started watching → clears **only** if it matches the suppressed game. |
| `watch/stop` | Manual stop on the active target → suppress with reason `manual-stop`. |
| `watch/stall_stop` | Stall-recovery stop → suppress with reason `stall-stop`. |
| `sync` | Periodic reconciliation from the current target + currently-watched game. |

## Suppression rules

Two hold windows govern how long a game stays suppressed:

| Constant | Value | Applies to |
| --- | --- | --- |
| `MANUAL_STOP_SUPPRESSION_HOLD_MS` | `120_000` (2 min) | manual-stop |
| `STALL_STOP_SUPPRESSION_HOLD_MS` | `60_000` (1 min) | stall-stop |

### manual-stop

Starts immediately on `watch/stop`. It clears when:

- the user manually selects a target (`target/manual_set`), or
- the user manually starts the same game (`watch/manual_start`), or
- a `sync` reports a **different** game is now being watched (clears immediately), or
- the app is idle / still on the same game **and** the 2-minute hold has elapsed —
  then `sync` clears it, so a newly-discovered campaign can be picked up.

### stall-stop

Starts on `watch/stall_stop`. During the 1-minute hold, suppression always remains.
After the hold, on `sync`:

- if the **same** stalled game is still being watched → stay suppressed,
- if idle (`watchingGame === ""`) or a **different** game is watched → clear.

This avoids bounce-back while still letting a stalled game re-enter the priority flow
once things stabilize.

> A timeout in `useAppModel` dispatches a `sync` when a hold expires, so suppression
> can resolve even when no unrelated React state changed.

## Selectors (used by `useAppModel`)

- `selectVisibleTargetGame(state, activeTargetGame)` — the target to show/act on
  (`""` when suppressed).
- `selectIsTargetSuppressed(state, activeTargetGame)` — boolean check.
- `shouldForceClearWatchingOnSuppressedTarget(state, watchingGame)` — safety clear so
  the app never keeps watching a now-suppressed game.

## Stall recovery flow

When a watched drop makes no progress within the no-progress window, `useAppModel`:

1. Detects the no-progress window has elapsed (shorter near the end of a drop).
2. Tries **channel-level recovery first** — switch to another eligible channel for
   the same drop.
3. Limits channel retries; once exhausted (or no channel is viable),
4. **retargets** to the next priority candidate (next *actionable* game, else next
   priority entry anyway — so the list keeps moving),
5. applies `watch/stall_stop` suppression on the stalled game.

Relevant constants in `useAppModel.ts`:

| Constant | Value | Meaning |
| --- | --- | --- |
| `STALL_NO_PROGRESS_WINDOW_MS` | `15 * 60_000` | No-progress window (normal). |
| `STALL_NO_PROGRESS_WINDOW_NEAR_END_MS` | `3 * 60_000` | Tighter window near a drop's end. |
| `STALL_RECOVERY_COOLDOWN_MS` | `60_000` | Min gap between recovery actions. |
| `STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS` | `2` | Channel switches before retargeting. |
| `STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END` | `1` | Same, near a drop's end. |
| `NO_FARMABLE_GAME_COOLDOWN_MS` | `10 * 60_000` | Cooldown for a game with no farmable drop. |
| `NO_PROGRESS_GAME_COOLDOWN_MS` | `30 * 60_000` | Cooldown for a persistently stalled game. |

The watch ping itself lives in `useWatchPing.ts` (`WATCH_INTERVAL_MS = 59_000`, plus
up to `WATCH_JITTER_MS = 8_000` jitter); each successful ping is what advances
watch-time, so "no progress" is measured against it.

## Observability

Grep these log keys when debugging suppression/recovery transitions:

- `watch-engine: event`
- `watch-engine: suppression`
- `watch-engine: retarget`

## Tests

- `src/renderer/shared/hooks/watch/watchEngine.test.ts`
- `src/renderer/shared/hooks/watch/watchStallRecovery.test.ts`
- `src/renderer/shared/hooks/priority/usePriorityOrchestration.test.ts`
