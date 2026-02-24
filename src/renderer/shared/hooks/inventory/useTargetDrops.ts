import { useMemo } from "react";
import { InventoryDrop, InventoryDropCollection } from "@renderer/shared/domain/dropDomain";
import type { InventoryItem, WatchingState } from "@renderer/shared/types";

type WithCategory = { item: InventoryItem; category: string };
const isActionableCategory = (category: string, allowUpcoming: boolean): boolean =>
  category === "in-progress" || (allowUpcoming && category === "upcoming");

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
};

type ComputeParams = Params & { now?: number };

export function computeTargetDrops({
  targetGame,
  inventoryItems,
  withCategories,
  allowWatching,
  allowUnlinkedGames = false,
  watching,
  inventoryFetchedAt,
  progressAnchorByDropId,
  now: providedNow,
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
  const collection = new InventoryDropCollection(inventoryItems);
  const withCategoryDrops = withCategories.map(({ item, category }) => ({
    drop: new InventoryDrop(item),
    category,
  }));
  const nonExpiredForGame = collection.forGame(targetGame).filter((drop) => !drop.isExpired(now));
  const activeRelevant = withCategoryDrops.filter(
    ({ drop, category }) =>
      drop.game === targetGame && isActionableCategory(category, allowUnlinkedGames),
  );
  const inProgressRelevant = withCategoryDrops.filter(
    ({ drop, category }) =>
      drop.game === targetGame && category === "in-progress" && !drop.isExpired(now),
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
  const isWatchableInProgress = ({ drop, category }: { drop: InventoryDrop; category: string }) =>
    drop.game === targetGame &&
    category === "in-progress" &&
    !drop.isExpired(now) &&
    drop.isBlocked !== true &&
    drop.remainingMinutes > 0 &&
    drop.raw.isClaimable !== true;
  const sortedActive = sortCandidates(activeRelevant);
  const sortedInProgress = sortCandidates(inProgressRelevant.filter(isWatchableInProgress));
  const upcomingRelevant = withCategoryDrops.filter(
    ({ drop, category }) =>
      drop.game === targetGame && category === "upcoming" && drop.isBlocked !== true,
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
  const hasUnclaimedTarget = withCategoryDrops.some(
    ({ drop, category }) =>
      drop.game === targetGame && isActionableCategory(category, allowUnlinkedGames),
  );
  const hasWatchableTarget =
    sortedInProgress.length > 0 || (allowUnlinkedGames && sortedUpcoming.length > 0);
  const canWatchTarget = allowWatching && !!targetGame && hasWatchableTarget;
  const showNoDropsHint = !!targetGame && !hasUnclaimedTarget;

  const campaignMinutes = targetDropEntries.reduce((map, drop) => {
    const key = drop.raw.campaignId || `drop-${drop.id}`;
    const req = drop.requiredMinutes;
    const earned = Math.min(req, drop.earnedMinutes);
    const existing = map.get(key) ?? { req: 0, earned: 0 };
    map.set(key, { req: Math.max(existing.req, req), earned: Math.max(existing.earned, earned) });
    return map;
  }, new Map<string, { req: number; earned: number }>());
  const totalRequiredMinutes = Array.from(campaignMinutes.values()).reduce(
    (acc, v) => acc + v.req,
    0,
  );
  const totalEarnedMinutes = Array.from(campaignMinutes.values()).reduce(
    (acc, v) => acc + v.earned,
    0,
  );
  const isWatchingAnyChannel = Boolean(watching);
  const isWatchingTargetGame = Boolean(watching && watching.game === targetGame);
  const farmableInProgress = isWatchingTargetGame
    ? (sortedInProgress.find(({ drop }) => drop.canProgressOnWatchingChannel(watching, targetGame))
        ?.drop ?? null)
    : null;
  const farmableUpcoming = isWatchingTargetGame
    ? (sortedUpcoming.find(({ drop }) => drop.canProgressOnWatchingChannel(watching, targetGame))
        ?.drop ?? null)
    : null;
  const activeDrop = isWatchingAnyChannel
    ? (farmableInProgress ?? farmableUpcoming ?? null)
    : (sortedInProgress[0]?.drop ?? null);
  const activeDropAnchorAt = (() => {
    if (!activeDrop) return null;
    const byDrop = progressAnchorByDropId?.[activeDrop.id];
    if (typeof byDrop === "number" && Number.isFinite(byDrop)) return byDrop;
    return inventoryFetchedAt;
  })();
  const liveDeltaMinutesRaw =
    watching && activeDropAnchorAt ? Math.max(0, (now - activeDropAnchorAt) / 60000) : 0;
  const liveDeltaMinutes = Math.min(
    liveDeltaMinutesRaw,
    Math.max(0, totalRequiredMinutes - totalEarnedMinutes),
  );
  const activeDropRequired = activeDrop ? activeDrop.requiredMinutes : 0;
  const activeDropEarned = activeDrop ? activeDrop.earnedMinutes : 0;
  const liveDeltaApplied = activeDrop
    ? Math.min(liveDeltaMinutes, Math.max(0, activeDropRequired - activeDropEarned))
    : 0;
  const targetProgress = totalRequiredMinutes
    ? Math.min(100, Math.round((totalEarnedMinutes / totalRequiredMinutes) * 100))
    : 0;
  const activeDropVirtualEarned = activeDrop
    ? Math.min(activeDropRequired, activeDropEarned + liveDeltaApplied)
    : 0;
  const activeDropRemainingMinutes = activeDrop
    ? Math.max(0, activeDropRequired - activeDropVirtualEarned)
    : 0;
  const activeDropEta =
    activeDropRemainingMinutes > 0 ? now + activeDropRemainingMinutes * 60_000 : null;
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
}: Params): TargetDropsResult {
  return useMemo(
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
      }),
    [
      allowWatching,
      allowUnlinkedGames,
      inventoryFetchedAt,
      inventoryItems,
      progressAnchorByDropId,
      targetGame,
      watching,
      withCategories,
    ],
  );
}
