import { useEffect, useRef } from "react";
import type { WatchingState } from "@renderer/shared/types";
import type { ActiveDropInfo } from "@renderer/shared/hooks/inventory";
import { CLAIM_PROBE_NEAR_END_MINUTES } from "./watchStallRecovery";

const CLAIM_PROBE_INTERVAL_MS = 25_000;

type Params = {
  watching: WatchingState;
  activeDropInfo: ActiveDropInfo | null;
  inventoryFetchedAt: number | null;
  // watchStats.lastOk — unused in the effect body, but deliberately in the deps:
  // each successful watch ping re-evaluates the near-end predicate, which is how
  // the probe arms itself as predicted remaining time crosses the threshold.
  lastWatchOk: number;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<unknown>;
};

export function useClaimProbe({
  watching,
  activeDropInfo,
  inventoryFetchedAt,
  lastWatchOk,
  fetchInventory,
}: Params) {
  const claimProbeInFlightRef = useRef(false);
  const claimProbeLastAtRef = useRef(0);

  useEffect(() => {
    if (!watching || !activeDropInfo) return;
    const anchorAt = activeDropInfo.progressAnchorAt ?? inventoryFetchedAt;
    const remainingBase = Math.max(
      0,
      activeDropInfo.requiredMinutes - activeDropInfo.earnedMinutes,
    );
    const elapsedMinutes =
      typeof anchorAt === "number" && Number.isFinite(anchorAt)
        ? Math.max(0, (Date.now() - anchorAt) / 60_000)
        : 0;
    const predictedRemainingMinutes = Math.max(0, remainingBase - elapsedMinutes);
    if (predictedRemainingMinutes > CLAIM_PROBE_NEAR_END_MINUTES) return;

    let cancelled = false;
    const runProbe = async () => {
      if (cancelled) return;
      const now = Date.now();
      if (claimProbeInFlightRef.current) return;
      if (now - claimProbeLastAtRef.current < CLAIM_PROBE_INTERVAL_MS) return;
      claimProbeInFlightRef.current = true;
      claimProbeLastAtRef.current = now;
      try {
        await fetchInventory({ forceLoading: true });
      } finally {
        claimProbeInFlightRef.current = false;
      }
    };

    void runProbe();
    const timer = window.setInterval(() => {
      void runProbe();
    }, CLAIM_PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeDropInfo, fetchInventory, inventoryFetchedAt, lastWatchOk, watching]);
}
