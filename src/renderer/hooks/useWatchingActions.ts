import { useCallback, useRef } from "react";
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
  const authErrorRef = useRef({ count: 0, lastAt: 0 });
  const AUTH_ERROR_WINDOW_MS = 2 * 60_000;
  const AUTH_ERROR_MAX_SOFT = 1;

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
      const now = Date.now();
      const tracker = authErrorRef.current;
      if (now - tracker.lastAt > AUTH_ERROR_WINDOW_MS) {
        tracker.count = 0;
      }
      tracker.count += 1;
      tracker.lastAt = now;

      void (async () => {
        const session = await window.electronAPI.auth.session().catch(() => null);
        const token = session?.accessToken?.trim?.() ?? "";
        const expiresAt = typeof session?.expiresAt === "number" ? session.expiresAt : 0;
        const expired = expiresAt > 0 && expiresAt <= Date.now();

        if (!token || expired || tracker.count > AUTH_ERROR_MAX_SOFT) {
          void logout();
          return;
        }
        logWarn("auth: transient error, keeping session", { message, expiresAt });
      })();
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
