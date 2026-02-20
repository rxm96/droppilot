import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAlertEffects } from "./useAlertEffects";
import { useAppActions } from "./useAppActions";
import { useAppBootstrap } from "./useAppBootstrap";
import { useAuth } from "./useAuth";
import { useCampaignWarmup } from "./useCampaignWarmup";
import { buildChannelAllowlist } from "./channelAllowlist";
import { useChannels } from "./useChannels";
import { useDebugCpu } from "./useDebugCpu";
import { useDebugSnapshot } from "./useDebugSnapshot";
import { useDropClaimAlerts } from "./useDropClaimAlerts";
import { useInventory } from "./useInventory";
import { useInventoryRefresh } from "./useInventoryRefresh";
import { usePriorityOrchestration } from "./usePriorityOrchestration";
import { useSettingsStore } from "./useSettingsStore";
import { useSmartAlerts } from "./useSmartAlerts";
import { useStats } from "./useStats";
import { useTargetDrops } from "./useTargetDrops";
import { useWatchPing } from "./useWatchPing";
import { useWatchingController } from "./useWatchingController";
import { useTheme } from "@renderer/shared/theme";
import type { FilterKey, View } from "@renderer/shared/types";
import { isVerboseLoggingEnabled } from "@renderer/shared/utils/logger";

const CLAIM_PROBE_NEAR_END_MINUTES = 1;
const CLAIM_PROBE_INTERVAL_MS = 25_000;

