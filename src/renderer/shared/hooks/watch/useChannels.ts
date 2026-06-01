import { useCallback, useEffect, useRef, useState } from "react";
import { useInterval } from "@renderer/shared/hooks/useInterval";
import { type ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import { sameGameName } from "@renderer/shared/domain/gameName";
import {
  buildAllowlistKey,
  normalizeAllowlist,
  prioritizeChannelsByAllowlist,
} from "./channelAllowlist";
import {
  applyLiveDiff,
  buildChannelDiff,
  computeAutoSwitchAction,
  isFreshCache,
  isManualPriorityOverrideActive,
  mergeChannelList,
  mergeViewerLiveDiff,
  shouldAutoSelectChannel,
  shouldClearTrackerAfterStaleResponse,
} from "./channelEngine";
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
import { RENDERER_ERROR_CODES } from "../../../../shared/errorCodes";

type Params = {
  targetGame: string;
  view: View;
  watching: WatchingState;
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
  autoSelectEnabled: boolean;
  autoSwitchEnabled: boolean;
  forcePrioritySwitch?: boolean;
  allowWatching: boolean;
  canWatchTarget: boolean;
  trackerMode?: ChannelTrackerMode | null;
  demoMode?: boolean;
  onAuthError?: (message?: string) => void;
  channelAllowlist?: ChannelAllowlist | null;
  manualWatchOverride?: { at: number; game: string } | null;
};

export function useChannels({
  targetGame,
  view,
  watching,
  setWatchingFromChannel,
  clearWatching,
  autoSelectEnabled,
  autoSwitchEnabled,
  forcePrioritySwitch = false,
  allowWatching,
  canWatchTarget,
  trackerMode,
  demoMode,
  onAuthError,
  channelAllowlist,
  manualWatchOverride,
}: Params) {
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
  const allowlistKeyRef = useRef<string>("");
  const trackerClearedRef = useRef(false);
  const lastTrackedGameRef = useRef<string>("");

  targetGameRef.current = targetGame;

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
      }),
    [fetchedAt, fetchedGame, TRACKER_REFRESH_WINDOW_MS],
  );
  const hasTrackableTarget = Boolean(targetGame) && (canWatchTarget || Boolean(watching));
  const shouldTrackChannels =
    allowWatching &&
    hasTrackableTarget &&
    (view === "control" || autoSelectEnabled || !!watching || autoSwitchEnabled);
  const shouldTrackChannelsRef = useRef(shouldTrackChannels);
  shouldTrackChannelsRef.current = shouldTrackChannels;
  const clearTrackerIfTrackingDisabled = useCallback(
    (
      context: "stale-demo-response" | "stale-response" | "stale-failure",
      requestedGame: string,
      requestId: number,
    ) => {
      const shouldTrack = shouldTrackChannelsRef.current;
      if (!shouldClearTrackerAfterStaleResponse({ shouldTrackChannels: shouldTrack })) return;
      logInfo("channels: clear tracker after stale response", {
        context,
        requestedGame,
        currentTargetGame: targetGameRef.current,
        requestId,
        shouldTrackChannels: shouldTrack,
      });
      void window.electronAPI.twitch.trackerClearChannels?.();
    },
    [],
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
          const rawList = getDemoChannels(gameName);
          const prioritizedList = prioritizeChannelsByAllowlist(rawList, channelAllowlist);
          if (gameName !== targetGameRef.current || requestId < latestAppliedRequestRef.current) {
            logDebug("channels: ignore stale demo response", {
              game: gameName,
              current: targetGameRef.current,
              requestId,
            });
            clearTrackerIfTrackingDisabled("stale-demo-response", gameName, requestId);
            return;
          }
          latestAppliedRequestRef.current = requestId;
          const diff = buildChannelDiff(prevList, prioritizedList, now);
          setChannelDiff(diff);
          applyChannelsState(mergeChannelList(prevList, prioritizedList));
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
          clearTrackerIfTrackingDisabled("stale-response", gameName, requestId);
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
        const rawList = res;
        const list = prioritizeChannelsByAllowlist(rawList, channelAllowlist);
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
      } catch (err) {
        if (gameName !== targetGameRef.current || requestId < latestAppliedRequestRef.current) {
          logDebug("channels: ignore stale failure", {
            game: gameName,
            current: targetGameRef.current,
            requestId,
          });
          clearTrackerIfTrackingDisabled("stale-failure", gameName, requestId);
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
      demoMode,
      fetchedGame,
      isFresh,
      onAuthError,
      channelAllowlist,
      clearTrackerIfTrackingDisabled,
      watching,
    ],
  );

  useEffect(() => {
    if (!allowWatching || !targetGame || !shouldTrackChannels) return;
    const previous = lastTrackedGameRef.current;
    if (previous && previous !== targetGame) {
      void window.electronAPI.twitch.trackerClearChannels?.();
      applyChannelsState([]);
      setChannelDiff(null);
      setChannelError(null);
      setFetchedAt(null);
      setFetchedGame("");
    }
    lastTrackedGameRef.current = targetGame;
  }, [allowWatching, applyChannelsState, shouldTrackChannels, targetGame]);

  useEffect(() => {
    if (demoMode) return;
    const applyPayload = (payload: ChannelLiveDiff) => {
      if (!allowWatching) return;
      if (!shouldTrackChannels) return;
      if (!targetGameRef.current) return;
      if (!sameGameName(payload.game, targetGameRef.current)) return;
      const prevList = channelsRef.current;
      const nextListRaw = applyLiveDiff(prevList, payload);
      const nextListPrioritized = prioritizeChannelsByAllowlist(nextListRaw, channelAllowlist);
      const nextList = mergeChannelList(prevList, nextListPrioritized);
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
  }, [
    allowWatching,
    applyChannelsState,
    demoMode,
    shouldTrackChannels,
    channelAllowlist,
    watching,
  ]);

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
    const prev = channelsRef.current;
    const prioritized = prioritizeChannelsByAllowlist(prev, channelAllowlist);
    const sameLength = prioritized.length === prev.length;
    const sameIds = sameLength && prioritized.every((channel, idx) => channel.id === prev[idx]?.id);
    if (!sameIds) {
      const diff = buildChannelDiff(prev, prioritized, Date.now());
      if (diff) setChannelDiff(diff);
      applyChannelsState(prioritized);
    }

    const key = buildAllowlistKey(channelAllowlist);
    if (allowlistKeyRef.current === key) return;
    logInfo("channels: allowlist changed", {
      game: targetGame,
      previousKey: allowlistKeyRef.current,
      nextKey: key,
      watching: watching
        ? {
            id: watching.channelId ?? watching.id ?? "",
            login: watching.login ?? watching.name ?? "",
          }
        : null,
    });
    allowlistKeyRef.current = key;
    if (!shouldTrackChannels || !targetGame || !allowWatching) return;
    void fetchChannels(targetGame, { force: true });
  }, [
    allowWatching,
    applyChannelsState,
    channelAllowlist,
    fetchChannels,
    shouldTrackChannels,
    targetGame,
    watching,
  ]);

  // Fetch when control view is active or auto-watch needs channel data (respect cache)
  useEffect(() => {
    if (!shouldTrackChannels) return;
    if (!targetGame) return;
    if (isFresh(targetGame)) return;
    fetchChannels(targetGame);
  }, [fetchChannels, isFresh, shouldTrackChannels, targetGame]);

  // Auto-refresh while control is active or auto-watching in background (cache-aware)
  useInterval(
    () => {
      if (!targetGame) return;
      if (isFresh(targetGame)) return;
      fetchChannels(targetGame);
    },
    TRACKER_REFRESH_WINDOW_MS,
    shouldTrackChannels,
  );

  // Auto-select first channel if none selected
  useEffect(() => {
    if (
      !shouldAutoSelectChannel({
        allowWatching,
        autoSelectEnabled,
        canWatchTarget,
        channels,
        watching,
        channelAllowlist,
      })
    )
      return;
    const normalizedAllowlist = normalizeAllowlist(channelAllowlist);
    const first = normalizedAllowlist
      ? channels.find((channel) => normalizedAllowlist.allowsChannel(channel))
      : channels[0];
    if (!first) return;
    setWatchingFromChannel(first);
  }, [
    channels,
    watching,
    targetGame,
    autoSelectEnabled,
    allowWatching,
    canWatchTarget,
    channelAllowlist,
    setWatchingFromChannel,
  ]);

  // Auto-switch if current channel disappears
  useEffect(() => {
    const now = Date.now();
    const manualPriorityOverrideActive = isManualPriorityOverrideActive({
      manualWatchOverride,
      targetGame,
      now,
    });
    const action = computeAutoSwitchAction({
      allowWatching,
      watching,
      channels,
      autoSwitchEnabled,
      forcePrioritySwitch: forcePrioritySwitch && !manualPriorityOverrideActive,
      canWatchTarget,
      channelAllowlist,
    });
    if (action.action === "none") return;
    if (action.action === "clear") {
      clearWatching();
      return;
    }
    // computeAutoSwitchAction only returns a "switch" when `watching` is set,
    // so this never returns at runtime — it just makes the invariant explicit.
    if (!watching) return;
    setWatchingFromChannel(action.nextChannel);
    setAutoSwitch({
      at: Date.now(),
      reason: action.reason,
      from: { id: watching.id, name: watching.name },
      to: { id: action.nextChannel.id, name: action.nextChannel.displayName },
    });
  }, [
    channels,
    watching,
    targetGame,
    manualWatchOverride,
    allowWatching,
    autoSwitchEnabled,
    forcePrioritySwitch,
    canWatchTarget,
    channelAllowlist,
    clearWatching,
    setWatchingFromChannel,
  ]);

  useEffect(() => {
    if (shouldTrackChannels) {
      trackerClearedRef.current = false;
      return;
    }
    applyChannelsState([]);
    setChannelDiff(null);
    setChannelError(null);
    setChannelsLoading(false);
    setChannelsRefreshing(false);
    setFetchedAt(null);
    setFetchedGame("");
    setAutoSwitch(null);
    if (!trackerClearedRef.current) {
      trackerClearedRef.current = true;
      void window.electronAPI.twitch.trackerClearChannels?.();
    }
  }, [applyChannelsState, shouldTrackChannels]);

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
