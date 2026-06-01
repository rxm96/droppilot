import { useCallback, useEffect, useRef } from "react";
import { useInterval } from "@renderer/shared/hooks/useInterval";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import { getDemoChannels } from "@renderer/shared/demoData";
import { errorInfoFromIpc, errorInfoFromUnknown } from "@renderer/shared/utils/errors";
import {
  isArrayOf,
  isChannelEntry,
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
} from "@renderer/shared/utils/ipc";
import { logDebug, logInfo, logWarn } from "@renderer/shared/utils/logger";
import { RENDERER_ERROR_CODES } from "../../../../shared/errorCodes";
import { buildAllowlistKey, prioritizeChannelsByAllowlist } from "./channelAllowlist";
import {
  buildChannelDiff,
  isFreshCache,
  mergeChannelList,
  shouldClearTrackerAfterStaleResponse,
} from "./channelEngine";
import type { ChannelStore } from "./useChannelStore";

type FetchParams = {
  store: ChannelStore;
  allowWatching: boolean;
  demoMode?: boolean;
  channelAllowlist?: ChannelAllowlist | null;
  watching: WatchingState;
  onAuthError?: (message?: string) => void;
  targetGame: string;
  shouldTrackChannels: boolean;
  refreshWindowMs: number;
};

export function useChannelFetch({
  store,
  allowWatching,
  demoMode,
  channelAllowlist,
  watching,
  onAuthError,
  targetGame,
  shouldTrackChannels,
  refreshWindowMs,
}: FetchParams) {
  const {
    applyChannelsState,
    setChannelDiff,
    setChannelError,
    setChannelsLoading,
    setChannelsRefreshing,
    setFetchedAt,
    setFetchedGame,
    resetChannelData,
    channelsRef,
    targetGameRef,
    shouldTrackChannelsRef,
    fetchedGame,
  } = store;

  const inFlightGamesRef = useRef<Set<string>>(new Set());
  const requestSeqRef = useRef(0);
  const latestAppliedRequestRef = useRef(0);
  const allowlistKeyRef = useRef<string>("");
  const lastTrackedGameRef = useRef<string>("");

  const isFresh = useCallback(
    (game: string, now = Date.now()) =>
      isFreshCache({
        fetchedAt: store.fetchedAt,
        fetchedGame: store.fetchedGame,
        game,
        now,
        refreshWindowMs,
      }),
    [store.fetchedAt, store.fetchedGame, refreshWindowMs],
  );

  // Shared tail for both demo and real fetches. Takes the ALREADY-prioritized list,
  // diffs it against the previous list, applies it, and records fetch metadata.
  // (The two branches differ only in how they obtain `list` and their per-branch logging.)
  const applyFetchedChannels = (
    prevList: ChannelEntry[],
    list: ChannelEntry[],
    gameName: string,
    now: number,
  ) => {
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
  };

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
          applyFetchedChannels(prevList, prioritizedList, gameName, now);
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
        applyFetchedChannels(prevList, list, gameName, now);
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
    // NOTE: `watching` is intentionally kept in these deps even though the body no
    // longer reads it. It previously fed a diagnostic snapshot (since removed); keeping
    // it preserves the original behavior where fetchChannels is re-created on watching
    // changes, which re-fires the fetch-on-active / allowlist effects. Removing it would
    // change behavior — do not drop it during the Task 8 lint pass.
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
      resetChannelData();
    }
    lastTrackedGameRef.current = targetGame;
  }, [allowWatching, resetChannelData, shouldTrackChannels, targetGame]);

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
    refreshWindowMs,
    shouldTrackChannels,
  );

  return fetchChannels;
}
