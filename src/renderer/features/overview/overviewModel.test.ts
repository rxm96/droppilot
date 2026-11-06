import { describe, expect, it } from "vitest";
import type { CampaignSummary, InventoryItem } from "@renderer/shared/types";
import {
  buildNeedsYouItems,
  channelInitials,
  resolveAutopilotState,
  resolveHeroState,
} from "./overviewModel";

const drop = (over: Partial<InventoryItem>): InventoryItem => ({
  id: "d1",
  game: "Rust",
  title: "Metal Door Skin",
  requiredMinutes: 180,
  earnedMinutes: 0,
  status: "locked",
  ...over,
});

describe("resolveAutopilotState", () => {
  it("is off while watching is not allowed (signed out)", () => {
    expect(
      resolveAutopilotState({ allowWatching: false, watching: false, autoSelectEnabled: true }),
    ).toBe("off");
  });
  it("is running while watching or while auto-select may pick a channel", () => {
    expect(
      resolveAutopilotState({ allowWatching: true, watching: true, autoSelectEnabled: false }),
    ).toBe("running");
    expect(
      resolveAutopilotState({ allowWatching: true, watching: false, autoSelectEnabled: true }),
    ).toBe("running");
  });
  it("is paused when nothing is watched and auto-select is off", () => {
    expect(
      resolveAutopilotState({ allowWatching: true, watching: false, autoSelectEnabled: false }),
    ).toBe("paused");
  });
});

describe("resolveHeroState", () => {
  const base = {
    autopilot: "running" as const,
    watching: false,
    hasActiveDrop: false,
    activeGame: "Valorant",
    channelsCount: 3,
    channelsLoading: false,
  };
  it("earns while a drop is being watched", () => {
    expect(resolveHeroState({ ...base, watching: true, hasActiveDrop: true })).toBe("earning");
  });
  it("says paused before anything else", () => {
    expect(resolveHeroState({ ...base, autopilot: "paused", hasActiveDrop: true })).toBe("paused");
  });
  it("is off while signed out", () => {
    expect(resolveHeroState({ ...base, autopilot: "off" })).toBe("off");
  });
  it("flags a watched channel that earns no drop", () => {
    expect(resolveHeroState({ ...base, watching: true })).toBe("watching-no-drop");
  });
  it("tells the idle cases apart", () => {
    expect(resolveHeroState({ ...base, activeGame: "" })).toBe("idle-no-target");
    expect(resolveHeroState({ ...base, channelsCount: 0 })).toBe("idle-no-channels");
    expect(resolveHeroState({ ...base, channelsCount: 0, channelsLoading: true })).toBe(
      "idle-starting",
    );
    expect(resolveHeroState(base)).toBe("idle-starting");
  });
});

describe("buildNeedsYouItems", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const base = {
    authExpired: false,
    items: [] as InventoryItem[],
    rankedGames: ["Valorant", "Rust"],
    campaigns: [] as CampaignSummary[],
    allowUnlinkedGames: false,
    now,
  };

  it("is empty when nothing needs the user", () => {
    expect(buildNeedsYouItems(base)).toEqual([]);
  });

  it("lists an expired session first", () => {
    const items = buildNeedsYouItems({
      ...base,
      authExpired: true,
      items: [drop({ id: "c", isClaimable: true, earnedMinutes: 180 })],
    });
    expect(items.map((i) => i.kind)).toEqual(["session-expired", "claim"]);
  });

  it("counts drops waiting to be claimed across all games", () => {
    const items = buildNeedsYouItems({
      ...base,
      items: [
        drop({ id: "a", isClaimable: true }),
        drop({ id: "b", game: "Apex", isClaimable: true }),
        drop({ id: "c", isClaimable: true, status: "claimed" }),
      ],
    });
    expect(items).toEqual([{ kind: "claim", count: 2 }]);
  });

  it("asks to link a ranked game whose drops need an account link, once per game", () => {
    const items = buildNeedsYouItems({
      ...base,
      campaigns: [
        { id: "camp-r", name: "Rust S1", game: "Rust", accountLinkUrl: "https://link.example" },
      ],
      items: [
        drop({ id: "r1", campaignId: "camp-r", blockingReasonHints: ["account_not_linked"] }),
        drop({ id: "r2", campaignId: "camp-r", title: "Hoodie", linked: false }),
        drop({ id: "x", game: "Apex", linked: false }),
      ],
    });
    expect(items).toEqual([
      {
        kind: "link",
        game: "Rust",
        dropTitle: "Metal Door Skin",
        moreCount: 1,
        linkUrl: "https://link.example",
      },
    ]);
  });

  it("matches ranked names regardless of case", () => {
    const items = buildNeedsYouItems({
      ...base,
      rankedGames: ["rust"],
      items: [drop({ linked: false })],
    });
    expect(items[0]).toMatchObject({ kind: "link", game: "Rust" });
  });

  it("skips claimed, expired and allowed-unlinked drops", () => {
    const linkable = [
      drop({ id: "a", linked: false, status: "claimed" }),
      drop({ id: "b", linked: false, endsAt: "2026-11-05T00:00:00Z" }),
      drop({ id: "c", linked: false, blockingReasonHints: ["campaign_expired"] }),
    ];
    expect(buildNeedsYouItems({ ...base, items: linkable })).toEqual([]);
    expect(
      buildNeedsYouItems({ ...base, allowUnlinkedGames: true, items: [drop({ linked: false })] }),
    ).toEqual([]);
  });
});

describe("channelInitials", () => {
  it("takes the first letters of the first two words", () => {
    expect(channelInitials("AgentZero")).toBe("AZ");
    expect(channelInitials("spikeplant_tv")).toBe("ST");
    expect(channelInitials("night owl aim")).toBe("NO");
  });
  it("falls back to the first two letters of a single word", () => {
    expect(channelInitials("shroud")).toBe("SH");
    expect(channelInitials("x")).toBe("X");
    expect(channelInitials("")).toBe("?");
  });
});
