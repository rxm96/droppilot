import { useMemo } from "react";
import type {
  AuthState,
  ErrorInfo,
  InventoryState,
  ProfileState,
  StatsState,
  WatchingState,
} from "../types";
import type { InventoryRefreshState } from "./useInventoryRefresh";
import type { WatchStats } from "./useWatchPing";
import type { ActiveDropInfo } from "./useTargetDrops";
import { getPerfSnapshot } from "../utils/perfStore";
import type { CpuSample } from "./useDebugCpu";

type Params = {
  authStatus: AuthState["status"];
  isLinked: boolean;
  demoMode: boolean;
  profile: ProfileState;
  watching: WatchingState;
  targetGame: string;
  inventory: InventoryState;
  inventoryItemsCount: number;
  inventoryRefreshing: boolean;
  inventoryFetchedAt: number | null;
  inventoryRefresh: InventoryRefreshState;
  channelsCount: number;
  channelsLoading: boolean;
  channelError: ErrorInfo | null;
  autoClaim: boolean;
  autoSelectEnabled: boolean;
  autoSwitchEnabled: boolean;
  obeyPriority: boolean;
  refreshMinMs: number;
  refreshMaxMs: number;
  watchStats: WatchStats;
  activeDropInfo: ActiveDropInfo | null;
  activeTargetGame: string;
  priorityOrder: string[];
  stats: StatsState;
  cpu: CpuSample;
};

export function useDebugSnapshot({
  authStatus,
  isLinked,
  demoMode,
  profile,
  watching,
  targetGame,
  inventory,
  inventoryItemsCount,
  inventoryRefreshing,
  inventoryFetchedAt,
  inventoryRefresh,
  channelsCount,
  channelsLoading,
  channelError,
  autoClaim,
  autoSelectEnabled,
  autoSwitchEnabled,
  obeyPriority,
  refreshMinMs,
  refreshMaxMs,
  watchStats,
  activeDropInfo,
  activeTargetGame,
  priorityOrder,
  stats,
  cpu,
}: Params) {
  return useMemo(
    () => ({
      auth: { status: authStatus, linked: isLinked, demoMode },
      profile:
        profile.status === "ready"
          ? { status: profile.status, displayName: profile.displayName, login: profile.login }
          : { status: profile.status },
      watching,
      targetGame,
      inventory: {
        status: inventory.status,
        items: inventoryItemsCount,
        refreshing: inventoryRefreshing,
        fetchedAt: inventoryFetchedAt,
      },
      inventoryRefresh: {
        mode: inventoryRefresh.mode,
        lastRun: inventoryRefresh.lastRun ? new Date(inventoryRefresh.lastRun).toISOString() : null,
        nextAt: inventoryRefresh.nextAt ? new Date(inventoryRefresh.nextAt).toISOString() : null,
      },
      channels: {
        count: channelsCount,
        loading: channelsLoading,
        error: channelError ? { code: channelError.code, message: channelError.message } : null,
      },
      automation: {
        autoClaim,
        autoSelectEnabled,
        autoSwitchEnabled,
        obeyPriority,
        refreshMinMs,
        refreshMaxMs,
      },
      watch: {
        lastOk: watchStats.lastOk,
        nextAt: watchStats.nextAt,
        error: watchStats.lastError
          ? { code: watchStats.lastError.code, message: watchStats.lastError.message }
          : null,
      },
      activeDropInfo,
      priority: {
        activeTargetGame,
        order: priorityOrder,
      },
      cpu,
      perf: getPerfSnapshot(),
      stats: stats.status === "ready" ? stats.data : { status: stats.status },
    }),
    [
      activeDropInfo,
      activeTargetGame,
      authStatus,
      autoClaim,
      autoSelectEnabled,
      autoSwitchEnabled,
      channelError,
      channelsCount,
      channelsLoading,
      demoMode,
      inventory.status,
      inventoryFetchedAt,
      inventoryItemsCount,
      inventoryRefresh.lastRun,
      inventoryRefresh.mode,
      inventoryRefresh.nextAt,
      inventoryRefreshing,
      isLinked,
      obeyPriority,
      priorityOrder,
      profile,
      refreshMaxMs,
      refreshMinMs,
      stats,
      targetGame,
      cpu,
      watchStats.lastError,
      watchStats.lastOk,
      watchStats.nextAt,
      watching,
    ],
  );
}
