import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import { DropChannelRestriction } from "@renderer/shared/domain/dropDomain";

export type StallRecoveryDrop = {
  id: string;
  earnedMinutes: number;
  allowedChannelIds?: string[];
  allowedChannelLogins?: string[];
};

export type WatchStallRecoveryPhase =
  | "healthy"
  | "suspect_no_progress"
  | "confirming_stall"
  | "same_game_retry"
  | "same_game_cooloff"
  | "escalate_to_next_game";

export type WatchStallRecoveryState = {
  phase: WatchStallRecoveryPhase;
  key: string | null;
  targetGame: string | null;
  dropId: string | null;
  lastEarnedMinutes: number | null;
  lastProgressAt: number | null;
  lastWatchOk: number | null;
  sameGameRetryCount: number;
  lastRecoveryActionAt: number | null;
  lastProbeAt: number | null;
  escalationReason: "retries_exhausted" | "no_viable_same_game_path" | null;
};

export const WATCH_STALL_RECOVERY_INITIAL_STATE: WatchStallRecoveryState = {
  phase: "healthy",
  key: null,
  targetGame: null,
  dropId: null,
  lastEarnedMinutes: null,
  lastProgressAt: null,
  lastWatchOk: null,
  sameGameRetryCount: 0,
  lastRecoveryActionAt: null,
  lastProbeAt: null,
  escalationReason: null,
};

export type AdvanceWatchStallRecoveryInput = {
  state: WatchStallRecoveryState;
  key: string;
  earnedMinutes: number;
  now: number;
  lastWatchOk: number;
  noProgressWindowMs: number;
  probeLeadMs?: number;
  probeCooldownMs?: number;
  actionCooldownMs?: number;
  maxSameGameRetries?: number;
  channels?: ChannelEntry[];
  watching?: WatchingState | null;
  drop?: StallRecoveryDrop | null;
};

export type WatchStallRecoveryAction =
  | { type: "none" }
  | { type: "request_confirmation_probe" }
  | { type: "switch_same_game_channel"; channelId: string }
  | { type: "restart_same_game_watch" }
  | { type: "enter_cooloff" }
  | { type: "suppress_and_escalate"; targetGame: string };

export type AdvanceWatchStallRecoveryResult = {
  state: WatchStallRecoveryState;
  action: WatchStallRecoveryAction;
};

export const shouldResetWatchStallRecoveryOnIdle = (
  state: WatchStallRecoveryState,
): boolean => state.phase === "escalate_to_next_game";

export type WatchStallTracker = {
  key: string;
  lastEarnedMinutes: number;
  lastProgressAt: number;
  lastActionAt: number | null;
  recoveryCount: number;
};

const resolveWatchingId = (watching: WatchingState): string =>
  String(watching?.channelId ?? watching?.id ?? "").trim();

const resolveWatchingLogin = (watching: WatchingState): string =>
  String(watching?.login ?? watching?.name ?? "")
    .trim()
    .toLowerCase();

const isSameAsWatching = (channel: ChannelEntry, watching: WatchingState): boolean => {
  if (!watching) return false;
  const watchingId = resolveWatchingId(watching);
  if (watchingId && channel.id === watchingId) return true;
  const watchingLogin = resolveWatchingLogin(watching);
  if (watchingLogin && channel.login.trim().toLowerCase() === watchingLogin) return true;
  return false;
};

const canFarmDropOnChannel = (
  channel: ChannelEntry,
  restriction: DropChannelRestriction,
): boolean => {
  return restriction.allowsChannel(channel);
};

const normalizeGame = (value: string | null | undefined): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const isSameGameChannel = (channel: ChannelEntry, targetGame: string | null): boolean => {
  const normalizedTargetGame = normalizeGame(targetGame);
  if (!normalizedTargetGame) return false;
  return normalizeGame(channel.game) === normalizedTargetGame;
};

