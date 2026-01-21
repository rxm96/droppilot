import { useMemo } from "react";
import type {
  AuthState,
  ErrorInfo,
  InventoryState,
  ProfileState,
  StatsState,
  WatchingState,
} from "../../types";
import type { InventoryRefreshState } from "../inventory/useInventoryRefresh";
import type { WatchStats } from "../control/useWatchPing";
import type { ActiveDropInfo } from "../control/useTargetDrops";

const formatTimestamp = (value: number | null | undefined) =>
  value && value > 0 ? new Date(value).toISOString() : null;

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
        fetchedAt: formatTimestamp(inventoryFetchedAt),
      },
      inventoryRefresh: {
        mode: inventoryRefresh.mode,
        lastRun: formatTimestamp(inventoryRefresh.lastRun),
        nextAt: formatTimestamp(inventoryRefresh.nextAt),
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
        lastOk: formatTimestamp(watchStats.lastOk),
        nextAt: formatTimestamp(watchStats.nextAt),
        error: watchStats.lastError
          ? { code: watchStats.lastError.code, message: watchStats.lastError.message }
          : null,
      },
      activeDropInfo: activeDropInfo
        ? {
            ...activeDropInfo,
            eta: formatTimestamp(activeDropInfo.eta ?? null),
          }
        : null,
      priority: {
        activeTargetGame,
        order: priorityOrder,
      },
      stats:
        stats.status === "ready"
          ? {
              ...stats.data,
              lastReset: formatTimestamp(stats.data.lastReset),
              lastMinuteAt: formatTimestamp(stats.data.lastMinuteAt),
              lastClaimAt: formatTimestamp(stats.data.lastClaimAt),
            }
          : { status: stats.status },
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
      watchStats.lastError,
      watchStats.lastOk,
      watchStats.nextAt,
      watching,
    ],
  );
}
