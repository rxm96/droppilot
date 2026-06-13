# Engine Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DropPilot's autopilot explain itself — live status countdowns, friendly claim-failure narration with a retry timer, and an in-place "session expired → re-login" banner instead of a silent logout.

**Architecture:** Three independent strands, all "pure function + thin component wrapper" (repo convention). No watch-engine behavior change; the only behavior change is the auth fatal path (`logout()` → `markExpired()`). Live time uses the existing `TimeText` leaf (ticks via `useVisibleTick`, isolates the per-second re-render).

**Tech Stack:** React 19 + TypeScript, Vitest (pure functions only — no `@testing-library/react`), Tailwind v4 `--dp-*` tokens, flat i18n dictionaries (en + de).

**Spec:** `docs/superpowers/specs/2026-06-13-engine-voice-design.md`

**Branch:** `feat/engine-voice` (already created off `main`).

**Conventions every task follows:**

- After any code change run `npm run typecheck` (covers BOTH tsconfigs) before committing — `npm run build` does NOT type-check.
- Run `npx prettier --write <files>` on every touched/created file before committing (CI gates on `format:check`).
- Add every new i18n key to **both** the English and German blocks of `src/renderer/shared/i18n.tsx`.
- Commit messages are Conventional Commits and end with the co-author trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**Strand 2 — Claim narration + retry**

- Modify `src/renderer/shared/types.ts` — extend `ClaimStatus` error shape.
- Modify `src/renderer/shared/domain/inventory/inventoryClaimEngine.ts` — populate retry fields on error status.
- Create `src/renderer/features/overview/claimNarration.ts` — pure `narrateClaim`.
- Create `src/renderer/features/overview/claimNarration.test.ts` — unit tests.
- Modify `src/renderer/features/overview/HeroPanel.tsx` — render via `narrateClaim` + `TimeText`.
- Modify `src/renderer/shared/i18n.tsx` — `hero.claim.retryIn`.

**Strand 1 — Watch-engine live countdowns**

- Modify `src/renderer/shared/hooks/watch/useWatchEngineSnapshot.ts` — expose absolute deadlines.
- Modify `src/renderer/features/control/ControlView.tsx` — local snapshot type (the duplicate at lines 24-39).
- Modify `src/renderer/features/control/controlHelpers.ts` — pure `narrateEngineCountdown`.
- Create `src/renderer/features/control/controlHelpers.test.ts` — unit tests.
- Modify `src/renderer/features/control/EngineStatusPanel.tsx` — `TimeText` live ticks.
- Modify `src/renderer/shared/i18n.tsx` — countdown variant keys.

**Strand 3 — Auth `expired` + banner**

- Modify `src/renderer/shared/types.ts` — `AuthState` `expired` variant.
- Modify `src/renderer/shared/hooks/app/useAuth.ts` — `markExpired()`.
- Modify `src/renderer/shared/hooks/watch/useWatchingActions.ts` — swap fatal `logout` → `markExpired`.
- Modify `src/renderer/shared/hooks/app/useAppActions.ts` — thread `markExpired`.
- Modify `src/renderer/shared/hooks/app/useAppModel.ts` — pass `markExpired` from `useAuth`.
- Create `src/renderer/features/control/SessionExpiredBanner.tsx` — banner component.
- Modify `src/renderer/App.tsx` — render the banner in the shell.
- Modify `src/renderer/shared/i18n.tsx` — `session.expired.*`.

---

## Strand 2 — Claim narration + retry visibility

### Task 1: Extend `ClaimStatus` + populate retry fields

**Files:**
- Modify: `src/renderer/shared/types.ts:221-227`
- Modify: `src/renderer/shared/domain/inventory/inventoryClaimEngine.ts:177-184`

- [ ] **Step 1: Extend the `ClaimStatus` type**

In `src/renderer/shared/types.ts`, replace the existing `ClaimStatus` (lines 221-227):

```ts
export type ClaimStatus = {
  kind: "success" | "error";
  message?: string;
  code?: string;
  title?: string;
  at: number;
  /** Absolute ms; present on an error the engine scheduled a retry for (transient). */
  nextRetryAt?: number;
  /** Retry attempt count for the failing drop (1-based). */
  attempts?: number;
};
```

- [ ] **Step 2: Populate the fields in the auto-claim error branch**

In `src/renderer/shared/domain/inventory/inventoryClaimEngine.ts`, the error branch already computes `attempts` and writes the retry map (lines 166-175). Replace the `setClaimStatus` call at lines 177-184:

