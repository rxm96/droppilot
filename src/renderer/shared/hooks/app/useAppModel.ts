import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAlertEffects } from "./useAlertEffects";
import { useAppActions } from "./useAppActions";
import { useAppBootstrap } from "./useAppBootstrap";
import { useAuth } from "./useAuth";
import {
  useCampaignWarmup,
  useDropClaimAlerts,
  useInventory,
  useInventoryRefresh,
  useTargetDrops,
} from "@renderer/shared/hooks/inventory";
import {
  buildChannelAllowlist,
  filterCategoriesForOrchestration,
  useChannels,
  useClaimProbe,
  useWatchPing,
  useWatchingController,
  useWatchingSince,
  useStalledGameCooldowns,
  useStallRecovery,
  selectVisibleTargetGame,
  shouldForceClearWatchingOnSuppressedTarget,
  useDropProgressPoll,
  useWatchEngine,
  useWatchEngineSnapshot,
  useWatchSessionMeta,
  useWatchSuppressionSync,
} from "@renderer/shared/hooks/watch";
import { useActiveCampaignDebugLog } from "./useActiveCampaignDebugLog";
import { useActivityFeedWiring } from "./useActivityFeedWiring";
import { useDebugCpu } from "./useDebugCpu";
import { useDebugSnapshot } from "./useDebugSnapshot";
import { usePriorityOrchestration } from "@renderer/shared/hooks/priority";
import { useSettingsStore } from "./useSettingsStore";
import { useSmartAlerts } from "./useSmartAlerts";
import { useStats } from "./useStats";
import { useAccent, useFontPair, useTheme } from "@renderer/shared/theme";
import type { FilterKey, View } from "@renderer/shared/types";
import { isVerboseLoggingEnabled } from "@renderer/shared/utils/logger";

