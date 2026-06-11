# useChannels Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the ~990-line `useChannels.ts` hook into a shared store + three focused behavior hooks plus two pure modules, with zero runtime behavior change.

**Architecture:** Extract pure logic into `channelEngine.ts` and `channelAllowlist.ts`, delete the forensic-logging apparatus and dead code, then carve the hook into `useChannelStore` (state spine) + `useChannelFetch` / `useChannelLiveDiff` / `useChannelAutopilot` behind a thin `useChannels` orchestrator. Each task leaves the tree compiling and all tests green.

**Tech Stack:** React 19 hooks, TypeScript, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-01-usechannels-refactor-design.md`

---

## File Structure

| File                                                                   | Responsibility                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/renderer/shared/hooks/watch/channelEngine.ts` _(new)_             | Pure, React-free channel-list logic.                                  |
| `src/renderer/shared/hooks/watch/channelEngine.test.ts` _(new, moved)_ | Unit tests for the pure logic.                                        |
| `src/renderer/shared/hooks/watch/channelAllowlist.ts` _(extend)_       | Allowlist normalization + prioritization + key.                       |
| `src/renderer/shared/hooks/watch/channelAllowlist.test.ts` _(extend)_  | Tests for the relocated allowlist helpers.                            |
| `src/renderer/shared/hooks/watch/useChannelStore.ts` _(new)_           | State spine: state, shared refs, mutators, resets, lifecycle effects. |
| `src/renderer/shared/hooks/watch/useChannelFetch.ts` _(new)_           | Fetch + cache + stale-guard + interval + allowlist refetch.           |
| `src/renderer/shared/hooks/watch/useChannelLiveDiff.ts` _(new)_        | WS diff subscription + viewer debounce.                               |
| `src/renderer/shared/hooks/watch/useChannelAutopilot.ts` _(new)_       | Auto-select + auto-switch.                                            |
| `src/renderer/shared/hooks/watch/useChannels.ts` _(slimmed)_           | Thin orchestrator; public export unchanged.                           |
| `src/renderer/shared/hooks/watch/index.ts` _(extend)_                  | Add `export * from "./channelEngine"`.                                |
| `src/renderer/shared/hooks/watch/useChannels.test.ts` _(deleted)_      | Replaced by `channelEngine.test.ts`.                                  |

## Shared Conventions (read once, applies to every task)

**Verification gate** — run after the implementation step of every task; all must pass before committing:

```bash
npx vitest run src/renderer/shared/hooks/watch   # the watch test files
npm run typecheck                                 # tsc --noEmit, gates CI
```

Expected: vitest reports **0 failed**; typecheck prints **no errors**.

**Behavior preservation rules** (this is a pure refactor — the watch subsystem is subtle per `docs/watch-engine.md`):

1. **Moves are verbatim.** When a task says "move lines A–B", copy the existing code unchanged except for the re-sourcing rule below. Do not rewrite logic, rename variables, or "improve" anything not called out.
2. **Re-sourcing rule.** Inside a moved effect/callback, every reference to a piece of state, ref, setter, or `applyChannelsState` that now lives in the store becomes `store.<name>`. Destructure the stable callbacks you depend on (`applyChannelsState`, `resetChannelData`, `resetAll`, setters) from `store` at the top of the hook, and keep each effect's **existing dependency array** (pointing at those destructured stable references), so effect-firing behavior is identical.
3. **Effect order is fixed:** the orchestrator calls hooks in the order `useChannelStore → useChannelFetch → useChannelLiveDiff → useChannelAutopilot`. Do not reorder.
4. **No `useReducer`.** Keep the existing `useState` setters.

**Commit style:** Conventional Commits. Each task ends in one commit on branch `refactor/usechannels-split`.

---

## Task 1: Remove the forensic-logging apparatus

Pure deletion — smallest, safest first move. Shrinks the file ~100 lines.

**Files:**

- Modify: `src/renderer/shared/hooks/watch/useChannels.ts`

- [ ] **Step 1: Delete the logging helpers and their call sites**

In `useChannels.ts`, delete these function definitions entirely:
`getAllowlistMatchKind` (≈361–369), `countAllowlistedChannels` (≈371–381), `findFirstAllowlistedIndex` (≈383–389), `buildChannelPrioritySample` (≈391–401), `isWatchingAllowlisted` (≈403–409), and `logChannelPrioritySnapshot` (≈411–463).

Delete the three `logChannelPrioritySnapshot({ … });` call sites:

- demo branch (≈589–597),
- real-fetch branch (≈657–665),
- the `if (payload.reason !== "viewers") { logChannelPrioritySnapshot({ … }); }` block in the live-diff `applyPayload` (≈744–755) — delete the whole `if` block.