```ts
        const errInfo = getClaimErrorInfo(err);
        deps.setClaimStatus({
          kind: "error",
          message: errInfo.message,
          code: errInfo.code,
          title: drop.title,
          at: Date.now(),
          nextRetryAt: now + getClaimRetryDelay(attempts),
          attempts,
        });
```

(The PubSub-claim error branch at lines 231-238 has no scheduled retry — leave it untouched so it renders as terminal.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors in either tsconfig).

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/types.ts src/renderer/shared/domain/inventory/inventoryClaimEngine.ts
git add src/renderer/shared/types.ts src/renderer/shared/domain/inventory/inventoryClaimEngine.ts
git commit -m "feat(engine-voice): carry claim retry timing on ClaimStatus" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 2: Pure `narrateClaim` (TDD)

**Files:**
- Create: `src/renderer/features/overview/claimNarration.ts`
- Create: `src/renderer/features/overview/claimNarration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/features/overview/claimNarration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { narrateClaim } from "./claimNarration";
import type { ClaimStatus } from "@renderer/shared/types";

const DICT: Record<string, string> = {
  "error.claim.failed": "Claim failed",
  "hero.claim.retryIn": "retry in {time}",
  "error.unknown": "Something went wrong",
};

const t = (key: string, vars?: Record<string, string | number>): string => {
  const template = DICT[key] ?? key;
  return vars
    ? template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""))
    : template;
};

const NOW = 1_000_000;

describe("narrateClaim", () => {
  it("returns null when there is no status", () => {
    expect(narrateClaim(null, NOW, t)).toBeNull();
    expect(narrateClaim(undefined, NOW, t)).toBeNull();
  });

  it("renders a success as the ok tone with its message", () => {
    const status: ClaimStatus = { kind: "success", message: "Auto-claimed: Cap", at: NOW };
    expect(narrateClaim(status, NOW, t)).toEqual({ tone: "ok", text: "Auto-claimed: Cap" });
  });

  it("renders a success with no message as null (nothing to say)", () => {
    const status: ClaimStatus = { kind: "success", at: NOW };
    expect(narrateClaim(status, NOW, t)).toBeNull();
  });

  it("renders an auto-retrying error as warn with a localized message and countdown", () => {
    const status: ClaimStatus = {
      kind: "error",
      code: "claim.failed",
      message: "Drop claim failed",
      at: NOW,
      nextRetryAt: NOW + 240_000,
      attempts: 1,
    };
    expect(narrateClaim(status, NOW, t)).toEqual({
      tone: "warn",
      text: "Claim failed · retry in 4m",
    });
  });

  it("treats an elapsed retry as terminal err (no countdown)", () => {
    const status: ClaimStatus = {
      kind: "error",
      code: "claim.failed",
      at: NOW,
      nextRetryAt: NOW - 1,
      attempts: 3,
    };
    expect(narrateClaim(status, NOW, t)).toEqual({ tone: "err", text: "Claim failed" });
  });

  it("renders an error with no scheduled retry as terminal err", () => {
    const status: ClaimStatus = { kind: "error", code: "claim.failed", at: NOW };
    expect(narrateClaim(status, NOW, t)).toEqual({ tone: "err", text: "Claim failed" });
  });

  it("shows seconds granularity under a minute", () => {
    const status: ClaimStatus = {
      kind: "error",
      code: "claim.failed",
      at: NOW,
      nextRetryAt: NOW + 30_000,
      attempts: 1,
    };
    expect(narrateClaim(status, NOW, t)).toEqual({
      tone: "warn",
      text: "Claim failed · retry in 30s",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/features/overview/claimNarration.test.ts`
Expected: FAIL — `Failed to resolve import "./claimNarration"`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/features/overview/claimNarration.ts`:

```ts
import type { ClaimStatus } from "@renderer/shared/types";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

export type ClaimNarration = { tone: "ok" | "warn" | "err"; text: string };

/** Compact retry remaining: "4m" once a minute or more out, else "30s". */
const formatRetryRemaining = (ms: number): string => {
  if (ms >= 60_000) return `${Math.ceil(ms / 60_000)}m`;
  return `${Math.ceil(ms / 1000)}s`;
};

/**
 * Turn a ClaimStatus into a single narrated line + tone. Pure: pass `now` so the
 * caller (a TimeText leaf) can re-evaluate the countdown each tick.
 *
 * - success            → ok   (its message; null when there is nothing to show)
 * - error + future retry → warn (localized message + "· retry in 4m") — not scary red
 * - error otherwise    → err  (terminal)
 */
