import { describe, expect, it } from "vitest";
import type { InventoryItem, UserPubSubEvent } from "../types";
import { applyDropClaimToInventoryItems, applyDropProgressToInventoryItems } from "./useInventory";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop 1",
  requiredMinutes: 60,
  earnedMinutes: 10,
  status: "progress",
  ...overrides,
});

describe("applyDropProgressToInventoryItems", () => {
  it("updates earned minutes monotonically", () => {
    const items = [makeItem()];
    const payload: UserPubSubEvent = {
      kind: "drop-progress",
      at: Date.now(),
      topic: "user-drop-events.1",
      messageType: "drop-progress",
      dropId: "drop-1",
      currentProgressMin: 22,
      requiredProgressMin: 60,
    };
    const patched = applyDropProgressToInventoryItems(items, payload);
    expect(patched.changed).toBe(true);
    expect(patched.deltaMinutes).toBe(12);
    expect(patched.items[0].earnedMinutes).toBe(22);
    expect(patched.items[0].status).toBe("progress");
  });

  it("does not decrease progress on older values", () => {
    const items = [makeItem({ earnedMinutes: 34 })];
    const payload: UserPubSubEvent = {
      kind: "drop-progress",
      at: Date.now(),
      topic: "user-drop-events.1",
      messageType: "drop-progress",
      dropId: "drop-1",
      currentProgressMin: 20,
      requiredProgressMin: 60,
    };
    const patched = applyDropProgressToInventoryItems(items, payload);
    expect(patched.changed).toBe(false);
    expect(patched.items[0].earnedMinutes).toBe(34);
  });

  it("syncs in-progress drops within the same campaign", () => {
    const items = [
      makeItem({ id: "drop-1", earnedMinutes: 10, campaignId: "camp-1", status: "progress" }),
      makeItem({ id: "drop-2", earnedMinutes: 9, campaignId: "camp-1", status: "progress" }),
      makeItem({ id: "drop-3", earnedMinutes: 0, campaignId: "camp-1", status: "locked" }),
      makeItem({ id: "drop-4", earnedMinutes: 7, campaignId: "camp-2", status: "progress" }),
    ];
    const payload: UserPubSubEvent = {
      kind: "drop-progress",
      at: Date.now(),
      topic: "user-drop-events.1",
      messageType: "drop-progress",
      dropId: "drop-1",
      currentProgressMin: 12,
      requiredProgressMin: 60,
    };
    const patched = applyDropProgressToInventoryItems(items, payload);
    expect(patched.changed).toBe(true);
    expect(patched.deltaMinutes).toBe(5);
    expect(patched.items[0].earnedMinutes).toBe(12);
    expect(patched.items[1].earnedMinutes).toBe(12);
    expect(patched.items[2].earnedMinutes).toBe(0);
    expect(patched.items[3].earnedMinutes).toBe(7);
  });
});

describe("applyDropClaimToInventoryItems", () => {
  it("marks a drop as claimed and fills required minutes", () => {
    const items = [makeItem({ earnedMinutes: 55, status: "progress", dropInstanceId: "inst-1" })];
    const payload: UserPubSubEvent = {
      kind: "drop-claim",
      at: Date.now(),
      topic: "user-drop-events.1",
      messageType: "drop-claim",
      dropId: "drop-1",
      dropInstanceId: "inst-1",
    };
    const patched = applyDropClaimToInventoryItems(items, payload);
    expect(patched.changed).toBe(true);
    expect(patched.items[0].status).toBe("claimed");
    expect(patched.items[0].earnedMinutes).toBe(60);
    expect(patched.deltaMinutes).toBe(5);
  });
});
