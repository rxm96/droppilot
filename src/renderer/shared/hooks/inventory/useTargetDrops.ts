import { useEffect, useMemo, useRef, useState } from "react";
import { InventoryDrop, InventoryDropCollection } from "@renderer/shared/domain/dropDomain";
import { canEarnDrop, hasHardWatchingBlockers } from "@renderer/shared/domain/inventory";
import type { InventoryItem, WatchingState } from "@renderer/shared/types";
import { useInterval } from "@renderer/shared/hooks/useInterval";
import { sameGameName } from "@renderer/shared/domain/gameName";

type WithCategory = { item: InventoryItem; category: string };

/**
 * Domain objects derived purely from inventory data — no time input.
 * Constructing these is the allocation-heavy part of computeTargetDrops: every
 * InventoryDrop builds a DropChannelRestriction holding two Sets, so a full
 * rebuild is ~2N drop objects + ~4N Sets. Both InventoryDrop and
 * InventoryDropCollection are immutable (all getters read from `raw`,
 * `isExpired(now)` takes `now` per call), so a prebuilt domain is safe to reuse
 * across renders. useTargetDrops memoizes it on the data so the per-second live
 * tick no longer re-allocates the whole collection.
 */
export type DropDomain = {
  collection: InventoryDropCollection;
  withCategoryDrops: Array<{ drop: InventoryDrop; category: string }>;
};

export function buildDropDomain(
  inventoryItems: InventoryItem[],
  withCategories: WithCategory[],
): DropDomain {
  return {
    collection: new InventoryDropCollection(inventoryItems),
    withCategoryDrops: withCategories.map(({ item, category }) => ({
      drop: new InventoryDrop(item),
      category,
    })),
  };
}

export type ActiveDropInfo = {
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
  allowedChannelLogins?: string[];
};

export type TargetDropsResult = {
  targetDrops: InventoryItem[];
  totalDrops: number;
  claimedDrops: number;
  totalRequiredMinutes: number;
  totalEarnedMinutes: number;
  targetProgress: number;
  liveDeltaApplied: number;
  activeDropEta: number | null;
  activeDropInfo: ActiveDropInfo | null;
  canWatchTarget: boolean;
  showNoDropsHint: boolean;
};

type Params = {
  targetGame: string;
  inventoryItems: InventoryItem[];
  withCategories: WithCategory[];
  allowWatching: boolean;
  allowUnlinkedGames?: boolean;
  watching: WatchingState;
  inventoryFetchedAt: number | null;
  progressAnchorByDropId?: Record<string, number>;
  /**
   * Timestamp when the current watch session (this channel+stream) began. The
   * live-progress anchor is clamped to never predate this, so we don't credit
   * elapsed time from before the user actually started watching (e.g. a stale
   * inventory snapshot). ControlView uses the same clamp — passing it here keeps
   * both views' live progress identical.
   */
  watchStartedAt?: number | null;
  /**
   * The active drop id from the previous render. The selection prefers it (as
   * long as it's still a valid candidate) so the active drop doesn't flicker
   * between equivalent drops — e.g. two same-game campaigns at the same tier
   * whose earnedMinutes update asynchronously and keep swapping the sort order.
   */
  stickyActiveDropId?: string | null;
};

type ComputeParams = Params & {
  now?: number;
  /**
   * Optionally reuse a prebuilt drop domain (see buildDropDomain) instead of
   * constructing it from inventoryItems/withCategories. useTargetDrops passes a
   * memoized domain so the per-second `now` tick skips the allocation-heavy
   * rebuild. When omitted (e.g. tests), it's built inline — behavior is identical.
   */
  domain?: DropDomain;
};