export function narrateClaim(
  status: ClaimStatus | null | undefined,
  now: number,
  t: Translator,
): ClaimNarration | null {
  if (!status) return null;

  if (status.kind === "success") {
    const message = status.message?.trim();
    return message ? { tone: "ok", text: message } : null;
  }

  const base = resolveErrorMessage(t, { code: status.code, message: status.message });

  if (typeof status.nextRetryAt === "number" && status.nextRetryAt > now) {
    const remaining = formatRetryRemaining(status.nextRetryAt - now);
    return { tone: "warn", text: `${base} · ${t("hero.claim.retryIn", { time: remaining })}` };
  }

  return { tone: "err", text: base };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/features/overview/claimNarration.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/features/overview/claimNarration.ts src/renderer/features/overview/claimNarration.test.ts
git add src/renderer/features/overview/claimNarration.ts src/renderer/features/overview/claimNarration.test.ts
git commit -m "feat(engine-voice): add pure claim narration with retry countdown" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3: Wire `narrateClaim` into HeroPanel + i18n

**Files:**
- Modify: `src/renderer/features/overview/HeroPanel.tsx` (imports + the `claimStatus` block at lines 200-215)
- Modify: `src/renderer/shared/i18n.tsx` (after line 899 EN, after line 1934 DE)

- [ ] **Step 1: Add the i18n key (English)**

In `src/renderer/shared/i18n.tsx`, immediately after the English line `"hero.claimFeedback.errorFallback": "Claim failed",` (line 899), add:

```ts
    "hero.claim.retryIn": "retry in {time}",
```

- [ ] **Step 2: Add the i18n key (German)**

Immediately after the German line `"hero.claimFeedback.errorFallback": "Claim fehlgeschlagen",` (line 1934), add:

```ts
    "hero.claim.retryIn": "neuer Versuch in {time}",
```

- [ ] **Step 3: Import the helper + TimeText in HeroPanel**

In `src/renderer/features/overview/HeroPanel.tsx`, the file already imports `TimeText` (line 9) and `useI18n` (line 7). Add this import next to the other local imports (after line 6 `formatRemainingFromEta`):

```ts
import { narrateClaim } from "./claimNarration";
```

- [ ] **Step 4: Replace the claim-status render block**

Replace the existing block at lines 200-215:

```tsx
        {claimStatus && (
          <div className="mt-2 font-mono text-[10px]">
            <TimeText
              active={claimStatus.kind === "error" && typeof claimStatus.nextRetryAt === "number"}
              render={(now) => {
                const narration = narrateClaim(claimStatus, now, t);
                if (!narration) return null;
                const toneClass =
                  narration.tone === "ok"
                    ? "text-[color:var(--dp-signal-ok)]"
                    : narration.tone === "warn"
                      ? "text-[color:var(--dp-signal-warn)]"
                      : "text-[color:var(--dp-signal-err)]";
                return <span className={toneClass}>{narration.text}</span>;
              }}
            />
          </div>
        )}
```

Note: `claimStatus` prop is typed `{ kind: "success" | "error"; message?: string; code?: string } | null` on `HeroPanelProps` (line 33). Widen it to the shared type so `nextRetryAt`/`code` are available — change line 33 to:

```tsx
  claimStatus?: import("@renderer/shared/types").ClaimStatus | null;
```

Also remove the now-unused `cn` import (line 8) — it was only referenced by the old claim block, so `npm run typecheck` flags it otherwise.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (existing suites green + the new claimNarration tests).

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/renderer/features/overview/HeroPanel.tsx src/renderer/shared/i18n.tsx
git add src/renderer/features/overview/HeroPanel.tsx src/renderer/shared/i18n.tsx
git commit -m "feat(engine-voice): narrate claim status with localized text + retry timer" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Strand 1 — Watch-engine live countdowns

### Task 4: Expose absolute deadlines in the snapshot

**Files:**
- Modify: `src/renderer/shared/hooks/watch/useWatchEngineSnapshot.ts:79-129`
- Modify: `src/renderer/features/control/ControlView.tsx:24-39`
- Modify: `src/renderer/features/control/EngineStatusPanel.tsx:21-31`

- [ ] **Step 1: Add `sinceProgressAt` + `holdUntil` to the snapshot output**

In `src/renderer/shared/hooks/watch/useWatchEngineSnapshot.ts`, update the `noProgressTracker` computation (lines 79-85):

```ts
    const noProgressTracker =
      stallTracker && watching
        ? {
            recoveryCount: stallTracker.recoveryCount,
            sinceProgressMs: Math.max(0, now - stallTracker.lastProgressAt),
            sinceProgressAt: stallTracker.lastProgressAt,
          }
        : null;
```

Then update the returned `suppression` object (lines 115-123) to include the absolute hold deadline:

```ts
      suppression:
        suppressionGame && suppressionReason
          ? {
              game: suppressionGame,
              reason: suppressionReason,
              sinceAt: suppressionAt,
              holdRemainingMs: suppressionHoldRemainingMs,
              holdUntil:
                holdMs && typeof suppressionAt === "number" && Number.isFinite(suppressionAt)
                  ? suppressionAt + holdMs
                  : null,
            }
          : null,
```

(`activeCooldowns[].until` is already absolute — no change.)

- [ ] **Step 2: Mirror the fields in ControlView's local snapshot type**

In `src/renderer/features/control/ControlView.tsx`, update the local `WatchEngineSnapshot` type (lines 24-39) — add `holdUntil` to `suppression` and `sinceProgressAt` to `noProgressTracker`:

```ts
type WatchEngineSnapshot = {
  decision: WatchEngineDecision;
  targetGame: string;
  activeTargetGame: string;
  suppression: {
    game: string;
    reason: WatchEngineSuppressionReason;
    sinceAt: number | null;
    holdRemainingMs: number;
    holdUntil: number | null;
  } | null;
  activeCooldowns: Array<{ game: string; until: number; remainingMs: number }>;
  allowlistActive: boolean;
  allowlistedLiveChannels: number;
  totalLiveChannels: number;
  noProgressTracker: { recoveryCount: number; sinceProgressMs: number; sinceProgressAt: number } | null;
};
```

(The `suppression` and `noProgressTracker` objects are already passed wholesale into `<EngineStatusPanel>` at lines 251 & 256, so the new fields flow through automatically.)

- [ ] **Step 3: Mirror the fields in EngineStatusPanel's prop type**

In `src/renderer/features/control/EngineStatusPanel.tsx`, update `EngineStatusPanelProps` (lines 21-31) the same way:

```ts
  suppression: {
    game: string;
    reason: WatchEngineSuppressionReason;
    sinceAt: number | null;
    holdRemainingMs: number;
    holdUntil: number | null;
  } | null;
  activeCooldowns: Array<{ game: string; until: number; remainingMs: number }>;
  allowlistActive: boolean;
  allowlistedLiveChannels: number;
  totalLiveChannels: number;
  noProgressTracker: { recoveryCount: number; sinceProgressMs: number; sinceProgressAt: number } | null;
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/useWatchEngineSnapshot.ts src/renderer/features/control/ControlView.tsx src/renderer/features/control/EngineStatusPanel.tsx
git add src/renderer/shared/hooks/watch/useWatchEngineSnapshot.ts src/renderer/features/control/ControlView.tsx src/renderer/features/control/EngineStatusPanel.tsx
git commit -m "feat(engine-voice): expose absolute engine deadlines for live countdowns" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 5: Pure `narrateEngineCountdown` (TDD)

**Files:**
- Modify: `src/renderer/features/control/controlHelpers.ts` (append a new export)
- Create: `src/renderer/features/control/controlHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/features/control/controlHelpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { narrateEngineCountdown } from "./controlHelpers";

const DICT: Record<string, string> = {
  "control.watchEngineNext.suppressedCountdown": "Resuming in {time} after the stall hold.",
  "control.watchEngineNext.cooldownCountdown":
    "Cooldown ends in {time}, then auto-select retries.",
};

const t = (key: string, vars?: Record<string, string | number>): string => {
  const template = DICT[key] ?? key;
  return vars
    ? template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""))
    : template;
};

