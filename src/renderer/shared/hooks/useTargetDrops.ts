import { useMemo } from "react";
import type { InventoryItem, WatchingState } from "@renderer/shared/types";

type WithCategory = { item: InventoryItem; category: string };
const isActionableCategory = (category: string, allowUpcoming: boolean): boolean =>
  category === "in-progress" || (allowUpcoming && category === "upcoming");
const getRemainingMinutes = (item: InventoryItem): number =>
  Math.max(0, Math.max(0, Number(item.requiredMinutes) || 0) - Math.max(0, Number(item.earnedMinutes) || 0));
const normalizeIds = (values?: string[]): Set<string> =>
  new Set(
    (values ?? [])
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0),
  );
const normalizeLogins = (values?: string[]): Set<string> =>
  new Set(
    (values ?? [])
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
const canDropProgressOnWatchingChannel = (
  item: InventoryItem,
  watching: WatchingState,
  targetGame: string,
): boolean => {
  if (!watching || watching.game !== targetGame) return false;
  const allowedIds = normalizeIds(item.allowedChannelIds);
  const allowedLogins = normalizeLogins(item.allowedChannelLogins);
  if (allowedIds.size === 0 && allowedLogins.size === 0) return true;
  const watchingId = String(watching.channelId ?? watching.id ?? "").trim();
  if (watchingId.length > 0 && allowedIds.has(watchingId)) return true;
  const watchingLogin = String(watching.login ?? watching.name ?? "")
    .trim()
    .toLowerCase();
  if (watchingLogin.length > 0 && allowedLogins.has(watchingLogin)) return true;
  return false;
};

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
  const allForGame = inventoryItems.filter((i) => i.game === targetGame);
  const isExpired = (item: InventoryItem) => {
    const status = (item.campaignStatus ?? "").toUpperCase();
    const endsAt = item.endsAt ? Date.parse(item.endsAt) : undefined;
    return status === "EXPIRED" || (endsAt !== undefined && endsAt < now);
  };
  const nonExpiredForGame = allForGame.filter((i) => !isExpired(i));
  const activeRelevant = withCategories.filter(
    ({ item, category }) =>
      item.game === targetGame && isActionableCategory(category, allowUnlinkedGames),
  );
  const inProgressRelevant = withCategories.filter(
    ({ item, category }) => item.game === targetGame && category === "in-progress" && !isExpired(item),
  );
  const sortCandidates = (candidates: WithCategory[]): WithCategory[] =>
    [...candidates].sort((a, b) => {
      const remainingA = getRemainingMinutes(a.item);
      const remainingB = getRemainingMinutes(b.item);
      if (remainingA !== remainingB) return remainingA - remainingB;
      const endA = a.item.endsAt ? Date.parse(a.item.endsAt) : null;
      const endB = b.item.endsAt ? Date.parse(b.item.endsAt) : null;
      const safeEndA = endA && endA > now ? endA : Number.POSITIVE_INFINITY;
      const safeEndB = endB && endB > now ? endB : Number.POSITIVE_INFINITY;
      if (safeEndA !== safeEndB) return safeEndA - safeEndB;
      const startA = a.item.startsAt ? Date.parse(a.item.startsAt) : 0;
      const startB = b.item.startsAt ? Date.parse(b.item.startsAt) : 0;
      if (startA !== startB) return startA - startB;
      return (a.item.title || "").localeCompare(b.item.title || "");
    });
  const sortedActive = sortCandidates(activeRelevant);
  const sortedInProgress = sortCandidates(inProgressRelevant);
  const upcomingRelevant = withCategories.filter(
    ({ item, category }) => item.game === targetGame && category === "upcoming" && item.blocked !== true,
  );
  const sortedUpcoming = sortCandidates(upcomingRelevant);
  const sortedActiveItems = sortedActive.map((s) => s.item);
  const remaining = nonExpiredForGame.filter((i) => !sortedActiveItems.includes(i));
  const compareByCampaignAndDrop = (a: InventoryItem, b: InventoryItem) => {
    const campaignLabelA =
      a.campaignName?.trim().toLocaleLowerCase() ||
      a.campaignId?.trim().toLocaleLowerCase() ||
      `drop-${a.id}`;
    const campaignLabelB =
      b.campaignName?.trim().toLocaleLowerCase() ||
      b.campaignId?.trim().toLocaleLowerCase() ||
      `drop-${b.id}`;
    if (campaignLabelA !== campaignLabelB) {
      return campaignLabelA.localeCompare(campaignLabelB);
    }
    const requiredA = Math.max(0, Number(a.requiredMinutes) || 0);
    const requiredB = Math.max(0, Number(b.requiredMinutes) || 0);
    if (requiredA !== requiredB) return requiredA - requiredB;
    const earnedA = Math.max(0, Number(a.earnedMinutes) || 0);
    const earnedB = Math.max(0, Number(b.earnedMinutes) || 0);
    if (earnedA !== earnedB) return earnedA - earnedB;
    return (a.title || "").localeCompare(b.title || "");
  };
  const targetDrops = [
    ...[...sortedActiveItems].sort(compareByCampaignAndDrop),
    ...[...remaining].sort(compareByCampaignAndDrop),
  ];

  const totalDrops = targetDrops.length;
  const claimedDrops = targetDrops.filter((i) => i.status === "claimed").length;
  const hasUnclaimedTarget = withCategories.some(
    ({ item, category }) =>
      item.game === targetGame && isActionableCategory(category, allowUnlinkedGames),
  );
  const canWatchTarget = allowWatching && !!targetGame && hasUnclaimedTarget;
  const showNoDropsHint = !!targetGame && !hasUnclaimedTarget;

  const campaignMinutes = targetDrops.reduce((map, drop) => {
    const key = drop.campaignId || `drop-${drop.id}`;
    const req = Math.max(0, Number(drop.requiredMinutes) || 0);
    const earned = Math.min(req, Math.max(0, Number(drop.earnedMinutes) || 0));
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
    ? sortedInProgress.find(({ item }) => canDropProgressOnWatchingChannel(item, watching, targetGame))
        ?.item ?? null
    : null;
  const farmableUpcoming = isWatchingTargetGame
    ? sortedUpcoming.find(({ item }) => canDropProgressOnWatchingChannel(item, watching, targetGame))
        ?.item ?? null
    : null;
  const activeDrop = isWatchingAnyChannel
    ? farmableInProgress ?? farmableUpcoming ?? null
    : sortedInProgress[0]?.item ?? null;
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
  const activeDropRequired = activeDrop ? Math.max(0, Number(activeDrop.requiredMinutes) || 0) : 0;
  const activeDropEarned = activeDrop ? Math.max(0, Number(activeDrop.earnedMinutes) || 0) : 0;
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
        dropInstanceId: activeDrop.dropInstanceId,
        campaignId: activeDrop.campaignId,
        allowedChannelIds: activeDrop.allowedChannelIds,
        allowedChannelLogins: activeDrop.allowedChannelLogins,
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
