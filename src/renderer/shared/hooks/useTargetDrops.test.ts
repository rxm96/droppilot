import { describe, expect, it } from "vitest";
import type { InventoryItem, WatchingState } from "@renderer/shared/types";
import { computeTargetDrops } from "@renderer/shared/hooks/useTargetDrops";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop 1",
  requiredMinutes: 60,
  earnedMinutes: 0,
  status: "locked",
  ...overrides,
});

describe("computeTargetDrops", () => {
  it("returns empty results when no target game is set", () => {
    const result = computeTargetDrops({
      targetGame: "",
      inventoryItems: [makeItem()],
      withCategories: [],
      allowWatching: true,
      watching: null,
      inventoryFetchedAt: null,
      now: 1_000_000,
    });
    expect(result.totalDrops).toBe(0);
    expect(result.canWatchTarget).toBe(false);
    expect(result.showNoDropsHint).toBe(false);
  });

  it("computes totals per campaign using max required/earned", () => {
    const first = makeItem({
      id: "drop-1",
      campaignId: "camp-1",
      requiredMinutes: 60,
      earnedMinutes: 10,
      status: "progress",
    });
    const second = makeItem({
      id: "drop-2",
      campaignId: "camp-1",
      requiredMinutes: 30,
      earnedMinutes: 20,
      status: "progress",
    });
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [first, second],
      withCategories: [
        { item: first, category: "in-progress" },
        { item: second, category: "in-progress" },
      ],
      allowWatching: true,
      watching: null,
      inventoryFetchedAt: null,
      now: 1_000_000,
    });
    expect(result.totalRequiredMinutes).toBe(60);
    expect(result.totalEarnedMinutes).toBe(20);
  });

  it("selects active drop by earliest end time", () => {
    const now = 2_000_000;
    const later = makeItem({
      id: "drop-later",
      title: "Later",
      status: "progress",
      endsAt: new Date(now + 120_000).toISOString(),
    });
    const sooner = makeItem({
      id: "drop-soon",
      title: "Soon",
      status: "progress",
      endsAt: new Date(now + 60_000).toISOString(),
    });
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [later, sooner],
      withCategories: [
        { item: later, category: "in-progress" },
        { item: sooner, category: "in-progress" },
      ],
      allowWatching: true,
      watching: null,
      inventoryFetchedAt: null,
      now,
    });
    expect(result.activeDropInfo?.id).toBe("drop-soon");
  });

  it("applies live delta minutes while watching", () => {
    const now = 6_000_000;
    const inventoryFetchedAt = now - 10 * 60_000;
    const item = makeItem({ status: "progress", earnedMinutes: 0, requiredMinutes: 60 });
    const watching: WatchingState = { id: "1", name: "Streamer", game: "Game" };
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [item],
      withCategories: [{ item, category: "in-progress" }],
      allowWatching: true,
      watching,
      inventoryFetchedAt,
      now,
    });
    expect(result.liveDeltaApplied).toBe(10);
    expect(result.targetProgress).toBe(17);
    expect(result.canWatchTarget).toBe(true);
  });

  it("shows no-drops hint when target has no actionable drops", () => {
    const item = makeItem({ status: "claimed", earnedMinutes: 60 });
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [item],
      withCategories: [{ item, category: "finished" }],
      allowWatching: true,
      watching: null,
      inventoryFetchedAt: null,
      now: 1_000_000,
    });
    expect(result.canWatchTarget).toBe(false);
    expect(result.showNoDropsHint).toBe(true);
  });
});
