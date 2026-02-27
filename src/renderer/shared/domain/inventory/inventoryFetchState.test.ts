import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@renderer/shared/types";
import {
  advanceDemoInventoryItems,
  deriveInventoryChanges,
  deriveMinutesUpdate,
  deriveNewlyClaimedItems,
  getElapsedWholeMinutes,
  reconcileFetchedInventoryItems,
} from "./inventoryFetchState";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop 1",
  requiredMinutes: 60,
  earnedMinutes: 10,
  status: "progress",
  ...overrides,
});

describe("getElapsedWholeMinutes", () => {
  it("floors minute deltas and never returns negative values", () => {
    expect(getElapsedWholeMinutes(0, 59_999)).toBe(0);
    expect(getElapsedWholeMinutes(0, 60_001)).toBe(1);
    expect(getElapsedWholeMinutes(120_000, 60_000)).toBe(0);
  });
});

describe("deriveMinutesUpdate", () => {
  it("calculates totals and delta from previous total", () => {
    const items = [makeItem({ earnedMinutes: 15 }), makeItem({ id: "drop-2", earnedMinutes: 20 })];
    const fromNull = deriveMinutesUpdate(null, items);
    expect(fromNull.nextTotalMinutes).toBe(35);
    expect(fromNull.deltaMinutes).toBe(0);

    const fromPrevious = deriveMinutesUpdate(30, items);
    expect(fromPrevious.nextTotalMinutes).toBe(35);
    expect(fromPrevious.deltaMinutes).toBe(5);
  });
});

describe("deriveInventoryChanges", () => {
  it("detects added and changed items", () => {
    const previous = [makeItem({ id: "a", earnedMinutes: 10, status: "progress" })];
    const next = [
      makeItem({ id: "a", earnedMinutes: 12, status: "progress" }),
      makeItem({ id: "b", earnedMinutes: 0, status: "locked" }),
    ];
    const changes = deriveInventoryChanges(previous, next);
    expect(Array.from(changes.added)).toEqual(["b"]);
    expect(Array.from(changes.updated)).toEqual(["a"]);
  });
});

describe("deriveNewlyClaimedItems", () => {
  it("returns only drops that became claimed in the next snapshot", () => {
    const previous = [
      makeItem({ id: "a", status: "progress" }),
      makeItem({ id: "b", status: "claimed" }),
    ];
    const next = [
      makeItem({ id: "a", status: "claimed" }),
      makeItem({ id: "b", status: "claimed" }),
    ];
    const claimed = deriveNewlyClaimedItems(previous, next);
    expect(claimed.map((item) => item.id)).toEqual(["a"]);
  });
});

describe("advanceDemoInventoryItems", () => {
  it("advances progress items, caps to required minutes, and auto-claims when enabled", () => {
    const items = [
      makeItem({ id: "a", earnedMinutes: 58, requiredMinutes: 60, status: "progress" }),
      makeItem({ id: "b", earnedMinutes: 5, requiredMinutes: 20, status: "progress" }),
      makeItem({ id: "c", earnedMinutes: 0, status: "locked" }),
    ];
    const next = advanceDemoInventoryItems({ items, elapsedMinutes: 5, autoClaimEnabled: true });
    expect(next[0].earnedMinutes).toBe(60);
    expect(next[0].status).toBe("claimed");
    expect(next[1].earnedMinutes).toBe(10);
    expect(next[1].status).toBe("progress");
    expect(next[2]).toBe(items[2]);
  });
});

describe("reconcileFetchedInventoryItems", () => {
  it("normalizes claimed drops on first fetched snapshot", () => {
    const merged = reconcileFetchedInventoryItems(
      [],
      [makeItem({ id: "drop-1", status: "claimed", earnedMinutes: 0, requiredMinutes: 240 })],
    );
    expect(merged[0].status).toBe("claimed");
    expect(merged[0].requiredMinutes).toBe(240);
    expect(merged[0].earnedMinutes).toBe(240);
  });

  it("keeps claimed drops from regressing to older fetched progress snapshots", () => {
    const previous = [
      makeItem({
        id: "drop-1",
        campaignId: "camp-1",
        status: "claimed",
        earnedMinutes: 240,
        requiredMinutes: 240,
      }),
    ];
    const fetched = [
      makeItem({
        id: "drop-1",
        campaignId: "camp-1",
        status: "progress",
        earnedMinutes: 0,
        requiredMinutes: 240,
      }),
    ];
    const merged = reconcileFetchedInventoryItems(previous, fetched);
    expect(merged[0].status).toBe("claimed");
    expect(merged[0].earnedMinutes).toBe(240);
  });

  it("keeps required minutes when fetched snapshot regresses to zero", () => {
    const previous = [
      makeItem({
        id: "drop-1",
        campaignId: "camp-1",
        status: "progress",
        earnedMinutes: 120,
        requiredMinutes: 240,
      }),
    ];
    const fetched = [
      makeItem({
        id: "drop-1",
        campaignId: "camp-1",
        status: "progress",
        earnedMinutes: 120,
        requiredMinutes: 0,
      }),
    ];
    const merged = reconcileFetchedInventoryItems(previous, fetched);
    expect(merged[0].requiredMinutes).toBe(240);
    expect(merged[0].earnedMinutes).toBe(120);
  });

  it("keeps higher earned minutes when fetched snapshot is stale", () => {
    const previous = [
      makeItem({
        id: "drop-1",
        campaignId: "camp-1",
        status: "progress",
        earnedMinutes: 88,
        requiredMinutes: 120,
      }),
    ];
    const fetched = [
      makeItem({
        id: "drop-1",
        campaignId: "camp-1",
        status: "progress",
        earnedMinutes: 12,
        requiredMinutes: 120,
      }),
    ];
    const merged = reconcileFetchedInventoryItems(previous, fetched);
    expect(merged[0].status).toBe("progress");
    expect(merged[0].earnedMinutes).toBe(88);
  });
});