const pickSameGameStallRecoveryChannel = ({
  channels,
  watching,
  drop,
  targetGame,
}: {
  channels: ChannelEntry[];
  watching: WatchingState;
  drop: StallRecoveryDrop;
  targetGame: string | null;
}): ChannelEntry | null => {
  if (!targetGame) return null;
  const restriction = new DropChannelRestriction({
    ids: drop.allowedChannelIds,
    logins: drop.allowedChannelLogins,
  });
  for (const channel of channels) {
    if (isSameAsWatching(channel, watching)) continue;
    if (!isSameGameChannel(channel, targetGame)) continue;
    if (!canFarmDropOnChannel(channel, restriction)) continue;
    return channel;
  }
  return null;
};

export const buildWatchStallTrackerKey = (watching: WatchingState, dropId: string): string => {
  const gameKey = String(watching?.game ?? watching?.channelId ?? watching?.id ?? "")
    .trim()
    .toLowerCase();
  return `${gameKey}:${dropId}`;
};

const resolveTargetGame = (
  state: WatchStallRecoveryState,
  watching: WatchingState | null,
): string | null => {
  const targetGame = String(state.targetGame ?? watching?.game ?? "").trim();
  return targetGame ? targetGame : null;
};

const resolveDropId = (state: WatchStallRecoveryState, drop: StallRecoveryDrop | null): string | null => {
  const dropId = String(state.dropId ?? drop?.id ?? "").trim();
  return dropId ? dropId : null;
};

const buildExhaustedSameGameOutcome = ({
  state,
  now,
  lastWatchOk,
}: {
  state: WatchStallRecoveryState;
  now: number;
  lastWatchOk: number;
}): AdvanceWatchStallRecoveryResult => {
  const targetGame = state.targetGame;
  if (!targetGame) {
    return {
      state: {
        ...state,
        phase: "escalate_to_next_game",
        escalationReason: "no_viable_same_game_path",
        lastRecoveryActionAt: now,
        lastWatchOk,
      },
      action: { type: "none" },
    };
  }
  return {
    state: {
      ...state,
      phase: "escalate_to_next_game",
      escalationReason: "retries_exhausted",
      lastRecoveryActionAt: now,
      lastWatchOk,
    },
    action: { type: "suppress_and_escalate", targetGame },
  };
};

const advanceFromConfirmingStall = ({
  state,
  now,
  lastWatchOk,
  maxSameGameRetries,
  channels,
  watching,
  drop,
}: {
  state: WatchStallRecoveryState;
  now: number;
  lastWatchOk: number;
  maxSameGameRetries: number;
  channels: ChannelEntry[];
  watching: WatchingState | null;
  drop: StallRecoveryDrop | null;
}): AdvanceWatchStallRecoveryResult => {
  if (state.sameGameRetryCount >= maxSameGameRetries) {
    return buildExhaustedSameGameOutcome({
      state,
      now,
      lastWatchOk,
    });
  }
  const nextChannel =
    drop && watching
      ? pickSameGameStallRecoveryChannel({
          channels,
          watching,
          drop,
          targetGame: state.targetGame,
        })
      : null;
  if (nextChannel) {
    return {
      state: {
        ...state,
        phase: "same_game_retry",
        targetGame: state.targetGame,
        dropId: state.dropId,
        sameGameRetryCount: state.sameGameRetryCount + 1,
        lastRecoveryActionAt: now,
        lastWatchOk,
      },
      action: { type: "switch_same_game_channel", channelId: nextChannel.id },
    };
  }
  if (state.sameGameRetryCount < maxSameGameRetries) {
    return {
      state: {
        ...state,
        phase: "same_game_retry",
        targetGame: state.targetGame,
        dropId: state.dropId,
        sameGameRetryCount: state.sameGameRetryCount + 1,
        lastRecoveryActionAt: now,
        lastWatchOk,
      },
      action: { type: "restart_same_game_watch" },
    };
  }
  return buildExhaustedSameGameOutcome({
    state,
    now,
    lastWatchOk,
  });
};

