import { useEffect, useRef } from "react";
import { type ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import { sameGameName } from "@renderer/shared/domain/gameName";
import { normalizeAllowlist, prioritizeChannelsByAllowlist } from "./channelAllowlist";
import {
  applyLiveDiff,
  buildChannelDiff,
  computeAutoSwitchAction,
  isManualPriorityOverrideActive,
  mergeChannelList,
  mergeViewerLiveDiff,
  shouldAutoSelectChannel,
} from "./channelEngine";
import type {
  ChannelEntry,
  ChannelLiveDiff,
  ChannelTrackerMode,
  View,
  WatchingState,
} from "@renderer/shared/types";
import { useChannelStore } from "./useChannelStore";
import { useChannelFetch } from "./useChannelFetch";
import { isChannelLiveDiff } from "@renderer/shared/utils/ipc";
import { logDebug } from "@renderer/shared/utils/logger";

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
  const hasTrackableTarget = Boolean(targetGame) && (canWatchTarget || Boolean(watching));
  const shouldTrackChannels =
    allowWatching &&
    hasTrackableTarget &&
    (view === "control" || autoSelectEnabled || !!watching || autoSwitchEnabled);
  const store = useChannelStore({ targetGame, shouldTrackChannels, demoMode });
  const {
    channels,
    channelDiff,
    channelError,
    channelsLoading,
    channelsRefreshing,
    autoSwitch,
    channelsRef,
    targetGameRef,
    applyChannelsState,
    setChannelDiff,
    setChannelsLoading,
    setChannelsRefreshing,
    setAutoSwitch,
    setFetchedAt,
    setFetchedGame,
  } = store;
  const pendingViewerDiffRef = useRef<ChannelLiveDiff | null>(null);
  const viewerFlushTimerRef = useRef<number | null>(null);

  const fetchChannels = useChannelFetch({
    store,
    allowWatching,
    demoMode,
    channelAllowlist,
    watching,
    onAuthError,
    targetGame,
    shouldTrackChannels,
    refreshWindowMs: TRACKER_REFRESH_WINDOW_MS,
  });

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
