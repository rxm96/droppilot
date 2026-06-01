import { useEffect } from "react";
import { type ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import { normalizeAllowlist } from "./channelAllowlist";
import {
  computeAutoSwitchAction,
  isManualPriorityOverrideActive,
  shouldAutoSelectChannel,
} from "./channelEngine";
import type { ChannelEntry, ChannelTrackerMode, View, WatchingState } from "@renderer/shared/types";
import { useChannelStore } from "./useChannelStore";
import { useChannelFetch } from "./useChannelFetch";
import { useChannelLiveDiff } from "./useChannelLiveDiff";

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
    setAutoSwitch,
  } = store;

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

  useChannelLiveDiff({
    store,
    allowWatching,
    demoMode,
    channelAllowlist,
    watching,
    shouldTrackChannels,
  });

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
