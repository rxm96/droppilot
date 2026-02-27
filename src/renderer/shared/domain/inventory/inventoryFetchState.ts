import type { InventoryItem } from "@renderer/shared/types";
import { getTotalEarnedMinutes } from "./inventoryPatch";

export type InventoryChangeSet = {
  added: Set<string>;
  updated: Set<string>;
};

const itemKey = (item: InventoryItem): string => {
  const campaignId = typeof item.campaignId === "string" ? item.campaignId.trim() : "";
  const id = typeof item.id === "string" ? item.id.trim() : "";
  return campaignId ? `${campaignId}::${id}` : id;
};

const statusRank = (status: InventoryItem["status"]): number => {
  switch (status) {
    case "claimed":
      return 2;
    case "progress":
      return 1;
    default:
      return 0;
  }
};

const maxStatus = (
  left: InventoryItem["status"],
  right: InventoryItem["status"],
): InventoryItem["status"] => (statusRank(left) >= statusRank(right) ? left : right);

export const reconcileFetchedInventoryItems = (
  previousItems: InventoryItem[],
  nextItems: InventoryItem[],
): InventoryItem[] => {
  if (nextItems.length === 0) return nextItems;
  const previousByComposite = new Map<string, InventoryItem>();
  const previousById = new Map<string, InventoryItem>();
  for (const item of previousItems) {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) continue;
    previousByComposite.set(itemKey(item), item);
    if (!previousById.has(id)) previousById.set(id, item);
  }
  return nextItems.map((nextItem) => {
    const id = typeof nextItem.id === "string" ? nextItem.id.trim() : "";
    if (!id) return nextItem;
    const previous = previousByComposite.get(itemKey(nextItem)) ?? previousById.get(id) ?? null;
    const fetchedRequired = Math.max(0, Number(nextItem.requiredMinutes) || 0);
    const previousRequired = previous ? Math.max(0, Number(previous.requiredMinutes) || 0) : 0;
    const required = Math.max(fetchedRequired, previousRequired);
    const previousEarned = previous ? Math.max(0, Number(previous.earnedMinutes) || 0) : 0;
    const fetchedEarned = Math.max(0, Number(nextItem.earnedMinutes) || 0);
    const mergedEarnedRaw = Math.max(previousEarned, fetchedEarned);
    const mergedEarned = required > 0 ? Math.min(required, mergedEarnedRaw) : mergedEarnedRaw;
    const mergedStatus = previous ? maxStatus(previous.status, nextItem.status) : nextItem.status;
    const enforcedEarned =
      mergedStatus === "claimed" && required > 0 ? Math.max(mergedEarned, required) : mergedEarned;

    if (
      required === fetchedRequired &&
      enforcedEarned === fetchedEarned &&
      mergedStatus === nextItem.status
    ) {
      return nextItem;
    }
    return {
      ...nextItem,
      requiredMinutes: required,
      earnedMinutes: enforcedEarned,
      status: mergedStatus,
    };
  });
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
