import { buildDemoPriorityPlan } from "../demoData";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { InventoryItem, InventoryState, PriorityPlan, WatchingState } from "../types";
import { isIpcAuthErrorResponse, isIpcErrorResponse, isPriorityPlan } from "../utils/ipc";

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

  const refreshDemoPriorityPlan = useCallback(async () => {
    setPriorityPlan(buildDemoPriorityPlan(inventoryItems, priorityGames));
  }, [inventoryItems, priorityGames]);

  const refreshLivePriorityPlan = useCallback(async () => {
    try {
      const res: unknown = await window.electronAPI.twitch.priorityPlan({ priorityGames });
      if (isIpcErrorResponse(res)) {
        if (isIpcAuthErrorResponse(res)) {
          forwardAuthError(res.message);
          return;
        }
        console.error("priority plan error", res);
        return;
      }
      if (!isPriorityPlan(res)) {
        console.error("priority plan invalid response", res);
        return;
      }
      setPriorityPlan(res);
    } catch (err) {
      console.error("priority plan failed", err);
    }
  }, [forwardAuthError, priorityGames]);

  const refreshPriorityPlan = demoMode ? refreshDemoPriorityPlan : refreshLivePriorityPlan;

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

  const fallbackOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const { item, category } of withCategories) {
      if (category !== "in-progress" && category !== "upcoming") continue;
      const game = item.game;
      if (!game || seen.has(game)) continue;
      seen.add(game);
      order.push(game);
    }
    return order;
  }, [withCategories]);

  const strictPriorityGames = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const game of priorityGames) {
      const normalized = game.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      order.push(normalized);
    }
    return order;
  }, [priorityGames]);

  const priorityOrder = useMemo(
    () => {
      if (obeyPriority) {
        // Strict mode: only games explicitly listed by the user are allowed.
        return strictPriorityGames;
      }
      return effectivePriorityPlan?.order?.length
        ? effectivePriorityPlan.order
        : priorityGames.length
          ? priorityGames
          : fallbackOrder;
    },
    [effectivePriorityPlan, priorityGames, fallbackOrder, obeyPriority, strictPriorityGames],
  );

  const bestActionableGame = useMemo(
    () => priorityOrder.find((game) => hasActionable(game)) ?? "",
    [priorityOrder, hasActionable],
  );

  useEffect(() => {
    if (inventoryStatus !== "idle") return;
    setPriorityPlan(null);
    setActiveTargetGame("");
  }, [inventoryStatus]);

  useEffect(() => {
    if (inventoryStatus !== "ready") return;
    void refreshPriorityPlan();
  }, [inventoryStatus, refreshPriorityPlan]);

  useEffect(() => {
    if (inventoryStatus !== "ready") return;
    if (bestActionableGame) return;
    if (watching) {
      stopWatching();
    }
  }, [inventoryStatus, bestActionableGame, stopWatching, watching]);

  useEffect(() => {
    if (inventoryStatus !== "ready") return;
    if (!bestActionableGame) return;

    const currentHasDrops = activeTargetGame ? hasActionable(activeTargetGame) : false;
    if (!activeTargetGame || !currentHasDrops) {
      setActiveTargetGame(bestActionableGame);
      return;
    }
    if (!obeyPriority) return;
    if (bestActionableGame !== activeTargetGame) {
      setActiveTargetGame(bestActionableGame);
    }
  }, [activeTargetGame, hasActionable, inventoryStatus, bestActionableGame, obeyPriority]);

  return {
    activeTargetGame,
    setActiveTargetGame,
    priorityPlan,
    effectivePriorityPlan,
    priorityOrder,
    refreshPriorityPlan,
  };
}
