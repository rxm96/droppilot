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
  resetAll: () => void;
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

  // Tear down + clear tracker subscriptions when tracking is disabled.
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
    resetAll,
  };
}
