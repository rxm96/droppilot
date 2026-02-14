import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AutoSwitchInfo,
  ChannelDiff,
  ChannelEntry,
  ChannelLiveDiff,
  ChannelTrackerMode,
  ErrorInfo,
  View,
  WatchingState,
} from "@renderer/shared/types";
import { getDemoChannels } from "@renderer/shared/demoData";
import { errorInfoFromIpc, errorInfoFromUnknown } from "@renderer/shared/utils/errors";
import {
  isArrayOf,
  isChannelEntry,
  isChannelLiveDiff,
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
} from "@renderer/shared/utils/ipc";
import { logDebug, logInfo, logWarn } from "@renderer/shared/utils/logger";
import { RENDERER_ERROR_CODES } from "../../../shared/errorCodes";

type Params = {
  targetGame: string;
  view: View;
  watching: WatchingState;
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
  fetchInventory: () => void;
  inventoryFetchedAt: number | null;
  autoSelectEnabled: boolean;
  autoSwitchEnabled: boolean;
  forcePrioritySwitch?: boolean;
  allowWatching: boolean;
  canWatchTarget: boolean;
  trackerMode?: ChannelTrackerMode | null;
  demoMode?: boolean;
  onAuthError?: (message?: string) => void;
};

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
  hasChannels,
}: {
  fetchedAt: number | null;
  fetchedGame: string;
  game: string;
  now: number;
  refreshWindowMs: number;
  hasChannels: boolean;
}): boolean =>
  fetchedAt !== null && fetchedGame === game && now - fetchedAt < refreshWindowMs && hasChannels;

export const hasRecentInventory = ({
  inventoryFetchedAt,
  now,
  recentWindowMs,
}: {
  inventoryFetchedAt: number | null;
  now: number;
  recentWindowMs: number;
}): boolean => inventoryFetchedAt !== null && now - inventoryFetchedAt < recentWindowMs;

export const shouldAutoSelectChannel = ({
  allowWatching,
  autoSelectEnabled,
  canWatchTarget,
  channels,
  watching,
}: {
  allowWatching: boolean;
  autoSelectEnabled: boolean;
  canWatchTarget: boolean;
  channels: ChannelEntry[];
  watching: WatchingState;
}): boolean =>
  allowWatching && autoSelectEnabled && canWatchTarget && channels.length > 0 && !watching;

export const computeAutoSwitchAction = ({
  allowWatching,
  watching,
  channels,
  autoSwitchEnabled,
  forcePrioritySwitch,
  canWatchTarget,
}: {
  allowWatching: boolean;
  watching: WatchingState;
  channels: ChannelEntry[];
  autoSwitchEnabled: boolean;
  forcePrioritySwitch: boolean;
  canWatchTarget: boolean;
}):
  | { action: "none" }
  | { action: "clear" }
  | { action: "switch"; reason: "priority" | "offline"; nextChannel: ChannelEntry } => {
  if (!allowWatching) return { action: "none" };
  if (!watching) return { action: "none" };
  const stillThere = channels.some((c) => c.id === watching.id);
  if (stillThere) return { action: "none" };
  if (channels.length === 0) return { action: "clear" };
  const shouldForceSwitch = forcePrioritySwitch && canWatchTarget;
  if (!autoSwitchEnabled && !shouldForceSwitch) return { action: "none" };
  const nextChannel = channels[0];
  return {
    action: "switch",
    reason: shouldForceSwitch ? "priority" : "offline",
    nextChannel,
  };
};

