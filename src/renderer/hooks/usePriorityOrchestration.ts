import { buildDemoPriorityPlan } from "../demoData";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { InventoryItem, InventoryState, PriorityPlan, WatchingState } from "../types";

type WithCategory = { item: InventoryItem; category: string };

type Params = {
  demoMode: boolean;
  inventoryStatus: InventoryState["status"];
  inventoryItems: InventoryItem[];
  withCategories: WithCategory[];
  priorityGames: string[];
  obeyPriority: boolean;
  watching: WatchingState;
  stopWatching: (opts?: { skipRefresh?: boolean }) => void;
  forwardAuthError: (message?: string) => void;
};

export function usePriorityOrchestration({
  demoMode,
  inventoryStatus,
  inventoryItems,
  withCategories,
  priorityGames,
  obeyPriority,
  watching,
  stopWatching,
  forwardAuthError,
}: Params) {
  const [priorityPlan, setPriorityPlan] = useState<PriorityPlan | null>(null);
  const [activeTargetGame, setActiveTargetGame] = useState<string>("");

  const refreshPriorityPlan = useCallback(async () => {
    try {
      if (demoMode) {
        setPriorityPlan(buildDemoPriorityPlan(inventoryItems, priorityGames));
        return;
      }
      const res = await window.electronAPI.twitch.priorityPlan({ priorityGames });
      if ((res as any)?.error) {
        if ((res as any).error === "auth") {
          forwardAuthError((res as any).message);
          return;
        }
        console.error("priority plan error", res);
        return;
      }
      setPriorityPlan(res as PriorityPlan);
    } catch (err) {
      console.error("priority plan failed", err);
    }
  }, [demoMode, forwardAuthError, inventoryItems, priorityGames]);

  const hasActionable = useCallback(
    (game: string) =>
      withCategories.some(
        ({ item, category }) =>
          item.game === game && (category === "in-progress" || category === "upcoming"),
      ),
    [withCategories],
  );

  const effectivePriorityPlan = useMemo(() => {
    if (!demoMode) return priorityPlan;
    if (inventoryStatus !== "ready") return priorityPlan;
    return buildDemoPriorityPlan(inventoryItems, priorityGames);
  }, [demoMode, inventoryItems, inventoryStatus, priorityGames, priorityPlan]);

  const priorityOrder = useMemo(
    () =>
      effectivePriorityPlan?.order?.length
        ? effectivePriorityPlan.order
        : priorityGames,
    [effectivePriorityPlan, priorityGames],
  );

  useEffect(() => {
    if (inventoryStatus !== "ready") return;
    const hasAnyActionable = priorityOrder.some((g) => hasActionable(g));
    if (hasAnyActionable) return;
    if (!watching) {
      setActiveTargetGame("");
      return;
    }
    setActiveTargetGame("");
    stopWatching();
  }, [inventoryStatus, priorityOrder, hasActionable, stopWatching, watching]);

  useEffect(() => {
    if (activeTargetGame) return;
    if (inventoryStatus !== "ready") return;
    if (!priorityOrder.length) return;
    const firstActionable = priorityOrder.find((g) => hasActionable(g));
    if (!firstActionable) return;
    setActiveTargetGame(firstActionable);
  }, [activeTargetGame, hasActionable, inventoryStatus, priorityOrder]);

  useEffect(() => {
    if (!obeyPriority) return;
    if (inventoryStatus !== "ready") return;
    if (!priorityOrder.length) return;

    const best = priorityOrder.find((g) => hasActionable(g));
    if (!best) return;

    const currentHasDrops = activeTargetGame ? hasActionable(activeTargetGame) : false;
    if (!activeTargetGame || !currentHasDrops || best !== activeTargetGame) {
      setActiveTargetGame(best);
    }
  }, [priorityOrder, hasActionable, obeyPriority, activeTargetGame, inventoryStatus]);

  return {
    activeTargetGame,
    setActiveTargetGame,
    priorityPlan,
    effectivePriorityPlan,
    priorityOrder,
    refreshPriorityPlan,
  };
}
