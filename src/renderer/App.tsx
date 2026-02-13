import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppContent } from "./components/AppContent";
import { Hero } from "./components/Hero";
import { TitleBar } from "./components/TitleBar";
import { UpdateOverlay } from "./components/UpdateOverlay";
import { useAlertEffects } from "./hooks/useAlertEffects";
import { useAppActions } from "./hooks/useAppActions";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useAuth } from "./hooks/useAuth";
import { useChannels } from "./hooks/useChannels";
import { useDebugCpu } from "./hooks/useDebugCpu";
import { useDebugSnapshot } from "./hooks/useDebugSnapshot";
import { useDropClaimAlerts } from "./hooks/useDropClaimAlerts";
import { useInventory } from "./hooks/useInventory";
import { useInventoryRefresh } from "./hooks/useInventoryRefresh";
import { usePriorityOrchestration } from "./hooks/usePriorityOrchestration";
import { useSettingsStore } from "./hooks/useSettingsStore";
import { useSmartAlerts } from "./hooks/useSmartAlerts";
import { useStats } from "./hooks/useStats";
import { useTargetDrops } from "./hooks/useTargetDrops";
import { useWatchPing } from "./hooks/useWatchPing";
import { useWatchingController } from "./hooks/useWatchingController";
import { I18nProvider } from "./i18n";
import { useTheme } from "./theme";
import type { FilterKey, View } from "./types";
import { isVerboseLoggingEnabled } from "./utils/logger";

const PAGE_SIZE = 8;

function App() {
  const { auth, startLogin, startLoginWithCreds, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [creds, setCreds] = useState({ username: "", password: "", token: "" });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<View>("inventory");
  const [page, setPage] = useState<number>(1);
  const {
    priorityGames,
    obeyPriority,
    language,
    autoStart,
    autoClaim,
    autoSelect,
    autoSwitchEnabled,
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
    savePriorityGames,
    saveObeyPriority,
    saveLanguage,
    saveAutoStart,
    saveAutoClaim,
    saveAutoSelect,
    saveAutoSwitchEnabled,
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

  const isLinked = auth.status === "ok";
  const isLinkedOrDemo = isLinked || demoMode;
  const allowWatching = isLinkedOrDemo;
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
    inventoryRefreshing,
    inventoryChanges,
    inventoryFetchedAt,
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
    { autoClaim, demoMode },
  );

  const inventoryRefresh = useInventoryRefresh({
    watching,
    authStatus: effectiveAuthStatus,
    refreshMinMs,
    refreshMaxMs,
    fetchInventory,
  });
  const watchStats = useWatchPing({ watching, bumpStats, forwardAuthError, demoMode });

  const { profile, appVersion, updateStatus, setUpdateStatus, trackerStatus, userPubSubStatus } =
    useAppBootstrap({
      authStatus: auth.status,
      demoMode,
      debugEnabled,
      autoSelect,
      view,
      setView,
      setAutoSelectEnabled,
      watching,
      fetchInventory,
      forwardAuthError,
    });

  const actions = useAppActions({
    creds,
    startLoginWithCreds,
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
    saveDemoMode,
    saveAlertsEnabled,
    saveAlertsNotifyWhileFocused,
    saveAlertsDropClaimed,
    saveAlertsDropEndingSoon,
    saveAlertsDropEndingMinutes,
    saveAlertsWatchError,
    saveAlertsAutoSwitch,
    saveAlertsNewDrops,
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
    setPage(1);
  }, [filter, gameFilter]);

  useEffect(() => {
    if (!claimStatus) return;
    const id = window.setTimeout(() => setClaimStatus(null), 8000);
    return () => window.clearTimeout(id);
  }, [claimStatus, setClaimStatus]);

  const filteredItems = useMemo(() => {
    return withCategories
      .filter(({ item, category }) => {
        const matchesStatus = filter === "all" ? true : category === filter;
        const matchesGame = gameFilter === "all" ? true : item.game === gameFilter;
        return matchesStatus && matchesGame;
      })
      .map(({ item }) => item);
  }, [withCategories, filter, gameFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(
    () => filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredItems, currentPage],
  );

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
    watching,
    stopWatching: actions.stopWatching,
    forwardAuthError,
  });

  const targetGame = activeTargetGame || "";
  const {
    targetDrops,
    totalDrops,
    claimedDrops,
    totalRequiredMinutes,
    totalEarnedMinutes,
    targetProgress,
    activeDropEta,
    activeDropInfo,
    canWatchTarget,
    showNoDropsHint,
  } = useTargetDrops({
    targetGame,
    inventoryItems,
    withCategories,
    allowWatching,
    watching,
    inventoryFetchedAt,
  });

  useEffect(() => {
    if (!watching) return;
    const eta = activeDropEta;
    if (!eta) return;
    const timeout = window.setTimeout(
      () => {
        void fetchInventory({ forceLoading: true });
      },
      Math.max(0, eta + 30_000 - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [watching, activeDropEta, fetchInventory]);

  const { channels, channelDiff, channelError, channelsLoading, channelsRefreshing, autoSwitch } =
    useChannels({
      targetGame,
      view,
      watching,
      setWatchingFromChannel,
      clearWatching,
      autoSelectEnabled,
      autoSwitchEnabled,
      fetchInventory: () => fetchInventory(),
      inventoryFetchedAt,
      allowWatching,
      canWatchTarget,
      trackerMode: trackerStatus?.mode,
      demoMode,
      onAuthError: forwardAuthError,
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
    obeyPriority,
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
  });

  const navProps = {
    view,
    setView,
    auth,
    startLogin,
    logout,
    showDebug: debugEnabled,
  };
  const authProps = {
    auth,
    creds,
    setCreds,
    startLoginWithCreds: actions.handleStartLoginWithCreds,
  };
  const overviewProps = { inventory, stats, resetStats };
  const inventoryProps = {
    inventory,
    filter,
    onFilterChange: actions.handleFilterChange,
    gameFilter,
    onGameFilterChange: setGameFilter,
    uniqueGames,
    paginatedItems,
    filteredCount: filteredItems.length,
    currentPage,
    totalPages,
    setPage,
    changes: inventoryChanges,
    refreshing: inventoryRefreshing,
    isLinked: isLinkedOrDemo,
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
    startLogin,
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

  return (
    <I18nProvider language={language}>
      <div className="window-shell">
        {!isMac && (
          <TitleBar
            version={appVersion}
            theme={theme}
            setTheme={setTheme}
            updateStatus={updateStatus}
            onDownloadUpdate={actions.handleDownloadUpdate}
            onInstallUpdate={actions.handleInstallUpdate}
          />
        )}
        <UpdateOverlay updateStatus={updateStatus} onInstallUpdate={actions.handleInstallUpdate} />
        <div className="app-shell">
          <Hero
            isLinked={isLinkedOrDemo}
            demoMode={demoMode}
            profile={profile}
            nextWatchAt={watchStats.nextAt || undefined}
            watchError={watchStats.lastError}
            activeGame={targetGame}
            dropsTotal={totalDrops}
            dropsClaimed={claimedDrops}
            targetProgress={targetProgress}
          />

          <AppContent
            navProps={navProps}
            authProps={authProps}
            overviewProps={overviewProps}
            inventoryProps={inventoryProps}
            priorityProps={priorityProps}
            settingsProps={settingsProps}
            controlProps={controlProps}
            debugSnapshot={debugSnapshot}
            debugEnabled={debugEnabled}
          />
        </div>
      </div>
    </I18nProvider>
  );
}

export default App;
