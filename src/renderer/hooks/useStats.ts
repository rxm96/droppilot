import { useCallback, useEffect, useState } from "react";
import type { StatsData, StatsState } from "../types";
import { isIpcErrorResponse, isStatsData } from "../utils/ipc";
import { errorInfoFromIpc, errorInfoFromUnknown } from "../utils/errors";

const computeNext = (
  current: StatsData,
  delta: { minutes?: number; claims?: number; lastDropTitle?: string; lastGame?: string },
): StatsData => {
  const minutes = Math.max(0, delta.minutes ?? 0);
  const claims = Math.max(0, delta.claims ?? 0);
  const nextClaimsByGame = { ...(current.claimsByGame ?? {}) };
  if (claims > 0 && delta.lastGame) {
    const key = String(delta.lastGame).trim();
    if (key) {
      nextClaimsByGame[key] = Math.max(0, (nextClaimsByGame[key] ?? 0) + claims);
    }
  }
  return {
    ...current,
    totalMinutes: Math.max(0, current.totalMinutes + minutes),
    totalClaims: Math.max(0, current.totalClaims + claims),
    lastMinuteAt: minutes > 0 ? Date.now() : current.lastMinuteAt,
    lastClaimAt: claims > 0 ? Date.now() : current.lastClaimAt,
    lastDropTitle: delta.lastDropTitle ?? current.lastDropTitle,
    lastGame: delta.lastGame ?? current.lastGame,
    claimsByGame: nextClaimsByGame,
  };
};

type StatsHookOptions = {
  demoMode?: boolean;
};

export function useStats(options: StatsHookOptions = {}) {
  const demoMode = options.demoMode === true;
  const [stats, setStats] = useState<StatsState>({ status: "idle" });

  const loadStats = useCallback(async () => {
    setStats((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    try {
      const res: unknown = await window.electronAPI.stats.get();
      if (isIpcErrorResponse(res)) {
        const errInfo = errorInfoFromIpc(res, {
          code: "stats.load_failed",
          message: "Unable to load stats",
        });
        setStats({
          status: "error",
          message: errInfo.message ?? "Unable to load stats",
          code: errInfo.code,
        });
        return;
      }
      if (!isStatsData(res)) {
        setStats({
          status: "error",
          message: "Invalid stats response",
          code: "stats.invalid_response",
        });
        return;
      }
      setStats({ status: "ready", data: res });
    } catch (err) {
      const errInfo = errorInfoFromUnknown(err, {
        code: "stats.load_failed",
        message: "Stats request failed",
      });
      setStats({
        status: "error",
        message: errInfo.message ?? "Stats request failed",
        code: errInfo.code,
      });
    }
  }, []);

  const bumpStats = useCallback(
    async (delta: {
      minutes?: number;
      claims?: number;
      lastDropTitle?: string;
      lastGame?: string;
    }) => {
      if (demoMode) return;
      setStats((prev) => {
        if (prev.status === "ready" && prev.data) {
          return { status: "ready", data: computeNext(prev.data, delta) };
        }
        return prev;
      });
      try {
        const res: unknown = await window.electronAPI.stats.bump(delta);
        if (!isStatsData(res)) return;
        setStats({ status: "ready", data: res });
      } catch {
        // ignore
      }
    },
    [demoMode],
  );

  const resetStats = useCallback(async () => {
    if (demoMode) return;
    try {
      const res: unknown = await window.electronAPI.stats.reset();
      if (!isStatsData(res)) {
        setStats({
          status: "error",
          message: "Failed to reset stats",
          code: "stats.reset_failed",
        });
        return;
      }
      setStats({ status: "ready", data: res });
    } catch (err) {
      const errInfo = errorInfoFromUnknown(err, {
        code: "stats.reset_failed",
        message: "Failed to reset stats",
      });
      setStats({
        status: "error",
        message: errInfo.message ?? "Failed to reset stats",
        code: errInfo.code,
      });
    }
  }, [demoMode]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return {
    stats,
    loadStats,
    bumpStats,
    resetStats,
  };
}
