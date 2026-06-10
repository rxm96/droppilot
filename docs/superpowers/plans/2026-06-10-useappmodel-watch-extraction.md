# useAppModel Watch Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the watch/stall orchestration from `useAppModel.ts` (1625 lines) into pure, unit-tested decision functions plus thin executor hooks, strictly behavior-preserving, per the approved spec `docs/superpowers/specs/2026-06-09-useappmodel-watch-extraction-design.md`.

**Architecture:** Periphery hooks move first (low risk), then each core concern lands as "pure module + tests" followed by "thin hook executor". The 285-line stall effect becomes three pure `decide*` functions returning `StallRecoveryAction[]` descriptors; the `useStallRecovery` hook executes them. Hook call order in `useAppModel` is unchanged (suppression↔orchestration cycle).

**Tech Stack:** React 19 hooks, TypeScript, Vitest (pure functions only — no rendered-hook tests), Prettier.

**Branch:** `refactor/useappmodel-watch-extraction` (already created, stacked on `refactor/usechannels-split`).

---

## Ground rules (apply to every task)

- **Behavior-preserving:** dependency arrays of moved effects stay 1:1 identical (modulo renamed identifiers that hold the same value). Log messages and fields stay byte-identical. Constants keep their values.
- Before each commit: `npx prettier --write <changed files>` (format:check gates CI).
- Verify per task: `npx tsc --noEmit -p tsconfig.json` and `npm test` must both pass.
- Watch hooks live in `src/renderer/shared/hooks/watch/` and are exported via `watch/index.ts` (the barrel — `useAppModel` imports from `@renderer/shared/hooks/watch`). App hooks live in `src/renderer/shared/hooks/app/` and are imported relatively (`./useActivityFeedWiring`) — no barrel there.
- Commit messages: Conventional Commits with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer (match `git log` style).
- If a discovered oddity looks like a real bug: **do not fix it** — keep the port faithful, add it to a `## Findings` section at the bottom of this plan file, and mention it in the PR description later.
- **Action union refinement vs. spec:** the implemented `StallRecoveryAction` union (Task 12) uses a generic `{ kind: "log" }` action for info-only lines and carries `context` on `dispatch-stall-stop`. Task 17 amends the spec to match.

### Reference: source blocks in `useAppModel.ts` (line numbers at plan time)

| Block                                             | Lines                 |
| ------------------------------------------------- | --------------------- |
| `toConsoleSnapshot` helper                        | 60–66                 |
| Stall/claim constants                             | 48–58                 |
| Watch-engine reducer + dispatch wrapper           | 138–142, 186–239      |
| Cooldown store + expiry effect                    | 159, 166–169, 240–324 |
| `lastWatchedChannelIdentity` + `watchStartedAt`   | 147–150, 347–377      |
| Drop-progress poll                                | 441–459               |
| Suppression selectors + `orchestrationCategories` | 538–589               |
| `getNextPriorityTargetGame`                       | 590–610               |
| Suppression sync + hold-expire effects            | 629–686               |
| Stall-stop retarget effect                        | 688–708               |
| Campaign debug log                                | 732–773               |
| Activity feed wiring                              | 828–895               |
| Claim probe                                       | 897–934               |
| Giant stall-recovery effect                       | 936–1220              |
| `watchEngineSnapshot` memo                        | 1260–1382             |

### Reference: existing types you will use

```ts
// @renderer/shared/types
type WatchingState = {
  id: string;
  name: string;
  game: string;
  login?: string;
  channelId?: string;
  streamId?: string;
} | null;
type ChannelEntry = {
  id: string;
  login: string;
  displayName: string;
  streamId?: string;
  title: string;
  viewers: number;
  language?: string;
  thumbnail?: string;
  game: string;
};
// InventoryItem, CampaignSummary, AutoSwitchInfo also live here.

// @renderer/shared/domain/dropDomain
type ChannelAllowlist = { ids: string[]; logins: string[] };
class DropChannelRestriction {
  static fromAllowlist(a?: ChannelAllowlist | null): DropChannelRestriction;
  get hasConstraints(): boolean;
  allowsChannel(c: { id?: string; login?: string }): boolean;
}

// @renderer/shared/hooks/priority
type WithCategory = { item: InventoryItem; category: string };
const isGameActionable: (
  game: string,
  withCategories: WithCategory[],
  opts?: { allowUpcoming?: boolean },
) => boolean;

// watch/useWatchPing.ts
type WatchStats = { lastOk: number; lastError: ErrorInfo | null; nextAt: number };
const WATCH_INTERVAL_MS: number;

// watch/watchStallRecovery.ts (existing)
type WatchStallTracker = {
  key: string;
  lastEarnedMinutes: number;
  lastProgressAt: number;
  lastActionAt: number;
  recoveryCount: number;
};
const buildWatchStallTrackerKey: (watching: WatchingState, dropId: string) => string;
const evaluateNoProgressStall: (args: {
  tracker: WatchStallTracker | null;
  key: string;
  earnedMinutes: number;
  now: number;
  noProgressWindowMs: number;
  actionCooldownMs: number;
}) => { tracker: WatchStallTracker; shouldRecover: boolean };
const shouldProbeNoProgressConfirmation: (args: {
  tracker: WatchStallTracker | null;
  key: string;
  now: number;
  noProgressWindowMs: number;
  probeLeadMs: number;
  lastWatchOk: number;
  watchPingGraceMs: number;
  lastProbeAt: number;
  probeCooldownMs: number;
}) => boolean;
const pickStallRecoveryChannel: (args: {
  channels: ChannelEntry[];
  watching: WatchingState;
  drop: StallRecoveryDrop;
}) => ChannelEntry | null;

// inventory/useTargetDrops.ts
type ActiveDropInfo = {
  id: string;
  title: string;
  requiredMinutes: number;
  earnedMinutes: number;
  virtualEarned: number;
  remainingMinutes: number;
  eta: number | null;
  progressAnchorAt?: number;
  dropInstanceId?: string;
  campaignId?: string;
  allowedChannelIds?: string[];
  allowedChannelLogins?: string[]; /* … */
};
```

If a type import path differs at implementation time (e.g. `ErrorInfo`, `ActiveDropInfo` barrel export), follow where the existing `useAppModel.ts` / `useAlertEffects.ts` imports come from — do not redeclare types that exist.

---

### Task 1: `useDropProgressPoll` (periphery)

**Files:**

- Create: `src/renderer/shared/hooks/watch/useDropProgressPoll.ts`
- Modify: `src/renderer/shared/hooks/watch/index.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (remove lines ~432–459 block)

- [ ] **Step 1: Create the hook** — move the block verbatim, including both comment blocks:

```ts
import { useEffect, useRef } from "react";
import type { WatchingState } from "@renderer/shared/types";

// Live drop-progress reconciliation while watching. The `user-drop-events`
// PubSub topic delivers drop-progress only intermittently (goes silent for
// long stretches), so we back it with the DropCurrentSessionContext GQL query
// — the same query the Twitch web player + TwitchDropsMiner use. Mirroring
// TDM, the poll is REACTIVE, not a blind timer: a cheap tick checks whether
// the watched drop has been confirmed (by a push event OR a previous poll)
// within STALL_MS; only if it's gone stale do we spend a request. So while
// events flow we make zero extra calls, and when they're silent we degrade to
// ~one poll per stall window. Stays under the radar by construction.
const DROP_PROGRESS_TICK_MS = 15_000; // how often we *check* (no request)
const DROP_PROGRESS_STALL_MS = 60_000; // poll only after this much silence

type Params = {
  watching: WatchingState;
  demoMode: boolean;
  pollDropProgressOnce: (channelId: string) => Promise<unknown>;
  pollDropProgressIfStale: (channelId: string, staleMs: number) => Promise<unknown>;
};

export function useDropProgressPoll({
  watching,
  demoMode,
  pollDropProgressOnce,
  pollDropProgressIfStale,
}: Params) {
  const isWatchingForPoll = Boolean(watching) && !demoMode;
  // The DropCurrentSessionContext query needs the watched channel id. Track it
  // in a ref so the poll always uses the current channel without restarting the
  // interval (and resetting its timer) every time the user switches channels.
  const watchingChannelIdRef = useRef<string>("");
  watchingChannelIdRef.current = String(watching?.channelId ?? watching?.id ?? "");
  useEffect(() => {
    if (!isWatchingForPoll) return;
    // One unconditional baseline poll on watch start so the user sees progress
    // shortly after starting (also seeds the stall clock). After that the gate
    // takes over and only polls when the live data has actually gone stale.
    void pollDropProgressOnce(watchingChannelIdRef.current);
    const id = window.setInterval(() => {
      void pollDropProgressIfStale(watchingChannelIdRef.current, DROP_PROGRESS_STALL_MS);
    }, DROP_PROGRESS_TICK_MS);
    return () => window.clearInterval(id);
  }, [isWatchingForPoll, pollDropProgressOnce, pollDropProgressIfStale]);
}
```

- [ ] **Step 2: Export from the barrel** — add to `watch/index.ts`: `export * from "./useDropProgressPoll";`

- [ ] **Step 3: Wire `useAppModel`** — delete the moved block (constants `DROP_PROGRESS_TICK_MS`/`DROP_PROGRESS_STALL_MS`, `isWatchingForPoll`, `watchingChannelIdRef`, and the effect) and replace with, at the same position (after the `useWatchPing` call):

```ts
useDropProgressPoll({ watching, demoMode, pollDropProgressOnce, pollDropProgressIfStale });
```

Add `useDropProgressPoll` to the existing `@renderer/shared/hooks/watch` import.

- [ ] **Step 4: Verify** — Run: `npx tsc --noEmit -p tsconfig.json` then `npm test`. Expected: both clean.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/useDropProgressPoll.ts src/renderer/shared/hooks/watch/index.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "refactor(watch): extract useDropProgressPoll from useAppModel"
```

---

### Task 2: `useClaimProbe` (periphery)

**Files:**

- Create: `src/renderer/shared/hooks/watch/useClaimProbe.ts`
- Modify: `src/renderer/shared/hooks/watch/watchStallRecovery.ts` (add shared constant)
- Modify: `src/renderer/shared/hooks/watch/index.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts`

- [ ] **Step 1: Add the shared near-end constant to the pure module** — `CLAIM_PROBE_NEAR_END_MINUTES` is used by the claim probe AND by the stall effect's near-end window (line 1076). It lives in `watchStallRecovery.ts` so a pure module never imports from a hook file:

```ts
// In watchStallRecovery.ts, below the existing imports:

/**
 * "Near end" threshold shared by the claim probe and the no-progress stall
 * window: once a drop's predicted remaining time is at or below this, both
 * tighten their cadence.
 */
export const CLAIM_PROBE_NEAR_END_MINUTES = 1;
```

- [ ] **Step 2: Create the hook** (`useClaimProbe.ts`):

```ts
import { useEffect, useRef } from "react";
import type { WatchingState } from "@renderer/shared/types";
import type { ActiveDropInfo } from "@renderer/shared/hooks/inventory";
import { CLAIM_PROBE_NEAR_END_MINUTES } from "./watchStallRecovery";

const CLAIM_PROBE_INTERVAL_MS = 25_000;

type Params = {
  watching: WatchingState;
  activeDropInfo: ActiveDropInfo | null;
  inventoryFetchedAt: number | null;
  // watchStats.lastOk — unused in the effect body, but deliberately in the deps:
  // each successful watch ping re-evaluates the near-end predicate, which is how
  // the probe arms itself as predicted remaining time crosses the threshold.
  lastWatchOk: number;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<unknown>;
};

export function useClaimProbe({
  watching,
  activeDropInfo,
  inventoryFetchedAt,
  lastWatchOk,
  fetchInventory,
}: Params) {
  const claimProbeInFlightRef = useRef(false);
  const claimProbeLastAtRef = useRef(0);

  useEffect(() => {
    if (!watching || !activeDropInfo) return;
    const anchorAt = activeDropInfo.progressAnchorAt ?? inventoryFetchedAt;
    const remainingBase = Math.max(
      0,
      activeDropInfo.requiredMinutes - activeDropInfo.earnedMinutes,
    );
    const elapsedMinutes =
      typeof anchorAt === "number" && Number.isFinite(anchorAt)
        ? Math.max(0, (Date.now() - anchorAt) / 60_000)
        : 0;
    const predictedRemainingMinutes = Math.max(0, remainingBase - elapsedMinutes);
    if (predictedRemainingMinutes > CLAIM_PROBE_NEAR_END_MINUTES) return;

    let cancelled = false;
    const runProbe = async () => {
      if (cancelled) return;
      const now = Date.now();
      if (claimProbeInFlightRef.current) return;
      if (now - claimProbeLastAtRef.current < CLAIM_PROBE_INTERVAL_MS) return;
      claimProbeInFlightRef.current = true;
      claimProbeLastAtRef.current = now;
      try {
        await fetchInventory({ forceLoading: true });
      } finally {
        claimProbeInFlightRef.current = false;
      }
    };

    void runProbe();
    const timer = window.setInterval(() => {
      void runProbe();
    }, CLAIM_PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeDropInfo, fetchInventory, inventoryFetchedAt, lastWatchOk, watching]);
}
```

