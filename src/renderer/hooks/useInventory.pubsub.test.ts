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
