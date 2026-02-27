import { describe, expect, it } from "vitest";
import type { CampaignSummary, InventoryItem } from "@renderer/shared/types";
import {
  compareCampaignDropsByDuration,
  createPriorityGameSet,
  hasCampaignWatchtimeDrops,
  isCampaignInPriorityGames,
} from "./InventoryView";

const makeCampaign = (overrides: Partial<CampaignSummary> = {}): CampaignSummary => ({
  id: "camp-1",
  name: "Campaign",
  game: "Game",
  drops: [],
  ...overrides,
});

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop",
  requiredMinutes: 60,
  earnedMinutes: 0,
  status: "locked",
  campaignId: "camp-1",
  ...overrides,
});

describe("hasCampaignWatchtimeDrops", () => {
  it("returns false when campaign only has zero-minute drops", () => {
    const campaign = makeCampaign({
      drops: [{ id: "drop-1", requiredMinutes: 0, earnedMinutes: 0, status: "locked" }],
    });
    const inventoryByDropId = new Map<string, InventoryItem>();
    expect(hasCampaignWatchtimeDrops(campaign, inventoryByDropId)).toBe(false);
  });

  it("returns true when campaign has at least one watch-time drop", () => {
    const campaign = makeCampaign({
      drops: [{ id: "drop-1", requiredMinutes: 120, earnedMinutes: 0, status: "locked" }],
    });
    const inventoryByDropId = new Map<string, InventoryItem>();
    expect(hasCampaignWatchtimeDrops(campaign, inventoryByDropId)).toBe(true);
  });

  it("prefers inventory required minutes when available", () => {
    const campaign = makeCampaign({
      drops: [{ id: "drop-1", requiredMinutes: 0, earnedMinutes: 0, status: "locked" }],
    });
    const inventoryByDropId = new Map<string, InventoryItem>([
      ["drop-1", makeItem({ id: "drop-1", requiredMinutes: 90 })],
    ]);
    expect(hasCampaignWatchtimeDrops(campaign, inventoryByDropId)).toBe(true);
  });

  it("keeps campaigns visible when drops are missing from summary payload", () => {
    const campaign = makeCampaign({ drops: undefined });
    const inventoryByDropId = new Map<string, InventoryItem>();
    expect(hasCampaignWatchtimeDrops(campaign, inventoryByDropId)).toBe(true);
  });
});

describe("isCampaignInPriorityGames", () => {
  it("matches campaign games case-insensitively", () => {
    const prioritySet = createPriorityGameSet(["  World of Warcraft  ", "Rust"]);
    expect(isCampaignInPriorityGames(makeCampaign({ game: "world of warcraft" }), prioritySet)).toBe(
      true,
    );
  });

  it("returns false when campaign game is not in priority list", () => {
    const prioritySet = createPriorityGameSet(["Rust"]);
    expect(isCampaignInPriorityGames(makeCampaign({ game: "Valorant" }), prioritySet)).toBe(false);
  });

  it("returns false when priority list is empty", () => {
    const prioritySet = createPriorityGameSet([]);
    expect(isCampaignInPriorityGames(makeCampaign({ game: "Rust" }), prioritySet)).toBe(false);
  });
});

describe("compareCampaignDropsByDuration", () => {
  it("sorts drops by required minutes ascending", () => {
    const drops = [
      { id: "drop-120", title: "Late", requiredMinutes: 120 },
      { id: "drop-30", title: "Early", requiredMinutes: 30 },
      { id: "drop-60", title: "Middle", requiredMinutes: 60 },
    ];
    const sorted = [...drops].sort(compareCampaignDropsByDuration);
    expect(sorted.map((drop) => drop.id)).toEqual(["drop-30", "drop-60", "drop-120"]);
  });

  it("uses title and id as stable tie-breakers for equal duration", () => {
    const drops = [
      { id: "b", title: "Alpha", requiredMinutes: 60 },
      { id: "a", title: "Alpha", requiredMinutes: 60 },
      { id: "c", title: "Beta", requiredMinutes: 60 },
    ];
    const sorted = [...drops].sort(compareCampaignDropsByDuration);
    expect(sorted.map((drop) => drop.id)).toEqual(["a", "b", "c"]);
  });
});
