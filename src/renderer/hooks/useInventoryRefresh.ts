import { useEffect, useRef, useState } from "react";
import type { AuthState, WatchingState } from "../types";
import { logDebug, logInfo } from "../utils/logger";

export type InventoryRefreshState = {
  mode: "watching" | "idle" | null;
  lastRun: number;
  nextAt: number;
};

type FetchInventory = (opts?: { forceLoading?: boolean }) => Promise<void>;

type Params = {
  watching: WatchingState;
  authStatus: AuthState["status"];
  refreshMinMs: number;
  refreshMaxMs: number;
  fetchInventory: FetchInventory;
};

const MIN_REFRESH_MS = 60_000;

export function useInventoryRefresh({
  watching,
  authStatus,
  refreshMinMs,
  refreshMaxMs,
  fetchInventory,
}: Params) {
  const [inventoryRefresh, setInventoryRefresh] = useState<InventoryRefreshState>({
    mode: null,
    lastRun: 0,
    nextAt: 0,
  });
  const fetchInventoryRef = useRef(fetchInventory);

  useEffect(() => {
    fetchInventoryRef.current = fetchInventory;
  }, [fetchInventory]);

  useEffect(() => {
    if (authStatus === "ok") return;
    setInventoryRefresh({ mode: null, lastRun: 0, nextAt: 0 });
  }, [authStatus]);

  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    let timeout: number | undefined;
    const minDelay = Math.max(MIN_REFRESH_MS, refreshMinMs);
    const maxDelay = Math.max(minDelay, refreshMaxMs);
    const withJitter = () => minDelay + Math.floor(Math.random() * Math.max(1, maxDelay - minDelay));
    const scheduleNext = (delayMs: number) => {
      const nextAt = Date.now() + delayMs;
      setInventoryRefresh((prev) => ({
        mode: "watching",
        lastRun: prev.lastRun,
        nextAt,
      }));
      logDebug("heartbeat: inventory refresh scheduled", { mode: "watching", delayMs, nextAt });
      timeout = window.setTimeout(() => {
        void tick();
      }, delayMs);
    };
    const tick = async () => {
      if (cancelled) return;
      const startedAt = Date.now();
      setInventoryRefresh((prev) => ({
        mode: "watching",
        lastRun: startedAt,
        nextAt: prev.nextAt,
      }));
      logInfo("heartbeat: inventory refresh run", { mode: "watching", at: startedAt });
      await fetchInventoryRef.current();
      if (cancelled) return;
      scheduleNext(withJitter());
    };
    scheduleNext(minDelay);
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [watching, refreshMinMs, refreshMaxMs]);

  useEffect(() => {
    if (watching) return;
    if (authStatus !== "ok") return;
    let cancelled = false;
    const minDelay = Math.max(MIN_REFRESH_MS, refreshMinMs);
    const maxDelay = Math.max(minDelay, refreshMaxMs);
    const withJitter = () => minDelay + Math.floor(Math.random() * Math.max(1, maxDelay - minDelay));
    let timeout: number | undefined;
    const scheduleNext = (delayMs: number) => {
      const nextAt = Date.now() + delayMs;
      setInventoryRefresh((prev) => ({
        mode: "idle",
        lastRun: prev.lastRun,
        nextAt,
      }));
      logDebug("heartbeat: inventory refresh scheduled", { mode: "idle", delayMs, nextAt });
      timeout = window.setTimeout(() => {
        void run();
      }, delayMs);
    };
    const run = async () => {
      if (cancelled) return;
      const startedAt = Date.now();
      setInventoryRefresh((prev) => ({
        mode: "idle",
        lastRun: startedAt,
        nextAt: prev.nextAt,
      }));
      logInfo("heartbeat: inventory refresh run", { mode: "idle", at: startedAt });
      await fetchInventoryRef.current();
      if (!cancelled) {
        scheduleNext(withJitter());
      }
    };
    scheduleNext(minDelay);
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [watching, authStatus, refreshMinMs, refreshMaxMs]);

  return inventoryRefresh;
}
