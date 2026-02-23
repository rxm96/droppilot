import type { InventoryItem, UserPubSubEvent } from "@renderer/shared/types";

export type InventoryPatchResult = {
  changed: boolean;
  items: InventoryItem[];
  updatedId?: string;
  updatedIds?: string[];
  deltaMinutes: number;
  totalMinutes: number;
  claimedItem?: InventoryItem;
};

export const getTotalEarnedMinutes = (items: InventoryItem[]): number =>
  items.reduce((acc, item) => acc + Math.max(0, Number(item.earnedMinutes) || 0), 0);

export const applyDropProgressToInventoryItems = (
  items: InventoryItem[],
  payload: UserPubSubEvent,
): InventoryPatchResult => {
  if (payload.kind !== "drop-progress") {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }
  const dropId = payload.dropId?.trim();
  const currentProgressMin =
    typeof payload.currentProgressMin === "number" && Number.isFinite(payload.currentProgressMin)
      ? Math.max(0, payload.currentProgressMin)
      : null;
  if (!dropId || currentProgressMin === null) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }
  const index = items.findIndex((item) => item.id === dropId);
  if (index < 0) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }

  const target = items[index];
  const targetCampaignId = target.campaignId?.trim();
  const candidateIndexes =
    targetCampaignId && targetCampaignId.length > 0
      ? items
          .map((item, idx) => ({ item, idx }))
          .filter(
            ({ item }) =>
              item.campaignId?.trim() === targetCampaignId &&
              (item.id === target.id || item.status === "progress"),
          )
          .map(({ idx }) => idx)
      : [index];

  let changed = false;
  let deltaMinutes = 0;
  const nextItems = [...items];
  let updatedId: string | undefined;
  const updatedIds = new Set<string>();

  for (const idx of candidateIndexes) {
    const current = nextItems[idx];
    const required = Math.max(0, Number(current.requiredMinutes) || 0);
    const prevEarned = Math.max(0, Number(current.earnedMinutes) || 0);
    const nextEarnedRaw = Math.max(prevEarned, currentProgressMin);
    const nextEarned = required > 0 ? Math.min(required, nextEarnedRaw) : nextEarnedRaw;
    let nextStatus = current.status;
    if (nextStatus !== "claimed") {
      if (required > 0 && nextEarned >= required) {
        nextStatus = "progress";
      } else if (nextEarned > 0 && nextStatus === "locked") {
        nextStatus = "progress";
      }
    }
    if (nextEarned === prevEarned && nextStatus === current.status) {
      continue;
    }
    changed = true;
    deltaMinutes += Math.max(0, nextEarned - prevEarned);
    updatedIds.add(current.id);
    if (!updatedId || current.id === target.id) {
      updatedId = current.id;
    }
    nextItems[idx] = {
      ...current,
      earnedMinutes: nextEarned,
      status: nextStatus,
    };
  }

  if (!changed) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }

  return {
    changed: true,
    items: nextItems,
    updatedId,
    updatedIds: Array.from(updatedIds),
    deltaMinutes,
    totalMinutes: getTotalEarnedMinutes(nextItems),
  };
};

export const applyDropClaimToInventoryItems = (
  items: InventoryItem[],
  payload: UserPubSubEvent,
): InventoryPatchResult => {
  if (payload.kind !== "drop-claim") {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }
  const dropId = payload.dropId?.trim();
  const dropInstanceId = payload.dropInstanceId?.trim();
  if (!dropId && !dropInstanceId) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }
  const index = items.findIndex((item) => {
    if (dropId && item.id === dropId) return true;
    if (dropInstanceId && item.dropInstanceId && item.dropInstanceId === dropInstanceId)
      return true;
    return false;
  });
  if (index < 0) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }

  const target = items[index];
  const required = Math.max(0, Number(target.requiredMinutes) || 0);
  const prevEarned = Math.max(0, Number(target.earnedMinutes) || 0);
  const nextEarned = required > 0 ? Math.max(required, prevEarned) : prevEarned;
  const nextItem: InventoryItem = {
    ...target,
    earnedMinutes: nextEarned,
    status: "claimed",
  };
  if (target.status === "claimed" && nextEarned === prevEarned) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }

  const nextItems = [...items];
  nextItems[index] = nextItem;
  return {
    changed: true,
    items: nextItems,
    updatedId: nextItem.id,
    updatedIds: [nextItem.id],
    deltaMinutes: Math.max(0, nextEarned - prevEarned),
    totalMinutes: getTotalEarnedMinutes(nextItems),
    claimedItem: nextItem,
  };
};
