import { describe, expect, it } from "vitest";
import type { InventoryItem, InventoryState, UserPubSubEvent } from "@renderer/shared/types";
import {
  applyPubSubEventToInventoryState,
  getPatchedAnchorIds,
  markUpdatedInventoryChange,
  mergeProgressAnchors,
  resolvePubSubEventAt,
} from "./inventoryPubSubPatch";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop 1",
  requiredMinutes: 60,
  earnedMinutes: 10,
  status: "progress",
  ...overrides,
});

describe("applyPubSubEventToInventoryState", () => {
  it("patches progress events for ready inventory", () => {
    const inventory: InventoryState = {
      status: "ready",
      items: [makeItem({ earnedMinutes: 10 })],
    };
    const event: UserPubSubEvent = {
      kind: "drop-progress",
      at: Date.now(),
      topic: "user-drop-events.1",
      messageType: "drop-progress",
      dropId: "drop-1",
      currentProgressMin: 25,
      requiredProgressMin: 60,
    };

    const patched = applyPubSubEventToInventoryState(inventory, event);
    expect(patched.patched).toBe(true);
    expect(patched.deltaMinutes).toBe(15);
    expect(patched.updatedId).toBe("drop-1");
    expect(patched.nextTotalMinutes).toBe(25);
    expect(patched.nextInventory.status).toBe("ready");
    if (patched.nextInventory.status !== "ready") throw new Error("expected ready inventory");
    expect(patched.nextInventory.items[0].earnedMinutes).toBe(25);
  });

  it("detects unclaimed drops remaining in campaign after claim patch", () => {
    const inventory: InventoryState = {
      status: "error",
      message: "stale",
      code: "x",
      items: [
        makeItem({
          id: "drop-1",
          campaignId: "camp-1",
          dropInstanceId: "inst-1",
          earnedMinutes: 55,
          status: "progress",
        }),
        makeItem({
          id: "drop-2",
          campaignId: "camp-1",
          dropInstanceId: "inst-2",
          status: "locked",
          earnedMinutes: 0,
        }),
      ],
    };
    const event: UserPubSubEvent = {
      kind: "drop-claim",
      at: Date.now(),
      topic: "user-drop-events.1",
      messageType: "drop-claim",
      dropId: "drop-1",
      dropInstanceId: "inst-1",
    };

    const patched = applyPubSubEventToInventoryState(inventory, event);
    expect(patched.patched).toBe(true);
    expect(patched.hasUnclaimedInCampaign).toBe(true);
    expect(patched.claimedItem?.id).toBe("drop-1");
    expect(patched.nextInventory.status).toBe("error");
    if (patched.nextInventory.status !== "error") throw new Error("expected error inventory");
    expect(patched.nextInventory.items?.[0].status).toBe("claimed");
  });

  it("returns unchanged for non-patchable events", () => {
    const inventory: InventoryState = { status: "idle" };
    const event: UserPubSubEvent = {
      kind: "notification",
      at: Date.now(),
      topic: "user-drop-events.1",
      messageType: "notification",
      notificationType: "test",
    };

    const patched = applyPubSubEventToInventoryState(inventory, event);
    expect(patched.patched).toBe(false);
    expect(patched.nextInventory).toBe(inventory);
    expect(patched.deltaMinutes).toBe(0);
  });
});

describe("progress anchors and change highlights", () => {
  it("merges anchors only when event timestamp is newer", () => {
    const previous = { "drop-1": 100 };
    const next = mergeProgressAnchors(previous, ["drop-1", " drop-2 ", ""], 90);
    expect(next).not.toBe(previous);
    expect(next).toEqual({ "drop-1": 100, "drop-2": 90 });

    const unchanged = mergeProgressAnchors(next, ["drop-1"], 80);
    expect(unchanged).toBe(next);
  });

  it("marks updated drop ids and preserves added set reference", () => {
    const previous = { added: new Set(["a"]), updated: new Set(["x"]) };
    const next = markUpdatedInventoryChange(previous, " y ");
    expect(next).not.toBe(previous);
    expect(next.added).toBe(previous.added);
    expect(Array.from(next.updated)).toEqual(["x", "y"]);

    const unchanged = markUpdatedInventoryChange(next, "   ");
    expect(unchanged).toBe(next);
  });

  it("derives anchor ids and event timestamp from patch metadata", () => {
    expect(getPatchedAnchorIds({ updatedIds: ["a", "b"], updatedId: "z" })).toEqual(["a", "b"]);
    expect(getPatchedAnchorIds({ updatedId: "z" })).toEqual(["z"]);
    expect(getPatchedAnchorIds({})).toEqual([]);
    expect(
      resolvePubSubEventAt(
        {
          kind: "notification",
          at: 123,
          topic: "x",
          messageType: "notification",
        },
        999,
      ),
    ).toBe(123);
  });
});
