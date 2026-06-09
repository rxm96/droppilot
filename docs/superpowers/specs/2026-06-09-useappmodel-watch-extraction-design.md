# useAppModel Watch Extraction — Design

**Date:** 2026-06-09
**Branch:** `refactor/useappmodel-watch-extraction` (stacked on `refactor/usechannels-split`)
**Status:** Approved (brainstorming) — pending implementation plan

## Goal

`src/renderer/shared/hooks/app/useAppModel.ts` is 1625 lines with 19 `useEffect`
blocks. The watch/stall orchestration — suppression sync, hold-expire timers,
stalled-game cooldowns, retarget policy, the 285-line stall-recovery effect, and the
`watchEngineSnapshot` decision classifier — lives inline and is untestable under the
project convention (pure functions only, no rendered-hook tests). This is the most
subtle subsystem in the app (`docs/watch-engine.md`) and its orchestration has zero
test coverage.

Extract it into sibling hooks under `shared/hooks/watch/` (app-level periphery under
`shared/hooks/app/`) and pull the **policy** into pure, unit-tested decision
functions. `useAppModel` becomes composition + props assembly (~700 lines).

This is a **strictly behavior-preserving refactor**: identical dependency arrays,
identical log lines (messages and fields — they are the debugging tool), identical
constants (they move with their module). Any real bug discovered along the way is
documented in the PR description / an issue, **not** fixed inline.

## Decisions (locked during brainstorming)

| Question                      | Decision                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                         | **Core + periphery** — everything watch-related leaves `useAppModel`, including the small self-contained pieces (claim probe, drop poll, activity feed, session meta). |
| Branch base                   | Stacked on `refactor/usechannels-split` (unmerged, touches the same files). PR base = that branch.                                                                     |
| Extraction style              | **Decision/executor split** (approach B): policy becomes pure functions returning action descriptors; hooks are thin executors. Not a 1:1 mechanical move.             |
| Props assembly (lines ~1384+) | **Stays in `useAppModel`** — trivial, and assembling view props is its remaining job.                                                                                  |
| Discovered bugs               | Document, don't fix. Refactor commits stay behavior-preserving.                                                                                                        |
| Test posture                  | New tests pin **current** behavior (written against the 1:1-ported logic, not desired behavior).                                                                       |

## Architecture

### New pure modules (all with tests, in `shared/hooks/watch/`)

| File                             | Contents                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gameCooldowns.ts`               | Cooldown-map logic: `upsertCooldown` (monotonic max), `pruneExpired`, `isInCooldown`, `filterCategoriesForOrchestration` (hides suppressed/cooled-down games from priority orchestration). |
| `retargetPolicy.ts`              | `rotateToNextPriorityTarget` — the priority rotation from `getNextPriorityTargetGame`, blocked-game predicates passed as parameters.                                                       |
| `watchDecision.ts`               | `deriveWatchDecision` — the 10-way `decision` classifier currently inside the `watchEngineSnapshot` memo.                                                                                  |
| `watchStallRecovery.ts` (extend) | Three new decision functions: `decideIdleNoFarmable`, `decideWatchingNoFarmable`, `decideNoProgressRecovery` (see below).                                                                  |
| `watchEngine.ts` (extend)        | `stampWatchEngineEvent` — the timestamp-stamping logic from the dispatch wrapper.                                                                                                          |

### New hooks (thin executors/wrappers)

| Hook                            | Takes over from `useAppModel` (line refs at time of writing)                           |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `watch/useStalledGameCooldowns` | Cooldown state + ref mirror + expiry timer (159–324)                                   |
| `watch/useWatchEngine`          | Reducer + stamped dispatch with diff logging (138–239)                                 |
| `watch/useWatchSuppressionSync` | Sync/force-clear effect + hold-expire timer (629–686)                                  |
| `watch/useStallRecovery`        | The 285-line stall effect + stall-stop retarget effect (688–708, 936–1220) as executor |
| `watch/useWatchEngineSnapshot`  | Snapshot memo (1260–1382), uses `deriveWatchDecision`                                  |
| `watch/useDropProgressPoll`     | Reactive GQL drop-progress poll (441–459)                                              |
| `watch/useClaimProbe`           | Near-end inventory claim probe (897–934)                                               |
| `watch/useWatchSessionMeta`     | `watchStartedAt` session stamp + `lastWatchedChannelIdentity` (347–377)                |
| `app/useActivityFeedWiring`     | The 4 rising-edge activity-feed effects (828–895)                                      |
| `app/useActiveCampaignDebugLog` | Signature-deduplicated campaign debug log (732–773)                                    |

### Decision/executor split

Decision functions are pure: they take a state snapshot and return **action
descriptors**; the hook only executes them. Action union (in `watchStallRecovery.ts`):

```ts
type StallRecoveryAction =
  | { kind: "switch-channel"; channel: ChannelInfo }
  | { kind: "set-cooldown"; game: string; durationMs: number; reason: CooldownReason }
  | { kind: "retarget"; from: string; to: string; reason: string }
  | { kind: "enable-auto-select" }
  | { kind: "stop-watching" }
  | { kind: "dispatch-stall-stop"; game: string }
  | { kind: "refresh-channels"; game: string }
  | { kind: "refresh-inventory" };