describe("narrateEngineCountdown", () => {
  it("returns empty when no time remains", () => {
    expect(narrateEngineCountdown("suppressed", "stall-stop", 0, t)).toBe("");
    expect(narrateEngineCountdown("cooldown", null, -5, t)).toBe("");
  });

  it("narrates the stall-stop suppression hold with a live duration", () => {
    expect(narrateEngineCountdown("suppressed", "stall-stop", 252_000, t)).toBe(
      "Resuming in 4m 12s after the stall hold.",
    );
  });

  it("does not narrate a manual-stop suppression (user must resume)", () => {
    expect(narrateEngineCountdown("suppressed", "manual-stop", 252_000, t)).toBe("");
  });

  it("narrates a cooldown countdown", () => {
    expect(narrateEngineCountdown("cooldown", null, 65_000, t)).toBe(
      "Cooldown ends in 1m 05s, then auto-select retries.",
    );
  });

  it("returns empty for decisions without a countdown", () => {
    expect(narrateEngineCountdown("watching-progress", null, 99_000, t)).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/features/control/controlHelpers.test.ts`
Expected: FAIL — `narrateEngineCountdown` is not exported.

- [ ] **Step 3: Add the implementation**

In `src/renderer/features/control/controlHelpers.ts`, add this export directly below `formatDurationMs` (after line 172):

```ts
/**
 * Live "Next" line for the two time-bounded engine states. Pure: the caller
 * (a TimeText leaf) supplies the freshly-ticked remaining ms. Returns "" when
 * there is no countdown to show, so the caller falls back to the static next.
 */
export const narrateEngineCountdown = (
  decision: WatchEngineDecision,
  suppressionReason: WatchEngineSuppressionReason | null,
  remainingMs: number,
  t: Translator,
): string => {
  if (remainingMs <= 0) return "";
  const time = formatDurationMs(remainingMs);
  if (decision === "suppressed" && suppressionReason === "stall-stop") {
    return t("control.watchEngineNext.suppressedCountdown", { time });
  }
  if (decision === "cooldown") {
    return t("control.watchEngineNext.cooldownCountdown", { time });
  }
  return "";
};
```

(`WatchEngineDecision`, `WatchEngineSuppressionReason`, `Translator`, and `formatDurationMs` are all already defined in this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/features/control/controlHelpers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/features/control/controlHelpers.ts src/renderer/features/control/controlHelpers.test.ts
git add src/renderer/features/control/controlHelpers.ts src/renderer/features/control/controlHelpers.test.ts
git commit -m "feat(engine-voice): add pure engine countdown narration" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 6: Live countdowns in EngineStatusPanel + i18n

**Files:**
- Modify: `src/renderer/shared/i18n.tsx` (after line 312 EN, after line 1336 DE)
- Modify: `src/renderer/features/control/EngineStatusPanel.tsx`

- [ ] **Step 1: Add the countdown i18n keys (English)**

In `src/renderer/shared/i18n.tsx`, immediately after the English line `"control.watchEngineNext.idleReady": "Auto-select can pick one of the eligible live channels.",` (line 312), add:

```ts
    "control.watchEngineNext.suppressedCountdown": "Resuming in {time} after the stall hold.",
    "control.watchEngineNext.cooldownCountdown":
      "Cooldown ends in {time}, then auto-select retries.",
```

- [ ] **Step 2: Add the countdown i18n keys (German)**

Immediately after the German line `"control.watchEngineNext.noTarget": "Wähle ein Ziel-Game aus der Liste.",` (line 1336), add:

```ts
    "control.watchEngineNext.suppressedCountdown": "Fährt in {time} fort, nach dem Stall-Hold.",
    "control.watchEngineNext.cooldownCountdown":
      "Cooldown endet in {time}, dann versucht Auto-Select erneut.",
```

- [ ] **Step 3: Import TimeText + the countdown helper**

In `src/renderer/features/control/EngineStatusPanel.tsx`, add to the imports:

```ts
import { TimeText } from "@renderer/shared/components/TimeText";
```

and add `narrateEngineCountdown` to the existing import from `./controlHelpers` (the block at lines 7-15):

```ts
import {
  formatDurationMs,
  mapWatchEngineDecisionDetails,
  mapWatchEngineDecisionLabel,
  mapWatchEngineSuppressionReasonLabel,
  narrateEngineCountdown,
  watchEngineTone,
  type WatchEngineDecision,
  type WatchEngineSuppressionReason,
} from "./controlHelpers";
```

- [ ] **Step 4: Make the collapsed "Next" line tick**

Replace the "Next" row (lines 159-164) so the value is a live `TimeText` that prefers the countdown and falls back to the static `details.next`:

```tsx
          <div className="flex gap-3 font-mono text-[11px]">
            <span className="text-[color:var(--dp-text-dimmer)] w-12 flex-shrink-0">
              {t("control.engineStatus.next")}
            </span>
            <span className="text-[color:var(--dp-text-dim)] flex-1">
              <TimeText
                active={tone === "hold"}
                render={(now) => {
                  const remainingMs =
                    props.decision === "suppressed" && props.suppression?.holdUntil
                      ? Math.max(0, props.suppression.holdUntil - now)
                      : props.decision === "cooldown" && props.activeCooldowns[0]
                        ? Math.max(0, props.activeCooldowns[0].until - now)
                        : 0;
                  return (
                    narrateEngineCountdown(props.decision, suppressionReason, remainingMs, t) ||
                    details.next
                  );
                }}
              />
            </span>
          </div>
```

(`tone`, `suppressionReason`, and `details` are already computed at the top of the component, lines 53-56. `activeCooldowns` is sorted ascending by `until` in the snapshot, so `[0]` is the soonest.)

- [ ] **Step 5: Make the expanded suppression / cooldown / no-progress rows tick**

First widen `DetailRow` to accept a node value. Replace its signature + the `value` render (lines 195-219) so `value` is a `React.ReactNode`:

```tsx
function DetailRow({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "warn";
}) {
```

(The JSX body already renders `{value}` inside the `div`, so no further change there.)

Now feed live `TimeText` nodes into the three time-bearing rows. Replace the suppression detail row (line 174):

```tsx
          <DetailRow
            label={t("control.engineStatus.detail.suppression")}
            value={
              props.suppression ? (
                <TimeText
                  active={props.suppression.holdUntil !== null}
                  render={(now) => {
                    const holdRemainingMs =
                      props.suppression?.holdUntil != null
                        ? Math.max(0, props.suppression.holdUntil - now)
                        : 0;
                    return `${props.suppression!.game} (${mapWatchEngineSuppressionReasonLabel(
                      props.suppression!.reason,
                      t,
                    )})${
                      holdRemainingMs > 0
                        ? `, ${t("control.watchEngineHold", {
                            time: formatDurationMs(holdRemainingMs),
                          })}`
                        : ""
                    }`;
                  }}
                />
              ) : (
                t("control.watchEngineNoSuppression")
              )
            }
          />
```

Replace the cooldown detail row (line 175):

```tsx
          <DetailRow
            label={t("control.engineStatus.detail.cooldowns")}
            value={
              props.activeCooldowns.length > 0 ? (
                <TimeText
                  active
                  render={(now) =>
                    props.activeCooldowns
                      .slice(0, 3)
                      .map((c) => `${c.game} (${formatDurationMs(Math.max(0, c.until - now))})`)
                      .join(" | ")
                  }
                />
              ) : (
                t("control.watchEngineNoCooldowns")
              )
            }
          />
```

Replace the no-progress detail row (lines 182-188) — the row only renders while `noProgressTracker` is non-null (i.e. while watching), so the ticker is always `active`:

```tsx
          {props.noProgressTracker && (
            <DetailRow
              label={t("control.engineStatus.detail.noProgress")}
              value={
                <TimeText
                  active
                  render={(now) =>
                    t("control.watchEngineNoProgressValue", {
                      attempts: props.noProgressTracker!.recoveryCount,
                      time: formatDurationMs(
                        Math.max(0, now - props.noProgressTracker!.sinceProgressAt),
                      ),
                    })
                  }
                />
              }
              tone="warn"
            />
          )}
```

Then delete the now-unused `noProgressText` / `suppressionText` / `cooldownText` `const` blocks (lines 65-95) that the rows previously consumed — they are replaced by the inline `TimeText` renders above. Keep `targetText`, `allowlistText`, `channelsText`, `trackerText` (still used).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If it flags an unused `formatDurationMs` import — it is still used; if it flags removed consts, ensure no other reference remains.)

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/renderer/features/control/EngineStatusPanel.tsx src/renderer/shared/i18n.tsx
git add src/renderer/features/control/EngineStatusPanel.tsx src/renderer/shared/i18n.tsx
git commit -m "feat(engine-voice): live-tick engine status countdowns" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Strand 3 — Auth `expired` state + re-login banner

### Task 7: `AuthState` `expired` + `useAuth.markExpired`

**Files:**
- Modify: `src/renderer/shared/types.ts:1-5`
- Modify: `src/renderer/shared/hooks/app/useAuth.ts`

- [ ] **Step 1: Add the `expired` variant**

In `src/renderer/shared/types.ts`, replace `AuthState` (lines 1-5):

```ts
export type AuthState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ok" }
  | { status: "expired" }
  | { status: "error"; message: string };
```

- [ ] **Step 2: Add `markExpired` to the auth hook**

In `src/renderer/shared/hooks/app/useAuth.ts`, add to the `AuthHook` type (lines 20-24):

```ts
type AuthHook = {
  auth: AuthState;
  startLogin: () => Promise<void>;
  logout: () => Promise<void>;
  markExpired: () => Promise<void>;
};
```

Add the implementation after `logout` (after line 62), guarding against stomping an in-flight re-login or a repeat fire:

```ts
  const markExpired = async () => {
    // Clear the dead token server-side, but keep the dashboard mounted by moving
    // to a distinct "expired" state instead of "idle". Never stomps an in-flight
    // re-login (pending) or an already-expired state.
    await window.electronAPI.auth.logout();
    setAuth((prev) =>
      prev.status === "pending" || prev.status === "expired" ? prev : { status: "expired" },
    );
  };
```

And add `markExpired` to the returned object (lines 64-68):

```ts
  return {
    auth,
    startLogin,
    logout,
    markExpired,
  };
```

Note: `setAuth` from `useState` accepts an updater function — the guard reads the latest state without adding a dependency.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `tsc` reports a non-exhaustive `switch (auth.status)` or a `never` assignment anywhere, that site must handle `"expired"` (treat as "not linked"). Fix any such site by adding an `"expired"` case / branch that mirrors `"idle"`.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/types.ts src/renderer/shared/hooks/app/useAuth.ts
git add src/renderer/shared/types.ts src/renderer/shared/hooks/app/useAuth.ts
git commit -m "feat(engine-voice): add expired auth state + markExpired" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 8: Route the fatal auth path to `markExpired`

**Files:**
- Modify: `src/renderer/shared/hooks/watch/useWatchingActions.ts` (params + `handleAuthError` line ~122 + deps line 132)
- Modify: `src/renderer/shared/hooks/app/useAppActions.ts:50,96,116`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts:44,318`

- [ ] **Step 1: Swap `logout` → `markExpired` in `useWatchingActions`**

In `src/renderer/shared/hooks/watch/useWatchingActions.ts`:

1. In the params type, replace `logout: () => Promise<void>;` with `markExpired: () => Promise<void>;`.
2. In the destructure, replace `logout` with `markExpired`.
3. In `handleAuthError`, replace the fatal-branch call (line ~122) `void logout();` with:

```ts
        if (fatalRevalidate || shouldLogout) {
          void markExpired();
          return;
        }
```

4. Update the `useCallback` deps (line 132) from `[isLinked, stopWatching, logout]` to `[isLinked, stopWatching, markExpired]`.

(`markExpired` itself calls the backend `auth.logout()`, so the dead token is still cleared — only the resulting UI state changes from `idle` to `expired`.)

- [ ] **Step 2: Thread `markExpired` through `useAppActions`**

In `src/renderer/shared/hooks/app/useAppActions.ts`:

1. In the `Params` type, replace `logout: () => Promise<void>;` (line 50) with `markExpired: () => Promise<void>;`.
2. In the destructure (line 96), replace `logout` with `markExpired`.
3. In the `useWatchingActions({ … })` call (line 116), replace `logout,` with `markExpired,`.

(`logout` is not used elsewhere in this hook — it only ever fed `useWatchingActions`.)

- [ ] **Step 3: Pass `markExpired` from `useAppModel`**

In `src/renderer/shared/hooks/app/useAppModel.ts`:

1. Update the `useAuth` destructure (line 44) from `const { auth, startLogin, logout } = useAuth();` to:

```ts
  const { auth, startLogin, logout, markExpired } = useAuth();
```

2. In the `useAppActions({ … })` call, replace `logout,` (line 318) with `markExpired,`.

(`logout` is still used later in `useAppModel` for the intentional Settings logout — leave those references at lines ~590 and ~664 unchanged.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. (`useWatchingActions.test.ts` already asserts "requests logout when token is missing/expired" — verify those tests still pass; they exercise the same fatal decision, now via `markExpired`. If a test stubs a `logout` dep by name, update the stub to `markExpired`.)

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/useWatchingActions.ts src/renderer/shared/hooks/app/useAppActions.ts src/renderer/shared/hooks/app/useAppModel.ts
git add src/renderer/shared/hooks/watch/useWatchingActions.ts src/renderer/shared/hooks/app/useAppActions.ts src/renderer/shared/hooks/app/useAppModel.ts
git commit -m "feat(engine-voice): route fatal auth errors to expired state, not silent logout" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 9: `SessionExpiredBanner` + App wiring + i18n

**Files:**
- Create: `src/renderer/features/control/SessionExpiredBanner.tsx`
- Modify: `src/renderer/App.tsx` (import + render after `<AppNav>` line 186)
- Modify: `src/renderer/shared/i18n.tsx` (after line 86 EN, after line 1125 DE)

- [ ] **Step 1: Add the i18n keys (English)**

In `src/renderer/shared/i18n.tsx`, immediately after the English line `"session.login": "Login...",` (line 86), add:

```ts
    "session.expired.title": "Session expired — engine paused.",
    "session.expired.relogin": "Re-login",
```

- [ ] **Step 2: Add the i18n keys (German)**

Immediately after the German line `"session.login": "Login...",` (line 1125), add:

```ts
    "session.expired.title": "Sitzung abgelaufen — Engine pausiert.",
    "session.expired.relogin": "Neu anmelden",
```

- [ ] **Step 3: Create the banner component**

Create `src/renderer/features/control/SessionExpiredBanner.tsx`:

```tsx
import * as React from "react";
import type { AuthState } from "@renderer/shared/types";
import { Button } from "@renderer/shared/components/ui/button";
import { useI18n } from "@renderer/shared/i18n";

export type SessionExpiredBannerProps = {
  auth: AuthState;
  onRelogin: () => void;
};

/**
 * Persistent, non-blocking strip shown only when the session expired. Keeps the
 * dashboard mounted and offers an in-place re-login instead of the silent bounce
 * to a signed-out shell.
 */
export function SessionExpiredBanner({ auth, onRelogin }: SessionExpiredBannerProps) {
  const { t } = useI18n();
  if (auth.status !== "expired") return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-2.5"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          aria-hidden="true"
          className="inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full"
          style={{ background: "var(--dp-signal-warn)", boxShadow: "0 0 6px rgba(251,191,36,0.5)" }}
        />
        <span className="truncate text-[13px] text-[color:var(--dp-text)]">
          {t("session.expired.title")}
        </span>
      </div>
      <Button variant="dp-primary" size="dp-sm" onClick={onRelogin} className="flex-shrink-0">
        {t("session.expired.relogin")}
      </Button>
    </div>
  );
}
```

(`Button` `dp-primary`/`dp-sm` variants are the same ones used by `App.tsx`'s `sessionRight`. If `Button` does not accept `className`, drop the `className` prop — verify against `src/renderer/shared/components/ui/button.tsx`.)

- [ ] **Step 4: Render the banner in the App shell**

In `src/renderer/App.tsx`, add the import near the other feature imports:

```ts
import { SessionExpiredBanner } from "./features/control/SessionExpiredBanner";
```

Then insert the banner between `<AppNav … />` (ends line 186) and the scroll container `<div className="flex-1 min-h-0 overflow-y-auto">` (line 190):

```tsx
      <AppNav
        view={navProps.view}
        onChange={navProps.setView}
        items={navItems}
        right={sessionRight}
      />
      <SessionExpiredBanner auth={navProps.auth} onRelogin={navProps.startLogin} />
```

(`navProps.auth` and `navProps.startLogin` are already consumed by `sessionRight` in this file, so they exist on `navProps`.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/renderer/features/control/SessionExpiredBanner.tsx src/renderer/App.tsx src/renderer/shared/i18n.tsx
git add src/renderer/features/control/SessionExpiredBanner.tsx src/renderer/App.tsx src/renderer/shared/i18n.tsx
git commit -m "feat(engine-voice): in-place session-expired banner with re-login" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck both configs**

Run: `npm run typecheck`
Expected: PASS (renderer + main/preload).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — including the new `claimNarration.test.ts` and `controlHelpers.test.ts`.

- [ ] **Step 3: Format gate**

Run: `npm run format:check`
Expected: PASS (CI gates on this).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: succeeds (renderer `dist/` + `dist-electron/`).

- [ ] **Step 5: Manual smoke (no automated render tests exist)**

Verify by reasoning + a dev run (`npm run dev`) where feasible:
1. **Claim line** — a failing auto-claim shows amber "<message> · retry in Nm" counting down; a success shows green; the retry text ticks each second.
2. **Engine status** — while a stall hold or cooldown is active, the collapsed "Next" line counts down live; expanded suppression/cooldown/no-progress rows tick.
3. **Session expired** — when the fatal auth path fires, the dashboard stays mounted and the warn banner appears with a working **Re-login** that returns to `ok` and resumes; an intentional Settings logout still goes to the signed-out `idle` state (banner absent).

- [ ] **Step 6: Open the PR**

```bash
git push -u origin feat/engine-voice
gh pr create --base main --title "feat: Engine Voice — narrate engine status, claim retries, and session expiry" --body "Implements docs/superpowers/specs/2026-06-13-engine-voice-design.md. Live engine-status countdowns, claim narration with localized text + retry timer (transient amber vs terminal red), and an in-place session-expired banner replacing the silent logout. See plan: docs/superpowers/plans/2026-06-13-engine-voice.md."
```

---

## Notes / risks carried from the spec

- **`expired` vs `idle` audit** — Step 3 of Task 7 relies on `tsc` to surface any exhaustive `switch (auth.status)`; comparison sites (`=== "ok"`, `=== "idle"`) already treat `expired` as "not linked" with no change. Confirm `App.tsx` `linked` and `useAppModel` `isLinkedOrDemo` during Task 9 smoke.
- **`markExpired` idempotence** — guarded via the `useState` updater (never overwrites `pending`/`expired`).
- **Live-tick cost** — every ticker is a `TimeText` leaf with `active` scoped to when a countdown is actually live (`tone === "hold"`, an open cooldown, a present hold), so there is no 1 Hz no-op while idle/watching-normally.
- **Localized claim text** — `narrateClaim` reuses `resolveErrorMessage`, which falls back to the raw `message` then `error.unknown` when a `code` has no key, so no claim path renders blank.
