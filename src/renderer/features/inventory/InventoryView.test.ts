import { describe, expect, it } from "vitest";
import type { CampaignSummary, InventoryItem } from "@renderer/shared/types";
import { hasCampaignWatchtimeDrops } from "./InventoryView";

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
