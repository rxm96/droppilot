import { useCallback, useEffect, useState } from "react";
import type { StatsData, StatsState } from "../types";

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
      const res = await window.electronAPI.stats.get();
      if ((res as any)?.error) {
        setStats({ status: "error", message: (res as any).message ?? "Konnte Stats nicht laden" });
        return;
      }
      setStats({ status: "ready", data: res as StatsData });
    } catch (err) {
      setStats({ status: "error", message: err instanceof Error ? err.message : "Stats: Fehler" });
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
        const res = await window.electronAPI.stats.bump(delta);
        if ((res as any)?.error) return;
        setStats({ status: "ready", data: res as StatsData });
      } catch {
        // ignore
      }
    },
    [demoMode],
  );

  const resetStats = useCallback(async () => {
    if (demoMode) return;
    try {
      const res = await window.electronAPI.stats.reset();
      setStats({ status: "ready", data: res as StatsData });
    } catch (err) {
      setStats({
        status: "error",
        message: err instanceof Error ? err.message : "Stats: Reset fehlgeschlagen",
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
