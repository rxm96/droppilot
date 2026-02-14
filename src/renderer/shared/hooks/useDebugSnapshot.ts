import { useMemo } from "react";
import type {
  AuthState,
  ChannelDiff,
  ChannelTrackerStatus,
  ErrorInfo,
  InventoryState,
  ProfileState,
  StatsState,
  UserPubSubStatus,
  WatchingState,
} from "@renderer/shared/types";
import type { InventoryRefreshState } from "./useInventoryRefresh";
import type { WatchStats } from "./useWatchPing";
import type { ActiveDropInfo } from "./useTargetDrops";
import { getPerfSnapshot } from "@renderer/shared/utils/perfStore";
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
  channelsRefreshing?: boolean;
  channelDiff?: ChannelDiff | null;
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
  trackerStatus: ChannelTrackerStatus | null;
  userPubSubStatus: UserPubSubStatus | null;
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
  channelsRefreshing,
  channelDiff,
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
  trackerStatus,
  userPubSubStatus,
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
        refreshing: channelsRefreshing ?? false,
        diff: channelDiff
          ? {
              at: channelDiff.at,
              added: channelDiff.addedIds.length,
              removed: channelDiff.removedIds.length,
              updated: channelDiff.updatedIds.length,
            }
          : null,
        error: channelError ? { code: channelError.code, message: channelError.message } : null,
      },
      tracker: trackerStatus,
      userPubSub: userPubSubStatus,
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
      channelsRefreshing,
      channelDiff,
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
      trackerStatus,
      userPubSubStatus,
      cpu,
      watchStats.lastError,
      watchStats.lastOk,
      watchStats.nextAt,
      watching,
    ],
  );
}
