import { describe, expect, it } from "vitest";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import {
  buildWatchStallTrackerKey,
  decideIdleNoFarmable,
  decideNoProgressRecovery,
  decideWatchingNoFarmable,
  evaluateNoProgressStall,
  NO_FARMABLE_DROP_GRACE_MS,
  NO_FARMABLE_GAME_COOLDOWN_MS,
  pickStallRecoveryChannel,
  shouldProbeNoProgressConfirmation,
  STALL_CONFIRMATION_PROBE_COOLDOWN_MS,
  STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS,
  STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END,
  STALL_NO_PROGRESS_WINDOW_MS,
  STALL_NO_PROGRESS_WINDOW_NEAR_END_MS,
} from "./watchStallRecovery";
import type {
  NoFarmableMarker,
  StallRecoveryAction,
  WatchConfirmationProbe,
  WatchStallTracker,
} from "./watchStallRecovery";

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
    expect(buildWatchStallTrackerKey(watching, "drop-1")).toBe("game:drop-1");
  });

  it("keeps the same stall key across channel switches within the same game", () => {
    const first: WatchingState = {
      id: "chan-1",
      channelId: "chan-1",
      login: "alpha",
      name: "Alpha",
      game: "Game",
      streamId: "stream-1",
    };
    const second: WatchingState = {
      id: "chan-2",
      channelId: "chan-2",
      login: "beta",
      name: "Beta",
      game: "Game",
      streamId: "stream-2",
    };
    expect(buildWatchStallTrackerKey(first, "drop-1")).toBe("game:drop-1");
    expect(buildWatchStallTrackerKey(second, "drop-1")).toBe("game:drop-1");
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
    expect(firstRecovery.tracker.recoveryCount).toBe(1);
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

  it("increments recovery count on repeated stall recoveries and resets on progress", () => {
    const init = evaluateNoProgressStall({
      tracker: null,
      key: "k",
      earnedMinutes: 5,
      now: 0,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 1_000,
    });
    const firstRecovery = evaluateNoProgressStall({
      tracker: init.tracker,
      key: "k",
      earnedMinutes: 5,
      now: 10_001,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 1_000,
    });
    const secondRecovery = evaluateNoProgressStall({
      tracker: firstRecovery.tracker,
      key: "k",
      earnedMinutes: 5,
      now: 11_002,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 1_000,
    });
    expect(secondRecovery.shouldRecover).toBe(true);
    expect(secondRecovery.tracker.recoveryCount).toBe(2);
    const progressed = evaluateNoProgressStall({
      tracker: secondRecovery.tracker,
      key: "k",
      earnedMinutes: 6,
      now: 12_000,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 1_000,
    });
    expect(progressed.shouldRecover).toBe(false);
    expect(progressed.tracker.recoveryCount).toBe(0);
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

  it("requests a confirmation probe shortly before recovery when watch pings stay healthy", () => {
    const init = evaluateNoProgressStall({
      tracker: null,
      key: "k",
      earnedMinutes: 5,
      now: 0,
      noProgressWindowMs: 15 * 60_000,
      actionCooldownMs: 1_000,
    });
    expect(
      shouldProbeNoProgressConfirmation({
        tracker: init.tracker,
        key: "k",
        now: 13 * 60_000,
        noProgressWindowMs: 15 * 60_000,
        probeLeadMs: 2 * 60_000,
        lastWatchOk: 12 * 60_000 + 30_000,
        watchPingGraceMs: 90_000,
        lastProbeAt: 0,
        probeCooldownMs: 60_000,
      }),
    ).toBe(true);
  });

  it("does not request a confirmation probe without a recent watch ping or after the stall window", () => {
    const init = evaluateNoProgressStall({
      tracker: null,
      key: "k",
      earnedMinutes: 5,
      now: 0,
      noProgressWindowMs: 15 * 60_000,
      actionCooldownMs: 1_000,
    });
    expect(
      shouldProbeNoProgressConfirmation({
        tracker: init.tracker,
        key: "k",
        now: 13 * 60_000,
        noProgressWindowMs: 15 * 60_000,
        probeLeadMs: 2 * 60_000,
        lastWatchOk: 11 * 60_000,
        watchPingGraceMs: 90_000,
        lastProbeAt: 0,
        probeCooldownMs: 60_000,
      }),
    ).toBe(false);
    expect(
      shouldProbeNoProgressConfirmation({
        tracker: init.tracker,
        key: "k",
        now: 15 * 60_000,
        noProgressWindowMs: 15 * 60_000,
        probeLeadMs: 2 * 60_000,
        lastWatchOk: 14 * 60_000 + 30_000,
        watchPingGraceMs: 90_000,
        lastProbeAt: 0,
        probeCooldownMs: 60_000,
      }),
    ).toBe(false);
  });

  it("respects probe cooldown for the same unconfirmed progress baseline", () => {
    const init = evaluateNoProgressStall({
      tracker: null,
      key: "k",
      earnedMinutes: 5,
      now: 0,
      noProgressWindowMs: 15 * 60_000,
      actionCooldownMs: 1_000,
    });
    expect(
      shouldProbeNoProgressConfirmation({
        tracker: init.tracker,
        key: "k",
        now: 13 * 60_000 + 30_000,
        noProgressWindowMs: 15 * 60_000,
        probeLeadMs: 2 * 60_000,
        lastWatchOk: 13 * 60_000,
        watchPingGraceMs: 90_000,
        lastProbeAt: 13 * 60_000,
        probeCooldownMs: 60_000,
      }),
    ).toBe(false);
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

const channel = (id: string, login = id): ChannelEntry =>
  ({ id, login, displayName: login, title: "", viewers: 0, game: "Rust" }) as ChannelEntry;

const idleBase = {
  allowWatching: true,
  autoSelectEnabled: true,
  targetGame: "Rust",
  activeTargetGame: "Rust",
  channelAllowlist: { ids: ["allowed-1"], logins: [] },
  channels: [channel("other-1")],
  channelsLoading: false,
  channelsRefreshing: false,
  noFarmable: null as NoFarmableMarker | null,
  getNextTargetGame: () => "Dota 2",
};

describe("decideIdleNoFarmable", () => {
  it("does nothing (and clears the marker) when idle evaluation is off", () => {
    expect(decideIdleNoFarmable({ ...idleBase, autoSelectEnabled: false })).toEqual({
      actions: [],
      noFarmable: null,
    });
    expect(decideIdleNoFarmable({ ...idleBase, targetGame: "" })).toEqual({
      actions: [],
      noFarmable: null,
    });
  });

  it("does nothing when the allowlist has no constraints", () => {
    expect(
      decideIdleNoFarmable({ ...idleBase, channelAllowlist: { ids: [], logins: [] } }),
    ).toEqual({ actions: [], noFarmable: null });
  });

  it("keeps the marker untouched while channels are still loading", () => {
    const marker = { key: "Rust", sinceAt: 1 };
    expect(
      decideIdleNoFarmable({
        ...idleBase,
        channels: [],
        channelsLoading: true,
        noFarmable: marker,
      }).noFarmable,
    ).toBe(marker);
  });

  it("does nothing when an allowlisted channel is live", () => {
    expect(decideIdleNoFarmable({ ...idleBase, channels: [channel("allowed-1")] })).toEqual({
      actions: [],
      noFarmable: null,
    });
  });

  it("escalates when no allowlisted channel is live: cooldown, retarget, auto-select, stall-stop", () => {
    const { actions, noFarmable } = decideIdleNoFarmable(idleBase);
    expect(noFarmable).toBeNull();
    expect(actions.map((a) => a.kind)).toEqual([
      "set-cooldown",
      "log",
      "log",
      "retarget",
      "enable-auto-select",
      "dispatch-stall-stop",
    ]);
    expect(actions[0]).toEqual({
      kind: "set-cooldown",
      game: "Rust",
      durationMs: NO_FARMABLE_GAME_COOLDOWN_MS,
      reason: "stall-no-farmable",
    });
    expect(actions[1]).toEqual({
      kind: "log",
      message: "watch-engine: no-farmable idle evaluate",
      data: { from: "Rust", to: "Dota 2", channelsCount: 1, allowlistActive: true },
    });
    expect(actions[2]).toEqual({
      kind: "log",
      message: "watch-engine: retarget",
      data: { reason: "stall-no-farmable-idle", from: "Rust", to: "Dota 2" },
    });
    expect(actions[3]).toEqual({ kind: "retarget", to: "Dota 2" });
    expect(actions[5]).toEqual({
      kind: "dispatch-stall-stop",
      game: "Rust",
      context: "stall-no-farmable",
    });
  });

  it("logs a retarget skip when no next target exists", () => {
    const { actions } = decideIdleNoFarmable({ ...idleBase, getNextTargetGame: () => "" });
    expect(actions.map((a) => a.kind)).toEqual([
      "set-cooldown",
      "log",
      "log",
      "enable-auto-select",
      "dispatch-stall-stop",
    ]);
    const skip = actions[2] as Extract<StallRecoveryAction, { kind: "log" }>;
    expect(skip).toEqual({
      kind: "log",
      message: "watch-engine: retarget skipped",
      data: { reason: "stall-no-farmable-idle-no-next-target", from: "Rust" },
    });
  });
});

const watchingRust: WatchingState = {
  id: "w1",
  channelId: "w1",
  name: "streamer",
  login: "streamer",
  game: "Rust",
};

// Must satisfy canEarnDrop's positive gates for category "in-progress" —
// if canEarnDrop gains new requirements, extend this stub, not the decision fn.
const progressDrop = (id: string, allowedChannelLogins?: string[]) =>
  ({
    id,
    status: "progress",
    earnedMinutes: 5,
    requiredMinutes: 60,
    game: "Rust",
    allowedChannelLogins,
  }) as never;

const watchingBase = {
  watching: watchingRust,
  targetGame: "Rust",
  activeTargetGame: "Rust",
  channelAllowlist: { ids: [], logins: [] },
  channels: [channel("w1", "streamer"), channel("c2", "other")],
  channelsLoading: false,
  targetDrops: [] as never[],
  noFarmable: null as NoFarmableMarker | null,
  now: 100_000,
  getNextTargetGame: () => "Dota 2",
};

describe("decideWatchingNoFarmable", () => {
  it("starts the grace period on first sight", () => {
    expect(decideWatchingNoFarmable(watchingBase)).toEqual({
      actions: [],
      noFarmable: { key: "Rust", sinceAt: 100_000 },
      resetStallTracking: false,
    });
  });

  it("restarts the grace period when the target changes", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      noFarmable: { key: "Dota 2", sinceAt: 1 },
    });
    expect(result.noFarmable).toEqual({ key: "Rust", sinceAt: 100_000 });
  });

  it("waits silently inside the grace window", () => {
    const marker = { key: "Rust", sinceAt: 100_000 - NO_FARMABLE_DROP_GRACE_MS + 1 };
    expect(decideWatchingNoFarmable({ ...watchingBase, noFarmable: marker })).toEqual({
      actions: [],
      noFarmable: marker,
      resetStallTracking: false,
    });
  });

  it("waits while channels are loading and the list is empty", () => {
    const marker = { key: "Rust", sinceAt: 1 };
    expect(
      decideWatchingNoFarmable({
        ...watchingBase,
        channels: [],
        channelsLoading: true,
        noFarmable: marker,
      }).noFarmable,
    ).toBe(marker);
  });

  it("switches to a candidate channel that can farm an in-progress drop", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      noFarmable: { key: "Rust", sinceAt: 1 },
      targetDrops: [progressDrop("d1", ["other"])],
    });
    expect(result.actions).toEqual([{ kind: "switch-channel", channel: watchingBase.channels[1] }]);
    expect(result.noFarmable).toBeNull();
    expect(result.resetStallTracking).toBe(false);
  });

  it("falls back to any allowed channel when watching the wrong game", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      watching: { ...watchingRust, game: "Other Game" },
      noFarmable: { key: "Rust", sinceAt: 1 },
    });
    expect(result.actions).toEqual([{ kind: "switch-channel", channel: watchingBase.channels[0] }]);
  });

  it("escalates after the grace period: cooldown, retarget, stop, stall-stop, reset tracking", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      noFarmable: { key: "Rust", sinceAt: 1 },
    });
    expect(result.actions.map((a) => a.kind)).toEqual([
      "set-cooldown",
      "log",
      "retarget",
      "enable-auto-select",
      "stop-watching",
      "dispatch-stall-stop",
    ]);
    expect(result.noFarmable).toBeNull();
    expect(result.resetStallTracking).toBe(true);
    expect(result.actions[1]).toEqual({
      kind: "log",
      message: "watch-engine: retarget",
      data: { reason: "stall-no-farmable-direct", from: "Rust", to: "Dota 2" },
    });
  });

  it("escalates without log/retarget actions when no next target exists", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      noFarmable: { key: "Rust", sinceAt: 1 },
      getNextTargetGame: () => "",
    });
    expect(result.actions.map((a) => a.kind)).toEqual([
      "set-cooldown",
      "enable-auto-select",
      "stop-watching",
      "dispatch-stall-stop",
    ]);
    expect(result.resetStallTracking).toBe(true);
  });

  it("keeps scanning candidates until one has a watchable channel", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      noFarmable: { key: "Rust", sinceAt: 1 },
      targetDrops: [progressDrop("d1", ["nobody-live"]), progressDrop("d2", ["other"])],
    });
    expect(result.actions).toEqual([{ kind: "switch-channel", channel: watchingBase.channels[1] }]);
  });

  it("wrong-game fallback respects an allowlist constraint", () => {
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      watching: { ...watchingRust, game: "Other Game" },
      channelAllowlist: { ids: [], logins: ["other"] },
      noFarmable: { key: "Rust", sinceAt: 1 },
    });
    expect(result.actions).toEqual([{ kind: "switch-channel", channel: watchingBase.channels[1] }]);
  });

  it("ignores drops that are not in progress", () => {
    const claimedDrop = {
      id: "d3",
      status: "claimed",
      earnedMinutes: 5,
      requiredMinutes: 60,
      game: "Rust",
      allowedChannelLogins: ["other"],
    } as never;
    const result = decideWatchingNoFarmable({
      ...watchingBase,
      noFarmable: { key: "Rust", sinceAt: 1 },
      targetDrops: [claimedDrop],
    });
    expect(result.actions.map((a) => a.kind)).toEqual([
      "set-cooldown",
      "log",
      "retarget",
      "enable-auto-select",
      "stop-watching",
      "dispatch-stall-stop",
    ]);
  });
});

