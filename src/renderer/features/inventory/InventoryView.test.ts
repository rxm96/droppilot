import { describe, expect, it } from "vitest";
import type { CampaignSummary } from "@renderer/shared/types";
import {
  compareCampaignDropsByDuration,
  createPriorityGameSet,
  isCampaignInPriorityGames,
  shouldDisplayCampaignEntry,
} from "./InventoryView";

const makeCampaign = (overrides: Partial<CampaignSummary> = {}): CampaignSummary => ({
  id: "camp-1",
  name: "Campaign",
  game: "Game",
  drops: [],
  ...overrides,
});

describe("shouldDisplayCampaignEntry", () => {
  const priorityGameSet = createPriorityGameSet(["Game"]);
  const isCampaignUnlinked = () => false;

  it("keeps zero-minute campaigns visible in the default inventory filter", () => {
    const campaign = makeCampaign({
      drops: [{ id: "drop-1", requiredMinutes: 0, earnedMinutes: 0, status: "locked" }],
    });
    expect(
      shouldDisplayCampaignEntry(
        { campaign, phase: "finished" },
        {
          normalizedFilter: "all",
          priorityGameSet,
          gameFilter: "all",
          isCampaignUnlinked,
        },
      ),
    ).toBe(true);
  });

  it("still hides expired campaigns from the default inventory filter", () => {
    expect(
      shouldDisplayCampaignEntry(
        { campaign: makeCampaign(), phase: "expired" },
        {
          normalizedFilter: "all",
          priorityGameSet,
          gameFilter: "all",
          isCampaignUnlinked,
        },
      ),
    ).toBe(false);
  });

  it("still respects the selected game filter", () => {
    expect(
      shouldDisplayCampaignEntry(
        { campaign: makeCampaign({ game: "Other Game" }), phase: "finished" },
        {
          normalizedFilter: "all",
          priorityGameSet,
          gameFilter: "Game",
          isCampaignUnlinked,
        },
      ),
    ).toBe(false);
  });
});

describe("isCampaignInPriorityGames", () => {
  it("matches campaign games case-insensitively", () => {
    const prioritySet = createPriorityGameSet(["  World of Warcraft  ", "Rust"]);
    expect(
      isCampaignInPriorityGames(makeCampaign({ game: "world of warcraft" }), prioritySet),
    ).toBe(true);
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
