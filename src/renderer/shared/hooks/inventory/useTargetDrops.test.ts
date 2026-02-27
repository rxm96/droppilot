import { describe, expect, it } from "vitest";
import type { InventoryItem, WatchingState } from "@renderer/shared/types";
import { computeTargetDrops } from "./useTargetDrops";

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

  it("keeps claimed campaign minutes while showing remaining open-drop campaign progress", () => {
    const claimed = makeItem({
      id: "drop-claimed",
      campaignId: "camp-1",
      requiredMinutes: 240,
      earnedMinutes: 240,
      status: "claimed",
    });
    const open = makeItem({
      id: "drop-open",
      campaignId: "camp-1",
      requiredMinutes: 240,
      earnedMinutes: 0,
      status: "locked",
    });
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [claimed, open],
      withCategories: [
        { item: claimed, category: "finished" },
        { item: open, category: "upcoming" },
      ],
      allowWatching: true,
      allowUnlinkedGames: true,
      watching: null,
      inventoryFetchedAt: null,
      now: 1_000_000,
    });
    expect(result.totalRequiredMinutes).toBe(480);
    expect(result.totalEarnedMinutes).toBe(240);
    expect(result.targetProgress).toBe(50);
  });

  it("selects active drop by least remaining minutes", () => {
    const now = 2_000_000;
    const slower = makeItem({
      id: "drop-slower",
      title: "Slower",
      status: "progress",
      requiredMinutes: 120,
      earnedMinutes: 30,
      endsAt: new Date(now + 60_000).toISOString(),
    });
    const faster = makeItem({
      id: "drop-faster",
      title: "Faster",
      status: "progress",
      requiredMinutes: 30,
      earnedMinutes: 20,
      endsAt: new Date(now + 120_000).toISOString(),
    });
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [slower, faster],
      withCategories: [
        { item: slower, category: "in-progress" },
        { item: faster, category: "in-progress" },
      ],
      allowWatching: true,
      watching: null,
      inventoryFetchedAt: null,
      now,
    });
    expect(result.activeDropInfo?.id).toBe("drop-faster");
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
    expect(result.targetProgress).toBe(0);
    expect(result.canWatchTarget).toBe(true);
  });

  it("uses per-drop progress anchor when available", () => {
    const now = 7_000_000;
    const item = makeItem({ id: "drop-anchored", status: "progress", earnedMinutes: 5 });
    const watching: WatchingState = { id: "1", name: "Streamer", game: "Game" };
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [item],
      withCategories: [{ item, category: "in-progress" }],
      allowWatching: true,
      watching,
      inventoryFetchedAt: now - 10 * 60_000,
      progressAnchorByDropId: { "drop-anchored": now - 60_000 },
      now,
    });
    expect(result.liveDeltaApplied).toBe(1);
    expect(result.activeDropInfo?.progressAnchorAt).toBe(now - 60_000);
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

  it("allows watching upcoming target drops when unlinked campaigns are allowed", () => {
    const item = makeItem({ status: "locked", game: "Game" });
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [item],
      withCategories: [{ item, category: "upcoming" }],
      allowWatching: true,
      allowUnlinkedGames: true,
      watching: null,
      inventoryFetchedAt: null,
      now: 1_000_000,
    });
    expect(result.canWatchTarget).toBe(true);
    expect(result.showNoDropsHint).toBe(false);
  });

  it("shows an upcoming drop as active while already watching the target game", () => {
    const now = 8_000_000;
    const item = makeItem({ status: "locked", earnedMinutes: 0, requiredMinutes: 60 });
    const watching: WatchingState = { id: "1", name: "Streamer", game: "Game" };
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [item],
      withCategories: [{ item, category: "upcoming" }],
      allowWatching: true,
      allowUnlinkedGames: false,
      watching,
      inventoryFetchedAt: now - 5 * 60_000,
      now,
    });
    expect(result.activeDropInfo?.id).toBe(item.id);
    expect(result.liveDeltaApplied).toBe(0);
    expect(result.activeDropInfo?.eta).toBeNull();
  });

  it("does not treat eligibility-blocked upcoming drops as watchable active targets", () => {
    const now = 8_500_000;
    const item = makeItem({
      status: "locked",
      earnedMinutes: 0,
      requiredMinutes: 60,
      blockingReasonHints: ["preconditions_not_met"],
    });
    const watching: WatchingState = { id: "1", name: "Streamer", game: "Game" };
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [item],
      withCategories: [{ item, category: "upcoming" }],
      allowWatching: true,
      allowUnlinkedGames: true,
      watching,
      inventoryFetchedAt: now - 5 * 60_000,
      now,
    });
    expect(result.activeDropInfo).toBeNull();
    expect(result.canWatchTarget).toBe(false);
    expect(result.showNoDropsHint).toBe(true);
  });

  it("keeps account-not-linked upcoming drops watchable when unlinked games are allowed", () => {
    const now = 8_600_000;
    const item = makeItem({
      status: "locked",
      earnedMinutes: 0,
      requiredMinutes: 60,
      blockingReasonHints: ["account_not_linked"],
    });
    const watching: WatchingState = { id: "1", name: "Streamer", game: "Game" };
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [item],
      withCategories: [{ item, category: "upcoming" }],
      allowWatching: true,
      allowUnlinkedGames: true,
      watching,
      inventoryFetchedAt: now - 5 * 60_000,
      now,
    });
    expect(result.canWatchTarget).toBe(true);
    expect(result.showNoDropsHint).toBe(false);
    expect(result.activeDropInfo?.id).toBe(item.id);
  });

  it("ignores zero-minute upcoming drops as non-watchable targets", () => {
    const now = 8_700_000;
    const item = makeItem({
      status: "locked",
      earnedMinutes: 0,
      requiredMinutes: 0,
      blockingReasonHints: ["account_not_linked"],
    });
    const watching: WatchingState = { id: "1", name: "Streamer", game: "Game" };
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [item],
      withCategories: [{ item, category: "upcoming" }],
      allowWatching: true,
      allowUnlinkedGames: true,
      watching,
      inventoryFetchedAt: now - 5 * 60_000,
      now,
    });
    expect(result.activeDropInfo).toBeNull();
    expect(result.canWatchTarget).toBe(false);
    expect(result.showNoDropsHint).toBe(true);
  });

  it("prefers an in-progress drop that is farmable on the current channel", () => {
    const now = 9_000_000;
    const restrictedFast = makeItem({
      id: "drop-restricted-fast",
      title: "Restricted fast",
      status: "progress",
      requiredMinutes: 30,
      earnedMinutes: 25,
      allowedChannelIds: ["channel-allowed"],
    });
    const unrestricted = makeItem({
      id: "drop-open",
      title: "Open",
      status: "progress",
      requiredMinutes: 120,
      earnedMinutes: 20,
    });
    const watching: WatchingState = {
      id: "channel-current",
      channelId: "channel-current",
      login: "currentlogin",
      name: "Current",
      game: "Game",
    };
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [restrictedFast, unrestricted],
      withCategories: [
        { item: restrictedFast, category: "in-progress" },
        { item: unrestricted, category: "in-progress" },
      ],
      allowWatching: true,
      watching,
      inventoryFetchedAt: now - 60_000,
      now,
    });
    expect(result.activeDropInfo?.id).toBe("drop-open");
  });

  it("has no active drop while watching if no drop is farmable on the current channel", () => {
    const now = 10_000_000;
    const restricted = makeItem({
      id: "drop-restricted-only",
      title: "Restricted only",
      status: "progress",
      requiredMinutes: 60,
      earnedMinutes: 20,
      allowedChannelIds: ["another-channel"],
      allowedChannelLogins: ["anotherlogin"],
    });
    const watching: WatchingState = {
      id: "channel-current",
      channelId: "channel-current",
      login: "currentlogin",
      name: "Current",
      game: "Game",
    };
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [restricted],
      withCategories: [{ item: restricted, category: "in-progress" }],
      allowWatching: true,
      watching,
      inventoryFetchedAt: now - 5 * 60_000,
      now,
    });
    expect(result.activeDropInfo).toBeNull();
    expect(result.liveDeltaApplied).toBe(0);
  });

  it("does not treat an already claimable in-progress drop as watchable progress", () => {
    const now = 10_500_000;
    const claimable = makeItem({
      id: "drop-claimable",
      title: "Claimable",
      status: "progress",
      requiredMinutes: 60,
      earnedMinutes: 60,
      isClaimable: true,
    });
    const watching: WatchingState = {
      id: "channel-current",
      channelId: "channel-current",
      login: "currentlogin",
      name: "Current",
      game: "Game",
    };
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [claimable],
      withCategories: [{ item: claimable, category: "in-progress" }],
      allowWatching: true,
      watching,
      inventoryFetchedAt: now - 60_000,
      now,
    });
    expect(result.activeDropInfo).toBeNull();
    expect(result.canWatchTarget).toBe(false);
    expect(result.showNoDropsHint).toBe(false);
  });

  it("does not fall back to global fastest drop while watching a non-target game", () => {
    const now = 11_000_000;
    const fastest = makeItem({
      id: "drop-fastest",
      title: "Fastest",
      status: "progress",
      requiredMinutes: 30,
      earnedMinutes: 20,
    });
    const slower = makeItem({
      id: "drop-slower",
      title: "Slower",
      status: "progress",
      requiredMinutes: 120,
      earnedMinutes: 20,
    });
    const watching: WatchingState = {
      id: "channel-other",
      channelId: "channel-other",
      login: "otherlogin",
      name: "Other",
      game: "OtherGame",
    };
    const result = computeTargetDrops({
      targetGame: "Game",
      inventoryItems: [fastest, slower],
      withCategories: [
        { item: fastest, category: "in-progress" },
        { item: slower, category: "in-progress" },
      ],
      allowWatching: true,
      watching,
      inventoryFetchedAt: now - 60_000,
      now,
    });
    expect(result.activeDropInfo).toBeNull();
  });
});
