import { describe, expect, it } from "vitest";
import { deriveWatchDecision } from "./watchDecision";

const base = {
  suppressionGame: "",
  activeTargetGame: "Rust",
  targetGame: "Rust",
  isTargetInCooldown: false,
  isWatching: false,
  canWatchTarget: true,
  isRecoveringNoProgress: false,
  hasPredictiveProgress: false,
  hasFarmableActiveDrop: false,
  channelsLoading: false,
  channelsRefreshing: false,
  allowlistedLiveChannels: 1,
};

describe("deriveWatchDecision", () => {
  it.each([
    ["suppressed", { suppressionGame: "Rust" }],
    ["cooldown", { isTargetInCooldown: true }],
    ["no-target", { targetGame: "" }],
    ["watching-no-watchable", { isWatching: true, canWatchTarget: false }],
    ["watching-recover", { isWatching: true, isRecoveringNoProgress: true }],
    ["watching-progress", { isWatching: true, hasFarmableActiveDrop: true }],
    ["watching-progress", { isWatching: true, hasPredictiveProgress: true }],
    ["watching-no-farmable", { isWatching: true }],
    ["idle-loading-channels", { channelsLoading: true }],
    ["idle-no-channels", { allowlistedLiveChannels: 0 }],
    ["idle-ready", {}],
    ["idle-no-watchable-drops", { canWatchTarget: false }],
  ] as const)("returns %s", (expected, overrides) => {
    expect(deriveWatchDecision({ ...base, ...overrides })).toBe(expected);
  });

  it("suppression only counts when it matches the active target", () => {
    expect(deriveWatchDecision({ ...base, suppressionGame: "Dota 2" })).toBe("idle-ready");
  });
});
