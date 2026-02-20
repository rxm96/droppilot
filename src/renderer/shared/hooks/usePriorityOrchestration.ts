import { buildDemoPriorityPlan } from "@renderer/shared/demoData";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  InventoryItem,
  InventoryState,
  PriorityPlan,
  WatchingState,
} from "@renderer/shared/types";

export type WithCategory = { item: InventoryItem; category: string };

const isActionableCategory = (category: string, allowUpcoming = false): boolean =>
  category === "in-progress" || (allowUpcoming && category === "upcoming");

export const isGameActionable = (
  game: string,
  withCategories: WithCategory[],
  opts?: { allowUpcoming?: boolean },
): boolean => {
  const allowUpcoming = opts?.allowUpcoming === true;
  return withCategories.some(({ item, category }) => {
    if (item.game !== game) return false;
    return isActionableCategory(category, allowUpcoming);
  });
};

export const computeFallbackOrder = (
  withCategories: WithCategory[],
  opts?: { allowUpcoming?: boolean },
): string[] => {
  const allowUpcoming = opts?.allowUpcoming === true;
  const seen = new Set<string>();
  const order: string[] = [];
  for (const { item, category } of withCategories) {
    if (!isActionableCategory(category, allowUpcoming)) continue;
    const game = item.game;
    if (!game || seen.has(game)) continue;
    seen.add(game);
    order.push(game);
  }
  return order;
};

export const normalizePriorityGames = (priorityGames: string[]): string[] => {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const game of priorityGames) {
    const normalized = game.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    order.push(normalized);
  }
  return order;
};

const buildLivePriorityPlan = (
  items: InventoryItem[],
  priorityGames: string[],
): PriorityPlan => {
  const activeItems = items.filter((i) => i.status !== "claimed");
  const availableGames = Array.from(new Set(activeItems.map((i) => i.game)));
  const order: string[] = [];

  for (const g of priorityGames) {
    if (availableGames.includes(g) && !order.includes(g)) {
      order.push(g);
    }
  }
  for (const g of availableGames) {
    if (!order.includes(g)) {
      order.push(g);
    }
  }

  const missingPriority = priorityGames.filter((g) => !availableGames.includes(g));

  return {
    order,
    availableGames,
    missingPriority,
    totalActiveDrops: activeItems.length,
  };
};

export const computePriorityOrder = ({
  obeyPriority,
  effectivePriorityPlan,
  priorityGames,
  fallbackOrder,
  strictPriorityGames,
}: {
  obeyPriority: boolean;
  effectivePriorityPlan: PriorityPlan | null;
  priorityGames: string[];
  fallbackOrder: string[];
  strictPriorityGames: string[];
}): string[] => {
  if (obeyPriority) {
    // Strict mode: only games explicitly listed by the user are allowed.
    return strictPriorityGames;
  }
  return effectivePriorityPlan?.order?.length
    ? effectivePriorityPlan.order
    : priorityGames.length
      ? priorityGames
      : fallbackOrder;
};

export const computeBestActionableGame = (
  priorityOrder: string[],
  fallbackOrder: string[],
  withCategories: WithCategory[],
  obeyPriority: boolean,
  allowUpcomingActionable = false,
): string => {
  const primary = priorityOrder.find((game) =>
    isGameActionable(game, withCategories, { allowUpcoming: allowUpcomingActionable }),
  );
  if (primary) return primary;
  if (obeyPriority) return "";
  return (
    fallbackOrder.find((game) =>
      isGameActionable(game, withCategories, { allowUpcoming: allowUpcomingActionable }),
    ) ?? ""
  );
};