```

The three branches of the giant stall effect become:

- `decideIdleNoFarmable(input)` — the "not watching" branch: allowlist check,
  cooldown + retarget + `stall_stop`.
- `decideWatchingNoFarmable(input)` — "watching but no active drop": grace period,
  candidate channels via `pickStallRecoveryChannel`, fallback channel, else escalate.
- `decideNoProgressRecovery(input)` — branch 3: composes the existing pure helpers
  (`evaluateNoProgressStall`, `shouldProbeNoProgressConfirmation`) and returns
  `{ tracker, confirmationProbe, actions }` — tracker/probe state flows in and out as
  values; the refs live in the executor hook. Same pattern `evaluateNoProgressStall`
  already uses.

The executor maps actions 1:1 onto `setWatchingFromChannel`, `setStalledGameCooldown`,
`setActiveTargetGame`, `dispatchWatchEngineEvent`, … and logs the same `logInfo` lines
as today, per action.

### Data flow / hook order in `useAppModel`

The suppression↔orchestration cycle is preserved, just made explicit. Hook call order
in `useAppModel` stays exactly as today:

```
useWatchEngine ─┐
                ├→ filterCategoriesForOrchestration → usePriorityOrchestration
useStalledGame ─┘                                        │ activeTargetGame, priorityOrder
Cooldowns                                                ↓
        selectVisibleTargetGame → targetGame / displayTargetGame
                                                         ↓
                          useTargetDrops / useChannels (unchanged)
                                                         ↓
        useWatchSuppressionSync + useStallRecovery (effects) ──→ dispatch/setters
                                                                  (feed back into state)
```

Two subtleties that get explanatory comments (matching the doc-commit style of the
useChannels split):

- `stallCheckHeartbeat` (= `watchStats.nextAt`) stays in `useStallRecovery`'s deps —
  it clocks the stall evaluation once per watch ping.
- Dependency arrays of moved effects stay **1:1 identical**; a deviation would be a
  behavior change.
- `useWatchEngineSnapshot` reads the stall tracker non-reactively (today:
  `watchStallTrackerRef.current` inside a memo). `useStallRecovery` returns the ref;
  read behavior unchanged.

## Error handling

Preserved as-is: the claim probe keeps its try/finally in-flight guard, fetch calls
remain `void`-ed promises with their existing internal error handling, the executor
introduces no new throw paths.

## Testing

New test files (Vitest, pure functions only, per project convention — hooks stay
untested):

- `gameCooldowns.test.ts` — upsert monotonicity, prune, isInCooldown,
  orchestration filter (suppressed game, cooled-down game, empty fast path).
- `retargetPolicy.test.ts` — rotation order, dedup, blocked-game skipping,
  actionable-first fallback, empty list.
- `watchDecision.test.ts` — table-driven over all 10 decision outcomes.
- `watchEngine.test.ts` (extend) — `stampWatchEngineEvent` (stamps only when absent,
  per event type).
- `watchStallRecovery.test.ts` (extend) — table-driven over branch outcomes for the
  three `decide*` functions: idle/grace/candidate-found/fallback/escalation; recovery
  budget normal vs. near-end; confirmation-probe gating.

## Commit plan

Each commit individually green (`npx tsc --noEmit` + `npm test`), one concern per
commit, `refactor(watch):` / `test(watch):` / `docs(watch):` prefixes:

1. **Periphery** (5 small commits): `useDropProgressPoll`, `useClaimProbe`,
   `useWatchSessionMeta`, `useActivityFeedWiring`, `useActiveCampaignDebugLog`.
2. **Cooldowns**: `gameCooldowns.ts` pure + tests → `useStalledGameCooldowns` + wiring.
3. **Engine dispatch**: `stampWatchEngineEvent` + test → `useWatchEngine`.
4. **Suppression sync**: `useWatchSuppressionSync`.
5. **Retarget policy**: `retargetPolicy.ts` + tests → replace inline callback.
6. **Stall decisions** (3 commits): one per `decide*` function, each with tests
   pinning current behavior.
7. **Executor**: `useStallRecovery`, remove the giant effect.
8. **Snapshot**: `watchDecision.ts` + tests → `useWatchEngineSnapshot`.
9. **Wrap-up**: update `docs/watch-engine.md` ("driven by useAppModel" → new hook
   names), `watch/index.ts` exports, final cleanup.

## Verification

Per commit: typecheck + tests. At the end: `npm run lint`, `npm run format:check`,
`npm run build`, plus a demo-mode smoke (`npm run dev`, demo mode on, compare watch
decision in the debug view against the base branch).

## Risks

1. **Behavior drift while decomposing the giant effect** — smallest possible steps,
   decision tests land before the executor swap, log-line parity doubles as a diff
   tool.
2. **Render order of the suppression↔orchestration cycle** — hook call order in
   `useAppModel` stays exactly as today.
3. **Snapshot's non-reactive tracker read** — ref is passed through unchanged.
