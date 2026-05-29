import { useEffect, useRef, useState } from "react";
import type { ErrorInfo, WatchingState } from "@renderer/shared/types";
import { errorInfoFromIpc, errorInfoFromUnknown } from "@renderer/shared/utils/errors";
import {
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
  isIpcOkFalseResponse,
} from "@renderer/shared/utils/ipc";
import { logInfo, logWarn } from "@renderer/shared/utils/logger";
import { TWITCH_ERROR_CODES } from "../../../../shared/errorCodes";

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

/**
 * Stable identity of the stream currently being watched, used as the watch-ping
 * effect's dependency. Keying off this primitive (instead of the `watching`
 * object) ensures the ping loop only restarts when the channel/stream actually
 * changes — NOT when an unrelated render produces a fresh-but-equal `watching`
 * reference. A spurious restart would re-run the immediate ping and credit an
 * extra watch minute, inflating stats far beyond the real ~1/min cadence.
 *
 * Game is intentionally excluded: the ping targets a channel/stream, and the
 * loop reads the latest game at ping time, so a game switch on the same stream
 * does not need to restart the loop.
 */
export const buildWatchPingKey = (watching: WatchingState): string => {
  if (!watching) return "";
  const channelId = String(watching.channelId ?? watching.id ?? "").trim();
  const login = String(watching.login ?? watching.name ?? "").trim();
  const streamId = String(watching.streamId ?? "").trim();
  return `${channelId}|${login}|${streamId}`;
};

export function useWatchPing({ watching, bumpStats, forwardAuthError, demoMode }: Params) {
  const [watchStats, setWatchStats] = useState<WatchStats>({
    lastOk: 0,
    lastError: null,
    nextAt: 0,
  });

  // Keep the latest values in refs so the ping loop can read them without
  // listing them as effect dependencies. Their identities can churn between
  // renders; subscribing to them would restart the loop (and immediate-ping)
  // even though the watched stream is unchanged.
  const watchingRef = useRef(watching);
  const bumpStatsRef = useRef(bumpStats);
  const forwardAuthErrorRef = useRef(forwardAuthError);
  watchingRef.current = watching;
  bumpStatsRef.current = bumpStats;
  forwardAuthErrorRef.current = forwardAuthError;

  const watchKey = buildWatchPingKey(watching);

  useEffect(() => {
    if (!watchKey) return;
    let cancelled = false;
    const ping = async () => {
      if (cancelled) return;
      const current = watchingRef.current;
      if (!current) return;
      try {
        if (demoMode) {
          logInfo("watch: ping demo", {
            channelId: current.channelId ?? current.id,
            login: current.login ?? current.name,
            streamId: current.streamId,
          });
          if (current.game) {
            void bumpStatsRef.current({ minutes: 1, lastGame: current.game });
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
          channelId: current.channelId ?? current.id,
          login: current.login ?? current.name,
          streamId: current.streamId,
        });
        const res = await window.electronAPI.twitch.watch({
          channelId: current.channelId ?? current.id,
          login: current.login ?? current.name,
          streamId: current.streamId,
        });
        if (cancelled) return;
        if (isIpcErrorResponse(res)) {
          if (isIpcAuthErrorResponse(res)) {
            forwardAuthErrorRef.current(res.message);
            return;
          }
          throw errorInfoFromIpc(res, {
            code: TWITCH_ERROR_CODES.WATCH_PING_FAILED,
            message: "Watch ping failed",
          });
        }
        if (isIpcOkFalseResponse(res)) {
          throw errorInfoFromIpc(res, {
            code: TWITCH_ERROR_CODES.WATCH_PING_FAILED,
            message: "Watch ping failed",
          });
        }
        logInfo("watch: ping ok", {
          channelId: current.channelId ?? current.id,
          login: current.login ?? current.name,
          streamId: current.streamId,
        });
        if (cancelled) return;
        if (current.game) {
          void bumpStatsRef.current({ minutes: 1, lastGame: current.game });
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
          const errInfo = errorInfoFromUnknown(err, {
            code: TWITCH_ERROR_CODES.WATCH_PING_FAILED,
            message: "Watch ping failed",
          });
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
  }, [watchKey, demoMode]);

  useEffect(() => {
    if (watching) return;
    setWatchStats((prev) => {
      if (prev.lastOk === 0 && prev.lastError === null && prev.nextAt === 0) return prev;
      return { lastOk: 0, lastError: null, nextAt: 0 };
    });
  }, [watching]);

  return watchStats;
}
