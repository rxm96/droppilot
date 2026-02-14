import { buildDemoPriorityPlan } from "@renderer/shared/demoData";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  InventoryItem,
  InventoryState,
  PriorityPlan,
  WatchingState,
} from "@renderer/shared/types";
import {
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
  isPriorityPlan,
} from "@renderer/shared/utils/ipc";

export type WithCategory = { item: InventoryItem; category: string };

const ACTIONABLE_CATEGORIES = new Set(["in-progress", "upcoming"]);

const parseIsoMs = (value?: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

export const isGameActionable = (game: string, withCategories: WithCategory[]): boolean => {
  const now = Date.now();
  return withCategories.some(({ item, category }) => {
    if (item.game !== game) return false;
    if (category === "in-progress") return true;
    if (category !== "upcoming" || !ACTIONABLE_CATEGORIES.has(category)) return false;
    const startMs = parseIsoMs(item.startsAt);
    if (startMs === null) return true;
    return now >= startMs;
  });
};

export const computeFallbackOrder = (withCategories: WithCategory[]): string[] => {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const { item, category } of withCategories) {
    if (!ACTIONABLE_CATEGORIES.has(category)) continue;
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
): string => {
  const primary = priorityOrder.find((game) => isGameActionable(game, withCategories));
  if (primary) return primary;
  if (obeyPriority) return "";
  return fallbackOrder.find((game) => isGameActionable(game, withCategories)) ?? "";
};

export const computeNextActiveTargetGame = ({
  inventoryStatus,
  activeTargetGame,
  bestActionableGame,
  obeyPriority,
  withCategories,
}: {
  inventoryStatus: InventoryState["status"];
  activeTargetGame: string;
  bestActionableGame: string;
  obeyPriority: boolean;
  withCategories: WithCategory[];
}): string => {
  if (inventoryStatus !== "ready") return activeTargetGame;
  const currentHasDrops = activeTargetGame
    ? isGameActionable(activeTargetGame, withCategories)
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

  const effectivePriorityPlan = useMemo(() => {
    if (!demoMode) return priorityPlan;
    if (inventoryStatus !== "ready") return priorityPlan;
    return buildDemoPriorityPlan(inventoryItems, priorityGames);
  }, [demoMode, inventoryItems, inventoryStatus, priorityGames, priorityPlan]);

  const fallbackOrder = useMemo(() => {
    return computeFallbackOrder(withCategories);
  }, [withCategories]);

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
    () => computeBestActionableGame(priorityOrder, fallbackOrder, withCategories, obeyPriority),
    [priorityOrder, fallbackOrder, withCategories, obeyPriority],
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
    });
    if (nextTarget !== activeTargetGame) {
      setActiveTargetGame(nextTarget);
    }
  }, [activeTargetGame, bestActionableGame, inventoryStatus, obeyPriority, withCategories]);

  return {
    activeTargetGame,
    setActiveTargetGame,
    priorityPlan,
    effectivePriorityPlan,
    priorityOrder,
    refreshPriorityPlan,
  };
}
