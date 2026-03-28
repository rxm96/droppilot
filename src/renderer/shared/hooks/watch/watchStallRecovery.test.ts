import { describe, expect, it } from "vitest";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import {
  WATCH_STALL_RECOVERY_INITIAL_STATE,
  advanceWatchStallRecovery,
  buildWatchStallTrackerKey,
  evaluateNoProgressStall,
  pickStallRecoveryChannel,
  shouldResetWatchStallRecoveryOnIdle,
  type WatchStallRecoveryState,
  shouldProbeNoProgressConfirmation,
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

it("moves from healthy to suspect_no_progress before taking action", () => {
  const first = advanceWatchStallRecovery({
    state: WATCH_STALL_RECOVERY_INITIAL_STATE,
    key: "game:drop-1",
    earnedMinutes: 5,
    now: 0,
    lastWatchOk: 0,
    noProgressWindowMs: 10_000,
  });

  const second = advanceWatchStallRecovery({
    state: first.state,
    key: "game:drop-1",
    earnedMinutes: 5,
    now: 10_001,
    lastWatchOk: 9_500,
    noProgressWindowMs: 10_000,
  });

  expect(second.state.phase).toBe("suspect_no_progress");
  expect(second.action.type).toBe("none");
});

it("resets back to healthy immediately when earned minutes increase", () => {
  const stalled: WatchStallRecoveryState = {
    phase: "same_game_cooloff",
    key: "game:drop-1",
    targetGame: null,
    dropId: null,
    lastEarnedMinutes: 5,
    lastProgressAt: 0,
    lastWatchOk: 0,
    sameGameRetryCount: 1,
    lastRecoveryActionAt: null,
    lastProbeAt: null,
    escalationReason: null,
  };

  const next = advanceWatchStallRecovery({
    state: stalled,
    key: "game:drop-1",
    earnedMinutes: 6,
    now: 12_000,
    lastWatchOk: 11_500,
    noProgressWindowMs: 10_000,
  });

  expect(next.state.phase).toBe("healthy");
  expect(next.state.sameGameRetryCount).toBe(0);
  expect(next.action.type).toBe("none");
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

  it("re-arms idle recovery only after a terminal escalation, not during same-game retry", () => {
    expect(
      shouldResetWatchStallRecoveryOnIdle({
        ...WATCH_STALL_RECOVERY_INITIAL_STATE,
        phase: "escalate_to_next_game",
        key: "game:drop-1",
        targetGame: "Game",
        dropId: "drop-1",
      }),
    ).toBe(true);

    expect(
      shouldResetWatchStallRecoveryOnIdle({
        ...WATCH_STALL_RECOVERY_INITIAL_STATE,
        phase: "same_game_retry",
        key: "game:drop-1",
        targetGame: "Game",
        dropId: "drop-1",
        sameGameRetryCount: 1,
      }),
    ).toBe(false);
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

  it("allows the first recovery when the tracker has no prior action", () => {
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
    expect(firstRecovery.tracker.lastActionAt).toBe(10_001);
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

  it("resets stall tracking when earned minutes increase and clears cooldown state", () => {
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
    expect(progressed.tracker.lastActionAt).toBe(null);
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

  it("does not treat a regressive earned-minutes snapshot as new progress", () => {
    const tracker = {
      key: "k",
      lastEarnedMinutes: 6,
      lastProgressAt: 8_000,
      lastActionAt: 7_000,
      recoveryCount: 1,
    };

    const next = evaluateNoProgressStall({
      tracker,
      key: "k",
      earnedMinutes: 5,
      now: 12_000,
      noProgressWindowMs: 10_000,
      actionCooldownMs: 1_000,
    });

    expect(next.shouldRecover).toBe(false);
    expect(next.tracker.lastEarnedMinutes).toBe(6);
    expect(next.tracker.lastActionAt).toBe(7_000);
    expect(next.tracker.recoveryCount).toBe(1);
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
      lastProbeAt: null,
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
        lastProbeAt: null,
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
        lastProbeAt: null,
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

  it("requests a confirmation probe once before recovering on the next unchanged evaluation", () => {
    const watching: WatchingState = {
      id: "1",
      channelId: "1",
      login: "alpha",
      name: "Alpha",
      game: "Game",
    };

    const healthy = advanceWatchStallRecovery({
      state: WATCH_STALL_RECOVERY_INITIAL_STATE,
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 0,
      lastWatchOk: 0,
      noProgressWindowMs: 10_000,
    });

    const suspect = advanceWatchStallRecovery({
      state: healthy.state,
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_001,
      lastWatchOk: 9_500,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [
        makeChannel({ id: "1", login: "alpha", game: "Game" }),
        makeChannel({ id: "2", login: "beta", game: "Game", displayName: "Beta" }),
      ],
      watching,
      drop: {
        id: "drop-1",
        earnedMinutes: 5,
        allowedChannelIds: ["2"],
      },
    });

    const confirming = advanceWatchStallRecovery({
      state: suspect.state,
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_501,
      lastWatchOk: 10_000,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [
        makeChannel({ id: "1", login: "alpha", game: "Game" }),
        makeChannel({ id: "2", login: "beta", game: "Game", displayName: "Beta" }),
      ],
      watching,
      drop: {
        id: "drop-1",
        earnedMinutes: 5,
        allowedChannelIds: ["2"],
      },
    });

    expect(healthy.state.phase).toBe("healthy");
    expect(healthy.action.type).toBe("none");
    expect(suspect.state.phase).toBe("suspect_no_progress");
    expect(suspect.action.type).toBe("request_confirmation_probe");
    expect(suspect.state.lastProbeAt).toBe(10_001);
    expect(confirming.state.phase).toBe("same_game_retry");
    expect(confirming.state.sameGameRetryCount).toBe(1);
    expect(confirming.action).toEqual({ type: "switch_same_game_channel", channelId: "2" });
  });

  it("recovers immediately on the first unchanged evaluation after a confirmation probe", () => {
    const watching: WatchingState = {
      id: "1",
      channelId: "1",
      login: "alpha",
      name: "Alpha",
      game: "Game",
    };

    const next = advanceWatchStallRecovery({
      state: {
        ...WATCH_STALL_RECOVERY_INITIAL_STATE,
        phase: "suspect_no_progress",
        key: "game:drop-1",
        targetGame: "Game",
        dropId: "drop-1",
        lastEarnedMinutes: 5,
        lastProgressAt: 0,
        lastWatchOk: 9_500,
        lastProbeAt: 10_000,
      },
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_500,
      lastWatchOk: 10_250,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [
        makeChannel({ id: "1", login: "alpha", game: "Game" }),
        makeChannel({ id: "2", login: "beta", game: "Game", displayName: "Beta" }),
      ],
      watching,
      drop: {
        id: "drop-1",
        earnedMinutes: 5,
        allowedChannelIds: ["2"],
      },
    });

    expect(next.state.phase).toBe("same_game_retry");
    expect(next.state.sameGameRetryCount).toBe(1);
    expect(next.action).toEqual({ type: "switch_same_game_channel", channelId: "2" });
  });

  it("stays probe-free when confirmation probing is disabled", () => {
    const healthy = advanceWatchStallRecovery({
      state: WATCH_STALL_RECOVERY_INITIAL_STATE,
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 0,
      lastWatchOk: 0,
      noProgressWindowMs: 10_000,
    });

    const suspect = advanceWatchStallRecovery({
      state: healthy.state,
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_001,
      lastWatchOk: 9_500,
      noProgressWindowMs: 10_000,
      probeLeadMs: 0,
      probeCooldownMs: 0,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [],
      watching: null,
      drop: null,
    });

    const confirming = advanceWatchStallRecovery({
      state: suspect.state,
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_500,
      lastWatchOk: 10_250,
      noProgressWindowMs: 10_000,
      probeLeadMs: 0,
      probeCooldownMs: 0,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [],
      watching: null,
      drop: null,
    });

    expect(healthy.action.type).toBe("none");
    expect(suspect.state.phase).toBe("suspect_no_progress");
    expect(suspect.action.type).toBe("none");
    expect(suspect.state.lastProbeAt).toBe(null);
    expect(confirming.state.phase).toBe("confirming_stall");
    expect(confirming.action.type).toBe("none");
  });

  it("derives targetGame from the live watching state before escalation", () => {
    const watching: WatchingState = {
      id: "1",
      channelId: "1",
      login: "alpha",
      name: "Alpha",
      game: "Game",
    };

    const next = advanceWatchStallRecovery({
      state: {
        ...WATCH_STALL_RECOVERY_INITIAL_STATE,
        phase: "confirming_stall",
        key: "game:drop-1",
        targetGame: null,
        dropId: "drop-1",
        lastEarnedMinutes: 5,
        lastProgressAt: 0,
        lastWatchOk: 9_500,
        sameGameRetryCount: 2,
        lastRecoveryActionAt: 4_000,
      },
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_001,
      lastWatchOk: 9_500,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [],
      watching,
      drop: { id: "drop-1", earnedMinutes: 5 },
    });

    expect(next.state.targetGame).toBe("Game");
    expect(next.state.phase).toBe("escalate_to_next_game");
    expect(next.action).toEqual({ type: "suppress_and_escalate", targetGame: "Game" });
  });

  it("switches to a same-game candidate before any cross-game fallback", () => {
    const watching: WatchingState = {
      id: "1",
      channelId: "1",
      login: "alpha",
      name: "Alpha",
      game: "Game",
    };

    const next = advanceWatchStallRecovery({
      state: {
        ...WATCH_STALL_RECOVERY_INITIAL_STATE,
        phase: "confirming_stall",
        key: "game:drop-1",
        targetGame: "Game",
        dropId: "drop-1",
        lastEarnedMinutes: 5,
        lastProgressAt: 0,
        lastWatchOk: 9_500,
      },
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_001,
      lastWatchOk: 9_500,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [
        makeChannel({ id: "3", login: "gamma", game: "OtherGame", displayName: "Gamma" }),
        makeChannel({ id: "2", login: "beta", game: "Game", displayName: "Beta" }),
      ],
      watching,
      drop: {
        id: "drop-1",
        earnedMinutes: 5,
        allowedChannelIds: ["2", "3"],
      },
    });

    expect(next.state.phase).toBe("same_game_retry");
    expect(next.action).toEqual({ type: "switch_same_game_channel", channelId: "2" });
  });

  it("does not spend another same-game retry once the budget is exhausted", () => {
    const watching: WatchingState = {
      id: "1",
      channelId: "1",
      login: "alpha",
      name: "Alpha",
      game: "Game",
    };

    const next = advanceWatchStallRecovery({
      state: {
        ...WATCH_STALL_RECOVERY_INITIAL_STATE,
        phase: "same_game_retry",
        key: "game:drop-1",
        targetGame: "Game",
        dropId: "drop-1",
        lastEarnedMinutes: 5,
        lastProgressAt: 0,
        lastWatchOk: 9_500,
        sameGameRetryCount: 2,
        lastRecoveryActionAt: 4_000,
      },
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_001,
      lastWatchOk: 9_500,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [makeChannel({ id: "2", login: "beta", game: "Game", displayName: "Beta" })],
      watching,
      drop: {
        id: "drop-1",
        earnedMinutes: 5,
        allowedChannelIds: ["2"],
      },
    });

    expect(next.state.phase).toBe("escalate_to_next_game");
    expect(next.state.escalationReason).toBe("retries_exhausted");
    expect(next.action).toEqual({ type: "suppress_and_escalate", targetGame: "Game" });
  });

  it("records no_viable_same_game_path and returns a safe action when no target game is available", () => {
    const next = advanceWatchStallRecovery({
      state: {
        ...WATCH_STALL_RECOVERY_INITIAL_STATE,
        phase: "same_game_cooloff",
        key: "game:drop-1",
        targetGame: null,
        dropId: null,
        lastEarnedMinutes: 5,
        lastProgressAt: 0,
        lastWatchOk: 9_500,
        sameGameRetryCount: 2,
        lastRecoveryActionAt: 4_000,
      },
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_001,
      lastWatchOk: 9_500,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [],
      watching: null,
      drop: {
        id: "drop-1",
        earnedMinutes: 5,
      },
    });

    expect(next.state.dropId).toBe("drop-1");
    expect(next.state.escalationReason).toBe("no_viable_same_game_path");
    expect(next.action).toEqual({ type: "none" });
  });

  it("honors cooldown before escalating after the final same-game retry", () => {
    const cooledOff = advanceWatchStallRecovery({
      state: {
        ...WATCH_STALL_RECOVERY_INITIAL_STATE,
        phase: "same_game_retry",
        key: "game:drop-1",
        targetGame: "Game",
        dropId: "drop-1",
        lastEarnedMinutes: 5,
        lastProgressAt: 0,
        lastWatchOk: 9_500,
        sameGameRetryCount: 2,
        lastRecoveryActionAt: 9_500,
      },
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_001,
      lastWatchOk: 9_500,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [],
      watching: null,
      drop: { id: "drop-1", earnedMinutes: 5 },
    });

    expect(cooledOff.state.phase).toBe("same_game_cooloff");
    expect(cooledOff.action).toEqual({ type: "enter_cooloff" });

    const escalated = advanceWatchStallRecovery({
      state: cooledOff.state,
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 16_001,
      lastWatchOk: 15_500,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [],
      watching: null,
      drop: { id: "drop-1", earnedMinutes: 5 },
    });

    expect(escalated.state.phase).toBe("escalate_to_next_game");
    expect(escalated.state.escalationReason).toBe("retries_exhausted");
    expect(escalated.action).toEqual({ type: "suppress_and_escalate", targetGame: "Game" });
  });

  it("does not re-emit enter_cooloff on repeated in-window cooloff ticks", () => {
    const cooledOff = advanceWatchStallRecovery({
      state: {
        ...WATCH_STALL_RECOVERY_INITIAL_STATE,
        phase: "same_game_retry",
        key: "game:drop-1",
        targetGame: "Game",
        dropId: "drop-1",
        lastEarnedMinutes: 5,
        lastProgressAt: 0,
        lastWatchOk: 9_500,
        sameGameRetryCount: 1,
        lastRecoveryActionAt: 9_500,
      },
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_001,
      lastWatchOk: 9_500,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [],
      watching: null,
      drop: { id: "drop-1", earnedMinutes: 5 },
    });

    expect(cooledOff.state.phase).toBe("same_game_cooloff");
    expect(cooledOff.action).toEqual({ type: "enter_cooloff" });

    const repeated = advanceWatchStallRecovery({
      state: cooledOff.state,
      key: "game:drop-1",
      earnedMinutes: 5,
      now: 10_500,
      lastWatchOk: 10_250,
      noProgressWindowMs: 10_000,
      probeLeadMs: 2_000,
      probeCooldownMs: 1_000,
      actionCooldownMs: 5_000,
      maxSameGameRetries: 2,
      channels: [],
      watching: null,
      drop: { id: "drop-1", earnedMinutes: 5 },
    });

    expect(repeated.state.phase).toBe("same_game_cooloff");
    expect(repeated.action).toEqual({ type: "none" });
  });
});
