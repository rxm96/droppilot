import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AutoSwitchInfo, ChannelDiff, ChannelEntry, ErrorInfo } from "@renderer/shared/types";

export type ChannelStore = {
  channels: ChannelEntry[];
  channelDiff: ChannelDiff | null;
  channelError: ErrorInfo | null;
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  autoSwitch: AutoSwitchInfo | null;
  fetchedAt: number | null;
  fetchedGame: string;
  channelsRef: MutableRefObject<ChannelEntry[]>;
  targetGameRef: MutableRefObject<string>;
  shouldTrackChannelsRef: MutableRefObject<boolean>;
  applyChannelsState: (next: ChannelEntry[]) => void;
  setChannelDiff: Dispatch<SetStateAction<ChannelDiff | null>>;
  setChannelError: Dispatch<SetStateAction<ErrorInfo | null>>;
  setChannelsLoading: Dispatch<SetStateAction<boolean>>;
  setChannelsRefreshing: Dispatch<SetStateAction<boolean>>;
  setAutoSwitch: Dispatch<SetStateAction<AutoSwitchInfo | null>>;
  setFetchedAt: Dispatch<SetStateAction<number | null>>;
  setFetchedGame: Dispatch<SetStateAction<string>>;
  resetChannelData: () => void;
};

export function useChannelStore({
  targetGame,
  shouldTrackChannels,
  demoMode,
}: {
  targetGame: string;
  shouldTrackChannels: boolean;
  demoMode?: boolean;
}): ChannelStore {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const channelsRef = useRef<ChannelEntry[]>([]);
  const [channelError, setChannelError] = useState<ErrorInfo | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsRefreshing, setChannelsRefreshing] = useState(false);
  const [channelDiff, setChannelDiff] = useState<ChannelDiff | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [fetchedGame, setFetchedGame] = useState<string>("");
  const [autoSwitch, setAutoSwitch] = useState<AutoSwitchInfo | null>(null);
  const targetGameRef = useRef(targetGame);
  const shouldTrackChannelsRef = useRef(shouldTrackChannels);
  const trackerClearedRef = useRef(false);

  targetGameRef.current = targetGame;
  shouldTrackChannelsRef.current = shouldTrackChannels;

  const applyChannelsState = useCallback((next: ChannelEntry[]) => {
    channelsRef.current = next;
    setChannels(next);
  }, []);

  // Two reset depths. resetChannelData wipes the data plane only (list/diff/error/
  // fetch metadata); resetAll additionally clears the loading flags and autoSwitch.
  // The target-game-switch path uses the former; demo-toggle and tracking-disabled
  // use the latter. Keep them distinct — collapsing them would change behavior.
  const resetChannelData = useCallback(() => {
    applyChannelsState([]);
    setChannelDiff(null);
    setChannelError(null);
    setFetchedAt(null);
    setFetchedGame("");
  }, [applyChannelsState]);

  const resetAll = useCallback(() => {
    resetChannelData();
    setChannelsLoading(false);
    setChannelsRefreshing(false);
    setAutoSwitch(null);
  }, [resetChannelData]);

  // Reset when switching demo mode.
  useEffect(() => {
    if (demoMode === undefined) return;
    resetAll();
  }, [demoMode, resetAll]);

  // Tracking turned off -> wipe state AND tell the main process to stop the tracker.
  // The trackerClearChannels IPC is co-located with resetAll (rather than split into a
  // separate effect in useChannels) so the "disabled" transition stays atomic and the
  // trackerCleared guard has a single owner.
  useEffect(() => {
    if (shouldTrackChannels) {
      trackerClearedRef.current = false;
      return;
    }
    resetAll();
    if (!trackerClearedRef.current) {
      trackerClearedRef.current = true;
      void window.electronAPI.twitch.trackerClearChannels?.();
    }
  }, [resetAll, shouldTrackChannels]);

  return {
    channels,
    channelDiff,
    channelError,
    channelsLoading,
    channelsRefreshing,
    autoSwitch,
    fetchedAt,
    fetchedGame,
    channelsRef,
    targetGameRef,
    shouldTrackChannelsRef,
    applyChannelsState,
    setChannelDiff,
    setChannelError,
    setChannelsLoading,
    setChannelsRefreshing,
    setAutoSwitch,
    setFetchedAt,
    setFetchedGame,
    resetChannelData,
  };
}