export function computeTargetDrops({
  targetGame,
  inventoryItems,
  withCategories,
  allowWatching,
  allowUnlinkedGames = false,
  watching,
  inventoryFetchedAt,
  progressAnchorByDropId,
  watchStartedAt,
  stickyActiveDropId,
  now: providedNow,
  domain,
}: ComputeParams): TargetDropsResult {
  if (!targetGame) {
    return {
      targetDrops: [],
      totalDrops: 0,
      claimedDrops: 0,
      totalRequiredMinutes: 0,
      totalEarnedMinutes: 0,
      targetProgress: 0,
      liveDeltaApplied: 0,
      activeDropEta: null,
      activeDropInfo: null,
      canWatchTarget: false,
      showNoDropsHint: false,
    };
  }
  const now = providedNow ?? Date.now();
  const { collection, withCategoryDrops } =
    domain ?? buildDropDomain(inventoryItems, withCategories);
  const nonExpiredForGame = collection.forGame(targetGame).filter((drop) => !drop.isExpired(now));
  const isWatchableUpcomingDrop = (drop: InventoryDrop): boolean => {
    return canEarnDrop(drop.raw, {
      category: "upcoming",
      allowUpcoming: true,
    });
  };
  const isWatchableInProgress = (drop: InventoryDrop): boolean =>
    !drop.isExpired(now) &&
    canEarnDrop(drop.raw, {
      category: "in-progress",
      allowUpcoming: false,
    });
  const isActionableForTarget = ({ drop, category }: { drop: InventoryDrop; category: string }) =>
    sameGameName(drop.game, targetGame) &&
    canEarnDrop(drop.raw, {
      category,
      allowUpcoming: allowUnlinkedGames,
    });
  const activeRelevant = withCategoryDrops.filter(({ drop, category }) =>
    isActionableForTarget({ drop, category }),
  );
  const inProgressRelevant = withCategoryDrops.filter(
    ({ drop, category }) =>
      sameGameName(drop.game, targetGame) &&
      category === "in-progress" &&
      isWatchableInProgress(drop),
  );
  const sortCandidates = (
    candidates: Array<{ drop: InventoryDrop; category: string }>,
  ): Array<{ drop: InventoryDrop; category: string }> =>
    [...candidates].sort((a, b) => {
      const remainingA = a.drop.remainingMinutes;
      const remainingB = b.drop.remainingMinutes;
      if (remainingA !== remainingB) return remainingA - remainingB;
      const endA = a.drop.raw.endsAt ? Date.parse(a.drop.raw.endsAt) : null;
      const endB = b.drop.raw.endsAt ? Date.parse(b.drop.raw.endsAt) : null;
      const safeEndA = endA && endA > now ? endA : Number.POSITIVE_INFINITY;
      const safeEndB = endB && endB > now ? endB : Number.POSITIVE_INFINITY;
      if (safeEndA !== safeEndB) return safeEndA - safeEndB;
      const startA = a.drop.raw.startsAt ? Date.parse(a.drop.raw.startsAt) : 0;
      const startB = b.drop.raw.startsAt ? Date.parse(b.drop.raw.startsAt) : 0;
      if (startA !== startB) return startA - startB;
      return a.drop.title.localeCompare(b.drop.title);
    });
  const sortedActive = sortCandidates(activeRelevant);
  const sortedInProgress = sortCandidates(inProgressRelevant);
  const upcomingRelevant = withCategoryDrops.filter(
    ({ drop, category }) =>
      sameGameName(drop.game, targetGame) &&
      category === "upcoming" &&
      isWatchableUpcomingDrop(drop),
  );
  const sortedUpcoming = sortCandidates(upcomingRelevant);
  const sortedActiveItems = sortedActive.map((s) => s.drop);
  const sortedActiveIds = new Set(sortedActiveItems.map((drop) => drop.id));
  const remaining = nonExpiredForGame.filter((drop) => !sortedActiveIds.has(drop.id));
  const compareByCampaignAndDrop = (a: InventoryDrop, b: InventoryDrop) => {
    const campaignLabelA =
      a.raw.campaignName?.trim().toLocaleLowerCase() ||
      a.raw.campaignId?.trim().toLocaleLowerCase() ||
      `drop-${a.id}`;
    const campaignLabelB =
      b.raw.campaignName?.trim().toLocaleLowerCase() ||
      b.raw.campaignId?.trim().toLocaleLowerCase() ||
      `drop-${b.id}`;
    if (campaignLabelA !== campaignLabelB) {
      return campaignLabelA.localeCompare(campaignLabelB);
    }
    const requiredA = a.requiredMinutes;
    const requiredB = b.requiredMinutes;
    if (requiredA !== requiredB) return requiredA - requiredB;
    const earnedA = a.earnedMinutes;
    const earnedB = b.earnedMinutes;
    if (earnedA !== earnedB) return earnedA - earnedB;
    return a.title.localeCompare(b.title);
  };
  const targetDropEntries = [
    ...[...sortedActiveItems].sort(compareByCampaignAndDrop),
    ...[...remaining].sort(compareByCampaignAndDrop),
  ];
  const targetDrops = targetDropEntries.map((drop) => drop.raw);

  const totalDrops = targetDrops.length;
  const claimedDrops = targetDropEntries.filter((drop) => drop.raw.status === "claimed").length;
  const hasUnclaimedTarget = withCategoryDrops.some(({ drop, category }) => {
    if (!sameGameName(drop.game, targetGame)) return false;
    if (drop.isExpired(now)) return false;
    if (drop.raw.status === "claimed") return false;
    if (drop.requiredMinutes <= 0) return false;
    if (drop.raw.blocked === true) return false;
    if (hasHardWatchingBlockers(drop.raw)) return false;
    if (category === "in-progress") return true;
    if (category === "upcoming") return allowUnlinkedGames;
    return false;
  });
  const hasWatchableTarget =
    sortedInProgress.length > 0 || (allowUnlinkedGames && sortedUpcoming.length > 0);
  const canWatchTarget = allowWatching && !!targetGame && hasWatchableTarget;
  const showNoDropsHint = !!targetGame && !hasUnclaimedTarget;

  const campaignMinutes = targetDropEntries.reduce(
    (map, drop) => {
      const key = drop.raw.campaignId || `drop-${drop.id}`;
      const req = drop.requiredMinutes;
      const earned = Math.min(req, drop.earnedMinutes);
      const existing = map.get(key) ?? {
        hasOpen: false,
        openReq: 0,
        openEarned: 0,
        claimedReqSum: 0,
        claimedEarnedSum: 0,
      };
      if (drop.raw.status === "claimed") {
        map.set(key, {
          ...existing,
          claimedReqSum: existing.claimedReqSum + req,
          claimedEarnedSum: existing.claimedEarnedSum + earned,
        });
        return map;
      }
      map.set(key, {
        ...existing,
        hasOpen: true,
        openReq: Math.max(existing.openReq, req),
        openEarned: Math.max(existing.openEarned, earned),
      });
      return map;
    },
    new Map<
      string,
      {
        hasOpen: boolean;
        openReq: number;
        openEarned: number;
        claimedReqSum: number;
        claimedEarnedSum: number;
      }
    >(),
  );
  const totalRequiredMinutes = Array.from(campaignMinutes.values()).reduce(
    (acc, v) => acc + v.claimedReqSum + (v.hasOpen ? v.openReq : 0),
    0,
  );
  const totalEarnedMinutes = Array.from(campaignMinutes.values()).reduce(
    (acc, v) => acc + v.claimedEarnedSum + (v.hasOpen ? v.openEarned : 0),
    0,
  );
  const isWatchingAnyChannel = Boolean(watching);
  const isWatchingTargetGame = Boolean(watching && sameGameName(watching.game, targetGame));
  // Anti-flicker: prefer the previously-active drop while it's still a valid
  // candidate, instead of always taking the first sorted one. Without this, two
  // equivalent drops (same game/tier) whose earnedMinutes update asynchronously
  // keep swapping the sort order and the active drop jumps back and forth.
  const preferSticky = (
    list: Array<{ drop: InventoryDrop; category: string }>,
  ): { drop: InventoryDrop; category: string } | null => {
    if (stickyActiveDropId) {
      const kept = list.find(({ drop }) => drop.id === stickyActiveDropId);
      if (kept) return kept;
    }
    return list[0] ?? null;
  };
  const farmableInProgress = isWatchingTargetGame
    ? preferSticky(
        sortedInProgress.filter(({ drop }) =>
          drop.canProgressOnWatchingChannel(watching, targetGame),
        ),
      )
    : null;
  const farmableUpcoming = isWatchingTargetGame
    ? preferSticky(
        sortedUpcoming.filter(({ drop }) =>
          drop.canProgressOnWatchingChannel(watching, targetGame),
        ),
      )
    : null;
  const activeDropEntry = isWatchingAnyChannel
    ? (farmableInProgress ?? farmableUpcoming ?? null)
    : preferSticky(sortedInProgress);
  const activeDrop = activeDropEntry?.drop ?? null;
  const activeDropCategory = activeDropEntry?.category ?? null;
  const canPredictActiveDropProgress =
    Boolean(watching) && isWatchingTargetGame && activeDropCategory === "in-progress";
  const activeDropAnchorAt = (() => {
    if (!activeDrop || !canPredictActiveDropProgress) return null;
    const byDrop = progressAnchorByDropId?.[activeDrop.id];
    const base =
      typeof byDrop === "number" && Number.isFinite(byDrop) ? byDrop : inventoryFetchedAt;
    if (base == null) return null;
    // Clamp to the current watch-session start so we never credit elapsed time
    // from before the user actually started watching this channel (e.g. a stale
    // inventory snapshot). Mirrors ControlView so both views show identical live
    // progress for the active drop.
    return typeof watchStartedAt === "number" && Number.isFinite(watchStartedAt)
      ? Math.max(base, watchStartedAt)
      : base;
  })();
  const liveDeltaMinutesRaw =
    canPredictActiveDropProgress && activeDropAnchorAt
      ? Math.max(0, (now - activeDropAnchorAt) / 60000)
      : 0;
  const liveDeltaMinutes = Math.min(
    liveDeltaMinutesRaw,
    Math.max(0, totalRequiredMinutes - totalEarnedMinutes),
  );
  const activeDropRequired = activeDrop ? activeDrop.requiredMinutes : 0;
  const activeDropEarned = activeDrop ? activeDrop.earnedMinutes : 0;
  const liveDeltaApplied =
    activeDrop && canPredictActiveDropProgress
      ? Math.min(liveDeltaMinutes, Math.max(0, activeDropRequired - activeDropEarned))
      : 0;
  // Include the live-ticking delta from the active drop so the percentage
  // advances between inventory polls (which can be ~1h apart).
  const targetProgress = totalRequiredMinutes
    ? Math.min(
        100,
        Math.round(((totalEarnedMinutes + liveDeltaApplied) / totalRequiredMinutes) * 100),
      )
    : 0;
  const activeDropVirtualEarned = activeDrop
    ? Math.min(activeDropRequired, activeDropEarned + liveDeltaApplied)
    : 0;
  const activeDropRemainingMinutes = activeDrop
    ? Math.max(0, activeDropRequired - activeDropVirtualEarned)
    : 0;
  const activeDropEta =
    canPredictActiveDropProgress && activeDropRemainingMinutes > 0
      ? now + activeDropRemainingMinutes * 60_000
      : null;
  const activeDropInfo = activeDrop
    ? {
        id: activeDrop.id,
        title: activeDrop.title,
        requiredMinutes: activeDropRequired,
        earnedMinutes: activeDropEarned,
        virtualEarned: activeDropVirtualEarned,
        remainingMinutes: activeDropRemainingMinutes,
        eta: activeDropEta,
        progressAnchorAt: activeDropAnchorAt ?? undefined,
        dropInstanceId: activeDrop.raw.dropInstanceId,
        campaignId: activeDrop.raw.campaignId,
        allowedChannelIds: activeDrop.raw.allowedChannelIds,
        allowedChannelLogins: activeDrop.raw.allowedChannelLogins,
      }
    : null;

  return {
    targetDrops,
    totalDrops,
    claimedDrops,
    totalRequiredMinutes,
    totalEarnedMinutes,
    targetProgress,
    liveDeltaApplied,
    activeDropEta,
    activeDropInfo,
    canWatchTarget,
    showNoDropsHint,
  };
}