(If `ActiveDropInfo` is not re-exported by the inventory barrel, import it from `@renderer/shared/hooks/inventory/useTargetDrops`. If `inventoryFetchedAt`'s actual type from `useInventory` is `number | undefined`, mirror that instead — do not change the value flow.)

- [ ] **Step 3: Export from the barrel** — `export * from "./useClaimProbe";` in `watch/index.ts`.

- [ ] **Step 4: Wire `useAppModel`** — delete: the local constants `CLAIM_PROBE_NEAR_END_MINUTES` and `CLAIM_PROBE_INTERVAL_MS` (lines 48–49), the refs `claimProbeInFlightRef`/`claimProbeLastAtRef` (157–158), and the effect (897–934). The stall effect still needs the near-end constant: add `CLAIM_PROBE_NEAR_END_MINUTES` to the existing `@renderer/shared/hooks/watch` import. Insert at the old effect's position (must be after `useTargetDrops` provides `activeDropInfo`):

```ts
useClaimProbe({
  watching,
  activeDropInfo,
  inventoryFetchedAt,
  lastWatchOk: watchStats.lastOk,
  fetchInventory,
});
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit -p tsconfig.json` + `npm test`. Expected: clean.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/useClaimProbe.ts src/renderer/shared/hooks/watch/watchStallRecovery.ts src/renderer/shared/hooks/watch/index.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "refactor(watch): extract useClaimProbe; share near-end constant from watchStallRecovery"
```

---

### Task 3: `useWatchSessionMeta` (periphery)

**Files:**

- Create: `src/renderer/shared/hooks/watch/useWatchSessionMeta.ts`
- Modify: `src/renderer/shared/hooks/watch/index.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts`

- [ ] **Step 1: Create the hook** — moves `lastWatchedChannelIdentity` (state 147–150, effect 347–359) and `watchStartedAt` (361–377) together:

```ts
import { useEffect, useRef, useState } from "react";
import type { WatchingState } from "@renderer/shared/types";

export type WatchedChannelIdentity = { id: string; login: string };

export function useWatchSessionMeta(watching: WatchingState) {
  const [lastWatchedChannelIdentity, setLastWatchedChannelIdentity] =
    useState<WatchedChannelIdentity | null>(null);
  useEffect(() => {
    if (!watching) return;
    const normalizedLogin = (watching.login ?? watching.name ?? "").trim().toLowerCase();
    setLastWatchedChannelIdentity((prev) => {
      if (prev?.id === watching.id && prev.login === normalizedLogin) {
        return prev;
      }
      return {
        id: watching.id,
        login: normalizedLogin,
      };
    });
  }, [watching]);

  // Stamp when the current watch session (channel+stream) began so useTargetDrops
  // can clamp its live-progress anchor to it — we must not credit elapsed time
  // from before the user started watching (e.g. a stale inventory snapshot).
  // Same session-key semantics ControlView uses, so both views agree.
  const watchSessionKeyRef = useRef<string | null>(null);
  const [watchStartedAt, setWatchStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!watching) {
      watchSessionKeyRef.current = null;
      setWatchStartedAt(null);
      return;
    }
    const sessionKey = `${watching.id}:${watching.streamId ?? ""}`;
    if (watchSessionKeyRef.current === sessionKey) return;
    watchSessionKeyRef.current = sessionKey;
    setWatchStartedAt(Date.now());
  }, [watching]);

  return { lastWatchedChannelIdentity, watchStartedAt };
}
```

- [ ] **Step 2: Export from the barrel**, delete the moved code from `useAppModel`, and wire:

```ts
const { lastWatchedChannelIdentity, watchStartedAt } = useWatchSessionMeta(watching);
```

Place directly after the `useWatchingController()` call (both consumers — `useTargetDrops` and `controlProps` — come later).

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json` + `npm test`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/useWatchSessionMeta.ts src/renderer/shared/hooks/watch/index.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "refactor(watch): extract useWatchSessionMeta (session stamp + last channel identity)"
```

---

### Task 4: `useActivityFeedWiring` (periphery, app-level)

**Files:**

- Create: `src/renderer/shared/hooks/app/useActivityFeedWiring.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (remove lines 828–895)

- [ ] **Step 1: Create the hook** — the four rising-edge effects verbatim:

```ts
import { useEffect, useRef } from "react";
import type { AutoSwitchInfo, InventoryItem, WatchingState } from "@renderer/shared/types";
import { recordActivity } from "@renderer/shared/utils/activityFeed";
import type { ActivityEvent } from "@renderer/shared/utils/activityFeed";

type Params = {
  autoSwitchInfo: AutoSwitchInfo | null;
  inventoryChanges: { added: Set<string> };
  inventoryItems: InventoryItem[];
  lastWatchError: { code?: string; message: string } | null;
  watching: WatchingState;
};

// Activity feed wiring (Sources 2-5). Source 1 (drop-claimed) is recorded by
// useDropClaimAlerts.
export function useActivityFeedWiring({
  autoSwitchInfo,
  inventoryChanges,
  inventoryItems,
  lastWatchError,
  watching,
}: Params) {
  // Source 2: Auto-switch — rising-edge detect (null → truthy with new `at`)
  const prevAutoSwitchRef = useRef<AutoSwitchInfo | null>(null);
  useEffect(() => {
    const prev = prevAutoSwitchRef.current;
    prevAutoSwitchRef.current = autoSwitchInfo;
    if (!autoSwitchInfo) return;
    if (prev && prev.at === autoSwitchInfo.at) return;
    recordActivity({
      kind: "auto-switch",
      at: autoSwitchInfo.at ?? Date.now(),
      fromName: autoSwitchInfo.from?.name ?? "",
      toName: autoSwitchInfo.to?.name ?? "",
      reason: autoSwitchInfo.reason ?? "",
    } as Omit<Extract<ActivityEvent, { kind: "auto-switch" }>, "id">);
  }, [autoSwitchInfo]);

  // Source 3: New drops added — rising-edge detect on added set size
  const prevAddedRef = useRef<Set<string> | undefined>(undefined);
  useEffect(() => {
    const prevSize = prevAddedRef.current?.size ?? 0;
    const currSize = inventoryChanges?.added?.size ?? 0;
    prevAddedRef.current = inventoryChanges?.added;
    if (currSize > prevSize && currSize > 0) {
      const firstAddedId = inventoryChanges.added.values().next().value;
      const sample = firstAddedId ? inventoryItems.find((it) => it.id === firstAddedId) : undefined;
      recordActivity({
        kind: "new-drops",
        at: Date.now(),
        count: currSize,
        sampleTitle: sample?.title,
      } as Omit<Extract<ActivityEvent, { kind: "new-drops" }>, "id">);
    }
  }, [inventoryChanges, inventoryItems]);

  // Source 4: Watch error — rising-edge detect (new or changed error)
  const prevWatchErrorRef = useRef<typeof lastWatchError>(null);
  useEffect(() => {
    const prev = prevWatchErrorRef.current;
    const curr = lastWatchError;
    prevWatchErrorRef.current = curr;
    if (!curr) return;
    if (prev && prev.code === curr.code && prev.message === curr.message) return;
    recordActivity({
      kind: "watch-error",
      at: Date.now(),
      message: curr.message,
      code: curr.code,
    } as Omit<Extract<ActivityEvent, { kind: "watch-error" }>, "id">);
  }, [lastWatchError]);

  // Source 5: Watch started — null → truthy transition
  const prevWatchingRef = useRef<WatchingState>(null);
  useEffect(() => {
    const prev = prevWatchingRef.current;
    prevWatchingRef.current = watching;
    if (!prev && watching) {
      recordActivity({
        kind: "watch-started",
        at: Date.now(),
        channelName: watching.name ?? watching.login ?? "",
        game: watching.game,
      } as Omit<Extract<ActivityEvent, { kind: "watch-started" }>, "id">);
    }
  }, [watching]);
}
```