Keep `normalizeAllowlist`, `prioritizeChannelsByAllowlist`, `buildAllowlistKey`, and all `logInfo` / `logDebug` / `logWarn` calls (e.g. `logInfo("channels: fetch success", …)`, `logDebug("channels: sample", …)`, `logInfo("channels: allowlist changed", …)`).

- [ ] **Step 2: Verify the gate passes**

```bash
npx vitest run src/renderer/shared/hooks/watch
npm run typecheck
```

Expected: 0 failed; no type errors. (If typecheck reports an unused import, remove only that import — but `logInfo`/`logDebug`/`logWarn` are all still used.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/hooks/watch/useChannels.ts
git commit -m "refactor(watch): drop forensic channel-priority logging from useChannels"
```

---

## Task 2: Extract allowlist helpers into `channelAllowlist.ts`

**Files:**

- Modify: `src/renderer/shared/hooks/watch/useChannels.ts`
- Modify: `src/renderer/shared/hooks/watch/channelAllowlist.ts`
- Test: `src/renderer/shared/hooks/watch/channelAllowlist.test.ts`

- [ ] **Step 1: Move the three helpers into `channelAllowlist.ts`**

Cut `normalizeAllowlist`, `prioritizeChannelsByAllowlist`, and `buildAllowlistKey` from `useChannels.ts` and paste them into `channelAllowlist.ts`. Mark all three `export`. Add the needed import at the top of `channelAllowlist.ts`:

```ts
import type { ChannelEntry } from "@renderer/shared/types";
```

(`channelAllowlist.ts` already imports `DropChannelRestriction` and `ChannelAllowlist` from `dropDomain`.)

- [ ] **Step 2: Import them back in `useChannels.ts`**

Add to the existing `./channelAllowlist`-adjacent imports in `useChannels.ts`:

```ts
import {
  buildAllowlistKey,
  normalizeAllowlist,
  prioritizeChannelsByAllowlist,
} from "./channelAllowlist";
```

- [ ] **Step 3: Add tests for the relocated helpers**

Append to `src/renderer/shared/hooks/watch/channelAllowlist.test.ts`:

```ts
import {
  buildAllowlistKey,
  normalizeAllowlist,
  prioritizeChannelsByAllowlist,
} from "./channelAllowlist";
import type { ChannelEntry } from "@renderer/shared/types";

const ch = (over: Partial<ChannelEntry> = {}): ChannelEntry => ({
  id: "1",
  login: "alpha",
  displayName: "Alpha",
  title: "t",
  viewers: 10,
  game: "Game",
  ...over,
});

describe("channel allowlist helpers", () => {
  it("normalizeAllowlist returns null when there are no constraints", () => {
    expect(normalizeAllowlist(null)).toBeNull();
    expect(normalizeAllowlist({ ids: [], logins: [] })).toBeNull();
  });

  it("prioritizeChannelsByAllowlist hoists allowlisted channels before fallback", () => {
    const channels = [ch({ id: "1", login: "alpha" }), ch({ id: "2", login: "beta" })];
    const out = prioritizeChannelsByAllowlist(channels, { ids: ["2"], logins: [] });
    expect(out.map((c) => c.id)).toEqual(["2", "1"]);
  });

  it("prioritizeChannelsByAllowlist returns the same array when no reorder is needed", () => {
    const channels = [ch({ id: "1" }), ch({ id: "2", login: "beta" })];
    expect(prioritizeChannelsByAllowlist(channels, null)).toBe(channels);
  });

  it("buildAllowlistKey is stable regardless of input order", () => {
    const a = buildAllowlistKey({ ids: ["b", "a"], logins: ["y", "x"] });
    const b = buildAllowlistKey({ ids: ["a", "b"], logins: ["x", "y"] });
    expect(a).toBe(b);
    expect(buildAllowlistKey(null)).toBe("");
  });
});
```

- [ ] **Step 4: Verify the gate passes**

```bash
npx vitest run src/renderer/shared/hooks/watch/channelAllowlist.test.ts
npm run typecheck
```

Expected: new tests PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shared/hooks/watch/useChannels.ts src/renderer/shared/hooks/watch/channelAllowlist.ts src/renderer/shared/hooks/watch/channelAllowlist.test.ts
git commit -m "refactor(watch): move allowlist helpers into channelAllowlist"
```

---

## Task 3: Extract pure logic into `channelEngine.ts`

**Files:**

- Create: `src/renderer/shared/hooks/watch/channelEngine.ts`
- Create: `src/renderer/shared/hooks/watch/channelEngine.test.ts`
- Delete: `src/renderer/shared/hooks/watch/useChannels.test.ts`
- Modify: `src/renderer/shared/hooks/watch/useChannels.ts`
- Modify: `src/renderer/shared/hooks/watch/index.ts`

- [ ] **Step 1: Create `channelEngine.ts` and move the pure functions**

Move these from `useChannels.ts` into a new `channelEngine.ts`, keeping each `export`: `sameChannel`, `mergeChannelList`, `sortChannelsByViewers`, `applyLiveDiff`, `mergeViewerLiveDiff`, `buildChannelDiff`, `isFreshCache`, `shouldAutoSelectChannel`, `computeAutoSwitchAction`, `isManualPriorityOverrideActive`, `shouldClearTrackerAfterStaleResponse`. Also move the `const MANUAL_PRIORITY_OVERRIDE_MS = 2 * 60_000;` constant (used by `isManualPriorityOverrideActive`).

**Do NOT move `hasRecentInventory` — delete it** (it is unused in production).

Header for `channelEngine.ts`:

```ts
import { sameGameName } from "@renderer/shared/domain/gameName";
import type {
  ChannelAllowlist,
  // (ChannelAllowlist comes from dropDomain — keep the import path used today)
} from "@renderer/shared/domain/dropDomain";
import type {
  ChannelDiff,
  ChannelEntry,
  ChannelLiveDiff,
  WatchingState,
} from "@renderer/shared/types";
import { normalizeAllowlist } from "./channelAllowlist";
```

(`shouldAutoSelectChannel` and `computeAutoSwitchAction` call `normalizeAllowlist`; `isManualPriorityOverrideActive` calls `sameGameName`. Verify the final import list against the moved bodies and drop any that turn out unused.)

- [ ] **Step 2: Import the engine functions back in `useChannels.ts`**

The hook still uses these directly — import them from `./channelEngine`:

```ts
import {
  applyLiveDiff,
  buildChannelDiff,
  computeAutoSwitchAction,
  isFreshCache,
  isManualPriorityOverrideActive,
  mergeChannelList,
  mergeViewerLiveDiff,
  shouldAutoSelectChannel,
  shouldClearTrackerAfterStaleResponse,
} from "./channelEngine";
```

- [ ] **Step 3: Move the test file**

Create `channelEngine.test.ts` as a copy of `useChannels.test.ts` with two edits, then delete `useChannels.test.ts`:

- change the import source `from "./useChannels"` → `from "./channelEngine"`;
- remove `hasRecentInventory` from that import list and delete the `hasRecentInventory({ … })` assertion block inside the `"respects cache freshness helpers"` test (keep the `isFreshCache(...)` assertion).

```bash
git rm src/renderer/shared/hooks/watch/useChannels.test.ts
```

- [ ] **Step 4: Add the barrel export**

In `src/renderer/shared/hooks/watch/index.ts` add a line (alongside the existing exports):

```ts
export * from "./channelEngine";
```

- [ ] **Step 5: Verify the gate passes**

```bash
npx vitest run src/renderer/shared/hooks/watch/channelEngine.test.ts
npm run typecheck
```

Expected: all moved assertions PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shared/hooks/watch/channelEngine.ts src/renderer/shared/hooks/watch/channelEngine.test.ts src/renderer/shared/hooks/watch/useChannels.ts src/renderer/shared/hooks/watch/index.ts
git rm src/renderer/shared/hooks/watch/useChannels.test.ts
git commit -m "refactor(watch): extract pure channel logic into channelEngine, drop dead hasRecentInventory"
```

---

## Task 4: Extract the state spine into `useChannelStore.ts`

This moves all `useState`/shared refs/`applyChannelsState`/resets and the two lifecycle reset effects out of the hook. The remaining effects in `useChannels.ts` are rewired to `store.*` per the re-sourcing rule.

**Files:**

- Create: `src/renderer/shared/hooks/watch/useChannelStore.ts`
- Modify: `src/renderer/shared/hooks/watch/useChannels.ts`

- [ ] **Step 1: Create `useChannelStore.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AutoSwitchInfo, ChannelDiff, ChannelEntry, ErrorInfo } from "@renderer/shared/types";