export function useTargetDrops({
  targetGame,
  inventoryItems,
  withCategories,
  allowWatching,
  allowUnlinkedGames,
  watching,
  inventoryFetchedAt,
  progressAnchorByDropId,
  watchStartedAt,
}: Params): TargetDropsResult {
  // Tick `now` every second while the user is watching the target game so
  // targetProgress, liveDeltaApplied, virtualEarned, and activeDropEta stay
  // live between inventory polls. When not watching the target, no interval
  // runs and `now` stays static (cheap).
  const isLiveActive = Boolean(watching && sameGameName(watching.game, targetGame));
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useInterval(() => setNowMs(Date.now()), 1000, isLiveActive);

  // Build the (data-only) drop domain once per inventory change. The live
  // recompute below still re-runs every `nowMs` tick, but reuses this memo so it
  // no longer re-allocates the whole InventoryDrop collection + restriction Sets
  // each second — only the cheap now-dependent filtering/selection re-runs.
  const domain = useMemo(
    () => buildDropDomain(inventoryItems, withCategories),
    [inventoryItems, withCategories],
  );

  // Remember the last active drop so the selection can prefer it across
  // recomputes (anti-flicker). Read in the memo, refreshed after each commit.
  const lastActiveDropIdRef = useRef<string | null>(null);
  const result = useMemo(
    () =>
      computeTargetDrops({
        targetGame,
        inventoryItems,
        withCategories,
        allowWatching,
        allowUnlinkedGames,
        watching,
        inventoryFetchedAt,
        progressAnchorByDropId,
        watchStartedAt,
        stickyActiveDropId: lastActiveDropIdRef.current,
        now: isLiveActive ? nowMs : undefined,
        domain,
      }),
    [
      allowWatching,
      allowUnlinkedGames,
      inventoryFetchedAt,
      domain,
      inventoryItems,
      progressAnchorByDropId,
      watchStartedAt,
      targetGame,
      watching,
      withCategories,
      isLiveActive,
      nowMs,
    ],
  );
  const activeDropId = result.activeDropInfo?.id ?? null;
  useEffect(() => {
    lastActiveDropIdRef.current = activeDropId;
  }, [activeDropId]);
  return result;
}
