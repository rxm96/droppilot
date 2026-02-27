import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@renderer/shared/types";
import { buildCampaignsFromInventory } from "./inventoryCampaigns";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop 1",
  requiredMinutes: 60,
  earnedMinutes: 0,
  status: "locked",
  campaignId: "camp-1",
  campaignName: "Campaign 1",
  ...overrides,
});

describe("buildCampaignsFromInventory", () => {
  it("marks campaign as finished when only zero-minute non-claimed drops remain", () => {
    const campaigns = buildCampaignsFromInventory([
      makeItem({
        id: "drop-claimed",
        status: "claimed",
        requiredMinutes: 240,
        earnedMinutes: 240,
      }),
      makeItem({
        id: "drop-zero",
        status: "locked",
        requiredMinutes: 0,
        earnedMinutes: 0,
      }),
    ]);

    expect(campaigns[0]?.hasUnclaimedDrops).toBe(false);
  });

  it("keeps campaign unclaimed when a watch-time drop is still open", () => {
    const campaigns = buildCampaignsFromInventory([
      makeItem({
        id: "drop-open",
        status: "locked",
        requiredMinutes: 120,
        earnedMinutes: 0,
      }),
    ]);

    expect(campaigns[0]?.hasUnclaimedDrops).toBe(true);
  });
});
