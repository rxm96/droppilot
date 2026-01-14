import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hero } from "./components/Hero";
import { Sidebar } from "./components/Sidebar";
import { OverviewView } from "./components/OverviewView";
import { InventoryView } from "./components/InventoryView";
import { SettingsView } from "./components/SettingsView";
import { ControlView } from "./components/ControlView";
import { TitleBar } from "./components/TitleBar";
import { DebugView } from "./components/DebugView";
import { useAuth } from "./hooks/useAuth";
import { useInventory } from "./hooks/useInventory";
import { useSettingsStore } from "./hooks/useSettingsStore";
import { useChannels } from "./hooks/useChannels";
import { useStats } from "./hooks/useStats";
import { useSmartAlerts } from "./hooks/useSmartAlerts";
import { logDebug, logInfo, logWarn } from "./utils/logger";
import { I18nProvider, translate } from "./i18n";
import { errorInfoFromIpc, errorInfoFromUnknown } from "./utils/errors";
import type {
  AutoSwitchInfo,
  ChannelEntry,
  ErrorInfo,
  FilterKey,
  PriorityPlan,
  ProfileState,
  View,
  WatchingState,
} from "./types";

const PAGE_SIZE = 8;
const WATCH_INTERVAL_MS = 59_000;
const WATCH_JITTER_MS = 8_000;