(`lastWatchError`'s structural type must match `WatchStats["lastError"]` — if `ErrorInfo` is exported, import and use it instead of the inline shape. If `inventoryChanges` has a named exported type, use it.) Note: Source 4's effect previously had dep `[watchStats.lastError]` — `[lastWatchError]` holds the same value.

- [ ] **Step 2: Wire `useAppModel`** — delete lines 828–895 (including the `--- Activity feed wiring ---` banner comments) and insert at the same position (after `useAlertEffects` provides `autoSwitchInfo`):

```ts
useActivityFeedWiring({
  autoSwitchInfo,
  inventoryChanges,
  inventoryItems,
  lastWatchError: watchStats.lastError,
  watching,
});
```

Import: `import { useActivityFeedWiring } from "./useActivityFeedWiring";`. Remove the now-unused `recordActivity`/`ActivityEvent` imports from `useAppModel`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json` + `npm test`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/app/useActivityFeedWiring.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "refactor(app): extract useActivityFeedWiring from useAppModel"
```

---

### Task 5: `useActiveCampaignDebugLog` (periphery, app-level)

**Files:**

- Create: `src/renderer/shared/hooks/app/useActiveCampaignDebugLog.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (remove lines 60–66, 170, 732–773)

- [ ] **Step 1: Create the hook** — moves `toConsoleSnapshot`, the signature ref, and the effect verbatim:

```ts
import { useEffect, useRef } from "react";
import type { CampaignSummary, InventoryItem, WatchingState } from "@renderer/shared/types";
import type { ActiveDropInfo } from "@renderer/shared/hooks/inventory";

const toConsoleSnapshot = <T>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

type Params = {
  activeDropInfo: ActiveDropInfo | null;
  campaigns: CampaignSummary[];
  inventoryFetchedAt: number | null;
  inventoryItems: InventoryItem[];
  targetGame: string;
  watching: WatchingState;
};

export function useActiveCampaignDebugLog({
  activeDropInfo,
  campaigns,
  inventoryFetchedAt,
  inventoryItems,
  targetGame,
  watching,
}: Params) {
  const activeCampaignDebugSignatureRef = useRef<string>("");
  useEffect(() => {
    const activeDropId = activeDropInfo?.id?.trim() ?? "";
    const activeCampaignId = activeDropInfo?.campaignId?.trim() ?? "";
    const watchingId = watching?.channelId ?? watching?.id ?? "";
    const signature = [
      activeDropId,
      activeCampaignId,
      targetGame,
      watchingId,
      inventoryFetchedAt ?? "",
    ].join("|");
    if (activeCampaignDebugSignatureRef.current === signature) return;
    activeCampaignDebugSignatureRef.current = signature;

    const activeDropRaw =
      (activeDropId ? inventoryItems.find((item) => item.id === activeDropId) : null) ?? null;
    const activeCampaignSummary =
      (activeCampaignId ? campaigns.find((campaign) => campaign.id === activeCampaignId) : null) ??
      null;
    const activeCampaignDropsFromInventory = activeCampaignId
      ? inventoryItems.filter((item) => item.campaignId === activeCampaignId)
      : activeDropRaw?.campaignId
        ? inventoryItems.filter((item) => item.campaignId === activeDropRaw.campaignId)
        : [];

    console.log(
      "[DropPilot] active-campaign-debug",
      toConsoleSnapshot({
        at: new Date().toISOString(),
        targetGame,
        watching,
        inventoryFetchedAt,
        activeDropInfo,
        activeDropRaw,
        activeCampaignSummary,
        activeCampaignDropsFromSummary: activeCampaignSummary?.drops ?? null,
        activeCampaignDropsFromInventory,
        inventoryItemsCount: inventoryItems.length,
        campaignsCount: campaigns.length,
      }),
    );
  }, [activeDropInfo, campaigns, inventoryFetchedAt, inventoryItems, targetGame, watching]);
}
```

- [ ] **Step 2: Wire `useAppModel`** — delete the moved pieces and insert at the old effect's position:

```ts
useActiveCampaignDebugLog({
  activeDropInfo,
  campaigns,
  inventoryFetchedAt,
  inventoryItems,
  targetGame,
  watching,
});
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json` + `npm test`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/app/useActiveCampaignDebugLog.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "refactor(app): extract useActiveCampaignDebugLog from useAppModel"
```

---

### Task 6: `gameCooldowns.ts` — pure cooldown logic + tests

**Files:**

- Create: `src/renderer/shared/hooks/watch/gameCooldowns.ts`
- Create: `src/renderer/shared/hooks/watch/gameCooldowns.test.ts`
- Modify: `src/renderer/shared/hooks/watch/index.ts`

- [ ] **Step 1: Write the failing tests first** (`gameCooldowns.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import {
  filterCategoriesForOrchestration,
  isGameInCooldown,
  nextCooldownExpiry,
  pruneExpiredCooldowns,
  removeCooldown,
  upsertCooldown,
} from "./gameCooldowns";

describe("gameCooldowns", () => {
  it("upserts a new cooldown", () => {
    expect(upsertCooldown({}, "Rust", 1_000)).toEqual({ Rust: 1_000 });
  });

  it("upsert is monotonic — a shorter cooldown never overwrites a longer one", () => {
    const map = { Rust: 5_000 };
    expect(upsertCooldown(map, "Rust", 1_000)).toBe(map);
    expect(upsertCooldown(map, "Rust", 9_000)).toEqual({ Rust: 9_000 });
  });

  it("upsert trims the game and ignores empty names", () => {
    const map = {};
    expect(upsertCooldown(map, "  ", 1_000)).toBe(map);
    expect(upsertCooldown(map, " Rust ", 1_000)).toEqual({ Rust: 1_000 });
  });

  it("removeCooldown returns the same map when the game is absent", () => {
    const map = { Rust: 1_000 };
    expect(removeCooldown(map, "Dota 2")).toBe(map);
    expect(removeCooldown(map, "Rust")).toEqual({});
  });

  it("prune drops expired and non-finite entries, keeps the rest", () => {
    const map = { A: 1_000, B: 5_000, C: Number.NaN };
    expect(pruneExpiredCooldowns(map, 2_000)).toEqual({ B: 5_000 });
  });

  it("prune returns the same map when nothing expired", () => {
    const map = { A: 5_000 };
    expect(pruneExpiredCooldowns(map, 1_000)).toBe(map);
  });

  it("nextCooldownExpiry returns the earliest expiry or null", () => {
    expect(nextCooldownExpiry({})).toBeNull();
    expect(nextCooldownExpiry({ A: 5_000, B: 3_000 })).toBe(3_000);
  });

  it("isGameInCooldown checks trimmed name against now", () => {
    const map = { Rust: 5_000 };
    expect(isGameInCooldown(map, " Rust ", 1_000)).toBe(true);
    expect(isGameInCooldown(map, "Rust", 5_000)).toBe(false);
    expect(isGameInCooldown(map, "Dota 2", 1_000)).toBe(false);
    expect(isGameInCooldown(map, "", 1_000)).toBe(false);
  });

  const cat = (game: string) => ({ item: { game } as never, category: "in-progress" });

  it("orchestration filter is an identity fast-path when nothing is blocked", () => {
    const cats = [cat("Rust")];
    expect(
      filterCategoriesForOrchestration(cats, { suppressedGame: "", cooldowns: {}, now: 0 }),
    ).toBe(cats);
  });

  it("orchestration filter drops suppressed and cooled-down games, keeps blank games", () => {
    const cats = [cat("Rust"), cat("Dota 2"), cat(""), cat("PoE")];
    const result = filterCategoriesForOrchestration(cats, {
      suppressedGame: "Rust",
      cooldowns: { "Dota 2": 5_000 },
      now: 1_000,
    });
    expect(result.map((c) => c.item.game)).toEqual(["", "PoE"]);
  });
});
```

Note on the `as never` cast: `WithCategory["item"]` is a full `InventoryItem`; the filter only reads `item.game`, so tests construct a minimal stub.

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/renderer/shared/hooks/watch/gameCooldowns.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`gameCooldowns.ts`):

```ts
import type { WithCategory } from "@renderer/shared/hooks/priority";

export type CooldownReason = "stall-no-farmable" | "stall-no-progress";

/** game name (trimmed) → epoch ms until which the game is blocked. */
export type GameCooldownMap = Record<string, number>;

/** Monotonic-max upsert: a shorter cooldown never overwrites a longer one. Returns the same map on no-op. */
export const upsertCooldown = (
  map: GameCooldownMap,
  rawGame: string,
  until: number,
): GameCooldownMap => {
  const game = rawGame.trim();
  if (!game) return map;
  const current = map[game] ?? 0;
  if (current >= until) return map;
  return { ...map, [game]: until };
};

/** Returns the same map when the game has no entry. */
export const removeCooldown = (map: GameCooldownMap, rawGame: string): GameCooldownMap => {
  const game = rawGame.trim();
  if (!game || !(game in map)) return map;
  const next = { ...map };
  delete next[game];
  return next;
};

/** Drops expired and non-finite entries. Returns the same map when nothing changed. */
export const pruneExpiredCooldowns = (map: GameCooldownMap, now: number): GameCooldownMap => {
  let changed = false;
  const next: GameCooldownMap = {};
  for (const [game, until] of Object.entries(map)) {
    if (Number.isFinite(until) && until > now) {
      next[game] = until;
      continue;
    }
    changed = true;
  }
  return changed ? next : map;
};

export const nextCooldownExpiry = (map: GameCooldownMap): number | null => {
  const untils = Object.values(map);
  if (untils.length === 0) return null;
  return Math.min(...untils);
};

export const isGameInCooldown = (map: GameCooldownMap, rawGame: string, now: number): boolean => {
  const game = rawGame.trim();
  if (!game) return false;
  const until = map[game];
  return typeof until === "number" && Number.isFinite(until) && until > now;
};

/**
 * Hide the suppressed game and any cooled-down games from priority
 * orchestration so it advances to the next eligible target. Items without a
 * game name pass through. Identity fast-path when nothing is blocked.
 */
export const filterCategoriesForOrchestration = (
  withCategories: WithCategory[],
  {
    suppressedGame,
    cooldowns,
    now,
  }: { suppressedGame: string; cooldowns: GameCooldownMap; now: number },
): WithCategory[] => {
  if (!suppressedGame && Object.keys(cooldowns).length === 0) {
    return withCategories;
  }
  return withCategories.filter(({ item }) => {
    const game = item.game.trim();
    if (!game) return true;
    if (suppressedGame && game === suppressedGame) return false;
    return !isGameInCooldown(cooldowns, game, now);
  });
};
```

(If `WithCategory` is not re-exported by the priority barrel, import from `@renderer/shared/hooks/priority/usePriorityOrchestration`.)

- [ ] **Step 4: Run tests to verify they pass** — `npx vitest run src/renderer/shared/hooks/watch/gameCooldowns.test.ts`. Expected: PASS. Then `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 5: Export + commit** — add `export * from "./gameCooldowns";` to `watch/index.ts`.

```bash
npx prettier --write src/renderer/shared/hooks/watch/gameCooldowns.ts src/renderer/shared/hooks/watch/gameCooldowns.test.ts src/renderer/shared/hooks/watch/index.ts
git add -A && git commit -m "test(watch): pure gameCooldowns module (upsert/prune/filter) with tests"
```

---

### Task 7: `useStalledGameCooldowns` hook + wiring

**Files:**

- Create: `src/renderer/shared/hooks/watch/useStalledGameCooldowns.ts`
- Modify: `src/renderer/shared/hooks/watch/index.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts`

- [ ] **Step 1: Create the hook** — replaces lines 159, 166–169, 240–324:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { logInfo } from "@renderer/shared/utils/logger";
import {
  isGameInCooldown,
  nextCooldownExpiry,
  pruneExpiredCooldowns,
  removeCooldown,
  upsertCooldown,
  type CooldownReason,
  type GameCooldownMap,
} from "./gameCooldowns";

/**
 * Stalled-game cooldown store. State drives reactivity (orchestration filter,
 * snapshot); the ref mirror lets setCooldown/clearCooldown stay referentially
 * stable while still deduplicating against the latest value.
 */
export function useStalledGameCooldowns() {
  const [cooldowns, setCooldowns] = useState<GameCooldownMap>({});
  const cooldownsRef = useRef<GameCooldownMap>({});

  const setCooldown = useCallback((rawGame: string, durationMs: number, reason: CooldownReason) => {
    const game = rawGame.trim();
    if (!game) return;
    const now = Date.now();
    const until = now + durationMs;
    const current = cooldownsRef.current[game] ?? 0;
    if (current >= until) return;
    cooldownsRef.current = { ...cooldownsRef.current, [game]: until };
    logInfo("watch-engine: cooldown", {
      reason,
      game,
      durationMs,
      until,
    });
    setCooldowns((prev) => upsertCooldown(prev, game, until));
  }, []);

  const clearCooldown = useCallback((rawGame: string, context: string) => {
    const game = rawGame.trim();
    if (!game) return;
    if (!(game in cooldownsRef.current)) return;
    cooldownsRef.current = removeCooldown(cooldownsRef.current, game);
    logInfo("watch-engine: cooldown clear", { context, game });
    setCooldowns((prev) => removeCooldown(prev, game));
  }, []);

  useEffect(() => {
    cooldownsRef.current = cooldowns;
  }, [cooldowns]);

  // Self-pruning: drop expired entries, then sleep until the next expiry
  // (+32ms slack). Prune-by-time instead of the old prune-by-name-list — the
  // two only diverge if an entry is extended between render and state update,
  // where prune-by-time is the safer behavior.
  useEffect(() => {
    const entries = Object.entries(cooldowns);
    if (entries.length === 0) return;
    const now = Date.now();
    const pruned = pruneExpiredCooldowns(cooldowns, now);
    if (pruned !== cooldowns) {
      setCooldowns((prev) => pruneExpiredCooldowns(prev, now));
      return;
    }
    const nextExpiry = nextCooldownExpiry(cooldowns);
    if (nextExpiry === null) return;
    const timer = window.setTimeout(
      () => {
        setCooldowns((prev) => pruneExpiredCooldowns(prev, Date.now()));
      },
      Math.max(0, nextExpiry - now) + 32,
    );
    return () => window.clearTimeout(timer);
  }, [cooldowns]);

  // Reads state (not the ref) on purpose: consumers memoize on this callback,
  // and it must change identity when the map changes so they re-evaluate.
  const isInCooldown = useCallback(
    (rawGame: string, now = Date.now()): boolean => isGameInCooldown(cooldowns, rawGame, now),
    [cooldowns],
  );

  return { cooldowns, setCooldown, clearCooldown, isInCooldown };
}
```

- [ ] **Step 2: Export from the barrel** and wire `useAppModel`. Delete the moved code and replace the consumption sites:

```ts
const {
  cooldowns: stalledGameCooldownUntil,
  setCooldown: setStalledGameCooldown,
  clearCooldown: clearStalledGameCooldown,
  isInCooldown: isGameInStallCooldown,
} = useStalledGameCooldowns();
```

(Renaming on destructure keeps every downstream reference — `getNextPriorityTargetGame`, the stall effect, the snapshot memo, `handleStartWatching` — untouched.) Delete the old `isGameInStallCooldown` callback (lines 542–550) too. Replace the `orchestrationCategories` memo (551–562) with:

```ts
const orchestrationCategories = useMemo(
  () =>
    filterCategoriesForOrchestration(withCategories, {
      suppressedGame: stallSuppressedGame,
      cooldowns: stalledGameCooldownUntil,
      now: Date.now(),
    }),
  [stallSuppressedGame, stalledGameCooldownUntil, withCategories],
);
```

(Dep note: the old memo also listed `isGameInStallCooldown`, which was itself memoized on the map — `stalledGameCooldownUntil` already covers it.) Import `filterCategoriesForOrchestration` and `useStalledGameCooldowns` from the watch barrel.

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json` + `npm test`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/useStalledGameCooldowns.ts src/renderer/shared/hooks/watch/index.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "refactor(watch): extract useStalledGameCooldowns over pure gameCooldowns"
```

---

### Task 8: `stampWatchEngineEvent` (pure) + test

**Files:**

- Modify: `src/renderer/shared/hooks/watch/watchEngine.ts`
- Modify: `src/renderer/shared/hooks/watch/watchEngine.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `watchEngine.test.ts` (inside a new `describe`):

```ts
import { stampWatchEngineEvent } from "./watchEngine"; // merge into the existing import

describe("stampWatchEngineEvent", () => {
  it("stamps watch/stop and watch/stall_stop with now when at is missing", () => {
    expect(stampWatchEngineEvent({ type: "watch/stop", activeTargetGame: "Rust" }, 42)).toEqual({
      type: "watch/stop",
      activeTargetGame: "Rust",
      at: 42,
    });
    expect(
      stampWatchEngineEvent({ type: "watch/stall_stop", activeTargetGame: "Rust" }, 42),
    ).toEqual({ type: "watch/stall_stop", activeTargetGame: "Rust", at: 42 });
  });

  it("keeps an existing finite at", () => {
    const event = { type: "watch/stop", activeTargetGame: "Rust", at: 7 } as const;
    expect(stampWatchEngineEvent(event, 42)).toBe(event);
  });

  it("stamps sync with now when missing, keeps existing now", () => {
    expect(
      stampWatchEngineEvent({ type: "sync", activeTargetGame: "", watchingGame: "" }, 42),
    ).toEqual({ type: "sync", activeTargetGame: "", watchingGame: "", now: 42 });
    const synced = { type: "sync", activeTargetGame: "", watchingGame: "", now: 7 } as const;
    expect(stampWatchEngineEvent(synced, 42)).toBe(synced);
  });

  it("passes other events through unchanged", () => {
    const event = { type: "target/manual_set", nextTargetGame: "Rust" } as const;
    expect(stampWatchEngineEvent(event, 42)).toBe(event);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/renderer/shared/hooks/watch/watchEngine.test.ts`. Expected: FAIL (`stampWatchEngineEvent` not exported).

- [ ] **Step 3: Implement** — append to `watchEngine.ts`:

```ts
/**
 * Stamp time onto events that carry one, only when the caller didn't provide
 * a finite value. Keeps reducer replays deterministic in tests/logs.
 */
export const stampWatchEngineEvent = (event: WatchEngineEvent, now: number): WatchEngineEvent => {
  switch (event.type) {
    case "watch/stop":
    case "watch/stall_stop":
      if (typeof event.at === "number" && Number.isFinite(event.at)) return event;
      return { ...event, at: now };
    case "sync":
      if (typeof event.now === "number" && Number.isFinite(event.now)) return event;
      return { ...event, now };
    default:
      return event;
  }
};
```

- [ ] **Step 4: Run tests** — `npx vitest run src/renderer/shared/hooks/watch/watchEngine.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/watchEngine.ts src/renderer/shared/hooks/watch/watchEngine.test.ts
git add -A && git commit -m "test(watch): pure stampWatchEngineEvent with tests"
```

---

### Task 9: `useWatchEngine` hook

**Files:**

- Create: `src/renderer/shared/hooks/watch/useWatchEngine.ts`
- Modify: `src/renderer/shared/hooks/watch/index.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (remove lines 138–142, 186–239)

- [ ] **Step 1: Create the hook** — reducer + stamped dispatch + the exact diff-logging block:

```ts
import { useCallback, useEffect, useReducer, useRef } from "react";
import { logDebug, logInfo } from "@renderer/shared/utils/logger";
import {
  selectVisibleTargetGame,
  stampWatchEngineEvent,
  watchEngineReducer,
  WATCH_ENGINE_INITIAL_STATE,
  type WatchEngineEvent,
} from "./watchEngine";

/**
 * Owns the suppression reducer plus the logging dispatch wrapper. The wrapper
 * pre-computes prev/next purely for structured logging — the reducer is pure,
 * so running it twice (here and in React's dispatch) is safe.
 */
export function useWatchEngine() {
  const [state, dispatch] = useReducer(watchEngineReducer, WATCH_ENGINE_INITIAL_STATE);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dispatchEvent = useCallback(
    (event: WatchEngineEvent, context: string) => {
      const stampedEvent = stampWatchEngineEvent(event, Date.now());
      const prev = stateRef.current;
      const next = watchEngineReducer(prev, stampedEvent);
      const changed =
        prev.suppressedTargetGame !== next.suppressedTargetGame ||
        prev.suppressionReason !== next.suppressionReason ||
        prev.suppressedAt !== next.suppressedAt;
      const eventTargetGame =
        "activeTargetGame" in stampedEvent
          ? stampedEvent.activeTargetGame
          : stampedEvent.type === "target/manual_set"
            ? stampedEvent.nextTargetGame
            : "";
      const prevVisibleTarget = selectVisibleTargetGame(prev, eventTargetGame);
      const nextVisibleTarget = selectVisibleTargetGame(next, eventTargetGame);
      if (stampedEvent.type !== "sync" || changed) {
        logDebug("watch-engine: event", { context, event: stampedEvent, prev, next, changed });
      }
      if (changed) {
        logInfo("watch-engine: suppression", {
          context,
          event: stampedEvent.type,
          suppressionFrom: prev.suppressedTargetGame || null,
          suppressionTo: next.suppressedTargetGame || null,
          reasonFrom: prev.suppressionReason ?? null,
          reasonTo: next.suppressionReason ?? null,
          suppressedAtFrom: prev.suppressedAt ?? null,
          suppressedAtTo: next.suppressedAt ?? null,
          visibleTargetFrom: prevVisibleTarget || null,
          visibleTargetTo: nextVisibleTarget || null,
        });
      }
      dispatch(stampedEvent);
    },
    [dispatch],
  );

  return { state, dispatchEvent };
}
```

- [ ] **Step 2: Export from the barrel** and wire `useAppModel` — delete the moved block (reducer call, `watchEngineStateRef`, ref-sync effect, `dispatchWatchEngineEvent`) and replace with:

```ts
const { state: watchEngineState, dispatchEvent: dispatchWatchEngineEvent } = useWatchEngine();
```

Drop now-unused `useAppModel` imports: `useReducer`, `watchEngineReducer`, `WATCH_ENGINE_INITIAL_STATE`, `WatchEngineEvent` (keep `selectVisibleTargetGame`, `shouldForceClearWatchingOnSuppressedTarget`, the hold constants — still used).

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json` + `npm test`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/useWatchEngine.ts src/renderer/shared/hooks/watch/index.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "refactor(watch): extract useWatchEngine (reducer + stamped logging dispatch)"
```

---

### Task 10: `useWatchSuppressionSync` hook

**Files:**

- Create: `src/renderer/shared/hooks/watch/useWatchSuppressionSync.ts`
- Modify: `src/renderer/shared/hooks/watch/index.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (remove lines 629–686)

- [ ] **Step 1: Create the hook** — the sync/force-clear effect and the hold-expire timer effect:

```ts
import { useEffect } from "react";
import {
  MANUAL_STOP_SUPPRESSION_HOLD_MS,
  STALL_STOP_SUPPRESSION_HOLD_MS,
  type WatchEngineEvent,
  type WatchEngineState,
} from "./watchEngine";

type Params = {
  watchEngineState: WatchEngineState;
  dispatchWatchEngineEvent: (event: WatchEngineEvent, context: string) => void;
  activeTargetGame: string;
  /** `watching?.game ?? ""` — empty string when not watching. */
  watchingGame: string;
  shouldClearSuppressedWatching: boolean;
  clearWatching: () => void;
};

/**
 * Keeps the suppression reducer reconciled with the live target/watching pair:
 * a periodic `sync` (or a force-clear of a suppressed watch), plus a timer
 * that fires one extra `sync` exactly when a hold window expires so the
 * reducer can release the suppression without waiting for unrelated renders.
 */
export function useWatchSuppressionSync({
  watchEngineState,
  dispatchWatchEngineEvent,
  activeTargetGame,
  watchingGame,
  shouldClearSuppressedWatching,
  clearWatching,
}: Params) {
  useEffect(() => {
    if (shouldClearSuppressedWatching) {
      clearWatching();
      return;
    }
    dispatchWatchEngineEvent(
      {
        type: "sync",
        activeTargetGame,
        watchingGame,
      },
      "sync",
    );
  }, [
    activeTargetGame,
    clearWatching,
    dispatchWatchEngineEvent,
    shouldClearSuppressedWatching,
    watchingGame,
  ]);

  useEffect(() => {
    const reason = watchEngineState.suppressionReason;
    if (reason !== "stall-stop" && reason !== "manual-stop") return;
    const suppressedGame = watchEngineState.suppressedTargetGame.trim();
    const suppressedAt = watchEngineState.suppressedAt;
    if (!suppressedGame) return;
    if (typeof suppressedAt !== "number" || !Number.isFinite(suppressedAt)) return;
    const holdMs =
      reason === "stall-stop" ? STALL_STOP_SUPPRESSION_HOLD_MS : MANUAL_STOP_SUPPRESSION_HOLD_MS;
    const runSync = () => {
      dispatchWatchEngineEvent(
        {
          type: "sync",
          activeTargetGame,
          watchingGame,
          now: Date.now(),
        },
        `${reason}-hold-expire-sync`,
      );
    };
    const dueAt = suppressedAt + holdMs;
    const remainingMs = dueAt - Date.now();
    if (remainingMs <= 0) {
      runSync();
      return;
    }
    const timer = window.setTimeout(runSync, remainingMs);
    return () => window.clearTimeout(timer);
  }, [
    activeTargetGame,
    dispatchWatchEngineEvent,
    watchEngineState.suppressedAt,
    watchEngineState.suppressedTargetGame,
    watchEngineState.suppressionReason,
    watchingGame,
  ]);
}
```

Dep note (add as a comment if not obvious from the props doc): the original effects depended on `watching?.game` and read `watching?.game ?? ""` in their bodies; `watchingGame` carries the identical value, and `undefined → ""` collapses only between states the effects already treat identically.

Faithfulness detail: in the original, effect two reads `const watchingGame = (watching?.game ?? "").trim()` — note the original sync dispatch passes the **untrimmed** value in effect one and the **trimmed** value in effect two. Preserve exactly: effect one passes `watchingGame` as-is; effect two passes `watchingGame` — wait, the original effect two (line 655) trims into a local and passes that local (line 665). Keep the trim in effect two's `runSync`:

```ts
// effect two, before runSync:
const trimmedWatchingGame = watchingGame.trim();
// and inside runSync pass `watchingGame: trimmedWatchingGame`
```

- [ ] **Step 2: Export from the barrel** and wire `useAppModel` — delete the two effects and insert (after `shouldClearSuppressedWatching` is computed):

```ts
useWatchSuppressionSync({
  watchEngineState,
  dispatchWatchEngineEvent,
  activeTargetGame,
  watchingGame: watching?.game ?? "",
  shouldClearSuppressedWatching,
  clearWatching,
});
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json` + `npm test`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/useWatchSuppressionSync.ts src/renderer/shared/hooks/watch/index.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "refactor(watch): extract useWatchSuppressionSync (sync + hold-expire effects)"
```

---

### Task 11: `retargetPolicy.ts` (pure) + tests + thin wrapper

**Files:**

- Create: `src/renderer/shared/hooks/watch/retargetPolicy.ts`
- Create: `src/renderer/shared/hooks/watch/retargetPolicy.test.ts`
- Modify: `src/renderer/shared/hooks/watch/index.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (lines 590–610)

- [ ] **Step 1: Write the failing tests** (`retargetPolicy.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { rotateToNextPriorityTarget } from "./retargetPolicy";

const never = () => false;
const always = () => true;

describe("rotateToNextPriorityTarget", () => {
  it("rotates forward from the current game and wraps around", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B", "C"],
        currentGame: "B",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("C");
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B", "C"],
        currentGame: "C",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("A");
  });

  it("starts from the top when the current game is not in the list", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B"],
        currentGame: "X",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("A");
  });

  it("trims and deduplicates the priority order", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: [" A ", "A", "", "B"],
        currentGame: "A",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("B");
  });

  it("skips blocked games and never returns the current game", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B", "C"],
        currentGame: "A",
        isGameBlocked: (g) => g === "B",
        isGameActionable: always,
      }),
    ).toBe("C");
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A"],
        currentGame: "A",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("");
  });

  it("prefers the first actionable candidate, falls back to the first candidate", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B", "C"],
        currentGame: "A",
        isGameBlocked: never,
        isGameActionable: (g) => g === "C",
      }),
    ).toBe("C");
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: ["A", "B", "C"],
        currentGame: "A",
        isGameBlocked: never,
        isGameActionable: never,
      }),
    ).toBe("B");
  });

  it("returns empty for an empty order", () => {
    expect(
      rotateToNextPriorityTarget({
        priorityOrder: [],
        currentGame: "A",
        isGameBlocked: never,
        isGameActionable: always,
      }),
    ).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/renderer/shared/hooks/watch/retargetPolicy.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** (`retargetPolicy.ts`) — exact port of `getNextPriorityTargetGame` with predicates injected:

```ts
/**
 * Pick the next target game after `currentGame` in priority order: rotate the
 * list so games after the current one come first, drop the current game and
 * anything blocked (in cooldown), prefer the first actionable candidate, and
 * otherwise fall back to the first candidate so the engine keeps moving.
 */
export const rotateToNextPriorityTarget = ({
  priorityOrder,
  currentGame,
  isGameBlocked,
  isGameActionable,
}: {
  priorityOrder: string[];
  currentGame: string;
  isGameBlocked: (game: string) => boolean;
  isGameActionable: (game: string) => boolean;
}): string => {
  const current = currentGame.trim();
  const ordered = priorityOrder
    .map((game) => game.trim())
    .filter((game, index, all) => game.length > 0 && all.indexOf(game) === index);
  if (ordered.length === 0) return "";
  const currentIndex = ordered.indexOf(current);
  const rotated =
    currentIndex >= 0
      ? [...ordered.slice(currentIndex + 1), ...ordered.slice(0, currentIndex)]
      : ordered;
  const candidates = rotated.filter((game) => game !== current && !isGameBlocked(game));
  if (candidates.length === 0) return "";
  const actionable = candidates.find((game) => isGameActionable(game));
  return actionable ?? candidates[0] ?? "";
};
```

- [ ] **Step 4: Run tests** — `npx vitest run src/renderer/shared/hooks/watch/retargetPolicy.test.ts`. Expected: PASS.

- [ ] **Step 5: Replace the inline callback in `useAppModel`** (lines 590–610) with a thin wrapper (it disappears entirely in Task 15):

```ts
const getNextPriorityTargetGame = useCallback(
  (currentGame: string): string =>
    rotateToNextPriorityTarget({
      priorityOrder,
      currentGame,
      isGameBlocked: (game) => isGameInStallCooldown(game),
      isGameActionable: (game) =>
        isGameActionable(game, orchestrationCategories, { allowUpcoming: allowUnlinkedGames }),
    }),
  [allowUnlinkedGames, isGameInStallCooldown, orchestrationCategories, priorityOrder],
);
```

Add `rotateToNextPriorityTarget` to the watch-barrel import and `export * from "./retargetPolicy";` to `watch/index.ts`.

- [ ] **Step 6: Verify** — `npx tsc --noEmit -p tsconfig.json` + `npm test`. Expected: clean.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/retargetPolicy.ts src/renderer/shared/hooks/watch/retargetPolicy.test.ts src/renderer/shared/hooks/watch/index.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "test(watch): pure rotateToNextPriorityTarget; useAppModel callback is a thin wrapper"
```

---

### Task 12: Action union + `decideIdleNoFarmable` (pure) + tests

**Files:**

- Modify: `src/renderer/shared/hooks/watch/watchStallRecovery.ts`
- Modify: `src/renderer/shared/hooks/watch/watchStallRecovery.test.ts`

- [ ] **Step 1: Add the action/decision types and stall constants** to `watchStallRecovery.ts` (constants move from `useAppModel` lines 50–58; `useAppModel` keeps importing them from the barrel until Task 15 removes its uses — during Tasks 12–14 the constants exist in BOTH places, which is fine since the useAppModel ones are module-local `const`s; do NOT delete them from `useAppModel` yet):

```ts
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { CooldownReason } from "./gameCooldowns";

export const STALL_NO_PROGRESS_WINDOW_MS = 15 * 60_000;
export const STALL_NO_PROGRESS_WINDOW_NEAR_END_MS = 3 * 60_000;
export const STALL_RECOVERY_COOLDOWN_MS = 60_000;
export const STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS = 2;
export const STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END = 1;
export const STALL_CONFIRMATION_PROBE_COOLDOWN_MS = 60_000;
export const NO_FARMABLE_DROP_GRACE_MS = 30_000;
export const NO_FARMABLE_GAME_COOLDOWN_MS = 10 * 60_000;
export const NO_PROGRESS_GAME_COOLDOWN_MS = 30 * 60_000;

/**
 * Effect descriptors returned by the decide* functions. The useStallRecovery
 * executor maps them 1:1 onto setters/dispatches and logs `log` actions via
 * logInfo — decisions stay pure and unit-testable, log lines stay identical.
 */
export type StallRecoveryAction =
  | { kind: "log"; message: string; data: Record<string, unknown> }
  | { kind: "switch-channel"; channel: ChannelEntry }
  | { kind: "set-cooldown"; game: string; durationMs: number; reason: CooldownReason }
  | { kind: "retarget"; to: string }
  | { kind: "enable-auto-select" }
  | { kind: "stop-watching" }
  | { kind: "dispatch-stall-stop"; game: string; context: string }
  | { kind: "refresh-channels"; game: string }
  | { kind: "refresh-inventory" };

/** "Watching with no farmable drop" grace-period marker (was noFarmableDropRef). */
export type NoFarmableMarker = { key: string; sinceAt: number };
```

(`ChannelEntry` is already imported at the top of the file.)

- [ ] **Step 2: Write the failing tests** — append a `describe("decideIdleNoFarmable", ...)` to `watchStallRecovery.test.ts`:

```ts
import {
  decideIdleNoFarmable,
  NO_FARMABLE_GAME_COOLDOWN_MS,
  type NoFarmableMarker,
  type StallRecoveryAction,
} from "./watchStallRecovery"; // merge into existing imports
import type { ChannelEntry } from "@renderer/shared/types"; // merge if already imported

const channel = (id: string, login = id): ChannelEntry =>
  ({ id, login, displayName: login, title: "", viewers: 0, game: "Rust" }) as ChannelEntry;

const idleBase = {
  allowWatching: true,
  autoSelectEnabled: true,
  targetGame: "Rust",
  activeTargetGame: "Rust",
  channelAllowlist: { ids: ["allowed-1"], logins: [] },
  channels: [channel("other-1")],
  channelsLoading: false,
  channelsRefreshing: false,
  noFarmable: null as NoFarmableMarker | null,
  getNextTargetGame: () => "Dota 2",
};

describe("decideIdleNoFarmable", () => {
  it("does nothing (and clears the marker) when idle evaluation is off", () => {
    expect(decideIdleNoFarmable({ ...idleBase, autoSelectEnabled: false })).toEqual({
      actions: [],
      noFarmable: null,
    });
    expect(decideIdleNoFarmable({ ...idleBase, targetGame: "" })).toEqual({
      actions: [],
      noFarmable: null,
    });
  });

  it("does nothing when the allowlist has no constraints", () => {
    expect(
      decideIdleNoFarmable({ ...idleBase, channelAllowlist: { ids: [], logins: [] } }),
    ).toEqual({ actions: [], noFarmable: null });
  });

  it("keeps the marker untouched while channels are still loading", () => {
    const marker = { key: "Rust", sinceAt: 1 };
    expect(
      decideIdleNoFarmable({
        ...idleBase,
        channels: [],
        channelsLoading: true,
        noFarmable: marker,
      }).noFarmable,
    ).toBe(marker);
  });

  it("does nothing when an allowlisted channel is live", () => {
    expect(decideIdleNoFarmable({ ...idleBase, channels: [channel("allowed-1")] })).toEqual({
      actions: [],
      noFarmable: null,
    });
  });

  it("escalates when no allowlisted channel is live: cooldown, retarget, auto-select, stall-stop", () => {
    const { actions, noFarmable } = decideIdleNoFarmable(idleBase);
    expect(noFarmable).toBeNull();
    expect(actions.map((a) => a.kind)).toEqual([
      "set-cooldown",
      "log",
      "log",
      "retarget",
      "enable-auto-select",
      "dispatch-stall-stop",
    ]);
    expect(actions[0]).toEqual({
      kind: "set-cooldown",
      game: "Rust",
      durationMs: NO_FARMABLE_GAME_COOLDOWN_MS,
      reason: "stall-no-farmable",
    });
    expect(actions[3]).toEqual({ kind: "retarget", to: "Dota 2" });
    expect(actions[5]).toEqual({
      kind: "dispatch-stall-stop",
      game: "Rust",
      context: "stall-no-farmable",
    });
  });

  it("logs a retarget skip when no next target exists", () => {
    const { actions } = decideIdleNoFarmable({ ...idleBase, getNextTargetGame: () => "" });
    expect(actions.map((a) => a.kind)).toEqual([
      "set-cooldown",
      "log",
      "log",
      "enable-auto-select",
      "dispatch-stall-stop",
    ]);
    const skip = actions[2] as Extract<StallRecoveryAction, { kind: "log" }>;
    expect(skip.message).toBe("watch-engine: retarget skipped");
  });
});
```

- [ ] **Step 3: Run to verify failure**, then **implement** in `watchStallRecovery.ts` — a faithful port of lines 937–992:

```ts
export type IdleNoFarmableInput = {
  allowWatching: boolean;
  autoSelectEnabled: boolean;
  targetGame: string;
  activeTargetGame: string;
  channelAllowlist: ChannelAllowlist;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  noFarmable: NoFarmableMarker | null;
  getNextTargetGame: (currentGame: string) => string;
};

export type StallRecoveryDecision = {
  actions: StallRecoveryAction[];
  noFarmable: NoFarmableMarker | null;
};

/**
 * Idle branch (not watching): if the target's drops are restricted to specific
 * channels and none of them is live, cool the game down and move the target on.
 */
export const decideIdleNoFarmable = (input: IdleNoFarmableInput): StallRecoveryDecision => {
  const {
    allowWatching,
    autoSelectEnabled,
    targetGame,
    activeTargetGame,
    channelAllowlist,
    channels,
    channelsLoading,
    channelsRefreshing,
    noFarmable,
    getNextTargetGame,
  } = input;
  const shouldEvaluateIdleNoFarmable = allowWatching && autoSelectEnabled && !!targetGame;
  if (!shouldEvaluateIdleNoFarmable) {
    return { actions: [], noFarmable: null };
  }
  const allowlistRestriction = DropChannelRestriction.fromAllowlist(channelAllowlist);
  if (!allowlistRestriction.hasConstraints) {
    return { actions: [], noFarmable: null };
  }
  if ((channelsLoading || channelsRefreshing) && channels.length === 0) {
    // Snapshot still loading — keep the marker untouched (matches the old
    // early-return that skipped the `noFarmableDropRef.current = null` reset).
    return { actions: [], noFarmable };
  }
  const hasAllowlistedChannel = channels.some((channel) =>
    allowlistRestriction.allowsChannel(channel),
  );
  if (hasAllowlistedChannel) {
    return { actions: [], noFarmable: null };
  }
  const stalledGame = activeTargetGame.trim() || targetGame.trim();
  const currentForRetarget = activeTargetGame.trim() || targetGame.trim();
  const nextTargetGame = currentForRetarget ? getNextTargetGame(currentForRetarget) : "";
  const actions: StallRecoveryAction[] = [
    {
      kind: "set-cooldown",
      game: stalledGame,
      durationMs: NO_FARMABLE_GAME_COOLDOWN_MS,
      reason: "stall-no-farmable",
    },
    {
      kind: "log",
      message: "watch-engine: no-farmable idle evaluate",
      data: {
        from: currentForRetarget || null,
        to: nextTargetGame || null,
        channelsCount: channels.length,
        allowlistActive: allowlistRestriction.hasConstraints,
      },
    },
  ];
  if (nextTargetGame) {
    actions.push(
      {
        kind: "log",
        message: "watch-engine: retarget",
        data: {
          reason: "stall-no-farmable-idle",
          from: activeTargetGame || targetGame || null,
          to: nextTargetGame,
        },
      },
      { kind: "retarget", to: nextTargetGame },
    );
  } else {
    actions.push({
      kind: "log",
      message: "watch-engine: retarget skipped",
      data: {
        reason: "stall-no-farmable-idle-no-next-target",
        from: activeTargetGame || targetGame || null,
      },
    });
  }
  actions.push(
    { kind: "enable-auto-select" },
    {
      kind: "dispatch-stall-stop",
      game: stalledGame || activeTargetGame,
      context: "stall-no-farmable",
    },
  );
  return { actions, noFarmable: null };
};
```

Ordering note (faithfulness): the original calls `setStalledGameCooldown` (line 961) BEFORE computing/logging the retarget — the action list preserves that order, and the executor runs actions sequentially. The original's `getNextPriorityTargetGame` read the cooldown **state from the current render** (the just-set cooldown was not yet visible) — the injected `getNextTargetGame` closure has exactly the same property. Original log order is: cooldown log (inside the setter) → idle-evaluate log → retarget(-skipped) log.

- [ ] **Step 4: Run tests** — `npx vitest run src/renderer/shared/hooks/watch/watchStallRecovery.test.ts`. Expected: PASS. Then `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/watchStallRecovery.ts src/renderer/shared/hooks/watch/watchStallRecovery.test.ts
git add -A && git commit -m "test(watch): StallRecoveryAction union + pure decideIdleNoFarmable"
```

---

### Task 13: `decideWatchingNoFarmable` (pure) + tests

**Files:**

- Modify: `src/renderer/shared/hooks/watch/watchStallRecovery.ts`
- Modify: `src/renderer/shared/hooks/watch/watchStallRecovery.test.ts`

- [ ] **Step 1: Write the failing tests:**

```ts
import { decideWatchingNoFarmable, NO_FARMABLE_DROP_GRACE_MS } from "./watchStallRecovery"; // merge imports

const watchingRust = { id: "w1", name: "streamer", game: "Rust", login: "streamer" };

const progressDrop = (id: string, allowedChannelLogins?: string[]) =>
  ({
    id,
    status: "progress",
    earnedMinutes: 5,
    requiredMinutes: 60,
    game: "Rust",
    allowedChannelLogins,
  }) as never;

const watchingBase = {
  watching: watchingRust,
  targetGame: "Rust",
  activeTargetGame: "Rust",
  channelAllowlist: { ids: [], logins: [] },
  channels: [channel("w1", "streamer"), channel("c2", "other")],
  channelsLoading: false,
  targetDrops: [] as never[],
  noFarmable: null as NoFarmableMarker | null,
  now: 100_000,
  getNextTargetGame: () => "Dota 2",
};

describe("decideWatchingNoFarmable", () => {
  it("starts the grace period on first sight", () => {
    expect(decideWatchingNoFarmable(watchingBase)).toEqual({
      actions: [],
      noFarmable: { key: "Rust", sinceAt: 100_000 },
      resetStallTracking: false,
    });
  });

  it("restarts the grace period when the target changes", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      noFarmable: { key: "Dota 2", sinceAt: 1 },
    });
    expect(result.noFarmable).toEqual({ key: "Rust", sinceAt: 100_000 });
  });

  it("waits silently inside the grace window", () => {
    const marker = { key: "Rust", sinceAt: 100_000 - NO_FARMABLE_DROP_GRACE_MS + 1 };
    expect(decideWatchingNoFarmable({ ...watchingBase, noFarmable: marker })).toEqual({
      actions: [],
      noFarmable: marker,
      resetStallTracking: false,
    });
  });

  it("waits while channels are loading and the list is empty", () => {
    const marker = { key: "Rust", sinceAt: 1 };
    expect(
      decideWatchingNoFarmable({
        ...watchingBase,
        channels: [],
        channelsLoading: true,
        noFarmable: marker,
      }).noFarmable,
    ).toBe(marker);
  });

  it("switches to a candidate channel that can farm an in-progress drop", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      noFarmable: { key: "Rust", sinceAt: 1 },
      targetDrops: [progressDrop("d1", ["other"])],
    });
    expect(result.actions).toEqual([{ kind: "switch-channel", channel: watchingBase.channels[1] }]);
    expect(result.noFarmable).toBeNull();
    expect(result.resetStallTracking).toBe(false);
  });

  it("falls back to any allowed channel when watching the wrong game", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      watching: { ...watchingRust, game: "Other Game" },
      noFarmable: { key: "Rust", sinceAt: 1 },
    });
    expect(result.actions).toEqual([{ kind: "switch-channel", channel: watchingBase.channels[0] }]);
  });

  it("escalates after the grace period: cooldown, retarget, stop, stall-stop, reset tracking", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      noFarmable: { key: "Rust", sinceAt: 1 },
    });
    expect(result.actions.map((a) => a.kind)).toEqual([
      "set-cooldown",
      "log",
      "retarget",
      "enable-auto-select",
      "stop-watching",
      "dispatch-stall-stop",
    ]);
    expect(result.noFarmable).toBeNull();
    expect(result.resetStallTracking).toBe(true);
  });
});
```

(Escalation-path setup note: `watching.game === targetGame`, so the wrong-game fallback does not trigger and the branch falls through to escalation even though channels exist.)

Stub note for the candidate-switch test: `decideWatchingNoFarmable` runs candidates through `canEarnDrop(drop, { category: "in-progress" })` from `@renderer/shared/domain/inventory`. Before writing the test, read `canEarnDrop`'s implementation and give `progressDrop()` whatever fields it requires to return `true` for an in-progress drop (e.g. not excluded/blocked/ended). If the minimal stub fails the test, extend the stub — do not adapt the decision function.

- [ ] **Step 2: Run to verify failure**, then **implement** — faithful port of lines 993–1060:

```ts
import { canEarnDrop } from "@renderer/shared/domain/inventory";
import { sameGameName } from "@renderer/shared/domain/gameName";
import type { InventoryItem } from "@renderer/shared/types";

