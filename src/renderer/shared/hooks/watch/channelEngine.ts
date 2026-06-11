import { sameGameName } from "@renderer/shared/domain/gameName";
import { type ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type {
  ChannelDiff,
  ChannelEntry,
  ChannelLiveDiff,
  WatchingState,
} from "@renderer/shared/types";
import { normalizeAllowlist } from "./channelAllowlist";

export const MANUAL_PRIORITY_OVERRIDE_MS = 2 * 60_000;

export const sameChannel = (left: ChannelEntry, right: ChannelEntry): boolean =>
  left.id === right.id &&
  left.login === right.login &&
  left.displayName === right.displayName &&
  left.streamId === right.streamId &&
  left.title === right.title &&
  left.viewers === right.viewers &&
  left.language === right.language &&
  left.thumbnail === right.thumbnail &&
  left.game === right.game;

export const mergeChannelList = (prev: ChannelEntry[], next: ChannelEntry[]): ChannelEntry[] => {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  return next.map((item) => {
    const prior = prevById.get(item.id);
    return prior && sameChannel(prior, item) ? prior : item;
  });
};

export const sortChannelsByViewers = (channels: ChannelEntry[]): ChannelEntry[] =>
  [...channels].sort((left, right) => {
    if (right.viewers !== left.viewers) {
      return right.viewers - left.viewers;
    }
    return left.displayName.localeCompare(right.displayName);
  });

export const applyLiveDiff = (prev: ChannelEntry[], payload: ChannelLiveDiff): ChannelEntry[] => {
  const removed = new Set(payload.removedIds);
  const next = prev.filter((channel) => !removed.has(channel.id));
  const indexById = new Map(next.map((channel, index) => [channel.id, index]));

  for (const channel of payload.updated) {
    const index = indexById.get(channel.id);
    if (index === undefined) {
      next.push(channel);
      indexById.set(channel.id, next.length - 1);
      continue;
    }
    next[index] = channel;
  }

  for (const channel of payload.added) {
    const index = indexById.get(channel.id);
    if (index === undefined) {
      next.push(channel);
      indexById.set(channel.id, next.length - 1);
      continue;
    }
    next[index] = channel;
  }

  if (payload.reason !== "viewers") {
    return sortChannelsByViewers(next);
  }
  return next;
};

export const mergeViewerLiveDiff = (
  base: ChannelLiveDiff | null,
  incoming: ChannelLiveDiff,
): ChannelLiveDiff => {
  if (!base || base.game !== incoming.game) return incoming;
  const updatedById = new Map<string, ChannelEntry>();
  for (const channel of base.updated) {
    updatedById.set(channel.id, channel);
  }
  for (const channel of incoming.updated) {
    updatedById.set(channel.id, channel);
  }
  return {
    ...incoming,
    at: Math.max(base.at, incoming.at),
    updated: Array.from(updatedById.values()),
  };
};

export const buildChannelDiff = (
  prev: ChannelEntry[],
  next: ChannelEntry[],
  at: number,
): ChannelDiff | null => {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  const nextById = new Map(next.map((item) => [item.id, item]));
  const addedIds: string[] = [];
  const removedIds: string[] = [];
  const updatedIds: string[] = [];
  const titleChangedIds: string[] = [];
  const viewerDeltaById: Record<string, number> = {};

  for (const [id, nextChannel] of nextById) {
    const prevChannel = prevById.get(id);
    if (!prevChannel) {
      addedIds.push(id);
      continue;
    }
    let changed = false;
    if (prevChannel.viewers !== nextChannel.viewers) {
      const delta = nextChannel.viewers - prevChannel.viewers;
      if (delta !== 0) {
        viewerDeltaById[id] = delta;
      }
      changed = true;
    }
    if ((prevChannel.title || "") !== (nextChannel.title || "")) {
      titleChangedIds.push(id);
      changed = true;
    }
    if (
      prevChannel.login !== nextChannel.login ||
      prevChannel.displayName !== nextChannel.displayName ||
      prevChannel.streamId !== nextChannel.streamId ||
      prevChannel.language !== nextChannel.language ||
      prevChannel.thumbnail !== nextChannel.thumbnail ||
      prevChannel.game !== nextChannel.game
    ) {
      changed = true;
    }
    if (changed) {
      updatedIds.push(id);
    }
  }

  for (const [id] of prevById) {
    if (!nextById.has(id)) {
      removedIds.push(id);
    }
  }

  if (
    addedIds.length === 0 &&
    removedIds.length === 0 &&
    updatedIds.length === 0 &&
    titleChangedIds.length === 0
  ) {
    return null;
  }

  return {
    at,
    addedIds,
    removedIds,
    updatedIds,
    titleChangedIds,
    viewerDeltaById,
  };
};

export const isFreshCache = ({
  fetchedAt,
  fetchedGame,
  game,
  now,
  refreshWindowMs,
}: {
  fetchedAt: number | null;
  fetchedGame: string;
  game: string;
  now: number;
  refreshWindowMs: number;
}): boolean => fetchedAt !== null && fetchedGame === game && now - fetchedAt < refreshWindowMs;

export const shouldAutoSelectChannel = ({
  allowWatching,
  autoSelectEnabled,
  canWatchTarget,
  channels,
  watching,
  channelAllowlist,
}: {
  allowWatching: boolean;
  autoSelectEnabled: boolean;
  canWatchTarget: boolean;
  channels: ChannelEntry[];
  watching: WatchingState;
  channelAllowlist?: ChannelAllowlist | null;
}): boolean => {
  if (
    !allowWatching ||
    !autoSelectEnabled ||
    !canWatchTarget ||
    watching ||
    channels.length === 0
  ) {
    return false;
  }
  const normalized = normalizeAllowlist(channelAllowlist);
  if (!normalized) return true;
  return channels.some((channel) => normalized.allowsChannel(channel));
};

export const computeAutoSwitchAction = ({
  allowWatching,
  watching,
  channels,
  autoSwitchEnabled,
  forcePrioritySwitch,
  canWatchTarget,
  channelAllowlist,
}: {
  allowWatching: boolean;
  watching: WatchingState;
  channels: ChannelEntry[];
  autoSwitchEnabled: boolean;
  forcePrioritySwitch: boolean;
  canWatchTarget: boolean;
  channelAllowlist?: ChannelAllowlist | null;
}):
  | { action: "none" }
  | { action: "clear" }
  | { action: "switch"; reason: "priority" | "offline"; nextChannel: ChannelEntry } => {
  if (!allowWatching) return { action: "none" };
  if (!watching) return { action: "none" };
  const normalizedAllowlist = normalizeAllowlist(channelAllowlist);
  const allowlistActive = Boolean(normalizedAllowlist);
  const isAllowed = (channel: ChannelEntry): boolean =>
    normalizedAllowlist ? normalizedAllowlist.allowsChannel(channel) : true;
  const preferredChannel = normalizedAllowlist
    ? channels.find((channel) => isAllowed(channel))
    : null;
  const shouldForceSwitch = forcePrioritySwitch && canWatchTarget;
  const stillThere = channels.some((c) => c.id === watching.id);
  if (stillThere) {
    const current = channels.find((c) => c.id === watching.id) ?? null;
    if (!current) return { action: "none" };
    if (allowlistActive && !isAllowed(current) && !preferredChannel) return { action: "clear" };
    if (!shouldForceSwitch || !preferredChannel) return { action: "none" };
    if (isAllowed(current)) return { action: "none" };
    if (preferredChannel.id === current.id) return { action: "none" };
    return { action: "switch", reason: "priority", nextChannel: preferredChannel };
  }
  if (channels.length === 0) return { action: "clear" };
  if (allowlistActive && !preferredChannel) return { action: "clear" };
  if (!autoSwitchEnabled && !shouldForceSwitch) return { action: "none" };
  const nextChannel = preferredChannel ?? channels[0];
  return {
    action: "switch",
    reason: shouldForceSwitch ? "priority" : "offline",
    nextChannel,
  };
};

export const isManualPriorityOverrideActive = ({
  manualWatchOverride,
  targetGame,
  now,
  windowMs = MANUAL_PRIORITY_OVERRIDE_MS,
}: {
  manualWatchOverride?: { at: number; game: string } | null;
  targetGame: string;
  now: number;
  windowMs?: number;
}): boolean => {
  if (!manualWatchOverride) return false;
  if (!sameGameName(manualWatchOverride.game, targetGame)) return false;
  return now - manualWatchOverride.at < windowMs;
};

export const shouldClearTrackerAfterStaleResponse = ({
  shouldTrackChannels,
}: {
  shouldTrackChannels: boolean;
}): boolean => {
  // If tracking is currently disabled, stale responses must not revive tracker subscriptions.
  return !shouldTrackChannels;
};
