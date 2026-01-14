import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppContent } from "./components/AppContent";
import { Hero } from "./components/Hero";
import { TitleBar } from "./components/TitleBar";
import { useAlertEffects } from "./hooks/useAlertEffects";
import { useAuth } from "./hooks/useAuth";
import { useChannels } from "./hooks/useChannels";
import { useDebugSnapshot } from "./hooks/useDebugSnapshot";
import { useDropClaimAlerts } from "./hooks/useDropClaimAlerts";
import { useInventory } from "./hooks/useInventory";
import { useInventoryRefresh } from "./hooks/useInventoryRefresh";
import { useSettingsStore } from "./hooks/useSettingsStore";
import { useSmartAlerts } from "./hooks/useSmartAlerts";
import { useStats } from "./hooks/useStats";
import { useTargetDrops } from "./hooks/useTargetDrops";
import { useWatchPing, WATCH_INTERVAL_MS } from "./hooks/useWatchPing";
import { I18nProvider } from "./i18n";
import type { ChannelEntry, FilterKey, PriorityPlan, ProfileState, View, WatchingState } from "./types";
import { errorInfoFromIpc } from "./utils/errors";
import { logDebug, logWarn } from "./utils/logger";

const PAGE_SIZE = 8;

function App() {
  const { auth, startLogin, startLoginWithCreds, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileState>({ status: "idle" });
  const [creds, setCreds] = useState({ username: "", password: "", token: "" });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<View>("inventory");
  const [page, setPage] = useState<number>(1);
  const {
    priorityGames, obeyPriority, language, autoClaim, autoSelect, autoSwitchEnabled,
    refreshMinMs, refreshMaxMs, demoMode,
    alertsEnabled, alertsNotifyWhileFocused, alertsDropClaimed, alertsDropEndingSoon, alertsDropEndingMinutes,
    alertsWatchError, alertsAutoSwitch, alertsNewDrops,
    savePriorityGames, saveObeyPriority, saveLanguage, saveAutoClaim, saveAutoSelect, saveAutoSwitchEnabled,
    saveRefreshIntervals, saveDemoMode, saveAlertsEnabled, saveAlertsNotifyWhileFocused, saveAlertsDropClaimed,
    saveAlertsDropEndingSoon, saveAlertsDropEndingMinutes, saveAlertsWatchError, saveAlertsAutoSwitch, saveAlertsNewDrops,
    resetAutomation, selectedGame, setSelectedGame, newGame, setNewGame,
    settingsJson, setSettingsJson, exportSettings, importSettings, settingsInfo, settingsError,
  } = useSettingsStore();
  const [gameFilter, setGameFilter] = useState<string>("all");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [priorityPlan, setPriorityPlan] = useState<PriorityPlan | null>(null);
  const [activeTargetGame, setActiveTargetGame] = useState<string>("");
  const [watching, setWatching] = useState<WatchingState>(null);
  const [autoSelectEnabled, setAutoSelectEnabled] = useState<boolean>(true);
  const [nowTick, setNowTick] = useState(Date.now());
  const isLinked = auth.status === "ok";
  const isLinkedOrDemo = isLinked || demoMode;
  const allowWatching = isLinkedOrDemo;
  const isMac = useMemo(() => typeof navigator !== "undefined" && /mac/i.test(navigator.platform), []);
  const authErrorHandlerRef = useRef<(message?: string) => void>(() => {});
  const forwardAuthError = useCallback((message?: string) => {
    authErrorHandlerRef.current?.(message);
  }, []);
  const { stats, bumpStats, resetStats } = useStats();
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
    inventory, inventoryItems, inventoryRefreshing, inventoryChanges, inventoryFetchedAt,
    fetchInventory, uniqueGames, claimStatus, setClaimStatus, withCategories,
  } = useInventory(
    isLinkedOrDemo,
    {
      onClaimed: handleDropClaimed,
      onAuthError: forwardAuthError,
    },
    { autoClaim, demoMode }
  );
  const inventoryRefresh = useInventoryRefresh({
    watching,
    authStatus: auth.status,
    refreshMinMs,
    refreshMaxMs,
    fetchInventory,
  });
  const watchStats = useWatchPing({ watching, bumpStats, forwardAuthError });

  useEffect(() => {
    const tick = window.setInterval(() => setNowTick(Date.now()), 1_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    setAutoSelectEnabled(autoSelect);
  }, [autoSelect]);

  // Show forwarded main-process logs (TwitchService etc.) in DevTools console.
  useEffect(() => {
    const unsubscribe = window.electronAPI.logs?.onMainLog?.((payload) => {
      logDebug(`[main:${payload.scope}]`, ...(payload.args ?? []));
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (auth.status === "ok") {
      fetchProfile();
      fetchInventory({ forceLoading: true });
    } else {
      setProfile({ status: "idle" });
    }
  }, [auth.status]);

  useEffect(() => {
    setPage(1);
  }, [filter, gameFilter]);

  useEffect(() => {
    if (!claimStatus) return;
    const id = window.setTimeout(() => setClaimStatus(null), 8000);
    return () => window.clearTimeout(id);
  }, [claimStatus, setClaimStatus]);

  useEffect(() => {
    const onUnload = () => {
      if (watching) {
        void fetchInventory({ forceLoading: true });
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [watching, fetchInventory]);

  const fetchProfile = async () => {
    setProfile({ status: "loading" });
    const res = await window.electronAPI.twitch.profile();
    if ((res as any)?.error) {
      if ((res as any).error === "auth") {
        forwardAuthError((res as any).message);
        return;
      }
      const errInfo = errorInfoFromIpc(res as any, "Konnte Profil nicht laden");
      setProfile({
        status: "error",
        message: errInfo.message ?? "Konnte Profil nicht laden",
        code: errInfo.code,
      });
      return;
    }
    if (!res) {
      setProfile({ status: "error", message: "Leere Antwort" });
      return;
    }
    const data = res as any;
    setProfile({
      status: "ready",
      displayName: data.displayName,
      login: data.login,
      avatar: data.profileImageUrl,
    });
  };

  const addGame = () => {
    const name = newGame.trim();
    if (!name) return;
    if (priorityGames.includes(name)) {
      setNewGame("");
      return;
    }
    const updated = [...priorityGames, name];
    setNewGame("");
    void savePriorityGames(updated);
  };

  const removeGame = (name: string) => {
    const updated = priorityGames.filter((g) => g !== name);
    void savePriorityGames(updated);
  };

  const handleDropReorder = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const updated = [...priorityGames];
    const [item] = updated.splice(dragIndex, 1);
    updated.splice(targetIndex, 0, item);
    setDragIndex(null);
    setDragOverIndex(null);
    void savePriorityGames(updated);
  };

  const addGameFromSelect = () => {
    const name = selectedGame.trim();
    if (!name) return;
    if (priorityGames.includes(name)) return;
    void savePriorityGames([...priorityGames, name]);
  };

  const refreshPriorityPlan = async () => {
    try {
      const res = await window.electronAPI.twitch.priorityPlan({ priorityGames });
      if ((res as any)?.error) {
        if ((res as any).error === "auth") {
          forwardAuthError((res as any).message);
          return;
        }
        console.error("priority plan error", res);
        return;
      }
      setPriorityPlan(res as PriorityPlan);
    } catch (err) {
      console.error("priority plan failed", err);
    }
  };

  const startWatching = useCallback(
    (ch: ChannelEntry) => {
      setAutoSelectEnabled(true);
      setWatching({
        id: ch.id,
        name: ch.displayName,
        game: ch.game,
        login: ch.login,
        channelId: ch.id,
        streamId: ch.streamId,
      });
      fetchInventory();
    },
    [fetchInventory]
  );

  const stopWatching = useCallback(
    (opts?: { skipRefresh?: boolean }) => {
      setAutoSelectEnabled(false);
      setWatching(null);
      if (!opts?.skipRefresh) {
        void fetchInventory({ forceLoading: true });
      }
    },
    [fetchInventory]
  );

  const handleAuthError = useCallback(
    (message?: string) => {
      if (!isLinked) return;
      logWarn("auth: invalid", { message });
      stopWatching({ skipRefresh: true });
      void logout();
    },
    [isLinked, stopWatching, logout]
  );

  authErrorHandlerRef.current = handleAuthError;

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
    [filteredItems, currentPage]
  );

  const previewPriorityGames =
    dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex
      ? (() => {
          const clone = [...priorityGames];
          const [item] = clone.splice(dragIndex, 1);
          clone.splice(dragOverIndex, 0, item);
          return clone;
        })()
      : priorityGames;

  const targetGame = activeTargetGame || "";
  const {
    targetDrops,
    totalDrops,
    claimedDrops,
    totalRequiredMinutes,
    totalEarnedMinutes,
    targetProgress,
    liveDeltaApplied,
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
    nowTick,
  });

  useEffect(() => {
    if (!watching) return;
    const eta = activeDropEta;
    if (!eta) return;
    const timeout = window.setTimeout(() => {
      void fetchInventory({ forceLoading: true });
    }, Math.max(0, eta + 30_000 - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [watching, activeDropEta, fetchInventory]);

  const hasActionable = useCallback(
    (game: string) =>
      withCategories.some(
        ({ item, category }) =>
          item.game === game && (category === "in-progress" || category === "upcoming")
      ),
    [withCategories]
  );

  const priorityOrder = useMemo(
    () => (priorityPlan?.order?.length ? priorityPlan.order : priorityGames),
    [priorityPlan, priorityGames]
  );

  useEffect(() => {
    if (inventory.status !== "ready") return;
    const hasAnyActionable = priorityOrder.some((g) => hasActionable(g));
    if (hasAnyActionable) return;
    if (!watching) {
      setActiveTargetGame("");
      return;
    }
    setActiveTargetGame("");
    stopWatching();
  }, [inventory.status, priorityOrder, hasActionable, stopWatching, watching]);

  useEffect(() => {
    if (activeTargetGame) return;
    if (inventory.status !== "ready") return;
    if (!priorityOrder.length) return;
    const firstActionable = priorityOrder.find((g) => hasActionable(g));
    if (!firstActionable) return;
    setActiveTargetGame(firstActionable);
  }, [activeTargetGame, inventory.status, priorityOrder, hasActionable]);

  useEffect(() => {
    if (!obeyPriority) return;
    if (inventory.status !== "ready") return;
    if (!priorityOrder.length) return;

    const best = priorityOrder.find((g) => hasActionable(g));
    if (!best) return;

    const currentHasDrops = activeTargetGame ? hasActionable(activeTargetGame) : false;
    if (!activeTargetGame || !currentHasDrops || best !== activeTargetGame) {
      setActiveTargetGame(best);
    }
  }, [priorityOrder, hasActionable, obeyPriority, activeTargetGame, inventory.status]);

  const { channels, channelError, channelsLoading, autoSwitch } = useChannels({
    targetGame,
    view,
    watching,
    setWatching,
    autoSelectEnabled,
    autoSwitchEnabled,
    fetchInventory: () => fetchInventory(),
    allowWatching,
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
  });

  const handleStartLoginWithCreds = useCallback(() => startLoginWithCreds(creds), [startLoginWithCreds, creds]);
  const handleFilterChange = useCallback((key: FilterKey) => setFilter(key), [setFilter]);
  const handleSetObeyPriority = useCallback((val: boolean) => { void saveObeyPriority(val); }, [saveObeyPriority]);
  const handleSetAutoClaim = useCallback((val: boolean) => { void saveAutoClaim(val); }, [saveAutoClaim]);
  const handleSetAutoSelect = useCallback((val: boolean) => { void saveAutoSelect(val); }, [saveAutoSelect]);
  const handleSetAutoSwitchEnabled = useCallback((val: boolean) => { void saveAutoSwitchEnabled(val); }, [saveAutoSwitchEnabled]);
  const handleSetDemoMode = useCallback((val: boolean) => { void saveDemoMode(val); }, [saveDemoMode]);
  const handleSetAlertsEnabled = useCallback((val: boolean) => { void saveAlertsEnabled(val); }, [saveAlertsEnabled]);
  const handleSetAlertsNotifyWhileFocused = useCallback((val: boolean) => { void saveAlertsNotifyWhileFocused(val); }, [saveAlertsNotifyWhileFocused]);
  const handleSetAlertsDropClaimed = useCallback((val: boolean) => { void saveAlertsDropClaimed(val); }, [saveAlertsDropClaimed]);
  const handleSetAlertsDropEndingSoon = useCallback((val: boolean) => { void saveAlertsDropEndingSoon(val); }, [saveAlertsDropEndingSoon]);
  const handleSetAlertsDropEndingMinutes = useCallback((val: number) => { void saveAlertsDropEndingMinutes(val); }, [saveAlertsDropEndingMinutes]);
  const handleSetAlertsWatchError = useCallback((val: boolean) => { void saveAlertsWatchError(val); }, [saveAlertsWatchError]);
  const handleSetAlertsAutoSwitch = useCallback((val: boolean) => { void saveAlertsAutoSwitch(val); }, [saveAlertsAutoSwitch]);
  const handleSetAlertsNewDrops = useCallback((val: boolean) => { void saveAlertsNewDrops(val); }, [saveAlertsNewDrops]);
  const handleSetRefreshIntervals = useCallback((minMs: number, maxMs: number) => { void saveRefreshIntervals(minMs, maxMs); }, [saveRefreshIntervals]);
  const handleResetAutomation = useCallback(() => { void resetAutomation(); }, [resetAutomation]);
  const handleFetchInventory = useCallback(() => { void fetchInventory(); }, [fetchInventory]);
  const handleStopWatching = useCallback(() => { stopWatching(); }, [stopWatching]);

  const heroNextWatchIn = watchStats.nextAt
    ? Math.max(0, Math.round((watchStats.nextAt - nowTick) / 1000))
    : undefined;
  const nextWatchIn = watchStats.nextAt
    ? Math.max(0, Math.round((watchStats.nextAt - nowTick) / 1000))
    : 0;
  const nextWatchProgress = watchStats.nextAt
    ? Math.min(1, Math.max(0, 1 - (watchStats.nextAt - nowTick) / WATCH_INTERVAL_MS))
    : undefined;

  const sidebarProps = { view, setView, auth, creds, setCreds, startLoginWithCreds: handleStartLoginWithCreds, startLogin, logout };
  const overviewProps = { profile, isLinked: isLinkedOrDemo, inventory, stats, resetStats, logout };
  const inventoryProps = {
    inventory, filter, onFilterChange: handleFilterChange, gameFilter, onGameFilterChange: setGameFilter,
    uniqueGames, paginatedItems, filteredCount: filteredItems.length, currentPage, totalPages, setPage,
    changes: inventoryChanges, refreshing: inventoryRefreshing, isLinked: isLinkedOrDemo,
  };
  const settingsProps = {
    startLogin, logout, isLinked, uniqueGames, selectedGame, setSelectedGame, newGame, setNewGame,
    addGame, addGameFromSelect, priorityGames, previewPriorityGames, removeGame,
    dragIndex, dragOverIndex, setDragIndex, setDragOverIndex, handleDropReorder,
    obeyPriority, setObeyPriority: handleSetObeyPriority,
    autoClaim: autoClaim, setAutoClaim: handleSetAutoClaim,
    autoSelect, setAutoSelect: handleSetAutoSelect,
    autoSwitchEnabled, setAutoSwitchEnabled: handleSetAutoSwitchEnabled,
    demoMode, setDemoMode: handleSetDemoMode,
    alertsEnabled, setAlertsEnabled: handleSetAlertsEnabled,
    alertsNotifyWhileFocused, setAlertsNotifyWhileFocused: handleSetAlertsNotifyWhileFocused,
    alertsDropClaimed, setAlertsDropClaimed: handleSetAlertsDropClaimed,
    alertsDropEndingSoon, setAlertsDropEndingSoon: handleSetAlertsDropEndingSoon,
    alertsDropEndingMinutes, setAlertsDropEndingMinutes: handleSetAlertsDropEndingMinutes,
    alertsWatchError, setAlertsWatchError: handleSetAlertsWatchError,
    alertsAutoSwitch, setAlertsAutoSwitch: handleSetAlertsAutoSwitch,
    alertsNewDrops, setAlertsNewDrops: handleSetAlertsNewDrops,
    sendTestAlert: handleTestAlert, refreshMinMs, refreshMaxMs,
    setRefreshIntervals: handleSetRefreshIntervals,
    resetAutomation: handleResetAutomation, language, setLanguage: saveLanguage,
    settingsJson, setSettingsJson, exportSettings, importSettings, settingsInfo, settingsError,
  };
  const controlProps = {
    priorityPlan, priorityGames, targetGame, setActiveTargetGame, targetDrops, targetProgress, totalDrops, claimedDrops,
    totalEarnedMinutes, totalRequiredMinutes, fetchInventory: handleFetchInventory, refreshPriorityPlan,
    watching, stopWatching: handleStopWatching, channels, channelsLoading, channelError, startWatching,
    liveDeltaApplied, activeDropInfo, claimStatus, canWatchTarget, showNoDropsHint, nextWatchIn,
    lastWatchOk: watchStats.lastOk, watchError: watchStats.lastError, autoSwitchInfo,
  };

  return (
    <I18nProvider language={language}>
      <div className="window-shell">
        {!isMac && <TitleBar />}
        <div className="app-shell">
          <Hero
            isLinked={isLinkedOrDemo}
            demoMode={demoMode}
            profile={profile}
            nextWatchIn={heroNextWatchIn}
            nextWatchProgress={nextWatchProgress}
            watchError={watchStats.lastError}
            activeGame={targetGame}
            dropsTotal={totalDrops}
            dropsClaimed={claimedDrops}
            targetProgress={targetProgress}
          />

          <AppContent
            sidebarProps={sidebarProps}
            overviewProps={overviewProps}
            inventoryProps={inventoryProps}
            settingsProps={settingsProps}
            controlProps={controlProps}
            debugSnapshot={debugSnapshot}
          />
        </div>
      </div>
    </I18nProvider>
  );
}

export default App;