export type WatchingNoFarmableInput = {
  watching: NonNullable<WatchingState>;
  targetGame: string;
  activeTargetGame: string;
  channelAllowlist: ChannelAllowlist;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  targetDrops: InventoryItem[];
  noFarmable: NoFarmableMarker | null;
  now: number;
  getNextTargetGame: (currentGame: string) => string;
};

/**
 * Watching, but useTargetDrops sees no active (farmable) drop. Give the
 * inventory a grace window to catch up, then try drop-allowlisted candidate
 * channels, then any allowed channel if we're on the wrong game — and only
 * then give up on the game (cooldown + retarget + stall-stop).
 */
export const decideWatchingNoFarmable = (
  input: WatchingNoFarmableInput,
): StallRecoveryDecision & { resetStallTracking: boolean } => {
  const {
    watching,
    targetGame,
    activeTargetGame,
    channelAllowlist,
    channels,
    channelsLoading,
    targetDrops,
    noFarmable,
    now,
    getNextTargetGame,
  } = input;
  const noFarmableKey = targetGame;
  if (!noFarmable || noFarmable.key !== noFarmableKey) {
    return {
      actions: [],
      noFarmable: { key: noFarmableKey, sinceAt: now },
      resetStallTracking: false,
    };
  }
  if (now - noFarmable.sinceAt < NO_FARMABLE_DROP_GRACE_MS) {
    return { actions: [], noFarmable, resetStallTracking: false };
  }
  // Asymmetry vs. the idle branch is original behavior: only `channelsLoading`
  // gates here (not `channelsRefreshing`).
  if (channelsLoading && channels.length === 0) {
    return { actions: [], noFarmable, resetStallTracking: false };
  }
  const candidateDrops = targetDrops.filter(
    (drop) => drop.status === "progress" && canEarnDrop(drop, { category: "in-progress" }),
  );
  for (const candidate of candidateDrops) {
    const nextChannel = pickStallRecoveryChannel({
      channels,
      watching,
      drop: {
        id: candidate.id,
        earnedMinutes: candidate.earnedMinutes,
        allowedChannelIds: candidate.allowedChannelIds,
        allowedChannelLogins: candidate.allowedChannelLogins,
      },
    });
    if (nextChannel) {
      return {
        actions: [{ kind: "switch-channel", channel: nextChannel }],
        noFarmable: null,
        resetStallTracking: false,
      };
    }
  }
  const allowlistRestriction = DropChannelRestriction.fromAllowlist(channelAllowlist);
  const fallbackChannel = allowlistRestriction.hasConstraints
    ? channels.find((channel) => allowlistRestriction.allowsChannel(channel))
    : channels[0];
  if (!sameGameName(watching.game, targetGame) && fallbackChannel) {
    return {
      actions: [{ kind: "switch-channel", channel: fallbackChannel }],
      noFarmable: null,
      resetStallTracking: false,
    };
  }
  const stalledGame = activeTargetGame.trim() || targetGame.trim() || watching.game.trim();
  const currentForRetarget = activeTargetGame.trim() || targetGame.trim();
  const nextTargetGame = currentForRetarget ? getNextTargetGame(currentForRetarget) : "";
  const actions: StallRecoveryAction[] = [
    {
      kind: "set-cooldown",
      game: stalledGame,
      durationMs: NO_FARMABLE_GAME_COOLDOWN_MS,
      reason: "stall-no-farmable",
    },
  ];
  if (nextTargetGame) {
    actions.push(
      {
        kind: "log",
        message: "watch-engine: retarget",
        data: {
          reason: "stall-no-farmable-direct",
          from: activeTargetGame,
          to: nextTargetGame,
        },
      },
      { kind: "retarget", to: nextTargetGame },
    );
  }
  actions.push(
    { kind: "enable-auto-select" },
    { kind: "stop-watching" },
    {
      kind: "dispatch-stall-stop",
      game: stalledGame || activeTargetGame,
      context: "stall-no-farmable",
    },
  );
  return { actions, noFarmable: null, resetStallTracking: true };
};
```

(`WatchingState` is already imported. Note: no `retarget skipped` log in this branch — original behavior. `canEarnDrop` may already be imported transitively; add the import if missing.)

- [ ] **Step 3: Run tests** — `npx vitest run src/renderer/shared/hooks/watch/watchStallRecovery.test.ts`. Expected: PASS. Then `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/watchStallRecovery.ts src/renderer/shared/hooks/watch/watchStallRecovery.test.ts
git add -A && git commit -m "test(watch): pure decideWatchingNoFarmable (grace, candidates, fallback, escalation)"
```

---

### Task 14: `decideNoProgressRecovery` (pure) + tests

**Files:**

- Modify: `src/renderer/shared/hooks/watch/watchStallRecovery.ts`
- Modify: `src/renderer/shared/hooks/watch/watchStallRecovery.test.ts`

- [ ] **Step 1: Write the failing tests:**

```ts
import {
  decideNoProgressRecovery,
  STALL_NO_PROGRESS_WINDOW_MS,
  type WatchConfirmationProbe,
} from "./watchStallRecovery"; // merge imports

