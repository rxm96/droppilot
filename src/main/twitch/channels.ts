import type { InventoryItem } from "./service";

export type PriorityPlan = {
  order: string[];
  availableGames: string[];
  missingPriority: string[];
  totalActiveDrops: number;
};

export function buildPriorityPlan(
  inventory: InventoryItem[],
  priorityGames: string[],
): PriorityPlan {
  // Consider only non-claimed drops
  const activeItems = inventory.filter((i) => i.status !== "claimed");
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
}
