import { useCallback, useRef } from "react";
import type { ChannelEntry } from "@renderer/shared/types";
import { logWarn } from "@renderer/shared/utils/logger";

type Params = {
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
  setAutoSelectEnabled: (next: boolean) => void;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<void>;
  isLinked: boolean;
  logout: () => Promise<void>;
};

export type AuthErrorTracker = { count: number; lastAt: number };

const AUTH_ERROR_WINDOW_MS = 2 * 60_000;
const AUTH_ERROR_MAX_SOFT = 1;

export const updateAuthErrorTracker = (
  tracker: AuthErrorTracker,
  now: number,
  windowMs: number,
): AuthErrorTracker => {
  const isStale = now - tracker.lastAt > windowMs;
  const nextCount = (isStale ? 0 : tracker.count) + 1;
  return { count: nextCount, lastAt: now };
};

export const shouldLogoutForAuthError = ({
  token,
  expiresAt,
  now,
  maxSoft,
  count,
}: {
  token: string;
  expiresAt: number;
  now: number;
  maxSoft: number;
  count: number;
}): boolean => {
  const expired = expiresAt > 0 && expiresAt <= now;
  return !token || expired || count > maxSoft;
};

export function useWatchingActions({
  setWatchingFromChannel,
  clearWatching,
  setAutoSelectEnabled,
  fetchInventory,
  isLinked,
  logout,
}: Params) {
  const authErrorRef = useRef<AuthErrorTracker>({ count: 0, lastAt: 0 });

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
      const nextTracker = updateAuthErrorTracker(authErrorRef.current, now, AUTH_ERROR_WINDOW_MS);
      authErrorRef.current = nextTracker;

      void (async () => {
        const session = await window.electronAPI.auth.session().catch(() => null);
        const token = session?.accessToken?.trim?.() ?? "";
        const expiresAt = typeof session?.expiresAt === "number" ? session.expiresAt : 0;
        const shouldLogout = shouldLogoutForAuthError({
          token,
          expiresAt,
          now: Date.now(),
          maxSoft: AUTH_ERROR_MAX_SOFT,
          count: nextTracker.count,
        });
        if (shouldLogout) {
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