export const advanceWatchStallRecovery = ({
  state,
  key,
  earnedMinutes,
  now,
  lastWatchOk,
  noProgressWindowMs,
  probeLeadMs = 0,
  probeCooldownMs = 0,
  actionCooldownMs = 0,
  maxSameGameRetries = 0,
  channels = [],
  watching = null,
  drop = null,
}: AdvanceWatchStallRecoveryInput): AdvanceWatchStallRecoveryResult => {
  const isNewKey = state.key === null || state.key !== key;
  const baseState = isNewKey
    ? {
        ...WATCH_STALL_RECOVERY_INITIAL_STATE,
        phase: "healthy" as const,
        key,
        lastEarnedMinutes: earnedMinutes,
        lastProgressAt: now,
        lastWatchOk,
    }
    : state;
  const targetGame = resolveTargetGame(baseState, watching);
  const dropId = resolveDropId(baseState, drop);
  const stateWithContext = {
    ...baseState,
    targetGame: targetGame ?? baseState.targetGame,
    dropId: dropId ?? baseState.dropId,
  };

  if (stateWithContext.lastEarnedMinutes !== null && earnedMinutes > stateWithContext.lastEarnedMinutes) {
    return {
      state: {
        ...stateWithContext,
        phase: "healthy",
        targetGame: stateWithContext.targetGame,
        dropId: stateWithContext.dropId,
        lastEarnedMinutes: earnedMinutes,
        lastProgressAt: now,
        lastWatchOk,
        sameGameRetryCount: 0,
        lastRecoveryActionAt: null,
        lastProbeAt: null,
        escalationReason: null,
      },
      action: { type: "none" },
    };
  }

  if (
    stateWithContext.phase === "healthy" &&
    stateWithContext.lastProgressAt !== null &&
    now - stateWithContext.lastProgressAt >= noProgressWindowMs
  ) {
    const shouldRequestProbe = probeLeadMs > 0 || probeCooldownMs > 0;
    return {
      state: {
        ...stateWithContext,
        phase: "suspect_no_progress",
        targetGame: stateWithContext.targetGame,
        lastProbeAt: shouldRequestProbe ? now : stateWithContext.lastProbeAt,
        lastWatchOk,
      },
      action: shouldRequestProbe ? { type: "request_confirmation_probe" } : { type: "none" },
    };
  }

  if (stateWithContext.phase === "suspect_no_progress") {
    const hasRequestedProbe = stateWithContext.lastProbeAt !== null;
    if (hasRequestedProbe) {
      return advanceFromConfirmingStall({
        state: {
          ...stateWithContext,
          phase: "confirming_stall",
          targetGame: stateWithContext.targetGame,
          dropId: stateWithContext.dropId,
          lastWatchOk,
        },
        now,
        lastWatchOk,
        maxSameGameRetries,
        channels,
        watching,
        drop,
      });
    }
    if (probeLeadMs <= 0 && probeCooldownMs <= 0) {
      return {
        state: {
          ...stateWithContext,
          phase: "confirming_stall",
          targetGame: stateWithContext.targetGame,
          dropId: stateWithContext.dropId,
          lastWatchOk,
        },
        action: { type: "none" },
      };
    }
    return {
      state: {
        ...stateWithContext,
        phase: "confirming_stall",
        targetGame: stateWithContext.targetGame,
        lastWatchOk,
      },
      action: { type: "request_confirmation_probe" },
    };
  }

  if (stateWithContext.phase === "confirming_stall") {
    return advanceFromConfirmingStall({
      state: stateWithContext,
      now,
      lastWatchOk,
      maxSameGameRetries,
      channels,
      watching,
      drop,
    });
  }

  if (stateWithContext.phase === "same_game_retry" || stateWithContext.phase === "same_game_cooloff") {
    if (
      stateWithContext.phase === "same_game_cooloff" &&
      stateWithContext.lastRecoveryActionAt !== null &&
      now - stateWithContext.lastRecoveryActionAt < actionCooldownMs
    ) {
      return {
        state: {
          ...stateWithContext,
          targetGame: stateWithContext.targetGame,
          dropId: stateWithContext.dropId,
          lastWatchOk,
        },
        action: { type: "none" },
      };
    }
    if (
      stateWithContext.lastRecoveryActionAt !== null &&
      now - stateWithContext.lastRecoveryActionAt < actionCooldownMs
    ) {
      return {
        state: {
          ...stateWithContext,
          phase: "same_game_cooloff",
          targetGame: stateWithContext.targetGame,
          dropId: stateWithContext.dropId,
          lastWatchOk,
        },
        action: { type: "enter_cooloff" },
      };
    }
    if (stateWithContext.sameGameRetryCount >= maxSameGameRetries) {
      return buildExhaustedSameGameOutcome({
        state: stateWithContext,
        now,
        lastWatchOk,
      });
    }
    return {
      state: {
        ...stateWithContext,
        phase: "confirming_stall",
        targetGame: stateWithContext.targetGame,
        dropId: stateWithContext.dropId,
        lastWatchOk,
      },
      action: { type: "none" },
    };
  }

  return {
    state: {
      ...stateWithContext,
      lastWatchOk,
    },
    action: { type: "none" },
  };
};

