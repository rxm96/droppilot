import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import { DropChannelRestriction } from "@renderer/shared/domain/dropDomain";

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
