import { describe, expect, it } from "vitest";
import type { ChannelEntry, ChannelLiveDiff, WatchingState } from "@renderer/shared/types";
import {
  applyLiveDiff,
  buildChannelDiff,
  computeAutoSwitchAction,
  isManualPriorityOverrideActive,
  hasRecentInventory,
  isFreshCache,
  mergeChannelList,
  shouldAutoSelectChannel,
} from "./useChannels";

const makeChannel = (overrides: Partial<ChannelEntry> = {}): ChannelEntry => ({
  id: "1",
  login: "alpha",
  displayName: "Alpha",
  title: "Streaming",
  viewers: 10,
  game: "Game",
  ...overrides,
});

describe("useChannels helpers", () => {
  it("merges channel lists while preserving identical references", () => {
    const a = makeChannel();
    const prev = [a];
    const next = [makeChannel()];
    const merged = mergeChannelList(prev, next);
    expect(merged[0]).toBe(a);
  });

  it("builds a channel diff with viewer deltas and title changes", () => {
    const prev = [makeChannel({ viewers: 10, title: "Old" })];
    const next = [
      makeChannel({ viewers: 14, title: "New" }),
      makeChannel({ id: "2", login: "beta", displayName: "Beta", viewers: 5 }),
    ];
    const diff = buildChannelDiff(prev, next, 1_000);
    expect(diff?.addedIds).toEqual(["2"]);
    expect(diff?.updatedIds).toEqual(["1"]);
    expect(diff?.titleChangedIds).toEqual(["1"]);
    expect(diff?.viewerDeltaById["1"]).toBe(4);
  });

  it("returns null diff when lists are identical", () => {
    const prev = [makeChannel()];
    const next = [makeChannel()];
    const diff = buildChannelDiff(prev, next, 1_000);
    expect(diff).toBeNull();
  });

  it("applies live diffs and sorts when reason is not viewers", () => {
    const prev = [makeChannel({ id: "1", viewers: 10 }), makeChannel({ id: "2", viewers: 5 })];
    const payload: ChannelLiveDiff = {
      game: "Game",
      at: 1_000,
      source: "ws",
      reason: "stream-up",
      added: [makeChannel({ id: "3", viewers: 15 })],
      removedIds: [],
      updated: [],
    };
    const next = applyLiveDiff(prev, payload);
    expect(next[0].id).toBe("3");
  });

  it("decides when to auto-select a channel", () => {
    const channels = [makeChannel()];
    const watching: WatchingState = null;
    expect(
      shouldAutoSelectChannel({
        allowWatching: true,
        autoSelectEnabled: true,
        canWatchTarget: true,
        channels,
        watching,
      }),
    ).toBe(true);
  });

  it("computes auto-switch actions", () => {
    const channels = [makeChannel({ id: "2", displayName: "Beta" })];
    const watching: WatchingState = { id: "1", name: "Alpha", game: "Game" };
    const action = computeAutoSwitchAction({
      allowWatching: true,
      watching,
      channels,
      autoSwitchEnabled: true,
      forcePrioritySwitch: false,
      canWatchTarget: true,
    });
    expect(action.action).toBe("switch");
    if (action.action === "switch") {
      expect(action.reason).toBe("offline");
      expect(action.nextChannel.id).toBe("2");
    }
  });

  it("switches to an allowlisted channel when current channel is not allowlisted", () => {
    const channels = [
      makeChannel({ id: "1", login: "alpha", displayName: "Alpha" }),
      makeChannel({ id: "2", login: "beta", displayName: "Beta" }),
    ];
    const watching: WatchingState = { id: "1", name: "Alpha", game: "Game" };
    const action = computeAutoSwitchAction({
      allowWatching: true,
      watching,
      channels,
      autoSwitchEnabled: true,
      forcePrioritySwitch: true,
      canWatchTarget: true,
      channelAllowlist: { ids: ["2"], logins: [] },
    });
    expect(action.action).toBe("switch");
    if (action.action === "switch") {
      expect(action.reason).toBe("priority");
      expect(action.nextChannel.id).toBe("2");
    }
  });

  it("does not switch when current channel is already allowlisted", () => {
    const channels = [
      makeChannel({ id: "1", login: "alpha", displayName: "Alpha" }),
      makeChannel({ id: "2", login: "beta", displayName: "Beta" }),
    ];
    const watching: WatchingState = { id: "1", name: "Alpha", game: "Game" };
    const action = computeAutoSwitchAction({
      allowWatching: true,
      watching,
      channels,
      autoSwitchEnabled: true,
      forcePrioritySwitch: true,
      canWatchTarget: true,
      channelAllowlist: { ids: ["1", "2"], logins: [] },
    });
    expect(action.action).toBe("none");
  });

  it("clears watching when no channels remain", () => {
    const watching: WatchingState = { id: "1", name: "Alpha", game: "Game" };
    const action = computeAutoSwitchAction({
      allowWatching: true,
      watching,
      channels: [],
      autoSwitchEnabled: true,
      forcePrioritySwitch: false,
      canWatchTarget: true,
    });
    expect(action.action).toBe("clear");
  });

  it("respects cache freshness helpers", () => {
    expect(
      isFreshCache({
        fetchedAt: 1_000,
        fetchedGame: "Game",
        game: "Game",
        now: 1_500,
        refreshWindowMs: 1_000,
      }),
    ).toBe(true);
    expect(
      hasRecentInventory({
        inventoryFetchedAt: 1_000,
        now: 4_000,
        recentWindowMs: 2_000,
      }),
    ).toBe(false);
  });

  it("activates manual override only for matching game and time window", () => {
    expect(
      isManualPriorityOverrideActive({
        manualWatchOverride: { at: 1_000, game: "Game" },
        targetGame: "Game",
        now: 1_500,
        windowMs: 1_000,
      }),
    ).toBe(true);
    expect(
      isManualPriorityOverrideActive({
        manualWatchOverride: { at: 1_000, game: "Other" },
        targetGame: "Game",
        now: 1_500,
        windowMs: 1_000,
      }),
    ).toBe(false);
    expect(
      isManualPriorityOverrideActive({
        manualWatchOverride: { at: 1_000, game: "Game" },
        targetGame: "Game",
        now: 3_000,
        windowMs: 1_000,
      }),
    ).toBe(false);
  });
});