function App() {
  const { auth, startLogin, startLoginWithCreds, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileState>({ status: "idle" });
  const [creds, setCreds] = useState({ username: "", password: "", token: "" });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<View>("inventory");
  const [page, setPage] = useState<number>(1);
  const {
    priorityGames,
    obeyPriority,
    language,
    autoClaim,
    autoSelect,
    autoSwitchEnabled,
    refreshMinMs,
    refreshMaxMs,
    demoMode,
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
    saveAutoClaim,
    saveAutoSelect,
    saveAutoSwitchEnabled,
    saveRefreshIntervals,
    saveDemoMode,
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
  const [priorityPlan, setPriorityPlan] = useState<PriorityPlan | null>(null);
  const [activeTargetGame, setActiveTargetGame] = useState<string>("");
  const [watching, setWatching] = useState<WatchingState>(null);
  const [autoSelectEnabled, setAutoSelectEnabled] = useState<boolean>(true);
  const [watchStats, setWatchStats] = useState<{ lastOk: number; lastError: ErrorInfo | null; nextAt: number }>({
    lastOk: 0,
    lastError: null,
    nextAt: 0,
  });
  const [inventoryRefresh, setInventoryRefresh] = useState<{
    mode: "watching" | "idle" | null;
    lastRun: number;
    nextAt: number;
  }>({ mode: null, lastRun: 0, nextAt: 0 });
  const [nowTick, setNowTick] = useState(Date.now());
  const [autoSwitchInfo, setAutoSwitchInfo] = useState<AutoSwitchInfo | null>(null);
  const isLinked = auth.status === "ok";
  const isLinkedOrDemo = isLinked || demoMode;
  const allowWatching = isLinkedOrDemo;
  const authErrorHandlerRef = useRef<(message?: string) => void>(() => {});
  const forwardAuthError = useCallback((message?: string) => {
    authErrorHandlerRef.current?.(message);
  }, []);
  const { stats, bumpStats, resetStats } = useStats();
  const { notify } = useSmartAlerts({
    enabled: alertsEnabled,
    notifyWhileFocused: alertsNotifyWhileFocused,
  });
  const handleDropClaimed = useCallback(
    ({ title, game }: { title: string; game: string }) => {
      bumpStats({ claims: 1, lastDropTitle: title, lastGame: game });
      if (!alertsDropClaimed) return;
      notify({
        key: `drop-claimed:${title}:${game}`,
        title: translate(language, "alerts.title.dropClaimed"),
        body: translate(language, "alerts.body.dropClaimed", { title, game }),
        dedupeMs: 60_000,
      });
    },
    [alertsDropClaimed, bumpStats, language, notify]
  );
  const handleTestAlert = useCallback(() => {
    notify({
      key: "test-alert",
      title: translate(language, "alerts.title.test"),
      body: translate(language, "alerts.body.test"),
      dedupeMs: 0,
      force: true,
    });
  }, [language, notify]);
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
    { autoClaim, demoMode }
  );
  const fetchInventoryRef = useRef(fetchInventory);
  const inventoryAlertReadyRef = useRef(false);

  useEffect(() => {
    fetchInventoryRef.current = fetchInventory;
  }, [fetchInventory]);

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
    if (auth.status === "ok") return;
    setInventoryRefresh({ mode: null, lastRun: 0, nextAt: 0 });
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
    if (!watching) return;
    let cancelled = false;
    let timeout: number | undefined;
    const minDelay = Math.max(60_000, refreshMinMs);
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
    scheduleNext(minDelay); // first refresh after min delay
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [watching, refreshMinMs, refreshMaxMs]);

  // Fallback: auch ohne aktiven Watching-Channel regelmäßig Inventar refreshen,
  // falls watching-State verloren geht.
  useEffect(() => {
    if (watching) return;
    if (auth.status !== "ok") return;
    let cancelled = false;
    const minDelay = Math.max(60_000, refreshMinMs);
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
  }, [watching, auth.status, refreshMinMs, refreshMaxMs]);

  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    const ping = async () => {
      if (cancelled) return;
      try {
        logInfo("watch: ping start", {
          channelId: watching.channelId ?? watching.id,
          login: watching.login ?? watching.name,
          streamId: watching.streamId,
        });
        const res = await window.electronAPI.twitch.watch({
          channelId: watching.channelId ?? watching.id,
          login: watching.login ?? watching.name,
          streamId: watching.streamId,
        });
        if (cancelled) return;
        if ((res as any)?.error) {
          if ((res as any).error === "auth") {
            forwardAuthError((res as any).message);
            return;
          }
          throw errorInfoFromIpc(res as any, "Watch-Ping fehlgeschlagen");
        }
        if ((res as any)?.ok === false) {
          throw errorInfoFromIpc(res as any, "Watch-Ping fehlgeschlagen");
        }
        logInfo("watch: ping ok", {
          channelId: watching.channelId ?? watching.id,
          login: watching.login ?? watching.name,
          streamId: watching.streamId,
        });
        if (cancelled) return;
        if (watching.game) {
          void bumpStats({ minutes: 1, lastGame: watching.game });
        }
        if (!cancelled) {
          setWatchStats(() => ({
            lastOk: Date.now(),
            lastError: null,
            nextAt: Date.now() + WATCH_INTERVAL_MS,
          }));
        }
      } catch (err) {
        if (!cancelled) {
          const errInfo = errorInfoFromUnknown(err, "Watch-Ping fehlgeschlagen");
          logWarn("watch: ping error", err);
          setWatchStats((prev) => ({
            lastOk: prev.lastOk,
            lastError: errInfo,
            nextAt: Date.now() + WATCH_INTERVAL_MS,
          }));
        }
      }
    };
    const withJitter = () => WATCH_INTERVAL_MS + Math.floor(Math.random() * WATCH_JITTER_MS);
    let timeout: number | undefined;
    const run = async () => {
      await ping();
      if (cancelled) return;
      timeout = window.setTimeout(run, withJitter());
    };
    run();
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [watching, bumpStats, forwardAuthError]);

  // Beim Fenster-Schließen noch ein letztes Inventory erzwingen, um Minuten mitzunehmen
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
      setWatchStats({ lastOk: 0, lastError: null, nextAt: 0 });
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
  const targetDrops = useMemo(() => {
    if (!targetGame) return [];
    const now = Date.now();
    const allForGame = inventoryItems.filter((i) => i.game === targetGame);
    const activeRelevant = withCategories.filter(
      ({ item, category }) =>
        item.game === targetGame && (category === "in-progress" || category === "upcoming")
    );
    const sortedActive = [...activeRelevant].sort((a, b) => {
      const endA = a.item.endsAt ? Date.parse(a.item.endsAt) : null;
      const endB = b.item.endsAt ? Date.parse(b.item.endsAt) : null;
      const safeEndA = endA && endA > now ? endA : Number.POSITIVE_INFINITY;
      const safeEndB = endB && endB > now ? endB : Number.POSITIVE_INFINITY;
      if (safeEndA !== safeEndB) return safeEndA - safeEndB;
      const startA = a.item.startsAt ? Date.parse(a.item.startsAt) : 0;
      const startB = b.item.startsAt ? Date.parse(b.item.startsAt) : 0;
      if (startA !== startB) return startA - startB;
      const remainingA = Math.max(
        0,
        Math.max(0, Number(a.item.requiredMinutes) || 0) - Math.max(0, Number(a.item.earnedMinutes) || 0)
      );
      const remainingB = Math.max(
        0,
        Math.max(0, Number(b.item.requiredMinutes) || 0) - Math.max(0, Number(b.item.earnedMinutes) || 0)
      );
      if (remainingA !== remainingB) return remainingA - remainingB;
      return (a.item.title || "").localeCompare(b.item.title || "");
    });
    const sortedActiveItems = sortedActive.map((s) => s.item);
    const remaining = allForGame.filter((i) => !sortedActiveItems.includes(i));
    return [...sortedActiveItems, ...remaining];
  }, [targetGame, withCategories, inventoryItems]);
  const totalDrops = targetDrops.length;
  const claimedDrops = targetDrops.filter((i) => i.status === "claimed").length;
  const hasUnclaimedTarget = withCategories.some(
    ({ item, category }) =>
      item.game === targetGame && (category === "in-progress" || category === "upcoming")
  );
  const canWatchTarget = allowWatching && !!targetGame && hasUnclaimedTarget;
  const showNoDropsHint = !!targetGame && !hasUnclaimedTarget;

  const campaignMinutes = targetDrops.reduce((map, drop) => {
    const key = drop.campaignId || `drop-${drop.id}`;
    const req = Math.max(0, Number(drop.requiredMinutes) || 0);
    const earned = Math.min(req, Math.max(0, Number(drop.earnedMinutes) || 0));
    const existing = map.get(key) ?? { req: 0, earned: 0 };
    map.set(key, { req: Math.max(existing.req, req), earned: Math.max(existing.earned, earned) });
    return map;
  }, new Map<string, { req: number; earned: number }>());
  const totalRequiredMinutes = Array.from(campaignMinutes.values()).reduce((acc, v) => acc + v.req, 0);
  const totalEarnedMinutes = Array.from(campaignMinutes.values()).reduce((acc, v) => acc + v.earned, 0);
  const liveDeltaMinutesRaw =
    watching && inventoryFetchedAt ? Math.max(0, (nowTick - inventoryFetchedAt) / 60000) : 0;
  const liveDeltaMinutes = Math.min(
    liveDeltaMinutesRaw,
    Math.max(0, totalRequiredMinutes - totalEarnedMinutes)
  );
  const activeDrop = targetDrops.find((d) => d.status !== "claimed") || null;
  const activeDropRequired = activeDrop ? Math.max(0, Number(activeDrop.requiredMinutes) || 0) : 0;
  const activeDropEarned = activeDrop ? Math.max(0, Number(activeDrop.earnedMinutes) || 0) : 0;
  const liveDeltaApplied = activeDrop
    ? Math.min(liveDeltaMinutes, Math.max(0, activeDropRequired - activeDropEarned))
    : 0;
  const targetProgress = totalRequiredMinutes
    ? Math.min(100, Math.round(((totalEarnedMinutes + liveDeltaApplied) / totalRequiredMinutes) * 100))
    : 0;
  const activeDropVirtualEarned = activeDrop ? Math.min(activeDropRequired, activeDropEarned + liveDeltaApplied) : 0;
  const activeDropRemainingMinutes = activeDrop ? Math.max(0, activeDropRequired - activeDropVirtualEarned) : 0;
  const activeDropEta = activeDropRemainingMinutes > 0 ? nowTick + activeDropRemainingMinutes * 60_000 : null;
  const activeDropInfo = activeDrop
    ? {
        id: activeDrop.id,
        title: activeDrop.title,
        requiredMinutes: activeDropRequired,
        earnedMinutes: activeDropEarned,
        virtualEarned: activeDropVirtualEarned,
        remainingMinutes: activeDropRemainingMinutes,
        eta: activeDropEta,
        dropInstanceId: activeDrop.dropInstanceId,
        campaignId: activeDrop.campaignId,
      }
    : null;

  useEffect(() => {
    if (watching) return;
    setWatchStats((prev) => {
      if (prev.lastOk === 0 && prev.lastError === null && prev.nextAt === 0) return prev;
      return { lastOk: 0, lastError: null, nextAt: 0 };
    });
  }, [watching]);

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

  // Wenn gar keine earnable Drops da sind, gehe in einen "Idle"-Zustand
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

  // Initial target setzen, sobald Inventory geladen ist
  useEffect(() => {
    if (activeTargetGame) return;
    if (inventory.status !== "ready") return;
    if (!priorityOrder.length) return;
    const firstActionable = priorityOrder.find((g) => hasActionable(g));
    if (!firstActionable) return; // keine Drops aktiv -> nichts setzen
    setActiveTargetGame(firstActionable);
  }, [activeTargetGame, inventory.status, priorityOrder, hasActionable]);

  // Auto-advance through priority games when obeyPriority enabled
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
  }, [
    priorityOrder,
    hasActionable,
    obeyPriority,
    activeTargetGame,
    inventory.status,
  ]);

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

  const debugSnapshot = useMemo(
    () => ({
      auth: { status: auth.status, linked: isLinked, demoMode },
      profile:
        profile.status === "ready"
          ? { status: profile.status, displayName: profile.displayName, login: profile.login }
          : { status: profile.status },
      watching,
      targetGame,
      inventory: {
        status: inventory.status,
        items: inventoryItems.length,
        refreshing: inventoryRefreshing,
        fetchedAt: inventoryFetchedAt,
      },
      inventoryRefresh: {
        mode: inventoryRefresh.mode,
        lastRun: inventoryRefresh.lastRun ? new Date(inventoryRefresh.lastRun).toISOString() : null,
        nextAt: inventoryRefresh.nextAt ? new Date(inventoryRefresh.nextAt).toISOString() : null,
      },
      channels: {
        count: channels.length,
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
      stats: stats.status === "ready" ? stats.data : { status: stats.status },
    }),
    [
      auth.status,
      isLinked,
      demoMode,
      profile,
      watching,
      targetGame,
      inventory.status,
      inventoryItems.length,
      inventoryRefreshing,
      inventoryFetchedAt,
      inventoryRefresh.mode,
      inventoryRefresh.lastRun,
      inventoryRefresh.nextAt,
      channels.length,
      channelsLoading,
      channelError,
      autoClaim,
      autoSelectEnabled,
      autoSwitchEnabled,
      obeyPriority,
      refreshMinMs,
      refreshMaxMs,
      watchStats.lastOk,
      watchStats.nextAt,
      watchStats.lastError,
      activeDropInfo,
      activeTargetGame,
      priorityOrder,
      stats,
    ]
  );

  useEffect(() => {
    if (!autoSwitch) return;
    setAutoSwitchInfo(autoSwitch);
    const id = window.setTimeout(() => setAutoSwitchInfo(null), 12000);
    return () => window.clearTimeout(id);
  }, [autoSwitch]);

  useEffect(() => {
    if (!alertsNewDrops) return;
    if (inventory.status !== "ready") return;
    if (!inventoryAlertReadyRef.current) {
      inventoryAlertReadyRef.current = true;
      return;
    }
    if (inventoryChanges.added.size === 0) return;
    const addedItems = inventoryItems.filter((item) => inventoryChanges.added.has(item.id));
    if (addedItems.length === 0) return;
    const games = Array.from(new Set(addedItems.map((item) => item.game).filter(Boolean)));
    const gameLabel = (() => {
      if (!games.length) return translate(language, "alerts.misc.multipleGames");
      const main = games.slice(0, 2).join(", ");
      const extra = games.length - 2;
      return extra > 0 ? `${main} +${extra}` : main;
    })();
    notify({
      key: `new-drops:${games.join("|")}:${addedItems.length}`,
      title: translate(language, "alerts.title.newDrops"),
      body: translate(language, "alerts.body.newDrops", { count: addedItems.length, games: gameLabel }),
      dedupeMs: 30_000,
    });
  }, [alertsNewDrops, inventory.status, inventoryChanges.added, inventoryItems, language, notify]);

  useEffect(() => {
    if (!alertsWatchError) return;
    if (!watchStats.lastError) return;
    const message = watchStats.lastError.message ?? translate(language, "error.unknown");
    notify({
      key: `watch-error:${watchStats.lastError.code ?? message}`,
      title: translate(language, "alerts.title.watchError"),
      body: translate(language, "alerts.body.watchError", { message }),
      dedupeMs: 10 * 60_000,
    });
  }, [alertsWatchError, language, notify, watchStats.lastError]);

  useEffect(() => {
    if (!alertsAutoSwitch) return;
    if (!autoSwitchInfo) return;
    const from = autoSwitchInfo.from?.name ?? translate(language, "alerts.misc.unknownChannel");
    const to = autoSwitchInfo.to?.name ?? translate(language, "alerts.misc.unknownChannel");
    notify({
      key: `auto-switch:${autoSwitchInfo.at}`,
      title: translate(language, "alerts.title.autoSwitch"),
      body: translate(language, "alerts.body.autoSwitch", { from, to }),
      dedupeMs: 30_000,
    });
  }, [alertsAutoSwitch, autoSwitchInfo, language, notify]);

  useEffect(() => {
    if (!alertsDropEndingSoon) return;
    if (!watching) return;
    if (!activeDropInfo) return;
    const threshold = Math.max(1, Math.min(60, Math.round(alertsDropEndingMinutes || 1)));
    if (activeDropInfo.remainingMinutes <= 0) return;
    if (activeDropInfo.remainingMinutes > threshold) return;
    const minutes = Math.max(1, Math.round(activeDropInfo.remainingMinutes));
    notify({
      key: `drop-ending:${activeDropInfo.id}`,
      title: translate(language, "alerts.title.dropEndingSoon"),
      body: translate(language, "alerts.body.dropEndingSoon", { title: activeDropInfo.title, minutes }),
      dedupeMs: 24 * 60 * 60 * 1000,
    });
  }, [activeDropInfo, alertsDropEndingMinutes, alertsDropEndingSoon, language, notify, watching]);

  const heroNextWatchIn = watchStats.nextAt
    ? Math.max(0, Math.round((watchStats.nextAt - nowTick) / 1000))
    : undefined;
  const nextWatchIn = watchStats.nextAt
    ? Math.max(0, Math.round((watchStats.nextAt - nowTick) / 1000))
    : 0;
  const nextWatchProgress = watchStats.nextAt
    ? Math.min(1, Math.max(0, 1 - (watchStats.nextAt - nowTick) / WATCH_INTERVAL_MS))
    : undefined;

  return (
    <I18nProvider language={language}>
      <div className="window-shell">
        <TitleBar />
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

          <main className="layout">
            <Sidebar
              view={view}
              setView={setView}
              auth={auth}
              creds={creds}
              setCreds={setCreds}
              startLoginWithCreds={() => startLoginWithCreds(creds)}
              startLogin={startLogin}
              logout={logout}
            />

            <section className="panel inventory-panel">
            {view === "overview" && (
              <OverviewView
                profile={profile}
                isLinked={isLinkedOrDemo}
                inventory={inventory}
                stats={stats}
                resetStats={resetStats}
                logout={logout}
              />
            )}

              {view === "inventory" && (
                <InventoryView
                  inventory={inventory}
                  filter={filter}
                  onFilterChange={(key) => setFilter(key)}
                  gameFilter={gameFilter}
                  onGameFilterChange={setGameFilter}
                  uniqueGames={uniqueGames}
                  paginatedItems={paginatedItems}
                  filteredCount={filteredItems.length}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  setPage={setPage}
                  changes={inventoryChanges}
                  refreshing={inventoryRefreshing}
                  isLinked={isLinkedOrDemo}
                />
              )}

              {view === "settings" && (
              <SettingsView
                startLogin={startLogin}
                logout={logout}
                isLinked={isLinked}
                uniqueGames={uniqueGames}
                selectedGame={selectedGame}
                setSelectedGame={setSelectedGame}
                newGame={newGame}
                setNewGame={setNewGame}
                  addGame={addGame}
                  addGameFromSelect={addGameFromSelect}
                  priorityGames={priorityGames}
                  previewPriorityGames={previewPriorityGames}
                  removeGame={removeGame}
                  dragIndex={dragIndex}
                  dragOverIndex={dragOverIndex}
                  setDragIndex={setDragIndex}
                  setDragOverIndex={setDragOverIndex}
                  handleDropReorder={handleDropReorder}
                obeyPriority={obeyPriority}
                setObeyPriority={(val) => {
                  void saveObeyPriority(val);
                }}
                autoClaim={autoClaim}
                setAutoClaim={(val) => void saveAutoClaim(val)}
                autoSelect={autoSelect}
                setAutoSelect={(val) => void saveAutoSelect(val)}
                autoSwitchEnabled={autoSwitchEnabled}
                setAutoSwitchEnabled={(val) => void saveAutoSwitchEnabled(val)}
                demoMode={demoMode}
                setDemoMode={(val) => void saveDemoMode(val)}
                alertsEnabled={alertsEnabled}
                setAlertsEnabled={(val) => void saveAlertsEnabled(val)}
                alertsNotifyWhileFocused={alertsNotifyWhileFocused}
                setAlertsNotifyWhileFocused={(val) => void saveAlertsNotifyWhileFocused(val)}
                alertsDropClaimed={alertsDropClaimed}
                setAlertsDropClaimed={(val) => void saveAlertsDropClaimed(val)}
                alertsDropEndingSoon={alertsDropEndingSoon}
                setAlertsDropEndingSoon={(val) => void saveAlertsDropEndingSoon(val)}
                alertsDropEndingMinutes={alertsDropEndingMinutes}
                setAlertsDropEndingMinutes={(val) => void saveAlertsDropEndingMinutes(val)}
                alertsWatchError={alertsWatchError}
                setAlertsWatchError={(val) => void saveAlertsWatchError(val)}
                alertsAutoSwitch={alertsAutoSwitch}
                setAlertsAutoSwitch={(val) => void saveAlertsAutoSwitch(val)}
                alertsNewDrops={alertsNewDrops}
                setAlertsNewDrops={(val) => void saveAlertsNewDrops(val)}
                sendTestAlert={handleTestAlert}
                refreshMinMs={refreshMinMs}
                refreshMaxMs={refreshMaxMs}
                setRefreshIntervals={(minMs, maxMs) => void saveRefreshIntervals(minMs, maxMs)}
                resetAutomation={() => void resetAutomation()}
                language={language}
                setLanguage={saveLanguage}
                settingsJson={settingsJson}
                setSettingsJson={setSettingsJson}
                exportSettings={exportSettings}
                  importSettings={importSettings}
                  settingsInfo={settingsInfo}
                  settingsError={settingsError}
                />
              )}

              {view === "control" && (
                <ControlView
                  priorityPlan={priorityPlan}
                  priorityGames={priorityGames}
                  targetGame={targetGame}
                  setActiveTargetGame={setActiveTargetGame}
                  targetDrops={targetDrops}
                  targetProgress={targetProgress}
                  totalDrops={totalDrops}
                  claimedDrops={claimedDrops}
                  totalEarnedMinutes={totalEarnedMinutes}
                  totalRequiredMinutes={totalRequiredMinutes}
                  fetchInventory={() => fetchInventory()}
                  refreshPriorityPlan={refreshPriorityPlan}
                  watching={watching}
                  stopWatching={stopWatching}
                  channels={channels}
                  channelsLoading={channelsLoading}
                  channelError={channelError}
                  startWatching={startWatching}
                  liveDeltaApplied={liveDeltaApplied}
                  activeDropInfo={activeDropInfo}
                  claimStatus={claimStatus}
                  canWatchTarget={canWatchTarget}
                  showNoDropsHint={showNoDropsHint}
                  nextWatchIn={nextWatchIn}
                  lastWatchOk={watchStats.lastOk}
                  watchError={watchStats.lastError}
                  autoSwitchInfo={autoSwitchInfo}
                />
              )}

              {view === "debug" && <DebugView snapshot={debugSnapshot} />}
            </section>
          </main>
        </div>
      </div>
    </I18nProvider>
  );
}

export default App;