const activeDrop = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: "d1",
    title: "Drop",
    requiredMinutes: 60,
    earnedMinutes: 10,
    virtualEarned: 10,
    remainingMinutes: 50,
    eta: null,
    allowedChannelLogins: ["other"],
    ...over,
  }) as never;

// buildWatchStallTrackerKey(watchingRust, "d1"):
//   game = "Rust".trim().toLowerCase() = "rust"
//   key  = "rust:d1"
const trackerKey = "rust:d1";

const noProgressBase = {
  watching: watchingRust,
  activeDropInfo: activeDrop(),
  targetGame: "Rust",
  activeTargetGame: "Rust",
  channels: [channel("w1", "streamer"), channel("c2", "other")],
  lastWatchOk: 0,
  now: 1_000_000,
  tracker: null as WatchStallTracker | null,
  confirmationProbe: null as WatchConfirmationProbe | null,
  getNextTargetGame: () => "Dota 2",
};

describe("decideNoProgressRecovery", () => {
  it("resets tracking when the drop id is blank", () => {
    expect(
      decideNoProgressRecovery({ ...noProgressBase, activeDropInfo: activeDrop({ id: "  " }) }),
    ).toEqual({ actions: [], tracker: null, confirmationProbe: null });
  });

  it("seeds the tracker on first evaluation without recovering", () => {
    const result = decideNoProgressRecovery(noProgressBase);
    expect(result.actions).toEqual([]);
    expect(result.tracker).toEqual({
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 1_000_000,
      lastActionAt: 0,
      recoveryCount: 0,
    });
  });

  it("emits a confirmation probe shortly before the window elapses", () => {
    const tracker: WatchStallTracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 0,
    };
    // window 15min, lead = min(2min, 5min) = 2min → probe window [13min, 15min)
    const now = STALL_NO_PROGRESS_WINDOW_MS - 60_000;
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      tracker,
      now,
      lastWatchOk: now - 1_000, // recent ping, after lastProgressAt
    });
    expect(result.actions.map((a) => a.kind)).toEqual(["log", "refresh-inventory"]);
    expect(result.actions[0]).toEqual({
      kind: "log",
      message: "watch-engine: confirmation probe",
      data: {
        reason: "stall-no-progress-confirmation-probe",
        key: trackerKey,
        noProgressWindowMs: STALL_NO_PROGRESS_WINDOW_MS,
        probeLeadMs: 2 * 60_000,
        lastConfirmedProgressMsAgo: Math.max(0, now - 0),
      },
    });
    expect(result.confirmationProbe).toEqual({
      key: trackerKey,
      baselineProgressAt: 0,
      lastProbeAt: now,
    });
  });

  it("switches channel on first recovery", () => {
    const tracker: WatchStallTracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 0,
    };
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      tracker,
      now: STALL_NO_PROGRESS_WINDOW_MS + 1,
    });
    expect(result.actions).toEqual([
      { kind: "switch-channel", channel: noProgressBase.channels[1] },
    ]);
    expect(result.tracker?.recoveryCount).toBe(1);
  });

  it("refreshes channels+inventory when no alternate channel is visible", () => {
    const tracker: WatchStallTracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 0,
    };
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      channels: [channel("w1", "streamer")], // only the watched channel
      tracker,
      now: STALL_NO_PROGRESS_WINDOW_MS + 1,
    });
    expect(result.actions.map((a) => a.kind)).toEqual([
      "log",
      "refresh-channels",
      "refresh-inventory",
    ]);
    expect(result.actions[0]).toEqual({
      kind: "log",
      message: "watch-engine: no-progress refresh",
      data: {
        reason: "stall-no-progress-refresh",
        game: "Rust",
        nearEndProbe: false,
        noProgressWindowMs: STALL_NO_PROGRESS_WINDOW_MS,
        attempts: 1,
        maxChannelRecoveryAttempts: STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS,
      },
    });
  });

  it("escalates to retarget once the recovery budget is exhausted", () => {
    const tracker: WatchStallTracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 2, // becomes 3 on this recovery → over budget (max 2)
    };
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      tracker,
      now: STALL_NO_PROGRESS_WINDOW_MS + 1,
    });
    expect(result.actions.map((a) => a.kind)).toEqual([
      "log",
      "set-cooldown",
      "log",
      "retarget",
      "enable-auto-select",
      "stop-watching",
      "dispatch-stall-stop",
    ]);
    expect(result.actions[0]).toEqual({
      kind: "log",
      message: "watch-engine: retarget escalation",
      data: {
        reason: "stall-no-progress-recovery-budget",
        from: "Rust",
        nearEndProbe: false,
        noProgressWindowMs: STALL_NO_PROGRESS_WINDOW_MS,
        attempts: 3,
        maxChannelRecoveryAttempts: STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS,
      },
    });
    expect(result.actions[2]).toEqual({
      kind: "log",
      message: "watch-engine: retarget",
      data: {
        reason: "stall-no-progress-direct",
        from: "Rust",
        to: "Dota 2",
      },
    });
    const stallStop = result.actions[result.actions.length - 1] as Extract<
      StallRecoveryAction,
      { kind: "dispatch-stall-stop" }
    >;
    expect(stallStop).toEqual({
      kind: "dispatch-stall-stop",
      game: "Rust",
      context: "stall-no-progress",
    });
  });

  it("emits a fresh probe when confirmationProbe has a mismatched key", () => {
    const tracker: WatchStallTracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 0,
    };
    // Same timing as the "emits a confirmation probe" test: inside probe window
    const now = STALL_NO_PROGRESS_WINDOW_MS - 60_000;
    const staleProbe: WatchConfirmationProbe = {
      key: "rust:other",
      baselineProgressAt: 0,
      lastProbeAt: now - 1_000, // recent — but key mismatch means it must NOT suppress
    };
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      tracker,
      now,
      lastWatchOk: now - 1_000,
      confirmationProbe: staleProbe,
    });
    // Stale probe is discarded (key mismatch), so a fresh probe is emitted for trackerKey
    expect(result.actions.map((a) => a.kind)).toEqual(["log", "refresh-inventory"]);
    expect(result.confirmationProbe).toEqual({
      key: trackerKey,
      baselineProgressAt: 0,
      lastProbeAt: now,
    });
  });

  it("suppresses the probe and passes the existing probe through when within probe cooldown", () => {
    const tracker: WatchStallTracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 0,
    };
    // Same timing as the "emits a confirmation probe" test: inside probe window
    const now = STALL_NO_PROGRESS_WINDOW_MS - 60_000;
    const recentProbe: WatchConfirmationProbe = {
      key: trackerKey,
      baselineProgressAt: 0,
      lastProbeAt: now - 1_000, // 1s ago — well within STALL_CONFIRMATION_PROBE_COOLDOWN_MS (60s)
    };
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      tracker,
      now,
      lastWatchOk: now - 1_000,
      confirmationProbe: recentProbe,
    });
    expect(result.actions).toEqual([]);
    // The probe object is passed through unchanged — same reference
    expect(result.confirmationProbe).toBe(recentProbe);
    // Confirm the constant makes the assertion meaningful
    expect(now - recentProbe.lastProbeAt).toBeLessThan(STALL_CONFIRMATION_PROBE_COOLDOWN_MS);
  });

  it("escalates immediately when near-end budget (1) is exhausted on second recovery", () => {
    // remainingMinutes: 1 → nearEndNoProgressProbe = true
    // noProgressWindowMs = STALL_NO_PROGRESS_WINDOW_NEAR_END_MS (180_000)
    // tracker.recoveryCount: 1 → evaluateNoProgressStall increments to 2
    // maxChannelRecoveryAttempts = STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END = 1
    // allowChannelRecovery = 2 <= 1 → false → escalation
    const tracker: WatchStallTracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 1,
    };
    const now = STALL_NO_PROGRESS_WINDOW_NEAR_END_MS + 1;
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      activeDropInfo: activeDrop({ remainingMinutes: 1 }),
      tracker,
      now,
      channels: [channel("w1", "streamer"), channel("c2", "other")],
    });
    expect(result.actions.map((a) => a.kind)).toEqual([
      "log",
      "set-cooldown",
      "log",
      "retarget",
      "enable-auto-select",
      "stop-watching",
      "dispatch-stall-stop",
    ]);
    const escalationLog = result.actions[0] as Extract<StallRecoveryAction, { kind: "log" }>;
    expect(escalationLog.data).toMatchObject({
      nearEndProbe: true,
      noProgressWindowMs: STALL_NO_PROGRESS_WINDOW_NEAR_END_MS,
      attempts: 2,
      maxChannelRecoveryAttempts: STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END,
    });
  });

  it("takes the refresh path on the last allowed normal-window attempt (recoveryCount reaches budget)", () => {
    // recoveryCount: 1 → evaluateNoProgressStall increments to 2
    // maxChannelRecoveryAttempts = STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS = 2
    // allowChannelRecovery = 2 <= 2 → true
    // No alternate channel → refresh path
    const tracker: WatchStallTracker = {
      key: trackerKey,
      lastEarnedMinutes: 10,
      lastProgressAt: 0,
      lastActionAt: 0,
      recoveryCount: 1,
    };
    const result = decideNoProgressRecovery({
      ...noProgressBase,
      tracker,
      now: STALL_NO_PROGRESS_WINDOW_MS + 1,
      channels: [channel("w1", "streamer")], // only the watched channel → no alternate
    });
    expect(result.actions.map((a) => a.kind)).toEqual([
      "log",
      "refresh-channels",
      "refresh-inventory",
    ]);
    const refreshLog = result.actions[0] as Extract<StallRecoveryAction, { kind: "log" }>;
    expect(refreshLog.data).toMatchObject({
      attempts: 2,
      nearEndProbe: false,
      noProgressWindowMs: STALL_NO_PROGRESS_WINDOW_MS,
    });
  });
});
