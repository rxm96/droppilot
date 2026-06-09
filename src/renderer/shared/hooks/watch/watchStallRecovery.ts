import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import { DropChannelRestriction } from "@renderer/shared/domain/dropDomain";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { CooldownReason } from "./gameCooldowns";

export const STALL_NO_PROGRESS_WINDOW_MS = 15 * 60_000;
export const STALL_NO_PROGRESS_WINDOW_NEAR_END_MS = 3 * 60_000;
export const STALL_RECOVERY_COOLDOWN_MS = 60_000;
export const STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS = 2;
export const STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END = 1;
export const STALL_CONFIRMATION_PROBE_COOLDOWN_MS = 60_000;
export const NO_FARMABLE_DROP_GRACE_MS = 30_000;
export const NO_FARMABLE_GAME_COOLDOWN_MS = 10 * 60_000;
export const NO_PROGRESS_GAME_COOLDOWN_MS = 30 * 60_000;

/**
 * Effect descriptors returned by the decide* functions. The useStallRecovery
 * executor maps them 1:1 onto setters/dispatches and logs `log` actions via
 * logInfo — decisions stay pure and unit-testable, log lines stay identical.
 */
export type StallRecoveryAction =
  | { kind: "log"; message: string; data: Record<string, unknown> }
  | { kind: "switch-channel"; channel: ChannelEntry }
  | { kind: "set-cooldown"; game: string; durationMs: number; reason: CooldownReason }
  | { kind: "retarget"; to: string }
  | { kind: "enable-auto-select" }
  | { kind: "stop-watching" }
  | { kind: "dispatch-stall-stop"; game: string; context: string }
  | { kind: "refresh-channels"; game: string }
  | { kind: "refresh-inventory" };

/** "Watching with no farmable drop" grace-period marker (was noFarmableDropRef). */
export type NoFarmableMarker = { key: string; sinceAt: number };

export type IdleNoFarmableInput = {
  allowWatching: boolean;
  autoSelectEnabled: boolean;
  targetGame: string;
  activeTargetGame: string;
  channelAllowlist: ChannelAllowlist;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  noFarmable: NoFarmableMarker | null;
  getNextTargetGame: (currentGame: string) => string;
};

export type StallRecoveryDecision = {
  actions: StallRecoveryAction[];
  noFarmable: NoFarmableMarker | null;
};

/**
 * Idle branch (not watching): if the target's drops are restricted to specific
 * channels and none of them is live, cool the game down and move the target on.
 */
export const decideIdleNoFarmable = (input: IdleNoFarmableInput): StallRecoveryDecision => {
  const {
    allowWatching,
    autoSelectEnabled,
    targetGame,
    activeTargetGame,
    channelAllowlist,
    channels,
    channelsLoading,
    channelsRefreshing,
    noFarmable,
    getNextTargetGame,
  } = input;
  const shouldEvaluateIdleNoFarmable = allowWatching && autoSelectEnabled && !!targetGame;
  if (!shouldEvaluateIdleNoFarmable) {
    return { actions: [], noFarmable: null };
  }
  const allowlistRestriction = DropChannelRestriction.fromAllowlist(channelAllowlist);
  if (!allowlistRestriction.hasConstraints) {
    return { actions: [], noFarmable: null };
  }
  if ((channelsLoading || channelsRefreshing) && channels.length === 0) {
    // Snapshot still loading — keep the marker untouched (matches the old
    // early-return that skipped the `noFarmableDropRef.current = null` reset).
    return { actions: [], noFarmable };
  }
  const hasAllowlistedChannel = channels.some((channel) =>
    allowlistRestriction.allowsChannel(channel),
  );
  if (hasAllowlistedChannel) {
    return { actions: [], noFarmable: null };
  }
  const stalledGame = activeTargetGame.trim() || targetGame.trim();
  const currentForRetarget = activeTargetGame.trim() || targetGame.trim();
  const nextTargetGame = currentForRetarget ? getNextTargetGame(currentForRetarget) : "";
  const actions: StallRecoveryAction[] = [
    {
      kind: "set-cooldown",
      game: stalledGame,
      durationMs: NO_FARMABLE_GAME_COOLDOWN_MS,
      reason: "stall-no-farmable",
    },
    {
      kind: "log",
      message: "watch-engine: no-farmable idle evaluate",
      data: {
        from: currentForRetarget || null,
        to: nextTargetGame || null,
        channelsCount: channels.length,
        allowlistActive: allowlistRestriction.hasConstraints,
      },
    },
  ];
  if (nextTargetGame) {
    actions.push(
      {
        kind: "log",
        message: "watch-engine: retarget",
        data: {
          reason: "stall-no-farmable-idle",
          from: activeTargetGame || targetGame || null,
          to: nextTargetGame,
        },
      },
      { kind: "retarget", to: nextTargetGame },
    );
  } else {
    actions.push({
      kind: "log",
      message: "watch-engine: retarget skipped",
      data: {
        reason: "stall-no-farmable-idle-no-next-target",
        from: activeTargetGame || targetGame || null,
      },
    });
  }
  actions.push(
    { kind: "enable-auto-select" },
    {
      kind: "dispatch-stall-stop",
      game: stalledGame || activeTargetGame,
      context: "stall-no-farmable",
    },
  );
  return { actions, noFarmable: null };
};

/**
 * "Near end" threshold shared by two consumers: at or below this predicted
 * remaining time, the claim probe starts running (useClaimProbe), and the
 * no-progress stall check switches to its tighter near-end window
 * (STALL_NO_PROGRESS_WINDOW_NEAR_END_MS).
 */
export const CLAIM_PROBE_NEAR_END_MINUTES = 1;

export type StallRecoveryDrop = {
  id: string;
  earnedMinutes: number;
  allowedChannelIds?: string[];
  allowedChannelLogins?: string[];
};

export type WatchStallTracker = {
  key: string;
  lastEarnedMinutes: number;
  lastProgressAt: number;
  lastActionAt: number;
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

export const buildWatchStallTrackerKey = (watching: WatchingState, dropId: string): string => {
  const gameKey = String(watching?.game ?? watching?.channelId ?? watching?.id ?? "")
    .trim()
    .toLowerCase();
  return `${gameKey}:${dropId}`;
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
        lastActionAt: 0,
        recoveryCount: 0,
      },
      shouldRecover: false,
    };
  }

  if (earnedMinutes !== tracker.lastEarnedMinutes) {
    return {
      tracker: {
        ...tracker,
        lastEarnedMinutes: earnedMinutes,
        lastProgressAt: now,
        recoveryCount: 0,
      },
      shouldRecover: false,
    };
  }

  if (now - tracker.lastProgressAt < noProgressWindowMs) {
    return { tracker, shouldRecover: false };
  }
  if (now - tracker.lastActionAt < actionCooldownMs) {
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
  lastProbeAt: number;
  probeCooldownMs: number;
}): boolean => {
  if (!tracker || tracker.key !== key) return false;
  if (lastWatchOk <= tracker.lastProgressAt) return false;
  if (now - lastWatchOk > watchPingGraceMs) return false;
  const probeAt = tracker.lastProgressAt + Math.max(0, noProgressWindowMs - probeLeadMs);
  if (now < probeAt) return false;
  if (now >= tracker.lastProgressAt + noProgressWindowMs) return false;
  if (lastProbeAt >= tracker.lastProgressAt && now - lastProbeAt < probeCooldownMs) return false;
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
