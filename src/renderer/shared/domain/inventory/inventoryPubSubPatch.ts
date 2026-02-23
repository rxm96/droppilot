import type { InventoryItem, InventoryState, UserPubSubEvent } from "@renderer/shared/types";
import {
  applyDropClaimToInventoryItems,
  applyDropProgressToInventoryItems,
} from "./inventoryPatch";

export type InventoryPatchHighlightState = {
  added: Set<string>;
  updated: Set<string>;
};

export type InventoryPubSubPatchResult = {
  patched: boolean;
  nextInventory: InventoryState;
  updatedId?: string;
  updatedIds: string[];
  deltaMinutes: number;
  nextTotalMinutes?: number;
  claimedItem?: InventoryItem;
  hasUnclaimedInCampaign?: boolean;
};

export const applyPubSubEventToInventoryState = (
  inventory: InventoryState,
  event: UserPubSubEvent,
): InventoryPubSubPatchResult => {
  const items =
    inventory.status === "ready"
      ? inventory.items
      : inventory.status === "error" && inventory.items
        ? inventory.items
        : null;
  if (!items?.length) {
    return {
      patched: false,
      nextInventory: inventory,
      updatedIds: [],
      deltaMinutes: 0,
    };
  }

  const patch =
    event.kind === "drop-progress"
      ? applyDropProgressToInventoryItems(items, event)
      : event.kind === "drop-claim"
        ? applyDropClaimToInventoryItems(items, event)
        : null;
  if (!patch || !patch.changed) {
    return {
      patched: false,
      nextInventory: inventory,
      updatedIds: [],
      deltaMinutes: 0,
    };
  }

  let hasUnclaimedInCampaign: boolean | undefined;
  if (event.kind === "drop-claim" && patch.updatedId) {
    const updated = patch.items.find((item) => item.id === patch.updatedId);
    const campaignId = updated?.campaignId?.trim();
    if (campaignId) {
      hasUnclaimedInCampaign = patch.items.some(
        (item) => item.campaignId?.trim() === campaignId && item.status !== "claimed",
      );
    }
  }

  const nextInventory: InventoryState =
    inventory.status === "ready"
      ? { status: "ready", items: patch.items }
      : { ...inventory, items: patch.items };

  return {
    patched: true,
    nextInventory,
    updatedId: patch.updatedId,
    updatedIds: patch.updatedIds ?? [],
    deltaMinutes: patch.deltaMinutes,
    nextTotalMinutes: patch.totalMinutes,
    claimedItem: patch.claimedItem,
    hasUnclaimedInCampaign,
  };
};

export const resolvePubSubEventAt = (event: UserPubSubEvent, fallbackNow = Date.now()): number =>
  typeof event.at === "number" && Number.isFinite(event.at) ? event.at : fallbackNow;

export const getPatchedAnchorIds = ({
  updatedId,
  updatedIds,
}: {
  updatedId?: string;
  updatedIds?: string[];
}): string[] => (updatedIds && updatedIds.length > 0 ? updatedIds : updatedId ? [updatedId] : []);

export const mergeProgressAnchors = (
  previousAnchors: Record<string, number>,
  updatedIds: string[],
  eventAt: number,
): Record<string, number> => {
  if (updatedIds.length === 0) return previousAnchors;
  let changed = false;
  const next = { ...previousAnchors };
  for (const rawId of updatedIds) {
    const id = rawId.trim();
    if (!id) continue;
    const prevAt = next[id] ?? 0;
    if (eventAt > prevAt) {
      next[id] = eventAt;
      changed = true;
    }
  }
  return changed ? next : previousAnchors;
};

export const markUpdatedInventoryChange = (
  previous: InventoryPatchHighlightState,
  updatedId: string,
): InventoryPatchHighlightState => {
  const id = updatedId.trim();
  if (!id) return previous;
  const updated = new Set(previous.updated);
  updated.add(id);
  return { added: previous.added, updated };
};