export type ChannelStore = {
  channels: ChannelEntry[];
  channelDiff: ChannelDiff | null;
  channelError: ErrorInfo | null;
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  autoSwitch: AutoSwitchInfo | null;
  fetchedAt: number | null;
  fetchedGame: string;
  channelsRef: MutableRefObject<ChannelEntry[]>;
  targetGameRef: MutableRefObject<string>;
  shouldTrackChannelsRef: MutableRefObject<boolean>;
  applyChannelsState: (next: ChannelEntry[]) => void;
  setChannelDiff: Dispatch<SetStateAction<ChannelDiff | null>>;
  setChannelError: Dispatch<SetStateAction<ErrorInfo | null>>;
  setChannelsLoading: Dispatch<SetStateAction<boolean>>;
  setChannelsRefreshing: Dispatch<SetStateAction<boolean>>;
  setAutoSwitch: Dispatch<SetStateAction<AutoSwitchInfo | null>>;
  setFetchedAt: Dispatch<SetStateAction<number | null>>;
  setFetchedGame: Dispatch<SetStateAction<string>>;
  resetChannelData: () => void;
  resetAll: () => void;
};

export function useChannelStore({
  targetGame,
  shouldTrackChannels,
  demoMode,
}: {
  targetGame: string;
  shouldTrackChannels: boolean;
  demoMode?: boolean;
}): ChannelStore {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const channelsRef = useRef<ChannelEntry[]>([]);
  const [channelError, setChannelError] = useState<ErrorInfo | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsRefreshing, setChannelsRefreshing] = useState(false);
  const [channelDiff, setChannelDiff] = useState<ChannelDiff | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [fetchedGame, setFetchedGame] = useState<string>("");
  const [autoSwitch, setAutoSwitch] = useState<AutoSwitchInfo | null>(null);
  const targetGameRef = useRef(targetGame);
  const shouldTrackChannelsRef = useRef(shouldTrackChannels);
  const trackerClearedRef = useRef(false);

  targetGameRef.current = targetGame;
  shouldTrackChannelsRef.current = shouldTrackChannels;

  const applyChannelsState = useCallback((next: ChannelEntry[]) => {
    channelsRef.current = next;
    setChannels(next);
  }, []);

  const resetChannelData = useCallback(() => {
    applyChannelsState([]);
    setChannelDiff(null);
    setChannelError(null);
    setFetchedAt(null);
    setFetchedGame("");
  }, [applyChannelsState]);

  const resetAll = useCallback(() => {
    resetChannelData();
    setChannelsLoading(false);
    setChannelsRefreshing(false);
    setAutoSwitch(null);
  }, [resetChannelData]);

  // Reset when switching demo mode.
  useEffect(() => {
    if (demoMode === undefined) return;
    resetAll();
  }, [demoMode, resetAll]);

  // Tear down + clear tracker subscriptions when tracking is disabled.
  useEffect(() => {
    if (shouldTrackChannels) {
      trackerClearedRef.current = false;
      return;
    }
    resetAll();
    if (!trackerClearedRef.current) {
      trackerClearedRef.current = true;
      void window.electronAPI.twitch.trackerClearChannels?.();
    }
  }, [resetAll, shouldTrackChannels]);

  return {
    channels,
    channelDiff,
    channelError,
    channelsLoading,
    channelsRefreshing,
    autoSwitch,
    fetchedAt,
    fetchedGame,
    channelsRef,
    targetGameRef,
    shouldTrackChannelsRef,
    applyChannelsState,
    setChannelDiff,
    setChannelError,
    setChannelsLoading,
    setChannelsRefreshing,
    setAutoSwitch,
    setFetchedAt,
    setFetchedGame,
    resetChannelData,
    resetAll,
  };
}
```

- [ ] **Step 2: Wire the store into `useChannels.ts`, delete the moved pieces**

In `useChannels.ts`:

- compute `shouldTrackChannels` and `hasTrackableTarget` exactly as today (keep that block);
- replace the eight `useState` declarations, `channelsRef`, `targetGameRef`, `shouldTrackChannelsRef`, `trackerClearedRef`, `applyChannelsState`, and the two reset effects (demo-reset ≈815–825 and tracking-disabled cleanup ≈959–976) with:

```ts
const store = useChannelStore({ targetGame, shouldTrackChannels, demoMode });
const {
  applyChannelsState,
  setChannelDiff,
  setChannelError,
  setChannelsLoading,
  setChannelsRefreshing,
  setAutoSwitch,
  setFetchedAt,
  setFetchedGame,
  resetChannelData,
  channelsRef,
  targetGameRef,
  shouldTrackChannelsRef,
} = store;
```

- delete the now-redundant `targetGameRef.current = targetGame;` line (the store does it).
- Everywhere the remaining hook code reads the old local state values `fetchedAt` / `fetchedGame` / `channels` / `autoSwitch`, read them from `store.` (e.g. `store.fetchedGame`, `store.channels`). Setter calls now use the destructured setters above (same names, so bodies are unchanged).
- the `return { … }` becomes:

```ts
return {
  channels: store.channels,
  channelDiff: store.channelDiff,
  channelError: store.channelError,
  channelsLoading: store.channelsLoading,
  channelsRefreshing: store.channelsRefreshing,
  autoSwitch: store.autoSwitch,
  fetchChannels,
};
```

- the target-game-change reset effect (≈720–732) stays in `useChannels.ts` for now; swap its inline `applyChannelsState([]); setChannelDiff(null); setChannelError(null); setFetchedAt(null); setFetchedGame("");` for a single `resetChannelData();` call (same five clears — verify against the store definition).

- [ ] **Step 3: Verify the gate passes**

```bash
npx vitest run src/renderer/shared/hooks/watch
npm run typecheck
```

Expected: 0 failed; no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/shared/hooks/watch/useChannelStore.ts src/renderer/shared/hooks/watch/useChannels.ts
git commit -m "refactor(watch): extract channel state spine into useChannelStore"
```

