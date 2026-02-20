import type { ChannelEntry, WatchingState } from "@renderer/shared/types";

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
};

const normalizeIds = (values?: string[]): Set<string> =>
  new Set((values ?? []).map((value) => String(value).trim()).filter((value) => value.length > 0));

const normalizeLogins = (values?: string[]): Set<string> =>
  new Set(
    (values ?? []).map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0),
  );

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

const canFarmDropOnChannel = (channel: ChannelEntry, drop: StallRecoveryDrop): boolean => {
  const allowedIds = normalizeIds(drop.allowedChannelIds);
  const allowedLogins = normalizeLogins(drop.allowedChannelLogins);
  if (allowedIds.size === 0 && allowedLogins.size === 0) return true;
  if (allowedIds.has(channel.id.trim())) return true;
  if (allowedLogins.has(channel.login.trim().toLowerCase())) return true;
  return false;
};

export const buildWatchStallTrackerKey = (watching: WatchingState, dropId: string): string => {
  const watchingId = resolveWatchingId(watching);
  const streamId = String(watching?.streamId ?? "").trim();
  return `${watchingId}:${streamId}:${dropId}`;
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
      tracker: { key, lastEarnedMinutes: earnedMinutes, lastProgressAt: now, lastActionAt: 0 },
      shouldRecover: false,
    };
  }

  if (earnedMinutes !== tracker.lastEarnedMinutes) {
    return {
      tracker: {
        ...tracker,
        lastEarnedMinutes: earnedMinutes,
        lastProgressAt: now,
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
    },
    shouldRecover: true,
  };
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
  for (const channel of channels) {
    if (isSameAsWatching(channel, watching)) continue;
    if (!canFarmDropOnChannel(channel, drop)) continue;
    return channel;
  }
  return null;
};
