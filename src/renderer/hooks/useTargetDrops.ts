import { useMemo } from "react";
import type { InventoryItem, WatchingState } from "../types";

type WithCategory = { item: InventoryItem; category: string };

export type ActiveDropInfo = {
  id: string;
  title: string;
  requiredMinutes: number;
  earnedMinutes: number;
  virtualEarned: number;
  remainingMinutes: number;
  eta: number | null;
  dropInstanceId?: string;
  campaignId?: string;
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
  watching: WatchingState;
  inventoryFetchedAt: number | null;
  nowTick: number;
};

export function useTargetDrops({
  targetGame,
  inventoryItems,
  withCategories,
  allowWatching,
  watching,
  inventoryFetchedAt,
  nowTick,
}: Params): TargetDropsResult {
  return useMemo(() => {
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
    const now = Date.now();
    const allForGame = inventoryItems.filter((i) => i.game === targetGame);
    const isExpired = (item: InventoryItem) => {
      const status = (item.campaignStatus ?? "").toUpperCase();
      const endsAt = item.endsAt ? Date.parse(item.endsAt) : undefined;
      return status === "EXPIRED" || (endsAt !== undefined && endsAt < now);
    };
    const nonExpiredForGame = allForGame.filter((i) => !isExpired(i));
    const activeRelevant = withCategories.filter(
      ({ item, category }) =>
        item.game === targetGame && (category === "in-progress" || category === "upcoming"),
    );
    const sortedActive = [...activeRelevant].sort((a, b) => {
      const endA = a.item.endsAt ? Date.parse(a.item.endsAt) : null;
      const endB = b.item.endsAt ? Date.parse(b.item.endsAt) : null;
      const safeEndA = endA && endA > now ? endA : Number.POSITIVE_INFINITY;
      const safeEndB = endB && endB > now ? endB : Number.POSITIVE_INFINITY;
      if (safeEndA !== safeEndB) return safeEndA - safeEndB;
      const startA = a.item.startsAt ? Date.parse(a.item.startsAt) : 0;
      const startB = b.item.startsAt ? Date.parse(b.item.startsAt) : 0;
      if (startA !== startB) return startA - startB;
      const remainingA = Math.max(
        0,
        Math.max(0, Number(a.item.requiredMinutes) || 0) -
          Math.max(0, Number(a.item.earnedMinutes) || 0),
      );
      const remainingB = Math.max(
        0,
        Math.max(0, Number(b.item.requiredMinutes) || 0) -
          Math.max(0, Number(b.item.earnedMinutes) || 0),
      );
      if (remainingA !== remainingB) return remainingA - remainingB;
      return (a.item.title || "").localeCompare(b.item.title || "");
    });
    const sortedActiveItems = sortedActive.map((s) => s.item);
    const remaining = nonExpiredForGame.filter((i) => !sortedActiveItems.includes(i));
    const targetDrops = [...sortedActiveItems, ...remaining];

    const totalDrops = targetDrops.length;
    const claimedDrops = targetDrops.filter((i) => i.status === "claimed").length;
    const hasUnclaimedTarget = withCategories.some(
      ({ item, category }) =>
        item.game === targetGame && (category === "in-progress" || category === "upcoming"),
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
    const liveDeltaMinutesRaw =
      watching && inventoryFetchedAt ? Math.max(0, (nowTick - inventoryFetchedAt) / 60000) : 0;
    const liveDeltaMinutes = Math.min(
      liveDeltaMinutesRaw,
      Math.max(0, totalRequiredMinutes - totalEarnedMinutes),
    );
    const activeDrop = sortedActiveItems[0] ?? null;
    const activeDropRequired = activeDrop
      ? Math.max(0, Number(activeDrop.requiredMinutes) || 0)
      : 0;
    const activeDropEarned = activeDrop ? Math.max(0, Number(activeDrop.earnedMinutes) || 0) : 0;
    const liveDeltaApplied = activeDrop
      ? Math.min(liveDeltaMinutes, Math.max(0, activeDropRequired - activeDropEarned))
      : 0;
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
      activeDropRemainingMinutes > 0 ? nowTick + activeDropRemainingMinutes * 60_000 : null;
    const activeDropInfo = activeDrop
      ? {
          id: activeDrop.id,
          title: activeDrop.title,
          requiredMinutes: activeDropRequired,
          earnedMinutes: activeDropEarned,
          virtualEarned: activeDropVirtualEarned,
          remainingMinutes: activeDropRemainingMinutes,
          eta: activeDropEta,
          dropInstanceId: activeDrop.dropInstanceId,
          campaignId: activeDrop.campaignId,
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
  }, [
    allowWatching,
    inventoryFetchedAt,
    inventoryItems,
    nowTick,
    targetGame,
    watching,
    withCategories,
  ]);
}