export function useChannels({
  targetGame,
  view,
  watching,
  setWatchingFromChannel,
  clearWatching,
  fetchInventory,
  inventoryFetchedAt,
  autoSelectEnabled,
  autoSwitchEnabled,
  forcePrioritySwitch = false,
  allowWatching,
  canWatchTarget,
  trackerMode,
  demoMode,
  onAuthError,
}: Params) {
  const RECENT_INVENTORY_WINDOW_MS = 30_000;
  const TRACKER_REFRESH_WINDOW_MS =
    trackerMode && trackerMode !== "polling" ? 10 * 60_000 : 5 * 60_000;
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const channelsRef = useRef<ChannelEntry[]>([]);
  const [channelError, setChannelError] = useState<ErrorInfo | null>(null);
  const [channelsLoading, setChannelsLoading] = useState<boolean>(false);
  const [channelsRefreshing, setChannelsRefreshing] = useState<boolean>(false);
  const [channelDiff, setChannelDiff] = useState<ChannelDiff | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [fetchedGame, setFetchedGame] = useState<string>("");
  const [autoSwitch, setAutoSwitch] = useState<AutoSwitchInfo | null>(null);
  const inFlightGamesRef = useRef<Set<string>>(new Set());
  const requestSeqRef = useRef(0);
  const latestAppliedRequestRef = useRef(0);
  const targetGameRef = useRef(targetGame);
  const pendingViewerDiffRef = useRef<ChannelLiveDiff | null>(null);
  const viewerFlushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    targetGameRef.current = targetGame;
  }, [targetGame]);

  const applyChannelsState = useCallback(
    (next: ChannelEntry[]) => {
      channelsRef.current = next;
      setChannels(next);
    },
    [setChannels],
  );

  const isFresh = useCallback(
    (game: string, now = Date.now()) =>
      isFreshCache({
        fetchedAt,
        fetchedGame,
        game,
        now,
        refreshWindowMs: TRACKER_REFRESH_WINDOW_MS,
        hasChannels: channels.length > 0,
      }),
    [channels.length, fetchedAt, fetchedGame, TRACKER_REFRESH_WINDOW_MS],
  );
  const hasRecentInventoryNow = useCallback(
    (now = Date.now()) =>
      hasRecentInventory({
        inventoryFetchedAt,
        now,
        recentWindowMs: RECENT_INVENTORY_WINDOW_MS,
      }),
    [inventoryFetchedAt, RECENT_INVENTORY_WINDOW_MS],
  );

  const fetchChannels = useCallback(
    async (gameName: string, { force }: { force?: boolean } = {}) => {
      if (!allowWatching) return;
      if (!gameName) return;
      if (inFlightGamesRef.current.has(gameName)) {
        logDebug("channels: skip (request already in flight)", { game: gameName });
        return;
      }
      const requestId = ++requestSeqRef.current;
      inFlightGamesRef.current.add(gameName);
      const now = Date.now();
      if (!force && isFresh(gameName, now)) {
        inFlightGamesRef.current.delete(gameName);
        logDebug("channels: skip (fresh cache)", { game: gameName });
        return;
      }

      const prevList = channelsRef.current;
      const hasVisibleChannels = prevList.length > 0 && fetchedGame === gameName;
      if (hasVisibleChannels) {
        setChannelsRefreshing(true);
      } else {
        setChannelsLoading(true);
      }
      setChannelError(null);
      try {
        if (demoMode) {
          const list = getDemoChannels(gameName);
          if (gameName !== targetGameRef.current || requestId < latestAppliedRequestRef.current) {
            logDebug("channels: ignore stale demo response", {
              game: gameName,
              current: targetGameRef.current,
              requestId,
            });
            return;
          }
          latestAppliedRequestRef.current = requestId;
          const diff = buildChannelDiff(prevList, list, now);
          setChannelDiff(diff);
          applyChannelsState(mergeChannelList(prevList, list));
          setFetchedAt(now);
          setFetchedGame(gameName);
          if (diff) {
            logDebug("channels: diff", {
              game: gameName,
              added: diff.addedIds.length,
              removed: diff.removedIds.length,
              updated: diff.updatedIds.length,
            });
          }
          const shouldSkipInventory =
            (autoSelectEnabled && !watching) || hasRecentInventoryNow(now);
          if (shouldSkipInventory) {
            logDebug("channels: skip inventory fetch (recent or auto-select)");
          } else {
            fetchInventory();
          }
          return;
        }
        logInfo("channels: fetch start", { game: gameName, force });
        const res: unknown = await window.electronAPI.twitch.channels({ game: gameName });
        if (gameName !== targetGameRef.current || requestId < latestAppliedRequestRef.current) {
          logDebug("channels: ignore stale response", {
            game: gameName,
            current: targetGameRef.current,
            requestId,
          });
          return;
        }
        latestAppliedRequestRef.current = requestId;
        if (isIpcErrorResponse(res)) {
          if (isIpcAuthErrorResponse(res)) {
            onAuthError?.(res.message);
            setChannelDiff(null);
            applyChannelsState([]);
            setChannelError(null);
            logWarn("channels: auth error", res);
            return;
          }
          setChannelError(
            errorInfoFromIpc(res, {
              code: RENDERER_ERROR_CODES.CHANNELS_FETCH_FAILED,
              message: "Unable to load channels",
            }),
          );
          setChannelDiff(null);
          applyChannelsState([]);
          logWarn("channels: fetch error", res);
          return;
        }
        if (!isArrayOf(res, isChannelEntry)) {
          setChannelError({
            code: RENDERER_ERROR_CODES.CHANNELS_INVALID_RESPONSE,
            message: "Invalid channels response",
          });
          setChannelDiff(null);
          applyChannelsState([]);
          logWarn("channels: invalid response", res);
          return;
        }
        const list = res;
        logInfo("channels: fetch success", { game: gameName, count: list.length });
        logDebug("channels: sample", list.slice(0, 3));
        const diff = buildChannelDiff(prevList, list, now);
        setChannelDiff(diff);
        applyChannelsState(mergeChannelList(prevList, list));
        setFetchedAt(now);
        setFetchedGame(gameName);
        if (diff) {
          logDebug("channels: diff", {
            game: gameName,
            added: diff.addedIds.length,
            removed: diff.removedIds.length,
            updated: diff.updatedIds.length,
          });
        }
        const shouldSkipInventory = (autoSelectEnabled && !watching) || hasRecentInventoryNow(now);
        if (shouldSkipInventory) {
          logDebug("channels: skip inventory fetch (recent or auto-select)");
        } else {
          // Nach Channel-Fetch auch Inventar neu laden, damit Drop-Progress aktuell bleibt.
          fetchInventory();
        }
      } catch (err) {
        if (gameName !== targetGameRef.current || requestId < latestAppliedRequestRef.current) {
          logDebug("channels: ignore stale failure", {
            game: gameName,
            current: targetGameRef.current,
            requestId,
          });
          return;
        }
        setChannelError(
          errorInfoFromUnknown(err, {
            code: RENDERER_ERROR_CODES.CHANNELS_FETCH_FAILED,
            message: "Unable to load channels",
          }),
        );
        setChannelDiff(null);
        applyChannelsState([]);
      } finally {
        inFlightGamesRef.current.delete(gameName);
        if (gameName === targetGameRef.current) {
          setChannelsLoading(false);
          setChannelsRefreshing(false);
        }
      }
    },
    [
      allowWatching,
      applyChannelsState,
      autoSelectEnabled,
      demoMode,
      fetchInventory,
      fetchedGame,
      hasRecentInventoryNow,
      isFresh,
      onAuthError,
      watching,
    ],
  );

  const shouldTrackChannels =
    allowWatching && (view === "control" || autoSelectEnabled || watching || autoSwitchEnabled);

  useEffect(() => {
    if (demoMode) return;
    const applyPayload = (payload: ChannelLiveDiff) => {
      if (!allowWatching) return;
      if (!shouldTrackChannels) return;
      if (!targetGameRef.current) return;
      if (payload.game !== targetGameRef.current) return;
      const prevList = channelsRef.current;
      const nextListRaw = applyLiveDiff(prevList, payload);
      const nextList = mergeChannelList(prevList, nextListRaw);
      const diff = buildChannelDiff(prevList, nextList, payload.at);
      if (!diff) return;
      applyChannelsState(nextList);
      setChannelDiff(diff);
      setFetchedAt(payload.at);
      setFetchedGame(payload.game);
      setChannelsLoading(false);
      setChannelsRefreshing(false);
      logDebug("channels: diff push", {
        game: payload.game,
        source: payload.source,
        reason: payload.reason,
        added: payload.added.length,
        removed: payload.removedIds.length,
        updated: payload.updated.length,
      });
    };
    const flushViewerDiff = () => {
      const queued = pendingViewerDiffRef.current;
      pendingViewerDiffRef.current = null;
      if (viewerFlushTimerRef.current !== null) {
        window.clearTimeout(viewerFlushTimerRef.current);
        viewerFlushTimerRef.current = null;
      }
      if (queued) {
        applyPayload(queued);
      }
    };
    const unsubscribe = window.electronAPI.twitch.onChannelsDiff((payload: unknown) => {
      if (!isChannelLiveDiff(payload)) return;
      if (payload.reason === "viewers") {
        pendingViewerDiffRef.current = mergeViewerLiveDiff(pendingViewerDiffRef.current, payload);
        if (viewerFlushTimerRef.current === null) {
          viewerFlushTimerRef.current = window.setTimeout(flushViewerDiff, 350);
        }
        return;
      }
      flushViewerDiff();
      applyPayload(payload);
    });
    return () => {
      if (viewerFlushTimerRef.current !== null) {
        window.clearTimeout(viewerFlushTimerRef.current);
        viewerFlushTimerRef.current = null;
      }
      pendingViewerDiffRef.current = null;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [allowWatching, applyChannelsState, demoMode, shouldTrackChannels]);

  // Reset when switching demo mode
  useEffect(() => {
    if (demoMode === undefined) return;
    applyChannelsState([]);
    setChannelDiff(null);
    setChannelError(null);
    setChannelsLoading(false);
    setChannelsRefreshing(false);
    setFetchedAt(null);
    setFetchedGame("");
    setAutoSwitch(null);
  }, [applyChannelsState, demoMode]);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  // Fetch when control view is active or auto-watch needs channel data (respect cache)
  useEffect(() => {
    if (!shouldTrackChannels) return;
    if (!targetGame) return;
    if (isFresh(targetGame)) return;
    fetchChannels(targetGame);
  }, [fetchChannels, isFresh, shouldTrackChannels, targetGame]);

  // Auto-refresh while control is active or auto-watching in background (cache-aware)
  useEffect(() => {
    if (!shouldTrackChannels) return;
    const id = window.setInterval(() => {
      if (!targetGame) return;
      if (isFresh(targetGame)) return;
      fetchChannels(targetGame);
    }, TRACKER_REFRESH_WINDOW_MS);
    return () => window.clearInterval(id);
  }, [TRACKER_REFRESH_WINDOW_MS, fetchChannels, isFresh, shouldTrackChannels, targetGame]);

  // Auto-select first channel if none selected
  useEffect(() => {
    if (
      !shouldAutoSelectChannel({
        allowWatching,
        autoSelectEnabled,
        canWatchTarget,
        channels,
        watching,
      })
    )
      return;
    const first = channels[0];
    setWatchingFromChannel(first);
    if (hasRecentInventoryNow()) {
      logDebug("channels: skip inventory fetch (recent inventory)");
    } else {
      fetchInventory();
    }
  }, [
    channels,
    watching,
    targetGame,
    autoSelectEnabled,
    allowWatching,
    canWatchTarget,
    inventoryFetchedAt,
    setWatchingFromChannel,
    fetchInventory,
    hasRecentInventoryNow,
  ]);

  // Auto-switch if current channel disappears
  useEffect(() => {
    const action = computeAutoSwitchAction({
      allowWatching,
      watching,
      channels,
      autoSwitchEnabled,
      forcePrioritySwitch,
      canWatchTarget,
    });
    if (action.action === "none") return;
    if (action.action === "clear") {
      clearWatching();
      fetchInventory();
      return;
    }
    setWatchingFromChannel(action.nextChannel);
    setAutoSwitch({
      at: Date.now(),
      reason: action.reason,
      from: { id: watching.id, name: watching.name },
      to: { id: action.nextChannel.id, name: action.nextChannel.displayName },
    });
    fetchInventory();
  }, [
    channels,
    watching,
    allowWatching,
    autoSwitchEnabled,
    forcePrioritySwitch,
    canWatchTarget,
    clearWatching,
    setWatchingFromChannel,
    fetchInventory,
  ]);

  useEffect(() => {
    if (allowWatching) return;
    applyChannelsState([]);
    setChannelDiff(null);
    setChannelError(null);
    setChannelsLoading(false);
    setChannelsRefreshing(false);
    setFetchedAt(null);
    setFetchedGame("");
    setAutoSwitch(null);
  }, [allowWatching, applyChannelsState]);

  return {
    channels,
    channelDiff,
    channelError,
    channelsLoading,
    channelsRefreshing,
    autoSwitch,
    fetchChannels,
  };
}