export const evaluateNoProgressStall = ({
  tracker,
  key,
  earnedMinutes,
  now,
  noProgressWindowMs,
  actionCooldownMs,
}: {
  tracker: WatchStallTracker | null;
  key: string;
  earnedMinutes: number;
  now: number;
  noProgressWindowMs: number;
  actionCooldownMs: number;
}): { tracker: WatchStallTracker; shouldRecover: boolean } => {
  if (!tracker || tracker.key !== key) {
    return {
      tracker: {
        key,
        lastEarnedMinutes: earnedMinutes,
        lastProgressAt: now,
        lastActionAt: null,
        recoveryCount: 0,
      },
      shouldRecover: false,
    };
  }

  if (earnedMinutes > tracker.lastEarnedMinutes) {
    return {
      tracker: {
        ...tracker,
        lastEarnedMinutes: earnedMinutes,
        lastProgressAt: now,
        lastActionAt: null,
        recoveryCount: 0,
      },
      shouldRecover: false,
    };
  }

  if (now - tracker.lastProgressAt < noProgressWindowMs) {
    return { tracker, shouldRecover: false };
  }
  if (tracker.lastActionAt !== null && now - tracker.lastActionAt < actionCooldownMs) {
    return { tracker, shouldRecover: false };
  }

  return {
    tracker: {
      ...tracker,
      lastActionAt: now,
      recoveryCount: tracker.recoveryCount + 1,
    },
    shouldRecover: true,
  };
};

export const shouldProbeNoProgressConfirmation = ({
  tracker,
  key,
  now,
  noProgressWindowMs,
  probeLeadMs,
  lastWatchOk,
  watchPingGraceMs,
  lastProbeAt,
  probeCooldownMs,
}: {
  tracker: WatchStallTracker | null;
  key: string;
  now: number;
  noProgressWindowMs: number;
  probeLeadMs: number;
  lastWatchOk: number;
  watchPingGraceMs: number;
  lastProbeAt: number | null;
  probeCooldownMs: number;
}): boolean => {
  if (!tracker || tracker.key !== key) return false;
  if (lastWatchOk <= tracker.lastProgressAt) return false;
  if (now - lastWatchOk > watchPingGraceMs) return false;
  const probeAt = tracker.lastProgressAt + Math.max(0, noProgressWindowMs - probeLeadMs);
  if (now < probeAt) return false;
  if (now >= tracker.lastProgressAt + noProgressWindowMs) return false;
  if (
    lastProbeAt !== null &&
    lastProbeAt >= tracker.lastProgressAt &&
    now - lastProbeAt < probeCooldownMs
  ) {
    return false;
  }
  return true;
};

export const pickStallRecoveryChannel = ({
  channels,
  watching,
  drop,
}: {
  channels: ChannelEntry[];
  watching: WatchingState;
  drop: StallRecoveryDrop;
}): ChannelEntry | null => {
  if (!watching) return null;
  const restriction = new DropChannelRestriction({
    ids: drop.allowedChannelIds,
    logins: drop.allowedChannelLogins,
  });
  for (const channel of channels) {
    if (isSameAsWatching(channel, watching)) continue;
    if (!canFarmDropOnChannel(channel, restriction)) continue;
    return channel;
  }
  return null;
};
