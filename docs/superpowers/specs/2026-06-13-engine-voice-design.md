# Engine Voice — Design

**Date:** 2026-06-13
**Branch:** `feat/engine-voice` (based on `main` post-#60)
**Status:** Approved (brainstorming) — plan pending

## Goal

DropPilot runs unattended for hours, but when something goes sideways it speaks in
machine: the watch engine shows opaque states (`Hold`, `Recover`), claim failures surface
as a raw English `"Drop claim failed"` with no next step, and an expired session ends in a
**silent logout** — the user is dropped back to a signed-out shell with no explanation.
This is the biggest perceived-flakiness gap for a "set-and-forget" tool.

The narration layer is **not greenfield**: `EngineStatusPanel` already maps every watch
decision to a label + "Why / Next" pair + tone, and localized `error.*` strings exist in
both locales. The work is to **fill the gaps** in that layer, in place:

1. **Live countdowns** — the engine's hold/cooldown/no-progress timers are static
   snapshots (`useWatchEngineSnapshot` reads `now` once per memo recompute); make them tick.
2. **Claim narration + retry visibility** — render the localized friendly text via the
   `code` the claim engine already sets (today `HeroPanel` ignores it), and surface the
   already-computed retry backoff as a live "retry in 4m" countdown, with a **transient
   (amber) vs terminal (red)** distinction so an auto-retrying failure stops looking fatal.
3. **In-place re-login** — introduce a distinct `expired` auth state so the dashboard
   stays and a persistent, non-blocking banner offers "Re-login" instead of the silent
   bounce to signed-out.

No watch-engine **behavior** changes; the only behavior change is the auth fatal path
(`logout()` → `markExpired()`). Everything else is presentation over state already on
screen or already computed.

## Decisions (locked during brainstorming)

| Question             | Decision                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                | **B**: narration polish + retry visibility + in-place re-login. (Not A = narration only; not C = + connection-health banner, which overlaps a separate idea.)  |
| Narration location   | **In-place (B).** Extend `controlHelpers` for live ticks; small new pure `claimNarration` helper; auth `expired` + banner as a separate concern. No god view-model. |
| Re-login UX          | **In-place notice via a new `expired` auth state.** Dashboard stays mounted; persistent banner with a Re-login action. Not the "explained signed-out screen".   |
| Retry surface        | **HeroPanel claim line only** in v1 (single active drop). Not per-row in the inventory list. (YAGNI.)                                                            |
| Retry plumbing       | **Enrich `ClaimStatus`** with `nextRetryAt` + `attempts` (computed in the error branch already). Do **not** expose the engine's private retry map.              |
| Voice / tone         | Terse, calm, mono aesthetic. **Transient ≠ terminal**: auto-retrying failures render amber + countdown, not red. Normal lifecycle (offline→switching, already-claimed) is non-alarming. |
| Connection health    | **Out of scope** (separate "Health Dashboard" idea). The only connection state surfaced here is the auth `expired` banner.                                      |

## Architecture

### Strand 1 — Watch-engine live countdowns

**`src/renderer/shared/hooks/watch/useWatchEngineSnapshot.ts`** — expose absolute deadlines
alongside the existing relative values (the absolutes are already in hand here):

- `suppression.holdUntil = suppressedAt + holdMs` (currently only `holdRemainingMs` leaks out).
- `noProgressTracker.sinceProgressAt = stallTracker.lastProgressAt` (currently only `sinceProgressMs`).
- `activeCooldowns[].until` is already absolute — no change.

The relative fields stay for backward-compat; consumers switch to the absolutes for ticking.

**`src/renderer/features/control/controlHelpers.ts`** — new pure string builders that take a
duration and return the live "Next" sentence, so the string stays testable and only the
clock lives in the component:

```ts
export const narrateSuppressionCountdown: (
  reason: WatchEngineSuppressionReason,
  remainingMs: number,
  t: Translator,
) => string; // "" when remainingMs <= 0 (hold elapsed → fall back to static next)
```

`formatDurationMs` is reused verbatim.

**`src/renderer/features/control/EngineStatusPanel.tsx`** — wrap the time-bearing pieces in
`<TimeText render={(now) => …}>` (already used by `HeroPanel`; ticks via `useVisibleTick`,
pauses on hidden tab):

- The collapsed **Next** line for `suppressed` / `cooldown` shows the live countdown
  (`narrateSuppressionCountdown` / cooldown remaining from `until - now`).
- Expanded **suppression / cooldown / no-progress** rows recompute their durations from the
  absolute deadlines + ticking `now`.

i18n: add countdown variants of the relevant `control.watchEngineNext.*` keys (en + de).

### Strand 2 — Claim narration + retry visibility

**`src/renderer/shared/types.ts`** — extend `ClaimStatus` error shape:

```ts
// error variant gains:
nextRetryAt?: number; // absolute ms; present when the engine scheduled a retry
attempts?: number;
```

**`src/renderer/shared/domain/inventory/inventoryClaimEngine.ts`** — at the two
`setClaimStatus({ kind: "error", … })` sites, include `nextRetryAt: now + getClaimRetryDelay(attempts)`
and `attempts` (both already computed for the retry-map write just above). PubSub-claim path
has no scheduled retry → omit the fields there (terminal).

**`src/renderer/features/overview/claimNarration.ts`** (new, pure, tested) —

```ts
export type ClaimNarration = { tone: "ok" | "warn" | "err"; text: string };
export function narrateClaim(
  status: ClaimStatus,
  now: number,
  t: Translator,
): ClaimNarration | null;
```

Logic:

- `success` → `tone: "ok"`, the success `message` (or `t("hero.claim.autoClaimed", { title })`).
- `error` **with `code`** → localized `t(toErrorKey(code))` (the existing `error.*` strings)
  instead of the raw English `message`.
- `error` with `nextRetryAt > now` → `tone: "warn"`, text + `t("hero.claim.retryIn", { time })`
  (the `{time}` filled live by the component). This is the "kills the scary red" path.
- `error` with no pending retry → `tone: "err"` (terminal).

**`src/renderer/features/overview/HeroPanel.tsx`** — replace the inline `claimStatus`
rendering (lines ~200–215, which ignores `code`) with `narrateClaim`, mapping `tone` to the
existing `--dp-signal-{ok,warn,err}` colors and filling the retry `{time}` via `TimeText`
from `nextRetryAt`. The 8s auto-clear in `useAppModel` is unchanged.

i18n: `hero.claim.retryIn`, `hero.claim.autoClaimed` (en + de). (`error.*` keys already exist.)

### Strand 3 — Auth `expired` state + Re-login banner

**`src/renderer/shared/types.ts`** — `AuthState` gains `| { status: "expired" }`.

**`src/renderer/shared/hooks/app/useAuth.ts`** — add `markExpired()`:

```ts
const markExpired = async () => {
  await window.electronAPI.auth.logout(); // clear the dead token server-side
  setAuth({ status: "expired" });
};
```

`logout()` (intentional) still resolves to `{ status: "idle" }`. Re-login from `expired`
reuses the existing `startLogin`. Return `markExpired` from the hook.

**`src/renderer/shared/hooks/watch/useWatchingActions.ts`** — in `handleAuthError`, the
fatal branch (`fatalRevalidate || shouldLogout`, line ~121) calls `markExpired()` instead of
`logout()`. `stopWatching()` is unchanged; the transient branch is unchanged. The
expired-vs-keep decision still lives in the already-tested pure `shouldLogoutForAuthError` —
no new logic path. Thread `markExpired` in as a dep (mirrors how `logout` is threaded today).

**`src/renderer/shared/hooks/app/useAppModel.ts`** — destructure `markExpired` from `useAuth`
and pass it into `useWatchingActions` (sibling to `logout`).

**`src/renderer/features/control/SessionExpiredBanner.tsx`** (new) — pure presentational
component, rendered only when `auth.status === "expired"`:

- Copy: `t("session.expired.title")` ("Session expired — engine paused") + a `[Re-login]`
  `dp-primary` button wired to `startLogin` (`disabled` while `pending`).
- `--dp-*` tokens, warn signal accent, non-blocking (a strip, not a modal).

**`src/renderer/App.tsx`** — render `<SessionExpiredBanner>` in the shell between `AppNav`
and the scrollable content area, so it persists across views. `linked` /`sessionRight`
already treat any non-`ok` status as "not linked" → the nav Sign-in button stays consistent;
the banner is the prominent affordance. No blocking connect screen exists, so this composes
cleanly.

i18n: `session.expired.title`, `session.expired.relogin` (en + de).

## Data flow

```
Watch engine state change
  → useWatchEngineSnapshot exposes absolute deadlines (holdUntil / cooldown.until / sinceProgressAt)
    → EngineStatusPanel <TimeText> ticks → narrateSuppressionCountdown(now) → live "resumes in 3m 12s"

Claim attempt fails (auto-claim)
  → inventoryClaimEngine schedules retry → setClaimStatus({ error, code, nextRetryAt, attempts })
    → HeroPanel narrateClaim(status, now) → amber "Claim failed · retry in 4m" (TimeText ticks {time})
       (terminal failure → red, no countdown; success → green)

Auth fatal (session truly expired)
  → handleAuthError: stopWatching() + shouldLogoutForAuthError → markExpired()
    → auth.status = "expired" (dashboard stays mounted)
      → App.tsx SessionExpiredBanner → [Re-login] → startLogin → status "ok" → engine resumes
```

## Testing (Vitest, pure functions only — repo convention)

- `claimNarration.test.ts`: success → ok; error+code → localized text (not raw message);
  error+`nextRetryAt > now` → warn + retry fragment; error, no retry → err (terminal);
  null/empty status → null.
- `controlHelpers` countdown helper test: `narrateSuppressionCountdown` returns the right
  string per reason and remaining ms; empty string once elapsed.
- Auth: rely on the existing `shouldLogoutForAuthError` tests for the decision; the
  `logout → markExpired` swap is a thin wiring change (the component/hook glue is not
  unit-tested per the convention — no `@testing-library/react`).

`npm run typecheck` (both tsconfigs), `npm test`, and `npm run format:check` stay green;
`prettier --write` on all touched/new files before commit.

## Out of scope (YAGNI)

- Per-row retry countdowns in the inventory list (HeroPanel line only).
- Connection-health surfacing (PubSub/tracker) — separate "Health Dashboard" idea.
- A "retry now" button that bypasses the claim backoff (visibility only in v1).
- Routing the `expired` event to the alert dispatcher (a future small add on the merged
  alert router).

## Risks

- **Live ticks & re-render cost** — `TimeText` already isolates the per-second re-render to
  the leaf (it does not re-render the panel/view), so adding several is cheap and matches
  the existing `HeroPanel` pattern. Verify no `TimeText` ticks while `active` should be false
  (e.g. no hold pending) to avoid a 1Hz no-op.
- **`expired` vs `idle` regressions** — every place that branches on `auth.status` must treat
  `expired` correctly. Audit the `auth.status === "ok"` / `=== "idle"` sites (App.tsx
  `linked`, `useAppModel` `isLinkedOrDemo`); `expired` must read as "not linked" everywhere
  except the banner. Caught by `typecheck` (the union is exhaustively matched in a few spots)
  + manual smoke.
- **Double-expire / re-login race** — `handleAuthError` can fire repeatedly; `markExpired`
  must be idempotent (setting `expired` when already `expired` is a no-op) and not stomp a
  `pending` re-login in progress. Guard: only `markExpired` from non-`pending`/non-`expired`.
- **Localized claim text accuracy** — switching from the raw `message` to `t(toErrorKey(code))`
  must cover every `code` the claim path emits (`claim.failed` is the dominant one; all
  `error.*` keys already exist in both locales). Fallback to `message` when no `code`.
