import { useEffect, useRef } from "react";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import { sameGameName } from "@renderer/shared/domain/gameName";
import type { ChannelLiveDiff, WatchingState } from "@renderer/shared/types";
import { isChannelLiveDiff } from "@renderer/shared/utils/ipc";
import { logDebug } from "@renderer/shared/utils/logger";
import { prioritizeChannelsByAllowlist } from "./channelAllowlist";
import {
  applyLiveDiff,
  buildChannelDiff,
  mergeChannelList,
  mergeViewerLiveDiff,
} from "./channelEngine";
import type { ChannelStore } from "./useChannelStore";

type LiveDiffParams = {
  store: ChannelStore;
  allowWatching: boolean;
  demoMode?: boolean;
  channelAllowlist?: ChannelAllowlist | null;
  watching: WatchingState;
  shouldTrackChannels: boolean;
};

export function useChannelLiveDiff({
  store,
  allowWatching,
  demoMode,
  channelAllowlist,
  watching,
  shouldTrackChannels,
}: LiveDiffParams) {
  const {
    applyChannelsState,
    setChannelDiff,
    setChannelsLoading,
    setChannelsRefreshing,
    setFetchedAt,
    setFetchedGame,
    channelsRef,
    targetGameRef,
  } = store;
  const pendingViewerDiffRef = useRef<ChannelLiveDiff | null>(null);
  const viewerFlushTimerRef = useRef<number | null>(null);

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
    // NOTE: `watching` is intentionally kept in these deps even though the body no longer
    // reads it (it previously fed a since-removed diagnostic snapshot). Keeping it preserves
    // the original behavior where this effect re-subscribes when watching changes. Removing
    // it would change behavior — do not drop it during the Task 8 lint pass.
  }, [
    allowWatching,
    applyChannelsState,
    demoMode,
    shouldTrackChannels,
    channelAllowlist,
    watching,
  ]);
}
