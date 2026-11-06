import type { InventoryItem, InventoryState, UserPubSubEvent } from "@renderer/shared/types";
import {
  applyDropClaimableToInventoryItems,
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
  claimableItem?: InventoryItem;
};

const getPatchableItems = (inventory: InventoryState): InventoryItem[] | null =>
  inventory.status === "ready"
    ? inventory.items
    : inventory.status === "error" && inventory.items
      ? inventory.items
      : null;

// `items` came from a "ready" or "error" inventory (idle/loading have none), so
// rebuild per-status to keep a valid InventoryState — a spread of idle/loading +
// items is not.
const withItems = (inventory: InventoryState, items: InventoryItem[]): InventoryState =>
  inventory.status === "error" ? { ...inventory, items } : { status: "ready", items };

/**
 * Flips one drop to "claimed" in local state after a successful claim call, so
 * the UI updates without waiting for the next inventory fetch. Returns the same
 * state object when nothing changed.
 */
export const markDropClaimedInInventoryState = (
  inventory: InventoryState,
  drop: InventoryItem,
): InventoryState => {
  const items = getPatchableItems(inventory);
  if (!items?.length) return inventory;
  const patch = applyDropClaimToInventoryItems(items, {
    kind: "drop-claim",
    at: Date.now(),
    topic: "claim-local",
    messageType: "drop-claim",
    dropId: drop.id,
    dropInstanceId: drop.dropInstanceId,
  });
  return patch.changed ? withItems(inventory, patch.items) : inventory;
};

export const applyPubSubEventToInventoryState = (
  inventory: InventoryState,
  event: UserPubSubEvent,
): InventoryPubSubPatchResult => {
  const items = getPatchableItems(inventory);
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
        ? applyDropClaimableToInventoryItems(items, event)
        : null;
  if (!patch || !patch.changed) {
    return {
      patched: false,
      nextInventory: inventory,
      updatedIds: [],
      deltaMinutes: 0,
    };
  }

  return {
    patched: true,
    nextInventory: withItems(inventory, patch.items),
    updatedId: patch.updatedId,
    updatedIds: patch.updatedIds ?? [],
    deltaMinutes: patch.deltaMinutes,
    nextTotalMinutes: patch.totalMinutes,
    claimableItem: patch.claimableItem,
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