---

## Task 5: Extract fetching into `useChannelFetch.ts` (with demo/real de-duplication)

**Files:**

- Create: `src/renderer/shared/hooks/watch/useChannelFetch.ts`
- Modify: `src/renderer/shared/hooks/watch/useChannels.ts`

- [ ] **Step 1: Create `useChannelFetch.ts`**

Signature and shared helper (the de-dup of today's demo/real tails):

```ts
import { useCallback, useEffect, useRef } from "react";
import { useInterval } from "@renderer/shared/hooks/useInterval";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import { getDemoChannels } from "@renderer/shared/demoData";
import { errorInfoFromIpc, errorInfoFromUnknown } from "@renderer/shared/utils/errors";
import {
  isArrayOf,
  isChannelEntry,
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
} from "@renderer/shared/utils/ipc";
import { logDebug, logInfo, logWarn } from "@renderer/shared/utils/logger";
import { RENDERER_ERROR_CODES } from "../../../../shared/errorCodes";
import { buildAllowlistKey, prioritizeChannelsByAllowlist } from "./channelAllowlist";
import { buildChannelDiff, isFreshCache, mergeChannelList } from "./channelEngine";
import type { ChannelStore } from "./useChannelStore";

type FetchParams = {
  store: ChannelStore;
  allowWatching: boolean;
  demoMode?: boolean;
  channelAllowlist?: ChannelAllowlist | null;
  watching: WatchingState;
  onAuthError?: (message?: string) => void;
  targetGame: string;
  shouldTrackChannels: boolean;
  refreshWindowMs: number;
};

export function useChannelFetch({
  store,
  allowWatching,
  demoMode,
  channelAllowlist,
  watching,
  onAuthError,
  targetGame,
  shouldTrackChannels,
  refreshWindowMs,
}: FetchParams) {
  const {
    applyChannelsState,
    setChannelDiff,
    setChannelError,
    setChannelsLoading,
    setChannelsRefreshing,
    setFetchedAt,
    setFetchedGame,
    resetChannelData,
    channelsRef,
    targetGameRef,
    shouldTrackChannelsRef,
  } = store;

  const inFlightGamesRef = useRef<Set<string>>(new Set());
  const requestSeqRef = useRef(0);
  const latestAppliedRequestRef = useRef(0);
  const allowlistKeyRef = useRef<string>("");
  const lastTrackedGameRef = useRef<string>("");

  const isFresh = useCallback(
    (game: string, now = Date.now()) =>
      isFreshCache({
        fetchedAt: store.fetchedAt,
        fetchedGame: store.fetchedGame,
        game,
        now,
        refreshWindowMs,
      }),
    [store.fetchedAt, store.fetchedGame, refreshWindowMs],
  );

  // Shared apply tail for both demo and real fetches (replaces the duplicated
  // prioritize → diff → merge → set-meta sequence).
  const applyFetchedChannels = (
    prevList: ChannelEntry[],
    rawList: ChannelEntry[],
    gameName: string,
    now: number,
  ) => {
    const prioritized = prioritizeChannelsByAllowlist(rawList, channelAllowlist);
    const diff = buildChannelDiff(prevList, prioritized, now);
    setChannelDiff(diff);
    applyChannelsState(mergeChannelList(prevList, prioritized));
    setFetchedAt(now);
    setFetchedGame(gameName);
    if (diff) {
      logDebug("channels: diff", {
        game: gameName,
        added: diff.addedIds.length,
        removed: diff.removedIds.length,
        updated: diff.updatedIds.length,
      });
    }
  };

  // … clearTrackerIfTrackingDisabled, fetchChannels, and the four effects below …
}
```

Then move the rest verbatim (re-sourcing rule applies):

- `clearTrackerIfTrackingDisabled` (useChannels ≈531–549) — uses `shouldTrackChannelsRef`, `targetGameRef`.
- `fetchChannels` (≈550–718). **Refactor the two branches to call `applyFetchedChannels`:** in the demo branch, after the stale-guard + `latestAppliedRequestRef.current = requestId;`, replace the inline `buildChannelDiff/setChannelDiff/applyChannelsState/setFetchedAt/setFetchedGame/diff-log` with `applyFetchedChannels(prevList, rawList, gameName, now);`. In the real branch, keep the `logInfo("channels: fetch success", …)` and `logDebug("channels: sample", …)` lines, then replace the same trailing sequence with `applyFetchedChannels(prevList, rawList, gameName, now);`. Keep the in-flight dedup, request sequencing, stale guards, error/auth/invalid handling, and the `finally` block unchanged. Keep `fetchChannels`'s dependency array as today (sourced from the destructured stable callbacks + `store.fetchedGame` + `isFresh` + `channelAllowlist` + `watching` + `onAuthError` + `allowWatching` + `demoMode` + `clearTrackerIfTrackingDisabled`).
- The **target-game-change reset** effect (≈720–732): move it here. It uses `lastTrackedGameRef`, calls `window.electronAPI.twitch.trackerClearChannels?.()` then `resetChannelData()`. Keep deps `[allowWatching, resetChannelData, shouldTrackChannels, targetGame]`.
- The **fetch-on-active** effect (≈865–870). Deps `[fetchChannels, isFresh, shouldTrackChannels, targetGame]`.
- The **interval refresh** `useInterval(…)` (≈873–881) with `refreshWindowMs` and `shouldTrackChannels` enabled flag.
- The **allowlist-change** effect (≈827–862): re-prioritize `channelsRef.current` via `prioritizeChannelsByAllowlist`, diff + `applyChannelsState` on change, then the `buildAllowlistKey` compare + `logInfo("channels: allowlist changed", …)` + force `fetchChannels(targetGame, { force: true })`. Keep deps `[allowWatching, applyChannelsState, channelAllowlist, fetchChannels, shouldTrackChannels, targetGame, watching]`. (This effect also needs `buildChannelDiff` — import it; already in the import list above.)

End the hook with `return fetchChannels;`.

- [ ] **Step 2: Wire it into `useChannels.ts`, delete the moved pieces**

Remove from `useChannels.ts`: `isFresh`, `clearTrackerIfTrackingDisabled`, `fetchChannels`, the five fetch refs (`inFlightGamesRef`, `requestSeqRef`, `latestAppliedRequestRef`, `allowlistKeyRef`, `lastTrackedGameRef`), and the four effects listed above plus the target-game-change reset effect. Replace with:

```ts
const fetchChannels = useChannelFetch({
  store,
  allowWatching,
  demoMode,
  channelAllowlist,
  watching,
  onAuthError,
  targetGame,
  shouldTrackChannels,
  refreshWindowMs: TRACKER_REFRESH_WINDOW_MS,
});
```

(`TRACKER_REFRESH_WINDOW_MS` is the existing computed value near the top of the hook — keep that line.) Drop the now-unused imports from `useChannels.ts` (e.g. `useInterval`, `getDemoChannels`, `errorInfoFromIpc/Unknown`, the ipc guards, `RENDERER_ERROR_CODES`, `buildChannelDiff`/`mergeChannelList`/`isFreshCache` if no longer referenced there, `buildAllowlistKey`, `prioritizeChannelsByAllowlist`). Let `npm run typecheck` tell you exactly which.

- [ ] **Step 3: Verify the gate passes**

```bash
npx vitest run src/renderer/shared/hooks/watch
npm run typecheck
```

Expected: 0 failed; no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/shared/hooks/watch/useChannelFetch.ts src/renderer/shared/hooks/watch/useChannels.ts
git commit -m "refactor(watch): extract useChannelFetch and de-duplicate demo/real fetch paths"
```

---

## Task 6: Extract the live-diff subscription into `useChannelLiveDiff.ts`

**Files:**

- Create: `src/renderer/shared/hooks/watch/useChannelLiveDiff.ts`
- Modify: `src/renderer/shared/hooks/watch/useChannels.ts`

- [ ] **Step 1: Create `useChannelLiveDiff.ts`**

```ts
import { useEffect, useRef } from "react";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import { sameGameName } from "@renderer/shared/domain/gameName";
import type { ChannelLiveDiff, WatchingState } from "@renderer/shared/types";
import { isChannelLiveDiff } from "@renderer/shared/utils/ipc";
import { logDebug } from "@renderer/shared/utils/logger";
import { prioritizeChannelsByAllowlist } from "./channelAllowlist";
import {
  applyLiveDiff,
  buildChannelDiff,
  mergeChannelList,
  mergeViewerLiveDiff,
} from "./channelEngine";
import type { ChannelStore } from "./useChannelStore";

type LiveDiffParams = {
  store: ChannelStore;
  allowWatching: boolean;
  demoMode?: boolean;
  channelAllowlist?: ChannelAllowlist | null;
  watching: WatchingState;
  shouldTrackChannels: boolean;
};

export function useChannelLiveDiff({
  store,
  allowWatching,
  demoMode,
  channelAllowlist,
  watching,
  shouldTrackChannels,
}: LiveDiffParams) {
  const {
    applyChannelsState,
    setChannelDiff,
    setChannelsLoading,
    setChannelsRefreshing,
    setFetchedAt,
    setFetchedGame,
    channelsRef,
    targetGameRef,
  } = store;
  const pendingViewerDiffRef = useRef<ChannelLiveDiff | null>(null);
  const viewerFlushTimerRef = useRef<number | null>(null);

  // Move the entire `useEffect` that subscribes via
  // window.electronAPI.twitch.onChannelsDiff (useChannels ≈734–812) here,
  // verbatim except the re-sourcing rule. That effect contains:
  //   - applyPayload(payload) — reads channelsRef.current / targetGameRef.current,
  //     calls prioritizeChannelsByAllowlist + applyLiveDiff + mergeChannelList +
  //     buildChannelDiff, then the store setters. (The forensic-log block was
  //     already removed in Task 1.)
  //   - flushViewerDiff() + the 350ms viewer debounce using the two refs above.
  //   - the onChannelsDiff subscription + cleanup.
  // Keep the dependency array exactly as today:
  //   [allowWatching, applyChannelsState, demoMode, shouldTrackChannels,
  //    channelAllowlist, watching]
}
```

> Note: `applyPayload` references `shouldTrackChannels` (the value, via closure) — keep using the `shouldTrackChannels` prop, not the ref, to preserve the existing dependency-array behavior.

- [ ] **Step 2: Wire it into `useChannels.ts`, delete the moved effect + refs**

Remove the live-diff `useEffect` and `pendingViewerDiffRef` / `viewerFlushTimerRef` from `useChannels.ts`. Add:

```ts
useChannelLiveDiff({
  store,
  allowWatching,
  demoMode,
  channelAllowlist,
  watching,
  shouldTrackChannels,
});
```

Drop now-unused imports (`isChannelLiveDiff`, `applyLiveDiff`, `mergeViewerLiveDiff`, `sameGameName`, etc.) as typecheck flags them.

- [ ] **Step 3: Verify the gate passes**

```bash
npx vitest run src/renderer/shared/hooks/watch
npm run typecheck
```

Expected: 0 failed; no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/shared/hooks/watch/useChannelLiveDiff.ts src/renderer/shared/hooks/watch/useChannels.ts
git commit -m "refactor(watch): extract useChannelLiveDiff (WS diff + viewer debounce)"
```

---

## Task 7: Extract auto-select / auto-switch into `useChannelAutopilot.ts`

**Files:**

- Create: `src/renderer/shared/hooks/watch/useChannelAutopilot.ts`
- Modify: `src/renderer/shared/hooks/watch/useChannels.ts`

- [ ] **Step 1: Create `useChannelAutopilot.ts`**

```ts
import { useEffect } from "react";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import { normalizeAllowlist } from "./channelAllowlist";
import {
  computeAutoSwitchAction,
  isManualPriorityOverrideActive,
  shouldAutoSelectChannel,
} from "./channelEngine";
import type { ChannelStore } from "./useChannelStore";

type AutopilotParams = {
  store: ChannelStore;
  allowWatching: boolean;
  autoSelectEnabled: boolean;
  autoSwitchEnabled: boolean;
  canWatchTarget: boolean;
  channelAllowlist?: ChannelAllowlist | null;
  forcePrioritySwitch: boolean;
  manualWatchOverride?: { at: number; game: string } | null;
  targetGame: string;
  watching: WatchingState;
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
};

export function useChannelAutopilot({
  store,
  allowWatching,
  autoSelectEnabled,
  autoSwitchEnabled,
  canWatchTarget,
  channelAllowlist,
  forcePrioritySwitch,
  manualWatchOverride,
  targetGame,
  watching,
  setWatchingFromChannel,
  clearWatching,
}: AutopilotParams) {
  const { channels, setAutoSwitch } = store;

  // Move the auto-select effect (useChannels ≈884–911) here verbatim, reading
  // `channels` from the destructured store value. Keep deps:
  //   [channels, watching, targetGame, autoSelectEnabled, allowWatching,
  //    canWatchTarget, channelAllowlist, setWatchingFromChannel]

  // Move the auto-switch effect (useChannels ≈914–957) here verbatim, using
  // setAutoSwitch from the store. Keep deps:
  //   [channels, watching, targetGame, manualWatchOverride, allowWatching,
  //    autoSwitchEnabled, forcePrioritySwitch, canWatchTarget, channelAllowlist,
  //    clearWatching, setWatchingFromChannel]
}
```

- [ ] **Step 2: Wire it into `useChannels.ts`, delete the moved effects**

Remove the auto-select and auto-switch `useEffect`s from `useChannels.ts`. Add:

```ts
useChannelAutopilot({
  store,
  allowWatching,
  autoSelectEnabled,
  autoSwitchEnabled,
  canWatchTarget,
  channelAllowlist,
  forcePrioritySwitch,
  manualWatchOverride,
  targetGame,
  watching,
  setWatchingFromChannel,
  clearWatching,
});
```

After this, `useChannels.ts` is the thin orchestrator: it computes `TRACKER_REFRESH_WINDOW_MS`, `hasTrackableTarget`, `shouldTrackChannels`, calls the store + three hooks in order, and returns the seven public values. Drop the now-unused engine/allowlist imports (`computeAutoSwitchAction`, `isManualPriorityOverrideActive`, `shouldAutoSelectChannel`, `normalizeAllowlist`) from `useChannels.ts`.

- [ ] **Step 3: Verify the gate passes**

```bash
npx vitest run src/renderer/shared/hooks/watch
npm run typecheck
```

Expected: 0 failed; no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/shared/hooks/watch/useChannelAutopilot.ts src/renderer/shared/hooks/watch/useChannels.ts
git commit -m "refactor(watch): extract useChannelAutopilot (auto-select + auto-switch)"
```

---

## Task 8: Full verification gate + manual smoke

No code changes unless a check fails.

- [ ] **Step 1: Full automated gate**

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Expected: tests 0 failed; typecheck clean; lint exits 0 (warnings allowed); `format:check` reports all files formatted (run `npm run format` if not); build succeeds.

- [ ] **Step 2: Confirm `useChannels.ts` is the thin orchestrator**

Open `src/renderer/shared/hooks/watch/useChannels.ts`. It should be ~60–80 lines: imports, `Params` type (or re-used), the three derived values, `useChannelStore` + three hooks in order, and the seven-field return. No `useState`, no `fetchChannels` body, no subscription effect.

- [ ] **Step 3: Manual smoke via `npm run dev`, diffed against `main`**

Launch the app and confirm each behaves identically to `main`:

- **Auto-select:** with auto-select on and a target game live, a channel is picked automatically.
- **Auto-switch (offline):** make the watched channel disappear from the list (or wait for it to drop offline) → it switches to the next channel.
- **Allowlist priority:** with a drop that restricts channels, an allowlisted channel is preferred/hoisted.
- **Demo mode:** toggle demo mode on/off → channel list resets and repopulates cleanly, no stuck loading.
- **Live viewer updates:** viewer counts update smoothly (debounced), no flicker or reorder storms.
- **Tracking teardown:** leave the control view / disable watching → channel list clears and tracker stops.

- [ ] **Step 4: Final commit (only if Step 1 required a format/lint fix)**

```bash
git add -A
git commit -m "chore(watch): formatting after useChannels split"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** every spec item maps to a task — logging removal (T1), allowlist relocation (T2), channelEngine + dead-code deletion + test move (T3), store with two reset variants (T4), fetch de-dup (T5), live-diff (T6), autopilot (T7), full gate + manual smoke (T8). Barrel export handled in T3; `useAppModel` consumer untouched (return shape preserved in T4/T7).
- **Placeholder scan:** no TBD/TODO. Verbatim-move steps cite exact source line ranges + the re-sourcing rule rather than re-pasting unchanged bodies; all genuinely new code (store, `applyFetchedChannels`, hook signatures, new tests) is shown in full.
- **Type consistency:** `ChannelStore` field/method names are used identically across T4–T7; `applyFetchedChannels`, `resetChannelData`, `resetAll`, `isFresh` names are consistent throughout.
- **Green at every commit:** task order (delete logging → move pure code nothing else imports → introduce store → lift one concern per task) keeps `tsc` + tests passing after each task.