export const computeNextActiveTargetGame = ({
  inventoryStatus,
  activeTargetGame,
  bestActionableGame,
  obeyPriority,
  withCategories,
  allowUpcomingActionable = false,
}: {
  inventoryStatus: InventoryState["status"];
  activeTargetGame: string;
  bestActionableGame: string;
  obeyPriority: boolean;
  withCategories: WithCategory[];
  allowUpcomingActionable?: boolean;
}): string => {
  if (inventoryStatus !== "ready") return activeTargetGame;
  const currentHasDrops = activeTargetGame
    ? isGameActionable(activeTargetGame, withCategories, {
        allowUpcoming: allowUpcomingActionable,
      })
    : false;
  if (!bestActionableGame) {
    return currentHasDrops ? activeTargetGame : "";
  }
  if (!activeTargetGame || !currentHasDrops) return bestActionableGame;
  if (!obeyPriority) return activeTargetGame;
  return bestActionableGame !== activeTargetGame ? bestActionableGame : activeTargetGame;
};

type Params = {
  demoMode: boolean;
  inventoryStatus: InventoryState["status"];
  inventoryItems: InventoryItem[];
  withCategories: WithCategory[];
  priorityGames: string[];
  obeyPriority: boolean;
  allowUnlinkedGames: boolean;
  watching: WatchingState;
  stopWatching: (opts?: { skipRefresh?: boolean }) => void;
};

export function usePriorityOrchestration({
  demoMode,
  inventoryStatus,
  inventoryItems,
  withCategories,
  priorityGames,
  obeyPriority,
  allowUnlinkedGames,
  watching,
  stopWatching,
}: Params) {
  const [priorityPlan, setPriorityPlan] = useState<PriorityPlan | null>(null);
  const [activeTargetGame, setActiveTargetGame] = useState<string>("");

  const refreshDemoPriorityPlan = useCallback(async () => {
    setPriorityPlan(buildDemoPriorityPlan(inventoryItems, priorityGames));
  }, [inventoryItems, priorityGames]);

  const refreshLivePriorityPlan = useCallback(() => {
    setPriorityPlan(buildLivePriorityPlan(inventoryItems, priorityGames));
  }, [inventoryItems, priorityGames]);

  const refreshPriorityPlan = demoMode ? refreshDemoPriorityPlan : refreshLivePriorityPlan;

  const effectivePriorityPlan = useMemo(() => {
    if (!demoMode) return priorityPlan;
    if (inventoryStatus !== "ready") return priorityPlan;
    return buildDemoPriorityPlan(inventoryItems, priorityGames);
  }, [demoMode, inventoryItems, inventoryStatus, priorityGames, priorityPlan]);

  const fallbackOrder = useMemo(() => {
    return computeFallbackOrder(withCategories, { allowUpcoming: allowUnlinkedGames });
  }, [allowUnlinkedGames, withCategories]);

  const strictPriorityGames = useMemo(() => {
    return normalizePriorityGames(priorityGames);
  }, [priorityGames]);

  const priorityOrder = useMemo(() => {
    return computePriorityOrder({
      obeyPriority,
      effectivePriorityPlan,
      priorityGames,
      fallbackOrder,
      strictPriorityGames,
    });
  }, [effectivePriorityPlan, priorityGames, fallbackOrder, obeyPriority, strictPriorityGames]);

  const bestActionableGame = useMemo(
    () =>
      computeBestActionableGame(
        priorityOrder,
        fallbackOrder,
        withCategories,
        obeyPriority,
        allowUnlinkedGames,
      ),
    [priorityOrder, fallbackOrder, withCategories, obeyPriority, allowUnlinkedGames],
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
    const nextTarget = computeNextActiveTargetGame({
      inventoryStatus,
      activeTargetGame,
      bestActionableGame,
      obeyPriority,
      withCategories,
      allowUpcomingActionable: allowUnlinkedGames,
    });
    if (nextTarget !== activeTargetGame) {
      setActiveTargetGame(nextTarget);
    }
  }, [
    activeTargetGame,
    bestActionableGame,
    inventoryStatus,
    obeyPriority,
    withCategories,
    allowUnlinkedGames,
  ]);

  return {
    activeTargetGame,
    setActiveTargetGame,
    priorityPlan,
    effectivePriorityPlan,
    priorityOrder,
    refreshPriorityPlan,
  };
}