const activeDrop = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: "d1",
    title: "Drop",
    requiredMinutes: 60,
    earnedMinutes: 10,
    virtualEarned: 10,
    remainingMinutes: 50,
    eta: null,
    allowedChannelLogins: ["other"],
    ...over,
  }) as never;

const noProgressBase = {
  watching: watchingRust,
  activeDropInfo: activeDrop(),
  targetGame: "Rust",
  activeTargetGame: "Rust",
  channels: [channel("w1", "streamer"), channel("c2", "other")],
  lastWatchOk: 0,
  now: 1_000_000,
  tracker: null as WatchStallTracker | null,
  confirmationProbe: null as WatchConfirmationProbe | null,
  getNextTargetGame: () => "Dota 2",
};

const trackerKey = "rust:d1"; // buildWatchStallTrackerKey(watchingRust, "d1")

describe("decideNoProgressRecovery", () => {
  it("resets tracking when the drop id is blank", () => {
    expect(
      decideNoProgressRecovery({ ...noProgressBase, activeDropInfo: activeDrop({ id: "  " }) }),
    ).toEqual({ actions: [], tracker: null, confirmationProbe: null });
  });

  it("seeds the tracker on first evaluation without recovering", () => {
    const result = decideNoProgressRecovery(noProgressBase);
    expect(result.actions).toEqual([]);
    expect(result.tracker).toEqual({
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 1_000_000,
      lastActionAt: 0,
      recoveryCount: 0,
    });
  });

  it("emits a confirmation probe shortly before the window elapses", () => {
    const tracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 0,
    };
    // window 15min, lead = min(2min, 5min) = 2min → probe window [13min, 15min)
    const now = STALL_NO_PROGRESS_WINDOW_MS - 60_000;
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      tracker,
      now,
      lastWatchOk: now - 1_000, // recent ping, after lastProgressAt
    });
    expect(result.actions.map((a) => a.kind)).toEqual(["log", "refresh-inventory"]);
    expect(result.confirmationProbe).toEqual({
      key: trackerKey,
      baselineProgressAt: 0,
      lastProbeAt: now,
    });
  });

  it("switches channel on first recovery", () => {
    const tracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 0,
    };
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      tracker,
      now: STALL_NO_PROGRESS_WINDOW_MS + 1,
    });
    expect(result.actions).toEqual([
      { kind: "switch-channel", channel: noProgressBase.channels[1] },
    ]);
    expect(result.tracker?.recoveryCount).toBe(1);
  });

  it("refreshes channels+inventory when no alternate channel is visible", () => {
    const tracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 0,
    };
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      channels: [channel("w1", "streamer")], // only the watched channel
      tracker,
      now: STALL_NO_PROGRESS_WINDOW_MS + 1,
    });
    expect(result.actions.map((a) => a.kind)).toEqual([
      "log",
      "refresh-channels",
      "refresh-inventory",
    ]);
  });

  it("escalates to retarget once the recovery budget is exhausted", () => {
    const tracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 2, // becomes 3 on this recovery → over budget (max 2)
    };
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      tracker,
      now: STALL_NO_PROGRESS_WINDOW_MS + 1,
    });
    expect(result.actions.map((a) => a.kind)).toEqual([
      "log",
      "set-cooldown",
      "log",
      "retarget",
      "enable-auto-select",
      "stop-watching",
      "dispatch-stall-stop",
    ]);
    const stallStop = result.actions.at(-1) as Extract<
      StallRecoveryAction,
      { kind: "dispatch-stall-stop" }
    >;
    expect(stallStop).toEqual({
      kind: "dispatch-stall-stop",
      game: "Rust",
      context: "stall-no-progress",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **implement** — faithful port of lines 1062–1195. `WATCH_INTERVAL_MS` comes from `./useWatchPing` (hook module exporting a constant — import is values-only and safe):

```ts
import { WATCH_INTERVAL_MS } from "./useWatchPing";
import type { ActiveDropInfo } from "@renderer/shared/hooks/inventory";

/** Confirmation-probe bookkeeping (was watchConfirmationProbeRef). */
export type WatchConfirmationProbe = {
  key: string;
  baselineProgressAt: number;
  lastProbeAt: number;
};

export type NoProgressRecoveryInput = {
  watching: NonNullable<WatchingState>;
  activeDropInfo: ActiveDropInfo;
  targetGame: string;
  activeTargetGame: string;
  channels: ChannelEntry[];
  lastWatchOk: number;
  now: number;
  tracker: WatchStallTracker | null;
  confirmationProbe: WatchConfirmationProbe | null;
  getNextTargetGame: (currentGame: string) => string;
};

export type NoProgressRecoveryDecision = {
  actions: StallRecoveryAction[];
  tracker: WatchStallTracker | null;
  confirmationProbe: WatchConfirmationProbe | null;
};

/**
 * Watching with an active drop: track earned-minutes progress; just before the
 * no-progress window elapses, spend one cheap inventory poll to rule out a
 * stale snapshot; on a confirmed stall, switch channels (within a small
 * budget), force-refresh once no alternate is visible, and finally give up on
 * the game (cooldown + retarget + stall-stop).
 */
export const decideNoProgressRecovery = (
  input: NoProgressRecoveryInput,
): NoProgressRecoveryDecision => {
  const {
    watching,
    activeDropInfo,
    targetGame,
    activeTargetGame,
    channels,
    lastWatchOk,
    now,
    tracker,
    confirmationProbe,
    getNextTargetGame,
  } = input;
  const dropId = activeDropInfo.id?.trim();
  if (!dropId) {
    return { actions: [], tracker: null, confirmationProbe: null };
  }
  const actions: StallRecoveryAction[] = [];
  const earnedMinutes = Math.max(0, Number(activeDropInfo.earnedMinutes) || 0);
  const key = buildWatchStallTrackerKey(watching, dropId);
  const nearEndNoProgressProbe = activeDropInfo.remainingMinutes <= CLAIM_PROBE_NEAR_END_MINUTES;
  const noProgressWindowMs = nearEndNoProgressProbe
    ? STALL_NO_PROGRESS_WINDOW_NEAR_END_MS
    : STALL_NO_PROGRESS_WINDOW_MS;
  const evaluation = evaluateNoProgressStall({
    tracker,
    key,
    earnedMinutes,
    now,
    noProgressWindowMs,
    actionCooldownMs: STALL_RECOVERY_COOLDOWN_MS,
  });
  let probe = confirmationProbe;
  if (
    probe &&
    (probe.key !== key || probe.baselineProgressAt < evaluation.tracker.lastProgressAt)
  ) {
    probe = null;
  }
  const probeLeadMs = Math.min(2 * 60_000, Math.floor(noProgressWindowMs / 3));
  const recentWatchPingGraceMs = WATCH_INTERVAL_MS + 30_000;
  const lastProbeAt =
    probe?.key === key && probe?.baselineProgressAt === evaluation.tracker.lastProgressAt
      ? probe.lastProbeAt
      : 0;
  if (
    shouldProbeNoProgressConfirmation({
      tracker: evaluation.tracker,
      key,
      now,
      noProgressWindowMs,
      probeLeadMs,
      lastWatchOk,
      watchPingGraceMs: recentWatchPingGraceMs,
      lastProbeAt,
      probeCooldownMs: STALL_CONFIRMATION_PROBE_COOLDOWN_MS,
    })
  ) {
    probe = {
      key,
      baselineProgressAt: evaluation.tracker.lastProgressAt,
      lastProbeAt: now,
    };
    actions.push(
      {
        kind: "log",
        message: "watch-engine: confirmation probe",
        data: {
          reason: "stall-no-progress-confirmation-probe",
          key,
          noProgressWindowMs,
          probeLeadMs,
          lastConfirmedProgressMsAgo: Math.max(0, now - evaluation.tracker.lastProgressAt),
        },
      },
      { kind: "refresh-inventory" },
    );
  }
  if (!evaluation.shouldRecover) {
    return { actions, tracker: evaluation.tracker, confirmationProbe: probe };
  }
  const maxChannelRecoveryAttempts = nearEndNoProgressProbe
    ? STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END
    : STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS;
  const allowChannelRecovery = evaluation.tracker.recoveryCount <= maxChannelRecoveryAttempts;

  if (allowChannelRecovery) {
    const nextChannel = pickStallRecoveryChannel({
      channels,
      watching,
      drop: {
        id: activeDropInfo.id,
        earnedMinutes: activeDropInfo.earnedMinutes,
        allowedChannelIds: activeDropInfo.allowedChannelIds,
        allowedChannelLogins: activeDropInfo.allowedChannelLogins,
      },
    });
    if (nextChannel) {
      actions.push({ kind: "switch-channel", channel: nextChannel });
      return { actions, tracker: evaluation.tracker, confirmationProbe: probe };
    }
    // No alternate channel currently visible: force-refresh state before game-level retarget.
    // This avoids premature target jumps when tracker/inventory snapshots are briefly stale.
    const recoveryGame = activeTargetGame.trim() || targetGame.trim() || watching.game.trim();
    actions.push({
      kind: "log",
      message: "watch-engine: no-progress refresh",
      data: {
        reason: "stall-no-progress-refresh",
        game: recoveryGame || null,
        nearEndProbe: nearEndNoProgressProbe,
        noProgressWindowMs,
        attempts: evaluation.tracker.recoveryCount,
        maxChannelRecoveryAttempts,
      },
    });
    if (recoveryGame) {
      actions.push({ kind: "refresh-channels", game: recoveryGame });
    }
    actions.push({ kind: "refresh-inventory" });
    return { actions, tracker: evaluation.tracker, confirmationProbe: probe };
  } else {
    actions.push({
      kind: "log",
      message: "watch-engine: retarget escalation",
      data: {
        reason: "stall-no-progress-recovery-budget",
        from: activeTargetGame || null,
        nearEndProbe: nearEndNoProgressProbe,
        noProgressWindowMs,
        attempts: evaluation.tracker.recoveryCount,
        maxChannelRecoveryAttempts,
      },
    });
  }
  const stalledGame = activeTargetGame.trim() || targetGame.trim() || watching.game.trim();
  actions.push({
    kind: "set-cooldown",
    game: stalledGame,
    durationMs: NO_PROGRESS_GAME_COOLDOWN_MS,
    reason: "stall-no-progress",
  });
  const currentForRetarget = activeTargetGame.trim() || targetGame.trim();
  const nextTargetGame = currentForRetarget ? getNextTargetGame(currentForRetarget) : "";
  if (nextTargetGame) {
    actions.push(
      {
        kind: "log",
        message: "watch-engine: retarget",
        data: {
          reason: "stall-no-progress-direct",
          from: activeTargetGame,
          to: nextTargetGame,
        },
      },
      { kind: "retarget", to: nextTargetGame },
    );
  }
  actions.push(
    { kind: "enable-auto-select" },
    { kind: "stop-watching" },
    {
      kind: "dispatch-stall-stop",
      game: stalledGame || activeTargetGame,
      context: "stall-no-progress",
    },
  );
  return { actions, tracker: evaluation.tracker, confirmationProbe: probe };
};
```

- [ ] **Step 3: Run tests** — `npx vitest run src/renderer/shared/hooks/watch/watchStallRecovery.test.ts`. Expected: PASS. Then `npx tsc --noEmit -p tsconfig.json` and `npm test` (full suite — guards the existing helpers).

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/watchStallRecovery.ts src/renderer/shared/hooks/watch/watchStallRecovery.test.ts
git add -A && git commit -m "test(watch): pure decideNoProgressRecovery (probe gating, budget, escalation)"
```

---

### Task 15: `useStallRecovery` executor — remove the giant effect

**Files:**

- Create: `src/renderer/shared/hooks/watch/useStallRecovery.ts`
- Modify: `src/renderer/shared/hooks/watch/index.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (remove lines 688–708, 936–1220, the wrapper from Task 11, stall constants and refs)

- [ ] **Step 1: Create the hook:**

```ts
import { useCallback, useEffect, useRef } from "react";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry, InventoryItem, WatchingState } from "@renderer/shared/types";
import type { ActiveDropInfo } from "@renderer/shared/hooks/inventory";
import { isGameActionable, type WithCategory } from "@renderer/shared/hooks/priority";
import { logInfo } from "@renderer/shared/utils/logger";
import type { CooldownReason } from "./gameCooldowns";
import { rotateToNextPriorityTarget } from "./retargetPolicy";
import type { WatchEngineEvent, WatchEngineState } from "./watchEngine";
import {
  decideIdleNoFarmable,
  decideNoProgressRecovery,
  decideWatchingNoFarmable,
  type NoFarmableMarker,
  type StallRecoveryAction,
  type WatchConfirmationProbe,
  type WatchStallTracker,
} from "./watchStallRecovery";

type Params = {
  allowWatching: boolean;
  autoSelectEnabled: boolean;
  watching: WatchingState;
  targetGame: string;
  activeTargetGame: string;
  setActiveTargetGame: (game: string) => void;
  setAutoSelectEnabled: (enabled: boolean) => void;
  priorityOrder: string[];
  orchestrationCategories: WithCategory[];
  allowUnlinkedGames: boolean;
  isInCooldown: (game: string, now?: number) => boolean;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  channelAllowlist: ChannelAllowlist;
  targetDrops: InventoryItem[];
  activeDropInfo: ActiveDropInfo | null;
  /** Unused in the effect body, deliberately in the deps: re-evaluates the stall when watchability flips. */
  canWatchTarget: boolean;
  lastWatchOk: number;
  /** watchStats.nextAt — clocks one stall evaluation per watch ping. */
  stallCheckHeartbeat: number;
  watchEngineState: WatchEngineState;
  dispatchWatchEngineEvent: (event: WatchEngineEvent, context: string) => void;
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
  setCooldown: (game: string, durationMs: number, reason: CooldownReason) => void;
  fetchChannels: (game: string, opts?: { force?: boolean }) => Promise<unknown>;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<unknown>;
};

/**
 * Executor for the stall-recovery decisions (see watchStallRecovery.ts). Owns
 * the tracker/probe/grace-marker refs; each evaluation feeds their values into
 * the pure decide* functions and applies the returned actions 1:1.
 */
export function useStallRecovery({
  allowWatching,
  autoSelectEnabled,
  watching,
  targetGame,
  activeTargetGame,
  setActiveTargetGame,
  setAutoSelectEnabled,
  priorityOrder,
  orchestrationCategories,
  allowUnlinkedGames,
  isInCooldown,
  channels,
  channelsLoading,
  channelsRefreshing,
  channelAllowlist,
  targetDrops,
  activeDropInfo,
  canWatchTarget,
  lastWatchOk,
  stallCheckHeartbeat,
  watchEngineState,
  dispatchWatchEngineEvent,
  setWatchingFromChannel,
  clearWatching,
  setCooldown,
  fetchChannels,
  fetchInventory,
}: Params) {
  const watchStallTrackerRef = useRef<WatchStallTracker | null>(null);
  const watchConfirmationProbeRef = useRef<WatchConfirmationProbe | null>(null);
  const noFarmableDropRef = useRef<NoFarmableMarker | null>(null);

  const getNextTargetGame = useCallback(
    (currentGame: string): string =>
      rotateToNextPriorityTarget({
        priorityOrder,
        currentGame,
        isGameBlocked: (game) => isInCooldown(game),
        isGameActionable: (game) =>
          isGameActionable(game, orchestrationCategories, { allowUpcoming: allowUnlinkedGames }),
      }),
    [allowUnlinkedGames, isInCooldown, orchestrationCategories, priorityOrder],
  );

  const runActions = useCallback(
    (actions: StallRecoveryAction[]) => {
      for (const action of actions) {
        switch (action.kind) {
          case "log":
            logInfo(action.message, action.data);
            break;
          case "switch-channel":
            setWatchingFromChannel(action.channel);
            break;
          case "set-cooldown":
            setCooldown(action.game, action.durationMs, action.reason);
            break;
          case "retarget":
            setActiveTargetGame(action.to);
            break;
          case "enable-auto-select":
            setAutoSelectEnabled(true);
            break;
          case "stop-watching":
            clearWatching();
            break;
          case "dispatch-stall-stop":
            dispatchWatchEngineEvent(
              { type: "watch/stall_stop", activeTargetGame: action.game },
              action.context,
            );
            break;
          case "refresh-channels":
            void fetchChannels(action.game, { force: true });
            break;
          case "refresh-inventory":
            void fetchInventory({ forceLoading: true });
            break;
        }
      }
    },
    [
      clearWatching,
      dispatchWatchEngineEvent,
      fetchChannels,
      fetchInventory,
      setActiveTargetGame,
      setAutoSelectEnabled,
      setCooldown,
      setWatchingFromChannel,
    ],
  );

  // After a stall-stop suppression, move the target on to the next priority
  // game (the suppressed game stays hidden until its hold expires).
  useEffect(() => {
    if (watchEngineState.suppressionReason !== "stall-stop") return;
    const suppressedGame = watchEngineState.suppressedTargetGame;
    if (!suppressedGame || activeTargetGame !== suppressedGame) return;
    const nextGame = getNextTargetGame(suppressedGame);
    if (!nextGame) return;
    logInfo("watch-engine: retarget", {
      reason: "stall-stop",
      from: suppressedGame,
      to: nextGame,
    });
    setAutoSelectEnabled(true);
    setActiveTargetGame(nextGame);
  }, [
    activeTargetGame,
    getNextTargetGame,
    setAutoSelectEnabled,
    setActiveTargetGame,
    watchEngineState.suppressedTargetGame,
    watchEngineState.suppressionReason,
  ]);

  // The stall evaluation proper. Top-level branching mirrors the original
  // effect; each branch is a pure decision plus ref bookkeeping.
  useEffect(() => {
    if (!watching) {
      watchStallTrackerRef.current = null;
      watchConfirmationProbeRef.current = null;
      const decision = decideIdleNoFarmable({
        allowWatching,
        autoSelectEnabled,
        targetGame,
        activeTargetGame,
        channelAllowlist,
        channels,
        channelsLoading,
        channelsRefreshing,
        noFarmable: noFarmableDropRef.current,
        getNextTargetGame,
      });
      noFarmableDropRef.current = decision.noFarmable;
      runActions(decision.actions);
      return;
    }
    if (!activeDropInfo && targetGame) {
      const decision = decideWatchingNoFarmable({
        watching,
        targetGame,
        activeTargetGame,
        channelAllowlist,
        channels,
        channelsLoading,
        targetDrops,
        noFarmable: noFarmableDropRef.current,
        now: Date.now(),
        getNextTargetGame,
      });
      noFarmableDropRef.current = decision.noFarmable;
      if (decision.resetStallTracking) {
        watchStallTrackerRef.current = null;
        watchConfirmationProbeRef.current = null;
      }
      runActions(decision.actions);
      return;
    }
    noFarmableDropRef.current = null;
    if (!activeDropInfo) {
      watchStallTrackerRef.current = null;
      watchConfirmationProbeRef.current = null;
      return;
    }
    const decision = decideNoProgressRecovery({
      watching,
      activeDropInfo,
      targetGame,
      activeTargetGame,
      channels,
      lastWatchOk,
      now: Date.now(),
      tracker: watchStallTrackerRef.current,
      confirmationProbe: watchConfirmationProbeRef.current,
      getNextTargetGame,
    });
    watchStallTrackerRef.current = decision.tracker;
    watchConfirmationProbeRef.current = decision.confirmationProbe;
    runActions(decision.actions);
  }, [
    allowWatching,
    activeTargetGame,
    activeDropInfo,
    autoSelectEnabled,
    canWatchTarget,
    channels,
    channelAllowlist,
    channelsLoading,
    channelsRefreshing,
    clearWatching,
    dispatchWatchEngineEvent,
    getNextTargetGame,
    fetchChannels,
    fetchInventory,
    runActions,
    setAutoSelectEnabled,
    setActiveTargetGame,
    setCooldown,
    setWatchingFromChannel,
    stallCheckHeartbeat,
    targetDrops,
    targetGame,
    watching,
    lastWatchOk,
  ]);

  return { watchStallTrackerRef };
}
```

Dep-array note: the original list is preserved item-for-item with renames (`getNextPriorityTargetGame`→`getNextTargetGame`, `setStalledGameCooldown`→`setCooldown`, `watchStats.lastOk`→`lastWatchOk`); `runActions` is additionally listed because the effect now calls it — it is memoized on the same setters the original effect listed individually, so it introduces no new firing.

- [ ] **Step 2: Wire `useAppModel`** — delete: the stall constants block (lines 50–58 — `CLAIM_PROBE_NEAR_END_MINUTES` import from the barrel can go too if unused elsewhere), the refs `watchStallTrackerRef`/`watchConfirmationProbeRef`/`noFarmableDropRef` (159–165), the `getNextPriorityTargetGame` wrapper (Task 11 version), the stall-stop retarget effect (688–708), and the giant effect (936–1220). Insert after `useChannels` (needs `channels`/`fetchChannels`):

```ts
const { watchStallTrackerRef } = useStallRecovery({
  allowWatching,
  autoSelectEnabled,
  watching,
  targetGame,
  activeTargetGame,
  setActiveTargetGame,
  setAutoSelectEnabled,
  priorityOrder,
  orchestrationCategories,
  allowUnlinkedGames,
  isInCooldown: isGameInStallCooldown,
  channels,
  channelsLoading,
  channelsRefreshing,
  channelAllowlist,
  targetDrops,
  activeDropInfo,
  canWatchTarget,
  lastWatchOk: watchStats.lastOk,
  stallCheckHeartbeat,
  watchEngineState,
  dispatchWatchEngineEvent,
  setWatchingFromChannel,
  clearWatching,
  setCooldown: setStalledGameCooldown,
  fetchChannels,
  fetchInventory,
});
```

Drop `useAppModel` imports that are now unused (`evaluateNoProgressStall`, `pickStallRecoveryChannel`, `shouldProbeNoProgressConfirmation`, `buildWatchStallTrackerKey`, `WatchStallTracker`, `WATCH_INTERVAL_MS`, `DropChannelRestriction`, `canEarnDrop`, `sameGameName`, `isGameActionable`, `rotateToNextPriorityTarget` — verify each with the compiler; `DropChannelRestriction` is still used by the snapshot memo until Task 16).

Position check: the original stall effect ran with `stallCheckHeartbeat = watchStats.nextAt` defined right after `useWatchPing` — keep that alias where it is.

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json` + `npm test`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/useStallRecovery.ts src/renderer/shared/hooks/watch/index.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "refactor(watch): useStallRecovery executor replaces the inline stall effect"
```

---

### Task 16: `watchDecision.ts` (pure) + tests + `useWatchEngineSnapshot`

**Files:**

- Create: `src/renderer/shared/hooks/watch/watchDecision.ts`
- Create: `src/renderer/shared/hooks/watch/watchDecision.test.ts`
- Create: `src/renderer/shared/hooks/watch/useWatchEngineSnapshot.ts`
- Modify: `src/renderer/shared/hooks/watch/index.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (remove lines 1260–1382)

- [ ] **Step 1: Write the failing tests** (`watchDecision.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { deriveWatchDecision } from "./watchDecision";

const base = {
  suppressionGame: "",
  activeTargetGame: "Rust",
  targetGame: "Rust",
  isTargetInCooldown: false,
  isWatching: false,
  canWatchTarget: true,
  isRecoveringNoProgress: false,
  hasPredictiveProgress: false,
  hasFarmableActiveDrop: false,
  channelsLoading: false,
  channelsRefreshing: false,
  allowlistedLiveChannels: 1,
};

describe("deriveWatchDecision", () => {
  it.each([
    ["suppressed", { suppressionGame: "Rust" }],
    ["cooldown", { isTargetInCooldown: true }],
    ["no-target", { targetGame: "" }],
    ["watching-no-watchable", { isWatching: true, canWatchTarget: false }],
    ["watching-recover", { isWatching: true, isRecoveringNoProgress: true }],
    ["watching-progress", { isWatching: true, hasFarmableActiveDrop: true }],
    ["watching-progress", { isWatching: true, hasPredictiveProgress: true }],
    ["watching-no-farmable", { isWatching: true }],
    ["idle-loading-channels", { channelsLoading: true }],
    ["idle-no-channels", { allowlistedLiveChannels: 0 }],
    ["idle-ready", {}],
    ["idle-no-watchable-drops", { canWatchTarget: false }],
  ] as const)("returns %s", (expected, overrides) => {
    expect(deriveWatchDecision({ ...base, ...overrides })).toBe(expected);
  });

  it("suppression only counts when it matches the active target", () => {
    expect(deriveWatchDecision({ ...base, suppressionGame: "Dota 2" })).toBe("idle-ready");
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **implement** (`watchDecision.ts`) — the exact precedence chain from lines 1309–1346:

```ts
export type WatchDecision =
  | "no-target"
  | "suppressed"
  | "cooldown"
  | "watching-progress"
  | "watching-recover"
  | "watching-no-farmable"
  | "watching-no-watchable"
  | "idle-loading-channels"
  | "idle-no-channels"
  | "idle-ready"
  | "idle-no-watchable-drops";

/**
 * Classify the engine's current posture for the UI/debug snapshot. Pure
 * precedence chain — inputs are pre-computed booleans so the order of checks
 * is the single source of truth.
 */
export const deriveWatchDecision = (input: {
  /** Trimmed suppressed game ("" when none). */
  suppressionGame: string;
  activeTargetGame: string;
  targetGame: string;
  isTargetInCooldown: boolean;
  isWatching: boolean;
  canWatchTarget: boolean;
  isRecoveringNoProgress: boolean;
  hasPredictiveProgress: boolean;
  hasFarmableActiveDrop: boolean;
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  allowlistedLiveChannels: number;
}): WatchDecision => {
  const activeTarget = input.activeTargetGame.trim();
  if (input.suppressionGame && activeTarget && input.suppressionGame === activeTarget) {
    return "suppressed";
  }
  if (input.targetGame && input.isTargetInCooldown) {
    return "cooldown";
  }
  if (!input.targetGame) {
    return "no-target";
  }
  if (input.isWatching) {
    if (!input.canWatchTarget) return "watching-no-watchable";
    if (input.isRecoveringNoProgress) return "watching-recover";
    if (input.hasPredictiveProgress || input.hasFarmableActiveDrop) return "watching-progress";
    return "watching-no-farmable";
  }
  if (input.channelsLoading || input.channelsRefreshing) {
    return "idle-loading-channels";
  }
  if (input.allowlistedLiveChannels === 0) {
    return "idle-no-channels";
  }
  if (input.canWatchTarget) {
    return "idle-ready";
  }
  return "idle-no-watchable-drops";
};
```

- [ ] **Step 3: Run tests** — `npx vitest run src/renderer/shared/hooks/watch/watchDecision.test.ts`. Expected: PASS.

- [ ] **Step 4: Create `useWatchEngineSnapshot.ts`** — the memo body verbatim, with the classifier swapped for `deriveWatchDecision`:

```ts
import { useMemo } from "react";
import type { MutableRefObject } from "react";
import { DropChannelRestriction, type ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import type { ActiveDropInfo } from "@renderer/shared/hooks/inventory";
import type { GameCooldownMap } from "./gameCooldowns";
import { deriveWatchDecision } from "./watchDecision";
import {
  MANUAL_STOP_SUPPRESSION_HOLD_MS,
  STALL_STOP_SUPPRESSION_HOLD_MS,
  type WatchEngineState,
} from "./watchEngine";
import type { WatchStallTracker } from "./watchStallRecovery";

type Params = {
  watchEngineState: WatchEngineState;
  stalledGameCooldownUntil: GameCooldownMap;
  isInCooldown: (game: string, now?: number) => boolean;
  channelAllowlist: ChannelAllowlist;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  targetGame: string;
  activeTargetGame: string;
  activeDropInfo: ActiveDropInfo | null;
  canWatchTarget: boolean;
  watching: WatchingState;
  /** Non-reactive read by design — same semantics as the old inline memo. */
  stallTrackerRef: MutableRefObject<WatchStallTracker | null>;
};

export function useWatchEngineSnapshot({
  watchEngineState,
  stalledGameCooldownUntil,
  isInCooldown,
  channelAllowlist,
  channels,
  channelsLoading,
  channelsRefreshing,
  targetGame,
  activeTargetGame,
  activeDropInfo,
  canWatchTarget,
  watching,
  stallTrackerRef,
}: Params) {
  return useMemo(() => {
    const now = Date.now();
    const suppressionGame = watchEngineState.suppressedTargetGame.trim();
    const suppressionReason = watchEngineState.suppressionReason;
    const suppressionAt = watchEngineState.suppressedAt;
    const holdMs =
      suppressionReason === "stall-stop"
        ? STALL_STOP_SUPPRESSION_HOLD_MS
        : suppressionReason === "manual-stop"
          ? MANUAL_STOP_SUPPRESSION_HOLD_MS
          : 0;
    const suppressionHoldRemainingMs =
      holdMs && typeof suppressionAt === "number" && Number.isFinite(suppressionAt)
        ? Math.max(0, suppressionAt + holdMs - now)
        : 0;
    const activeCooldowns = Object.entries(stalledGameCooldownUntil)
      .map(([rawGame, until]) => ({ game: rawGame.trim(), until }))
      .filter(
        ({ game, until }) =>
          game.length > 0 && typeof until === "number" && Number.isFinite(until) && until > now,
      )
      .sort((a, b) => a.until - b.until)
      .map(({ game, until }) => ({
        game,
        until,
        remainingMs: Math.max(0, until - now),
      }));
    const allowlistRestriction = DropChannelRestriction.fromAllowlist(channelAllowlist);
    const allowlistedLiveChannels = allowlistRestriction.hasConstraints
      ? channels.filter((channel) => allowlistRestriction.allowsChannel(channel)).length
      : channels.length;
    const stallTracker = stallTrackerRef.current;
    const noProgressTracker =
      stallTracker && watching
        ? {
            recoveryCount: stallTracker.recoveryCount,
            sinceProgressMs: Math.max(0, now - stallTracker.lastProgressAt),
          }
        : null;
    const hasPredictiveProgress = Boolean(
      activeDropInfo &&
      typeof activeDropInfo.eta === "number" &&
      Number.isFinite(activeDropInfo.eta),
    );
    const hasFarmableActiveDrop = Boolean(activeDropInfo);
    const isRecoveringNoProgress = Boolean(
      noProgressTracker && noProgressTracker.recoveryCount > 0,
    );

    const decision = deriveWatchDecision({
      suppressionGame,
      activeTargetGame,
      targetGame,
      isTargetInCooldown: Boolean(targetGame) && isInCooldown(targetGame, now),
      isWatching: Boolean(watching),
      canWatchTarget,
      isRecoveringNoProgress,
      hasPredictiveProgress,
      hasFarmableActiveDrop,
      channelsLoading,
      channelsRefreshing,
      allowlistedLiveChannels,
    });

    return {
      decision,
      targetGame,
      activeTargetGame,
      suppression:
        suppressionGame && suppressionReason
          ? {
              game: suppressionGame,
              reason: suppressionReason,
              sinceAt: suppressionAt,
              holdRemainingMs: suppressionHoldRemainingMs,
            }
          : null,
      activeCooldowns,
      allowlistActive: allowlistRestriction.hasConstraints,
      allowlistedLiveChannels,
      totalLiveChannels: channels.length,
      noProgressTracker,
    };
  }, [
    activeDropInfo,
    activeTargetGame,
    canWatchTarget,
    channelAllowlist,
    channels,
    channelsLoading,
    channelsRefreshing,
    isInCooldown,
    stalledGameCooldownUntil,
    targetGame,
    watchEngineState.suppressedAt,
    watchEngineState.suppressedTargetGame,
    watchEngineState.suppressionReason,
    watching,
    // stallTrackerRef intentionally absent — refs are stable; the read is non-reactive (original behavior).
  ]);
}
```

Equivalence note: the original chain checked `isGameInStallCooldown(targetGame, now)` only after `suppressed` failed; here `isTargetInCooldown` is evaluated eagerly as an input. `isInCooldown` is side-effect-free, so eager evaluation cannot change the outcome — the precedence chain inside `deriveWatchDecision` is unchanged.

- [ ] **Step 5: Wire `useAppModel`** — delete the memo (1260–1382) and insert:

```ts
const watchEngineSnapshot = useWatchEngineSnapshot({
  watchEngineState,
  stalledGameCooldownUntil,
  isInCooldown: isGameInStallCooldown,
  channelAllowlist,
  channels,
  channelsLoading,
  channelsRefreshing,
  targetGame,
  activeTargetGame,
  activeDropInfo,
  canWatchTarget,
  watching,
  stallTrackerRef: watchStallTrackerRef,
});
```

Remove now-unused `useAppModel` imports (`DropChannelRestriction`, `STALL_STOP_SUPPRESSION_HOLD_MS`, `MANUAL_STOP_SUPPRESSION_HOLD_MS` — verify with the compiler).

- [ ] **Step 6: Verify** — `npx tsc --noEmit -p tsconfig.json` + `npm test`. Expected: clean.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/renderer/shared/hooks/watch/watchDecision.ts src/renderer/shared/hooks/watch/watchDecision.test.ts src/renderer/shared/hooks/watch/useWatchEngineSnapshot.ts src/renderer/shared/hooks/watch/index.ts src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "refactor(watch): pure deriveWatchDecision + useWatchEngineSnapshot"
```

---

### Task 17: Wrap-up — docs, spec amendment, final verification

**Files:**

- Modify: `docs/watch-engine.md`
- Modify: `docs/superpowers/specs/2026-06-09-useappmodel-watch-extraction-design.md`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (final read-through only)

- [ ] **Step 1: Update `docs/watch-engine.md`** — in the intro block, replace the line

> **Stall recovery** — driven by `useAppModel` (`src/renderer/shared/hooks/app/useAppModel.ts`) with helpers in `watchStallRecovery.ts`.

with:

> **Stall recovery** — pure decision functions in `watchStallRecovery.ts`
> (`decideIdleNoFarmable`, `decideWatchingNoFarmable`, `decideNoProgressRecovery`)
> executed by `useStallRecovery.ts`. Detects "no watch-time progress" and decides
> whether to switch channels or retarget to the next priority game.

Also update the Events table intro ("`useAppModel` dispatches" → "`useWatchEngine`'s dispatch wrapper sends, driven by `useWatchSuppressionSync`, `useStallRecovery`, and `useAppModel`'s manual handlers") and scan the rest of the doc for `useAppModel` references that now point at the new hooks. Keep the behavioral content untouched — it still describes the same rules.

- [ ] **Step 2: Amend the spec's action union** to match the implementation (generic `log` action; `context` on `dispatch-stall-stop`; `retarget` carries only `to` — log lines travel as `log` actions): replace the union code block in the spec with the implemented one from Task 12 and add one sentence: "Amended during implementation: info-only log lines travel as `log` actions so byte-identical log parity is testable."

- [ ] **Step 3: Final read-through of `useAppModel.ts`** — confirm: no stall/suppression/cooldown logic remains beyond the documented "stays deliberately" list (manual handlers, wiring memos, `manualWatchOverride`, `autoSelectEnabled`, props assembly). Check the file length (expect roughly ~700 lines). Remove any leftover unused imports/constants (the compiler and eslint will flag them).

- [ ] **Step 4: Full verification suite**

```bash
npx tsc --noEmit -p tsconfig.json   # expect: clean
npm test                            # expect: all green, including 5 new/extended test files
npm run lint                        # expect: exit 0
npm run format:check                # expect: clean
npm run build                       # expect: renderer + main/preload build OK
```

- [ ] **Step 5: Demo-mode smoke test** — `npm run dev`, enable demo mode in Settings, open the Debug view: confirm the watch decision/engine snapshot renders and transitions (idle → watching) look unchanged vs. the base branch (`git stash` / checkout `refactor/usechannels-split` for comparison if needed). Document the observed decisions in the PR description.

- [ ] **Step 6: Commit**

```bash
npx prettier --write docs/watch-engine.md docs/superpowers/specs/2026-06-09-useappmodel-watch-extraction-design.md src/renderer/shared/hooks/app/useAppModel.ts
git add -A && git commit -m "docs(watch): point watch-engine.md at the extracted hooks; amend spec action union"
```

---

## Findings

Discovered during implementation (none fixed inline — all pre-existing or out of scope):

1. **Duplicate channel-identity types** — `useControlViewState.ts` defines `ResumeChannelIdentity` and `ControlView.tsx` an inline `{ id; login }`, both now shadowing `WatchedChannelIdentity` exported from `watch/useWatchSessionMeta.ts`. Follow-up: point both at the canonical type.
2. **`WATCH_INTERVAL_MS` layering** — the pure `watchStallRecovery.ts` imports it from the hook module `useWatchPing.ts` (values-only, plan-sanctioned). Cleaner follow-up: hoist watch timing constants into a leaf `watchTiming.ts`.
3. **Snapshot cooldown filter duplication** — `useWatchEngineSnapshot`'s `activeCooldowns` pipeline hand-rolls the trim/finite/`until > now` filter that `gameCooldowns.ts` centralizes. Candidate helper: `activeCooldownsSnapshot(map, now)`.
4. **Render-phase ref writes** (pre-existing pattern, moved verbatim): `useDropProgressPoll` and `useWatchPing` assign `ref.current` during render. Harmless today; a `useLayoutEffect` pass would be cleaner.
5. **Ungated debug `console.log`** (pre-existing): `useActiveCampaignDebugLog` logs unconditionally in production.
6. **Defensive optional chaining on non-nullable param** (pre-existing, moved verbatim): `useActivityFeedWiring`'s Source-3 effect uses `inventoryChanges?.added?.size` although the param type is non-nullable.
7. **Minor test-hardening candidates**: retargetPolicy (blocked-current game; rotation past a blocked successor), watchDecision (precedence-dominance rows with multiple flags set).
