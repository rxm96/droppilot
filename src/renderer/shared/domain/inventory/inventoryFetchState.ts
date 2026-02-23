import type { InventoryItem } from "@renderer/shared/types";
import { getTotalEarnedMinutes } from "./inventoryPatch";

export type InventoryChangeSet = {
  added: Set<string>;
  updated: Set<string>;
};

export const getElapsedWholeMinutes = (fromMs: number, toMs: number): number =>
  Math.max(0, Math.floor((toMs - fromMs) / 60_000));

export const deriveMinutesUpdate = (
  previousTotalMinutes: number | null,
  nextItems: InventoryItem[],
): { nextTotalMinutes: number; deltaMinutes: number } => {
  const nextTotalMinutes = getTotalEarnedMinutes(nextItems);
  if (previousTotalMinutes === null) {
    return { nextTotalMinutes, deltaMinutes: 0 };
  }
  return {
    nextTotalMinutes,
    deltaMinutes: Math.max(0, nextTotalMinutes - previousTotalMinutes),
  };
};

export const deriveInventoryChanges = (
  previousItems: InventoryItem[],
  nextItems: InventoryItem[],
): InventoryChangeSet => {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const added = new Set<string>();
  const updated = new Set<string>();
  for (const item of nextItems) {
    const prev = previousById.get(item.id);
    if (!prev) {
      added.add(item.id);
      continue;
    }
    if (prev.earnedMinutes !== item.earnedMinutes || prev.status !== item.status) {
      updated.add(item.id);
    }
  }
  return { added, updated };
};

export const deriveNewlyClaimedItems = (
  previousItems: InventoryItem[],
  nextItems: InventoryItem[],
): InventoryItem[] => {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  return nextItems.filter(
    (item) => item.status === "claimed" && previousById.get(item.id)?.status !== "claimed",
  );
};

export const advanceDemoInventoryItems = ({
  items,
  elapsedMinutes,
  autoClaimEnabled,
}: {
  items: InventoryItem[];
  elapsedMinutes: number;
  autoClaimEnabled: boolean;
}): InventoryItem[] => {
  if (elapsedMinutes <= 0) return items;
  return items.map((item) => {
    if (item.status !== "progress") return item;
    const requiredMinutes = Math.max(0, Number(item.requiredMinutes) || 0);
    const nextEarned = Math.min(
      requiredMinutes,
      Math.max(0, Number(item.earnedMinutes) || 0) + elapsedMinutes,
    );
    const progressDone = requiredMinutes === 0 || nextEarned >= requiredMinutes;
    const nextStatus = progressDone && autoClaimEnabled ? "claimed" : item.status;
    if (nextEarned === item.earnedMinutes && nextStatus === item.status) return item;
    return { ...item, earnedMinutes: nextEarned, status: nextStatus };
  });
};