export function useAppModel() {
  const { auth, startLogin, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const { fontPair, setFontPair } = useFontPair();
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
    updateChannel,
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
    closeToTray,
    minimizeToTray,
    savePriorityGames,
    saveObeyPriority,
    saveLanguage,
    saveAutoStart,
    saveAutoClaim,
    saveAutoSelect,
    saveAutoSwitchEnabled,
    saveWarmupEnabled,
    saveUpdateChannel,
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
    saveCloseToTray,
    saveMinimizeToTray,
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
  const { state: watchEngineState, dispatchEvent: dispatchWatchEngineEvent } = useWatchEngine();
  const [manualWatchOverride, setManualWatchOverride] = useState<{
    at: number;
    game: string;
  } | null>(null);
  const { watching, setWatchingFromChannel, clearWatching } = useWatchingController();
  const { lastWatchedChannelIdentity, watchStartedAt } = useWatchSessionMeta(watching);
  // Engine-watch uptime: stamped when watching starts, kept across channel
  // switches, cleared on pause/stop. Derived here (not in EnginePanel) so it
  // survives Overview tab remounts.
  const watchingSince = useWatchingSince(Boolean(watching));
  const [autoSelectEnabled, setAutoSelectEnabled] = useState<boolean>(true);
  const {
    cooldowns: stalledGameCooldownUntil,
    setCooldown: setStalledGameCooldown,
    clearCooldown: clearStalledGameCooldown,
    isInCooldown: isGameInStallCooldown,
  } = useStalledGameCooldowns();

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
    claimNowAll,
    pollDropProgressOnce,
    pollDropProgressIfStale,
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
  const stallCheckHeartbeat = watchStats.nextAt;

  useDropProgressPoll({ watching, demoMode, pollDropProgressOnce, pollDropProgressIfStale });
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
    savePriorityGames,
    saveObeyPriority,
    saveAutoStart,
    saveAutoClaim,
    saveAutoSelect,
    saveAutoSwitchEnabled,
    saveWarmupEnabled,
    saveUpdateChannel,
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
    saveCloseToTray,
    saveMinimizeToTray,
    saveRefreshIntervals,
    resetAutomation,
    setWatchingFromChannel,
    clearWatching,
    setAutoSelectEnabled,
    fetchInventory,
    isLinked,
    logout,
    onManualStartWatching: (channel) => {
      setManualWatchOverride({ at: Date.now(), game: channel.game });
    },
    setUpdateStatus,
    setFilter,
  });

  authErrorHandlerRef.current = actions.handleAuthError;
  const stopWatchingForAutomation = useCallback(() => {
    clearWatching();
  }, [clearWatching]);

  useEffect(() => {
    if (!claimStatus) return;
    const id = window.setTimeout(() => setClaimStatus(null), 8000);
    return () => window.clearTimeout(id);
  }, [claimStatus, setClaimStatus]);

  const stallSuppressedGame =
    watchEngineState.suppressionReason === "stall-stop"
      ? watchEngineState.suppressedTargetGame
      : "";
  const orchestrationCategories = useMemo(
    () =>
      filterCategoriesForOrchestration(withCategories, {
        suppressedGame: stallSuppressedGame,
        cooldowns: stalledGameCooldownUntil,
        now: Date.now(),
      }),
    [stallSuppressedGame, stalledGameCooldownUntil, withCategories],
  );

  const { activeTargetGame, setActiveTargetGame, priorityOrder, priorityListPreemptionActive } =
    usePriorityOrchestration({
      demoMode,
      inventoryStatus: inventory.status,
      inventoryItems,
      withCategories: orchestrationCategories,
      priorityGames,
      obeyPriority,
      allowUnlinkedGames,
      watching,
      stopWatching: stopWatchingForAutomation,
    });

  const targetGame = selectVisibleTargetGame(watchEngineState, activeTargetGame);
  const displayTargetGame = useMemo(() => {
    const visibleTarget = targetGame.trim();
    if (visibleTarget) return visibleTarget;
    if (watchEngineState.suppressionReason === "manual-stop") {
      return activeTargetGame.trim();
    }
    return "";
  }, [activeTargetGame, targetGame, watchEngineState.suppressionReason]);
  const shouldClearSuppressedWatching = shouldForceClearWatchingOnSuppressedTarget(
    watchEngineState,
    watching?.game ?? "",
  );
  const handleStopWatching = actions.handleStopWatching;
  const startWatching = actions.startWatching;
  const handleStartWatching = useCallback(
    (channel: Parameters<typeof startWatching>[0]) => {
      clearStalledGameCooldown(channel.game, "manual-watch-start");
      dispatchWatchEngineEvent(
        { type: "watch/manual_start", watchingGame: channel.game },
        "manual-watch-start",
      );
      startWatching(channel);
    },
    [clearStalledGameCooldown, dispatchWatchEngineEvent, startWatching],
  );
  const handleStopWatchingWithSuppressedTarget = useCallback(() => {
    handleStopWatching();
    dispatchWatchEngineEvent({ type: "watch/stop", activeTargetGame }, "manual-watch-stop");
  }, [activeTargetGame, dispatchWatchEngineEvent, handleStopWatching]);

  useWatchSuppressionSync({
    watchEngineState,
    dispatchWatchEngineEvent,
    activeTargetGame,
    watchingGame: watching?.game ?? "",
    shouldClearSuppressedWatching,
    clearWatching,
  });

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
    targetGame: displayTargetGame,
    inventoryItems,
    withCategories,
    allowWatching,
    allowUnlinkedGames,
    watching,
    inventoryFetchedAt,
    progressAnchorByDropId,
    watchStartedAt,
  });

  useActiveCampaignDebugLog({
    activeDropInfo,
    campaigns,
    inventoryFetchedAt,
    inventoryItems,
    targetGame,
    watching,
  });

  const channelAllowlist = useMemo(
    () =>
      buildChannelAllowlist({
        targetGame: displayTargetGame,
        withCategories,
        allowUpcoming: allowUnlinkedGames,
      }),
    [allowUnlinkedGames, displayTargetGame, withCategories],
  );

  const {
    channels,
    channelDiff,
    channelError,
    channelsLoading,
    channelsRefreshing,
    autoSwitch,
    fetchChannels,
  } = useChannels({
    targetGame: displayTargetGame,
    view,
    watching,
    setWatchingFromChannel,
    clearWatching,
    autoSelectEnabled,
    autoSwitchEnabled,
    forcePrioritySwitch: obeyPriority || priorityListPreemptionActive,
    allowWatching,
    canWatchTarget,
    trackerMode: trackerStatus?.mode,
    demoMode,
    onAuthError: forwardAuthError,
    channelAllowlist,
    manualWatchOverride,
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

  useActivityFeedWiring({
    autoSwitchInfo,
    inventoryChanges,
    inventoryItems,
    lastWatchError: watchStats.lastError,
    watching,
  });

  useClaimProbe({
    watching,
    activeDropInfo,
    inventoryFetchedAt,
    lastWatchOk: watchStats.lastOk,
    fetchInventory,
  });

  const { watchStallTrackerRef } = useStallRecovery({
    allowWatching,
    autoSelectEnabled,
    watching,
    targetGame,
    activeTargetGame,
    setActiveTargetGame,
    setAutoSelectEnabled,
    priorityOrder,
    orchestrationCategories,
    allowUnlinkedGames,
    isInCooldown: isGameInStallCooldown,
    channels,
    channelsLoading,
    channelsRefreshing,
    channelAllowlist,
    targetDrops,
    activeDropInfo,
    canWatchTarget,
    lastWatchOk: watchStats.lastOk,
    stallCheckHeartbeat,
    watchEngineState,
    dispatchWatchEngineEvent,
    setWatchingFromChannel,
    clearWatching,
    setCooldown: setStalledGameCooldown,
    fetchChannels,
    fetchInventory,
  });

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
  const watchEngineSnapshot = useWatchEngineSnapshot({
    watchEngineState,
    stalledGameCooldownUntil,
    isInCooldown: isGameInStallCooldown,
    channelAllowlist,
    channels,
    channelsLoading,
    channelsRefreshing,
    targetGame,
    activeTargetGame,
    activeDropInfo,
    canWatchTarget,
    watching,
    stallTrackerRef: watchStallTrackerRef,
  });

  const navProps = {
    view,
    setView,
    auth,
    profile,
    startLogin,
    logout,
    showDebug: debugEnabled,
    demoMode,
  };
  const heroClaimableDrops = targetDrops.filter(
    (drop) => drop.status !== "claimed" && drop.isClaimable === true,
  ).length;
  const heroBlockedDrops = targetDrops.filter(
    (drop) =>
      drop.status !== "claimed" &&
      (drop.status === "locked" || drop.blocked === true || drop.excluded),
  ).length;
  const statsProps = { stats, resetStats };
  const overviewProps = {
    inventory,
    activeGame: displayTargetGame,
    activeDropTitle: activeDropInfo?.title,
    activeDropRemainingMinutes: activeDropInfo?.remainingMinutes,
    activeDropEta: activeDropInfo?.eta,
    // QueuePanel uses this to render the live-ticking progress on the
    // actively-watched row. virtualEarned is updated every 1s by useTargetDrops
    // while watching the target game (Phase 12 fix).
    activeDrop: activeDropInfo
      ? { id: activeDropInfo.id, earnedMinutes: activeDropInfo.virtualEarned }
      : null,
    targetProgress,
    totalDrops,
    claimedDrops,
    claimableDrops: heroClaimableDrops,
    blockedDrops: heroBlockedDrops,
    channelsCount: channels.length,
    canWatchTarget,
    watchDecision: watchEngineSnapshot.decision,
    watchSuppressionReason: watchEngineSnapshot.suppression?.reason ?? null,
    lastWatchOk: watchStats.lastOk,
    watchingSince,
    inventoryFetchedAt,
    watchError: watchStats.lastError,
  };
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
    activeTargetGame,
    watchingGame: watching?.game ?? "",
    selectedGame,
    setSelectedGame,
    newGame,
    setNewGame,
    addGame: actions.addGame,
    addGameFromSelect: actions.addGameFromSelect,
    priorityGames,
    removeGame: actions.removeGame,
    movePriorityGame: actions.movePriorityGame,
    obeyPriority,
    setObeyPriority: actions.handleSetObeyPriority,
  };
  const settingsProps = {
    isLinked,
    onLogout: logout,
    onLogin: startLogin,
    theme,
    setTheme,
    accent,
    setAccent,
    fontPair,
    setFontPair,
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
    updateChannel,
    setUpdateChannel: actions.handleSetUpdateChannel,
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
    closeToTray,
    setCloseToTray: actions.handleSetCloseToTray,
    minimizeToTray,
    setMinimizeToTray: actions.handleSetMinimizeToTray,
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
    targetGame: displayTargetGame,
    targetDrops,
    totalEarnedMinutes,
    totalRequiredMinutes,
    inventoryRefreshing,
    inventoryFetchedAt,
    fetchInventory: actions.handleFetchInventory,
    watching,
    lastWatchedChannelIdentity,
    stopWatching: handleStopWatchingWithSuppressedTarget,
    channels,
    channelsLoading,
    channelsRefreshing,
    channelDiff,
    channelError,
    startWatching: handleStartWatching,
    activeDropInfo,
    claimStatus,
    showNoDropsHint,
    lastWatchOk: watchStats.lastOk,
    watchError: watchStats.lastError,
    autoSwitchInfo,
    trackerStatus,
    watchEngineSnapshot,
  };

  // The active drop's own live completion %, so the Hero card's "% complete"
  // matches its title + ETA (which are both about the active drop). Falls back
  // to the aggregate targetProgress when nothing is actively being watched.
  const activeDropProgress =
    activeDropInfo && activeDropInfo.requiredMinutes > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((activeDropInfo.virtualEarned / activeDropInfo.requiredMinutes) * 100),
          ),
        )
      : null;
  const heroProps = {
    demoMode,
    nextWatchAt: watchStats.nextAt || undefined,
    watchEngineDecision: watchEngineSnapshot.decision,
    activeGame: displayTargetGame,
    dropsTotal: totalDrops,
    dropsClaimed: claimedDrops,
    dropsClaimable: heroClaimableDrops,
    dropsBlocked: heroBlockedDrops,
    activeDropTitle: activeDropInfo?.title,
    activeDropRemainingMinutes: activeDropInfo?.remainingMinutes,
    activeDropEta: activeDropInfo?.eta,
    inventoryFetchedAt,
    lastWatchOk: watchStats.lastOk || undefined,
    targetProgress,
    activeDropProgress,
    warmupActive: warmupState.active,
    warmupGame: warmupState.game,
    onClaimNow: claimNowAll,
    claimStatus,
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
    statsProps,
    inventoryProps,
    priorityProps,
    settingsProps,
    controlProps,
    debugSnapshot,
    debugEnabled,
  };
}