export function useAppModel() {
  const { auth, startLogin, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<View>("inventory");
  const {
    priorityGames,
    obeyPriority,
    language,
    autoStart,
    autoClaim,
    autoSelect,
    autoSwitchEnabled,
    warmupEnabled,
    betaUpdates,
    refreshMinMs,
    refreshMaxMs,
    demoMode,
    debugEnabled,
    alertsEnabled,
    alertsNotifyWhileFocused,
    alertsDropClaimed,
    alertsDropEndingSoon,
    alertsDropEndingMinutes,
    alertsWatchError,
    alertsAutoSwitch,
    alertsNewDrops,
    enableBadgesEmotes,
    allowUnlinkedGames,
    savePriorityGames,
    saveObeyPriority,
    saveLanguage,
    saveAutoStart,
    saveAutoClaim,
    saveAutoSelect,
    saveAutoSwitchEnabled,
    saveWarmupEnabled,
    saveBetaUpdates,
    saveRefreshIntervals,
    saveDemoMode,
    saveDebugEnabled,
    saveAlertsEnabled,
    saveAlertsNotifyWhileFocused,
    saveAlertsDropClaimed,
    saveAlertsDropEndingSoon,
    saveAlertsDropEndingMinutes,
    saveAlertsWatchError,
    saveAlertsAutoSwitch,
    saveAlertsNewDrops,
    saveEnableBadgesEmotes,
    saveAllowUnlinkedGames,
    resetAutomation,
    selectedGame,
    setSelectedGame,
    newGame,
    setNewGame,
    settingsJson,
    setSettingsJson,
    exportSettings,
    importSettings,
    settingsInfo,
    settingsError,
  } = useSettingsStore();
  const [gameFilter, setGameFilter] = useState<string>("all");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { watching, setWatchingFromChannel, clearWatching } = useWatchingController();
  const [autoSelectEnabled, setAutoSelectEnabled] = useState<boolean>(true);
  const claimProbeInFlightRef = useRef(false);
  const claimProbeLastAtRef = useRef(0);

  const isLinked = auth.status === "ok";
  const isLinkedOrDemo = isLinked || demoMode;
  const allowWatching = isLinkedOrDemo;
  const allowWarmup = allowWatching && warmupEnabled;
  const effectiveAuthStatus = demoMode ? "ok" : auth.status;
  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /mac/i.test(navigator.platform),
    [],
  );
  const isWindows = useMemo(
    () => typeof navigator !== "undefined" && /win/i.test(navigator.platform),
    [],
  );

  const authErrorHandlerRef = useRef<(message?: string) => void>(() => {});
  const forwardAuthError = useCallback((message?: string) => {
    authErrorHandlerRef.current?.(message);
  }, []);
  const openAccountLink = useCallback((rawUrl?: string) => {
    const fallbackUrl = "https://www.twitch.tv/settings/connections";
    const url = typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : fallbackUrl;
    try {
      const maybeApi = (globalThis as { electronAPI?: unknown }).electronAPI;
      const maybeOpenExternal =
        maybeApi && typeof maybeApi === "object"
          ? (maybeApi as { openExternal?: unknown }).openExternal
          : undefined;
      if (typeof maybeOpenExternal === "function") {
        void maybeOpenExternal(url);
        return;
      }
    } catch {
      // Fallback below.
    }
    globalThis.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const { stats, bumpStats, resetStats } = useStats({ demoMode });
  const { notify } = useSmartAlerts({
    enabled: alertsEnabled,
    notifyWhileFocused: alertsNotifyWhileFocused,
  });
  const { handleDropClaimed, handleTestAlert } = useDropClaimAlerts({
    language,
    alertsDropClaimed,
    notify,
    bumpStats,
  });

  const {
    inventory,
    inventoryItems,
    campaigns,
    campaignsLoading,
    inventoryRefreshing,
    inventoryChanges,
    inventoryFetchedAt,
    progressAnchorByDropId,
    fetchInventory,
    uniqueGames,
    claimStatus,
    setClaimStatus,
    withCategories,
  } = useInventory(
    isLinkedOrDemo,
    {
      onClaimed: handleDropClaimed,
      onAuthError: forwardAuthError,
    },
    {
      autoClaim,
      demoMode,
      allowUnlinkedBadgeEmotes: enableBadgesEmotes,
      allowUnlinkedGames,
    },
  );

  const inventoryRefresh = useInventoryRefresh({
    watching,
    authStatus: effectiveAuthStatus,
    refreshMinMs,
    refreshMaxMs,
    fetchInventory,
  });
  const watchStats = useWatchPing({ watching, bumpStats, forwardAuthError, demoMode });
  const warmupState = useCampaignWarmup({
    allowWatching: allowWarmup,
    demoMode,
    inventoryStatus: inventory.status,
    inventoryFetchedAt,
    withCategories,
    priorityGames,
    allowUnlinkedGames,
    watching,
    fetchInventory,
    forwardAuthError,
  });

  const { profile, appVersion, updateStatus, setUpdateStatus, trackerStatus, userPubSubStatus } =
    useAppBootstrap({
      authStatus: auth.status,
      demoMode,
      debugEnabled,
      autoSelect,
      view,
      setView,
      setAutoSelectEnabled,
      fetchInventory,
      forwardAuthError,
    });

  const actions = useAppActions({
    newGame,
    setNewGame,
    selectedGame,
    priorityGames,
    dragIndex,
    setDragIndex,
    setDragOverIndex,
    savePriorityGames,
    saveObeyPriority,
    saveAutoStart,
    saveAutoClaim,
    saveAutoSelect,
    saveAutoSwitchEnabled,
    saveWarmupEnabled,
    saveBetaUpdates,
    saveDemoMode,
    saveAlertsEnabled,
    saveAlertsNotifyWhileFocused,
    saveAlertsDropClaimed,
    saveAlertsDropEndingSoon,
    saveAlertsDropEndingMinutes,
    saveAlertsWatchError,
    saveAlertsAutoSwitch,
    saveAlertsNewDrops,
    saveEnableBadgesEmotes,
    saveAllowUnlinkedGames,
    saveRefreshIntervals,
    resetAutomation,
    setWatchingFromChannel,
    clearWatching,
    setAutoSelectEnabled,
    fetchInventory,
    isLinked,
    logout,
    setUpdateStatus,
    setFilter,
  });

  authErrorHandlerRef.current = actions.handleAuthError;

  useEffect(() => {
    if (!claimStatus) return;
    const id = window.setTimeout(() => setClaimStatus(null), 8000);
    return () => window.clearTimeout(id);
  }, [claimStatus, setClaimStatus]);

  const previewPriorityGames =
    dragIndex !== null && dragOverIndex !== null && priorityGames.length > 0
      ? (() => {
          const clone = [...priorityGames];
          if (dragIndex < 0 || dragIndex >= clone.length) return priorityGames;
          const [item] = clone.splice(dragIndex, 1);
          if (item === undefined) return priorityGames;
          const clampedTargetIndex = Math.max(0, Math.min(dragOverIndex, clone.length));
          clone.splice(clampedTargetIndex, 0, item);
          return clone;
        })()
      : priorityGames;

  const {
    activeTargetGame,
    setActiveTargetGame,
    effectivePriorityPlan,
    priorityOrder,
    refreshPriorityPlan,
  } = usePriorityOrchestration({
    demoMode,
    inventoryStatus: inventory.status,
    inventoryItems,
    withCategories,
    priorityGames,
    obeyPriority,
    allowUnlinkedGames,
    watching,
    stopWatching: actions.stopWatching,
  });

  const targetGame = activeTargetGame || "";
  const {
    targetDrops,
    totalDrops,
    claimedDrops,
    totalRequiredMinutes,
    totalEarnedMinutes,
    targetProgress,
    activeDropInfo,
    canWatchTarget,
    showNoDropsHint,
  } = useTargetDrops({
    targetGame,
    inventoryItems,
    withCategories,
    allowWatching,
    allowUnlinkedGames,
    watching,
    inventoryFetchedAt,
    progressAnchorByDropId,
  });
  const channelAllowlist = useMemo(
    () =>
      buildChannelAllowlist({
        targetGame,
        withCategories,
        allowUpcoming: allowUnlinkedGames,
      }),
    [allowUnlinkedGames, targetGame, withCategories],
  );

  const { channels, channelDiff, channelError, channelsLoading, channelsRefreshing, autoSwitch } =
    useChannels({
      targetGame,
      view,
      watching,
      setWatchingFromChannel,
      clearWatching,
      autoSelectEnabled,
      autoSwitchEnabled,
      forcePrioritySwitch: obeyPriority,
      allowWatching,
      canWatchTarget,
      trackerMode: trackerStatus?.mode,
      demoMode,
      onAuthError: forwardAuthError,
      channelAllowlist,
    });

  const { autoSwitchInfo } = useAlertEffects({
    language,
    notify,
    alertsNewDrops,
    alertsWatchError,
    alertsAutoSwitch,
    alertsDropEndingSoon,
    alertsDropEndingMinutes,
    inventory,
    inventoryItems,
    inventoryChanges,
    watchStats,
    autoSwitch,
    activeDropInfo,
    watching,
  });

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
  }, [activeDropInfo, fetchInventory, inventoryFetchedAt, watchStats.lastOk, watching]);

  const debugCpu = useDebugCpu({
    enabled: debugEnabled && view === "debug" && isVerboseLoggingEnabled(),
  });
  const debugSnapshot = useDebugSnapshot({
    authStatus: auth.status,
    isLinked,
    demoMode,
    profile,
    watching,
    targetGame,
    inventory,
    inventoryItemsCount: inventoryItems.length,
    inventoryRefreshing,
    inventoryFetchedAt,
    inventoryRefresh,
    channelsCount: channels.length,
    channelsLoading,
    channelsRefreshing,
    channelDiff,
    channelError,
    autoClaim,
    autoSelectEnabled,
    autoSwitchEnabled,
    warmupEnabled,
    obeyPriority,
    allowWatching,
    refreshMinMs,
    refreshMaxMs,
    watchStats,
    activeDropInfo,
    activeTargetGame,
    priorityOrder,
    stats,
    cpu: debugCpu,
    trackerStatus,
    userPubSubStatus,
    warmup: warmupState,
  });

  const navProps = {
    view,
    setView,
    auth,
    startLogin,
    logout,
    showDebug: debugEnabled,
  };
  const overviewProps = { inventory, stats, resetStats };
  const inventoryProps = {
    inventory,
    filter,
    onFilterChange: actions.handleFilterChange,
    gameFilter,
    onGameFilterChange: setGameFilter,
    uniqueGames,
    refreshing: inventoryRefreshing,
    onRefresh: actions.handleFetchInventory,
    campaigns,
    campaignsLoading,
    isLinked: isLinkedOrDemo,
    allowUnlinkedGames,
    priorityGames,
    onAddPriorityGame: actions.addGameByName,
    onOpenAccountLink: openAccountLink,
  };
  const priorityProps = {
    uniqueGames,
    selectedGame,
    setSelectedGame,
    newGame,
    setNewGame,
    addGame: actions.addGame,
    addGameFromSelect: actions.addGameFromSelect,
    priorityGames,
    previewPriorityGames,
    removeGame: actions.removeGame,
    dragIndex,
    dragOverIndex,
    setDragIndex,
    setDragOverIndex,
    handleDropReorder: actions.handleDropReorder,
    obeyPriority,
    setObeyPriority: actions.handleSetObeyPriority,
  };
  const settingsProps = {
    isLinked,
    theme,
    setTheme,
    autoStart,
    setAutoStart: actions.handleSetAutoStart,
    autoClaim,
    setAutoClaim: actions.handleSetAutoClaim,
    autoSelect,
    setAutoSelect: actions.handleSetAutoSelect,
    autoSwitchEnabled,
    setAutoSwitchEnabled: actions.handleSetAutoSwitchEnabled,
    warmupEnabled,
    setWarmupEnabled: actions.handleSetWarmupEnabled,
    betaUpdates,
    setBetaUpdates: actions.handleSetBetaUpdates,
    demoMode,
    setDemoMode: actions.handleSetDemoMode,
    debugEnabled,
    setDebugEnabled: saveDebugEnabled,
    alertsEnabled,
    setAlertsEnabled: actions.handleSetAlertsEnabled,
    alertsNotifyWhileFocused,
    setAlertsNotifyWhileFocused: actions.handleSetAlertsNotifyWhileFocused,
    alertsDropClaimed,
    setAlertsDropClaimed: actions.handleSetAlertsDropClaimed,
    alertsDropEndingSoon,
    setAlertsDropEndingSoon: actions.handleSetAlertsDropEndingSoon,
    alertsDropEndingMinutes,
    setAlertsDropEndingMinutes: actions.handleSetAlertsDropEndingMinutes,
    alertsWatchError,
    setAlertsWatchError: actions.handleSetAlertsWatchError,
    alertsAutoSwitch,
    setAlertsAutoSwitch: actions.handleSetAlertsAutoSwitch,
    alertsNewDrops,
    setAlertsNewDrops: actions.handleSetAlertsNewDrops,
    enableBadgesEmotes,
    setEnableBadgesEmotes: actions.handleSetEnableBadgesEmotes,
    allowUnlinkedGames,
    setAllowUnlinkedGames: actions.handleSetAllowUnlinkedGames,
    sendTestAlert: handleTestAlert,
    refreshMinMs,
    refreshMaxMs,
    setRefreshIntervals: actions.handleSetRefreshIntervals,
    resetAutomation: actions.handleResetAutomation,
    language,
    setLanguage: saveLanguage,
    settingsJson,
    setSettingsJson,
    exportSettings,
    importSettings,
    settingsInfo,
    settingsError,
    showUpdateCheck: isWindows,
    showAutoStart: isWindows,
    updateStatus,
    checkUpdates: actions.handleCheckUpdates,
    downloadUpdate: actions.handleDownloadUpdate,
    installUpdate: actions.handleInstallUpdate,
  };
  const controlProps = {
    priorityPlan: effectivePriorityPlan,
    priorityGames,
    targetGame,
    setActiveTargetGame,
    targetDrops,
    targetProgress,
    totalDrops,
    claimedDrops,
    totalEarnedMinutes,
    totalRequiredMinutes,
    inventoryRefreshing,
    inventoryFetchedAt,
    fetchInventory: actions.handleFetchInventory,
    refreshPriorityPlan,
    watching,
    stopWatching: actions.handleStopWatching,
    channels,
    channelsLoading,
    channelsRefreshing,
    channelDiff,
    channelError,
    startWatching: actions.startWatching,
    activeDropInfo,
    claimStatus,
    canWatchTarget,
    showNoDropsHint,
    lastWatchOk: watchStats.lastOk,
    watchError: watchStats.lastError,
    autoSwitchInfo,
    trackerStatus,
  };

  const heroProps = {
    demoMode,
    profile,
    nextWatchAt: watchStats.nextAt || undefined,
    watchError: watchStats.lastError,
    activeGame: targetGame,
    dropsTotal: totalDrops,
    dropsClaimed: claimedDrops,
    targetProgress,
    warmupActive: warmupState.active,
    warmupGame: warmupState.game,
  };

  const titleBarProps = {
    version: appVersion,
    theme,
    setTheme,
    updateStatus,
    onDownloadUpdate: actions.handleDownloadUpdate,
    onInstallUpdate: actions.handleInstallUpdate,
  };

  const updateOverlayProps = {
    updateStatus,
    onInstallUpdate: actions.handleInstallUpdate,
  };

  return {
    language,
    isMac,
    heroProps,
    titleBarProps,
    updateOverlayProps,
    navProps,
    overviewProps,
    inventoryProps,
    priorityProps,
    settingsProps,
    controlProps,
    debugSnapshot,
    debugEnabled,
  };
}
