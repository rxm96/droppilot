import { useCallback } from "react";
import type { ChannelEntry } from "../types";
import { logWarn } from "../utils/logger";

type Params = {
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
  setAutoSelectEnabled: (next: boolean) => void;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<void>;
  isLinked: boolean;
  logout: () => Promise<void>;
};

export function useWatchingActions({
  setWatchingFromChannel,
  clearWatching,
  setAutoSelectEnabled,
  fetchInventory,
  isLinked,
  logout,
}: Params) {
  const startWatching = useCallback(
    (ch: ChannelEntry) => {
      setAutoSelectEnabled(true);
      setWatchingFromChannel(ch);
      fetchInventory();
    },
    [fetchInventory, setAutoSelectEnabled, setWatchingFromChannel],
  );

  const stopWatching = useCallback(
    (opts?: { skipRefresh?: boolean }) => {
      setAutoSelectEnabled(false);
      clearWatching();
      if (!opts?.skipRefresh) {
        void fetchInventory({ forceLoading: true });
      }
    },
    [clearWatching, fetchInventory, setAutoSelectEnabled],
  );

  const handleAuthError = useCallback(
    (message?: string) => {
      if (!isLinked) return;
      logWarn("auth: invalid", { message });
      stopWatching({ skipRefresh: true });
      void logout();
    },
    [isLinked, stopWatching, logout],
  );

  const handleFetchInventory = useCallback(() => {
    void fetchInventory();
  }, [fetchInventory]);

  const handleStopWatching = useCallback(() => {
    stopWatching();
  }, [stopWatching]);

  return {
    startWatching,
    stopWatching,
    handleAuthError,
    handleFetchInventory,
    handleStopWatching,
  };
}
