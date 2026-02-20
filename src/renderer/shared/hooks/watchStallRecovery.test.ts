import { describe, expect, it } from "vitest";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import {
  buildWatchStallTrackerKey,
  evaluateNoProgressStall,
  pickStallRecoveryChannel,
} from "@renderer/shared/hooks/watchStallRecovery";

const makeChannel = (overrides: Partial<ChannelEntry> = {}): ChannelEntry => ({
  id: "1",
  login: "alpha",
  displayName: "Alpha",
  title: "Streaming",
  viewers: 10,
  game: "Game",
  ...overrides,
});

describe("watchStallRecovery helpers", () => {
  it("builds a stable tracker key from watching session and drop id", () => {
    const watching: WatchingState = {
      id: "chan-1",
      channelId: "chan-1",
      login: "alpha",
      name: "Alpha",
      game: "Game",
      streamId: "stream-1",
    };
    expect(buildWatchStallTrackerKey(watching, "drop-1")).toBe("chan-1:stream-1:drop-1");
  });

  it("does not trigger recovery before the no-progress window", () => {
    const init = evaluateNoProgressStall({
      tracker: null,
      key: "k",
      earnedMinutes: 5,
      now: 1_000,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 1_000,
    });
    const next = evaluateNoProgressStall({
      tracker: init.tracker,
      key: "k",
      earnedMinutes: 5,
      now: 5_000,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 1_000,
    });
    expect(next.shouldRecover).toBe(false);
  });

  it("triggers recovery after no progress and respects cooldown", () => {
    const init = evaluateNoProgressStall({
      tracker: null,
      key: "k",
      earnedMinutes: 5,
      now: 0,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 5_000,
    });
    const firstRecovery = evaluateNoProgressStall({
      tracker: init.tracker,
      key: "k",
      earnedMinutes: 5,
      now: 10_001,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 5_000,
    });
    expect(firstRecovery.shouldRecover).toBe(true);
    const duringCooldown = evaluateNoProgressStall({
      tracker: firstRecovery.tracker,
      key: "k",
      earnedMinutes: 5,
      now: 12_000,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 5_000,
    });
    expect(duringCooldown.shouldRecover).toBe(false);
  });

  it("resets stall tracking when earned minutes increase", () => {
    const init = evaluateNoProgressStall({
      tracker: null,
      key: "k",
      earnedMinutes: 5,
      now: 0,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 1_000,
    });
    const progressed = evaluateNoProgressStall({
      tracker: init.tracker,
      key: "k",
      earnedMinutes: 6,
      now: 8_000,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 1_000,
    });
    const tooEarly = evaluateNoProgressStall({
      tracker: progressed.tracker,
      key: "k",
      earnedMinutes: 6,
      now: 12_000,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 1_000,
    });
    expect(tooEarly.shouldRecover).toBe(false);
  });

  it("picks the first alternative channel that can farm the active drop", () => {
    const watching: WatchingState = {
      id: "1",
      channelId: "1",
      login: "alpha",
      name: "Alpha",
      game: "Game",
    };
    const channels = [
      makeChannel({ id: "1", login: "alpha" }),
      makeChannel({ id: "2", login: "beta", displayName: "Beta" }),
      makeChannel({ id: "3", login: "gamma", displayName: "Gamma" }),
    ];
    const picked = pickStallRecoveryChannel({
      channels,
      watching,
      drop: {
        id: "drop-1",
        earnedMinutes: 10,
        allowedChannelIds: ["3"],
      },
    });
    expect(picked?.id).toBe("3");
  });

  it("returns null when no alternative channel is farmable", () => {
    const watching: WatchingState = {
      id: "1",
      channelId: "1",
      login: "alpha",
      name: "Alpha",
      game: "Game",
    };
    const channels = [makeChannel({ id: "1", login: "alpha" }), makeChannel({ id: "2" })];
    const picked = pickStallRecoveryChannel({
      channels,
      watching,
      drop: {
        id: "drop-1",
        earnedMinutes: 10,
        allowedChannelIds: ["999"],
        allowedChannelLogins: ["nobody"],
      },
    });
    expect(picked).toBeNull();
  });
});
