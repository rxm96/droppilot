import { type ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry, ChannelTrackerMode, View, WatchingState } from "@renderer/shared/types";
import { useChannelStore } from "./useChannelStore";
import { useChannelFetch } from "./useChannelFetch";
import { useChannelLiveDiff } from "./useChannelLiveDiff";
import { useChannelAutopilot } from "./useChannelAutopilot";

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

  useChannelAutopilot({
    store,
    allowWatching,
    autoSelectEnabled,
    autoSwitchEnabled,
    canWatchTarget,
    channelAllowlist,
    forcePrioritySwitch,
    manualWatchOverride,
    targetGame,
    watching,
    setWatchingFromChannel,
    clearWatching,
  });

  return {
    channels: store.channels,
    channelDiff: store.channelDiff,
    channelError: store.channelError,
    channelsLoading: store.channelsLoading,
    channelsRefreshing: store.channelsRefreshing,
    autoSwitch: store.autoSwitch,
    fetchChannels,
  };
}
