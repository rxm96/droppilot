import { useEffect, useState } from "react";
import type { ErrorInfo, WatchingState } from "../types";
import { errorInfoFromIpc, errorInfoFromUnknown } from "../utils/errors";
import { isIpcAuthErrorResponse, isIpcErrorResponse, isIpcOkFalseResponse } from "../utils/ipc";
import { logInfo, logWarn } from "../utils/logger";

export const WATCH_INTERVAL_MS = 59_000;
const WATCH_JITTER_MS = 8_000;

export type WatchStats = {
  lastOk: number;
  lastError: ErrorInfo | null;
  nextAt: number;
};

type Params = {
  watching: WatchingState;
  bumpStats: (delta: { minutes?: number; lastGame?: string }) => void;
  forwardAuthError: (message?: string) => void;
  demoMode?: boolean;
};

export function useWatchPing({ watching, bumpStats, forwardAuthError, demoMode }: Params) {
  const [watchStats, setWatchStats] = useState<WatchStats>({
    lastOk: 0,
    lastError: null,
    nextAt: 0,
  });

  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    const ping = async () => {
      if (cancelled) return;
      try {
        if (demoMode) {
          logInfo("watch: ping demo", {
            channelId: watching.channelId ?? watching.id,
            login: watching.login ?? watching.name,
            streamId: watching.streamId,
          });
          if (watching.game) {
            void bumpStats({ minutes: 1, lastGame: watching.game });
          }
          if (!cancelled) {
            setWatchStats(() => ({
              lastOk: Date.now(),
              lastError: null,
              nextAt: Date.now() + WATCH_INTERVAL_MS,
            }));
          }
          return;
        }
        logInfo("watch: ping start", {
          channelId: watching.channelId ?? watching.id,
          login: watching.login ?? watching.name,
          streamId: watching.streamId,
        });
        const res = await window.electronAPI.twitch.watch({
          channelId: watching.channelId ?? watching.id,
          login: watching.login ?? watching.name,
          streamId: watching.streamId,
        });
        if (cancelled) return;
        if (isIpcErrorResponse(res)) {
          if (isIpcAuthErrorResponse(res)) {
            forwardAuthError(res.message);
            return;
          }
          throw errorInfoFromIpc(res, "Watch ping failed");
        }
        if (isIpcOkFalseResponse(res)) {
          throw errorInfoFromIpc(res, "Watch ping failed");
        }
        logInfo("watch: ping ok", {
          channelId: watching.channelId ?? watching.id,
          login: watching.login ?? watching.name,
          streamId: watching.streamId,
        });
        if (cancelled) return;
        if (watching.game) {
          void bumpStats({ minutes: 1, lastGame: watching.game });
        }
        if (!cancelled) {
          setWatchStats(() => ({
            lastOk: Date.now(),
            lastError: null,
            nextAt: Date.now() + WATCH_INTERVAL_MS,
          }));
        }
      } catch (err) {
        if (!cancelled) {
          const errInfo = errorInfoFromUnknown(err, "Watch ping failed");
          logWarn("watch: ping error", err);
          setWatchStats((prev) => ({
            lastOk: prev.lastOk,
            lastError: errInfo,
            nextAt: Date.now() + WATCH_INTERVAL_MS,
          }));
        }
      }
    };
    const withJitter = () => WATCH_INTERVAL_MS + Math.floor(Math.random() * WATCH_JITTER_MS);
    let timeout: number | undefined;
    const run = async () => {
      await ping();
      if (cancelled) return;
      timeout = window.setTimeout(run, withJitter());
    };
    run();
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [watching, bumpStats, forwardAuthError, demoMode]);

  useEffect(() => {
    if (watching) return;
    setWatchStats((prev) => {
      if (prev.lastOk === 0 && prev.lastError === null && prev.nextAt === 0) return prev;
      return { lastOk: 0, lastError: null, nextAt: 0 };
    });
  }, [watching]);

  return watchStats;
}
