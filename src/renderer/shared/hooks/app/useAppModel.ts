import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
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
  useChannels,
  useWatchPing,
  useWatchingController,
  buildWatchStallTrackerKey,
  evaluateNoProgressStall,
  pickStallRecoveryChannel,
  STALL_STOP_SUPPRESSION_HOLD_MS,
  MANUAL_STOP_SUPPRESSION_HOLD_MS,
  selectVisibleTargetGame,
  shouldForceClearWatchingOnSuppressedTarget,
  watchEngineReducer,
  type WatchEngineEvent,
  WATCH_ENGINE_INITIAL_STATE,
  type WatchStallTracker,
} from "@renderer/shared/hooks/watch";
import { useDebugCpu } from "./useDebugCpu";
import { useDebugSnapshot } from "./useDebugSnapshot";
import { isGameActionable, usePriorityOrchestration } from "@renderer/shared/hooks/priority";
import { useSettingsStore } from "./useSettingsStore";
import { useSmartAlerts } from "./useSmartAlerts";
import { useStats } from "./useStats";
import { useTheme } from "@renderer/shared/theme";
import { DropChannelRestriction } from "@renderer/shared/domain/dropDomain";
import { canEarnDrop } from "@renderer/shared/domain/inventory";
import type { FilterKey, View } from "@renderer/shared/types";
import { isVerboseLoggingEnabled, logDebug, logInfo } from "@renderer/shared/utils/logger";

const CLAIM_PROBE_NEAR_END_MINUTES = 1;
const CLAIM_PROBE_INTERVAL_MS = 25_000;
const STALL_NO_PROGRESS_WINDOW_MS = 15 * 60_000;
const STALL_NO_PROGRESS_WINDOW_NEAR_END_MS = 3 * 60_000;
const STALL_RECOVERY_COOLDOWN_MS = 60_000;
const STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS = 2;
const STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END = 1;
const NO_FARMABLE_DROP_GRACE_MS = 30_000;
const NO_FARMABLE_GAME_COOLDOWN_MS = 10 * 60_000;
const NO_PROGRESS_GAME_COOLDOWN_MS = 30 * 60_000;

const toConsoleSnapshot = <T>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

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
  const [watchEngineState, dispatchWatchEngine] = useReducer(
    watchEngineReducer,
    WATCH_ENGINE_INITIAL_STATE,
  );
  const watchEngineStateRef = useRef(watchEngineState);
  const [manualWatchOverride, setManualWatchOverride] = useState<{
    at: number;
    game: string;
  } | null>(null);
  const [lastWatchedChannelIdentity, setLastWatchedChannelIdentity] = useState<{
    id: string;
    login: string;
  } | null>(null);
  const { watching, setWatchingFromChannel, clearWatching } = useWatchingController();
  const [autoSelectEnabled, setAutoSelectEnabled] = useState<boolean>(true);
  const claimProbeInFlightRef = useRef(false);
  const claimProbeLastAtRef = useRef(0);
  const watchStallTrackerRef = useRef<WatchStallTracker | null>(null);
  const noFarmableDropRef = useRef<{ key: string; sinceAt: number } | null>(null);
  const [stalledGameCooldownUntil, setStalledGameCooldownUntil] = useState<Record<string, number>>(
    {},
  );
  const stalledGameCooldownUntilRef = useRef<Record<string, number>>({});
  const activeCampaignDebugSignatureRef = useRef<string>("");

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
  useEffect(() => {
    watchEngineStateRef.current = watchEngineState;
  }, [watchEngineState]);
  const dispatchWatchEngineEvent = useCallback(
    (event: WatchEngineEvent, context: string) => {
      const stampedEvent: WatchEngineEvent = (() => {
        switch (event.type) {
          case "watch/stop":
          case "watch/stall_stop":
            if (typeof event.at === "number" && Number.isFinite(event.at)) return event;
            return { ...event, at: Date.now() };
          case "sync":
            if (typeof event.now === "number" && Number.isFinite(event.now)) return event;
            return { ...event, now: Date.now() };
          default:
            return event;
        }
      })();
      const prev = watchEngineStateRef.current;
      const next = watchEngineReducer(prev, stampedEvent);
      const changed =
        prev.suppressedTargetGame !== next.suppressedTargetGame ||
        prev.suppressionReason !== next.suppressionReason ||
        prev.suppressedAt !== next.suppressedAt;
      const eventTargetGame =
        "activeTargetGame" in stampedEvent
          ? stampedEvent.activeTargetGame
          : stampedEvent.type === "target/manual_set"
            ? stampedEvent.nextTargetGame
            : "";
      const prevVisibleTarget = selectVisibleTargetGame(prev, eventTargetGame);
      const nextVisibleTarget = selectVisibleTargetGame(next, eventTargetGame);
      if (stampedEvent.type !== "sync" || changed) {
        logDebug("watch-engine: event", { context, event: stampedEvent, prev, next, changed });
      }
      if (changed) {
        logInfo("watch-engine: suppression", {
          context,
          event: stampedEvent.type,
          suppressionFrom: prev.suppressedTargetGame || null,
          suppressionTo: next.suppressedTargetGame || null,
          reasonFrom: prev.suppressionReason ?? null,
          reasonTo: next.suppressionReason ?? null,
          suppressedAtFrom: prev.suppressedAt ?? null,
          suppressedAtTo: next.suppressedAt ?? null,
          visibleTargetFrom: prevVisibleTarget || null,
          visibleTargetTo: nextVisibleTarget || null,
        });
      }
      dispatchWatchEngine(stampedEvent);
    },
    [dispatchWatchEngine],
  );
  const setStalledGameCooldown = useCallback(
    (rawGame: string, durationMs: number, reason: "stall-no-farmable" | "stall-no-progress") => {
      const game = rawGame.trim();
      if (!game) return;
      const now = Date.now();
      const until = now + durationMs;
      const current = stalledGameCooldownUntilRef.current[game] ?? 0;
      if (current >= until) return;
      stalledGameCooldownUntilRef.current = {
        ...stalledGameCooldownUntilRef.current,
        [game]: until,
      };
      logInfo("watch-engine: cooldown", {
        reason,
        game,
        durationMs,
        until,
      });
      setStalledGameCooldownUntil((prev) => {
        const prevUntil = prev[game] ?? 0;
        if (prevUntil >= until) return prev;
        return { ...prev, [game]: until };
      });
    },
    [],
  );
  const clearStalledGameCooldown = useCallback((rawGame: string, context: string) => {
    const game = rawGame.trim();
    if (!game) return;
    if (!(game in stalledGameCooldownUntilRef.current)) return;
    const nextRef = { ...stalledGameCooldownUntilRef.current };
    delete nextRef[game];
    stalledGameCooldownUntilRef.current = nextRef;
    logInfo("watch-engine: cooldown clear", { context, game });
    setStalledGameCooldownUntil((prev) => {
      if (!(game in prev)) return prev;
      const next = { ...prev };
      delete next[game];
      return next;
    });
  }, []);
  useEffect(() => {
    stalledGameCooldownUntilRef.current = stalledGameCooldownUntil;
  }, [stalledGameCooldownUntil]);
  useEffect(() => {
    const entries = Object.entries(stalledGameCooldownUntil);
    if (entries.length === 0) return;
    const now = Date.now();
    const expiredGames = entries
      .filter(([, until]) => !Number.isFinite(until) || until <= now)
      .map(([game]) => game);
    if (expiredGames.length > 0) {
      setStalledGameCooldownUntil((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const game of expiredGames) {
          if (!(game in next)) continue;
          delete next[game];
          changed = true;
        }
        return changed ? next : prev;
      });
      return;
    }
    const nextExpiry = Math.min(...entries.map(([, until]) => until));
    const timer = window.setTimeout(
      () => {
        setStalledGameCooldownUntil((prev) => {
          const cutoff = Date.now();
          let changed = false;
          const next: Record<string, number> = {};
          for (const [game, until] of Object.entries(prev)) {
            if (Number.isFinite(until) && until > cutoff) {
              next[game] = until;
              continue;
            }
            changed = true;
          }
          return changed ? next : prev;
        });
      },
      Math.max(0, nextExpiry - now) + 32,
    );
    return () => window.clearTimeout(timer);
  }, [stalledGameCooldownUntil]);
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

  useEffect(() => {
    if (!watching) return;
    const normalizedLogin = (watching.login ?? watching.name ?? "").trim().toLowerCase();
    setLastWatchedChannelIdentity((prev) => {
      if (prev?.id === watching.id && prev.login === normalizedLogin) {
        return prev;
      }
      return {
        id: watching.id,
        login: normalizedLogin,
      };
    });
  }, [watching]);

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
  const stallCheckHeartbeat = watchStats.nextAt;
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
  const stallSuppressedGame =
    watchEngineState.suppressionReason === "stall-stop"
      ? watchEngineState.suppressedTargetGame
      : "";
  const isGameInStallCooldown = useCallback(
    (rawGame: string, now = Date.now()): boolean => {
      const game = rawGame.trim();
      if (!game) return false;
      const until = stalledGameCooldownUntil[game];
      return typeof until === "number" && Number.isFinite(until) && until > now;
    },
    [stalledGameCooldownUntil],
  );
  const orchestrationCategories = useMemo(() => {
    if (!stallSuppressedGame && Object.keys(stalledGameCooldownUntil).length === 0) {
      return withCategories;
    }
    const now = Date.now();
    return withCategories.filter(({ item }) => {
      const game = item.game.trim();
      if (!game) return true;
      if (stallSuppressedGame && game === stallSuppressedGame) return false;
      return !isGameInStallCooldown(game, now);
    });
  }, [isGameInStallCooldown, stallSuppressedGame, stalledGameCooldownUntil, withCategories]);

  const { activeTargetGame, setActiveTargetGame, priorityOrder, refreshPriorityPlan } =
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
  const getNextPriorityTargetGame = useCallback(
    (currentGame: string): string => {
      const current = currentGame.trim();
      const ordered = priorityOrder
        .map((game) => game.trim())
        .filter((game, index, all) => game.length > 0 && all.indexOf(game) === index);
      if (ordered.length === 0) return "";
      const currentIndex = ordered.indexOf(current);
      const rotated =
        currentIndex >= 0
          ? [...ordered.slice(currentIndex + 1), ...ordered.slice(0, currentIndex)]
          : ordered;
      const candidates = rotated.filter((game) => game !== current && !isGameInStallCooldown(game));
      if (candidates.length === 0) return "";
      const actionable = candidates.find((game) =>
        isGameActionable(game, orchestrationCategories, { allowUpcoming: allowUnlinkedGames }),
      );
      return actionable ?? candidates[0] ?? "";
    },
    [allowUnlinkedGames, isGameInStallCooldown, orchestrationCategories, priorityOrder],
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

  useEffect(() => {
    if (shouldClearSuppressedWatching) {
      clearWatching();
      return;
    }
    dispatchWatchEngineEvent(
      {
        type: "sync",
        activeTargetGame,
        watchingGame: watching?.game ?? "",
      },
      "sync",
    );
  }, [
    activeTargetGame,
    clearWatching,
    dispatchWatchEngineEvent,
    shouldClearSuppressedWatching,
    watching?.game,
  ]);

  useEffect(() => {
    const reason = watchEngineState.suppressionReason;
    if (reason !== "stall-stop" && reason !== "manual-stop") return;
    const suppressedGame = watchEngineState.suppressedTargetGame.trim();
    const suppressedAt = watchEngineState.suppressedAt;
    const watchingGame = (watching?.game ?? "").trim();
    if (!suppressedGame) return;
    if (typeof suppressedAt !== "number" || !Number.isFinite(suppressedAt)) return;
    const holdMs =
      reason === "stall-stop" ? STALL_STOP_SUPPRESSION_HOLD_MS : MANUAL_STOP_SUPPRESSION_HOLD_MS;
    const runSync = () => {
      dispatchWatchEngineEvent(
        {
          type: "sync",
          activeTargetGame,
          watchingGame,
          now: Date.now(),
        },
        `${reason}-hold-expire-sync`,
      );
    };
    const dueAt = suppressedAt + holdMs;
    const remainingMs = dueAt - Date.now();
    if (remainingMs <= 0) {
      runSync();
      return;
    }
    const timer = window.setTimeout(runSync, remainingMs);
    return () => window.clearTimeout(timer);
  }, [
    activeTargetGame,
    dispatchWatchEngineEvent,
    watchEngineState.suppressedAt,
    watchEngineState.suppressedTargetGame,
    watchEngineState.suppressionReason,
    watching?.game,
  ]);

  useEffect(() => {
    if (watchEngineState.suppressionReason !== "stall-stop") return;
    const suppressedGame = watchEngineState.suppressedTargetGame;
    if (!suppressedGame || activeTargetGame !== suppressedGame) return;
    const nextGame = getNextPriorityTargetGame(suppressedGame);
    if (!nextGame) return;
    logInfo("watch-engine: retarget", {
      reason: "stall-stop",
      from: suppressedGame,
      to: nextGame,
    });
    setAutoSelectEnabled(true);
    setActiveTargetGame(nextGame);
  }, [
    activeTargetGame,
    getNextPriorityTargetGame,
    setAutoSelectEnabled,
    setActiveTargetGame,
    watchEngineState.suppressedTargetGame,
    watchEngineState.suppressionReason,
  ]);

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
  });

  useEffect(() => {
    const activeDropId = activeDropInfo?.id?.trim() ?? "";
    const activeCampaignId = activeDropInfo?.campaignId?.trim() ?? "";
    const watchingId = watching?.channelId ?? watching?.id ?? "";
    const signature = [
      activeDropId,
      activeCampaignId,
      targetGame,
      watchingId,
      inventoryFetchedAt ?? "",
    ].join("|");
    if (activeCampaignDebugSignatureRef.current === signature) return;
    activeCampaignDebugSignatureRef.current = signature;

    const activeDropRaw =
      (activeDropId ? inventoryItems.find((item) => item.id === activeDropId) : null) ?? null;
    const activeCampaignSummary =
      (activeCampaignId ? campaigns.find((campaign) => campaign.id === activeCampaignId) : null) ??
      null;
    const activeCampaignDropsFromInventory = activeCampaignId
      ? inventoryItems.filter((item) => item.campaignId === activeCampaignId)
      : activeDropRaw?.campaignId
        ? inventoryItems.filter((item) => item.campaignId === activeDropRaw.campaignId)
        : [];

    console.log(
      "[DropPilot] active-campaign-debug",
      toConsoleSnapshot({
        at: new Date().toISOString(),
        targetGame,
        watching,
        inventoryFetchedAt,
        activeDropInfo,
        activeDropRaw,
        activeCampaignSummary,
        activeCampaignDropsFromSummary: activeCampaignSummary?.drops ?? null,
        activeCampaignDropsFromInventory,
        inventoryItemsCount: inventoryItems.length,
        campaignsCount: campaigns.length,
      }),
    );
  }, [activeDropInfo, campaigns, inventoryFetchedAt, inventoryItems, targetGame, watching]);

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
    forcePrioritySwitch: obeyPriority,
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

  useEffect(() => {
    if (!watching) {
      watchStallTrackerRef.current = null;
      const shouldEvaluateIdleNoFarmable = allowWatching && autoSelectEnabled && !!targetGame;
      if (!shouldEvaluateIdleNoFarmable) {
        noFarmableDropRef.current = null;
        return;
      }
      const allowlistRestriction = DropChannelRestriction.fromAllowlist(channelAllowlist);
      if (!allowlistRestriction.hasConstraints) {
        noFarmableDropRef.current = null;
        return;
      }
      if ((channelsLoading || channelsRefreshing) && channels.length === 0) {
        return;
      }
      const hasAllowlistedChannel = channels.some((channel) =>
        allowlistRestriction.allowsChannel(channel),
      );
      if (hasAllowlistedChannel) {
        noFarmableDropRef.current = null;
        return;
      }
      const stalledGame = activeTargetGame.trim() || targetGame.trim();
      setStalledGameCooldown(stalledGame, NO_FARMABLE_GAME_COOLDOWN_MS, "stall-no-farmable");
      const currentForRetarget = activeTargetGame.trim() || targetGame.trim();
      const nextTargetGame = currentForRetarget
        ? getNextPriorityTargetGame(currentForRetarget)
        : "";
      logInfo("watch-engine: no-farmable idle evaluate", {
        from: currentForRetarget || null,
        to: nextTargetGame || null,
        channelsCount: channels.length,
        allowlistActive: allowlistRestriction.hasConstraints,
      });
      if (nextTargetGame) {
        logInfo("watch-engine: retarget", {
          reason: "stall-no-farmable-idle",
          from: activeTargetGame || targetGame || null,
          to: nextTargetGame,
        });
        setActiveTargetGame(nextTargetGame);
      } else {
        logInfo("watch-engine: retarget skipped", {
          reason: "stall-no-farmable-idle-no-next-target",
          from: activeTargetGame || targetGame || null,
        });
      }
      setAutoSelectEnabled(true);
      dispatchWatchEngineEvent(
        { type: "watch/stall_stop", activeTargetGame: stalledGame || activeTargetGame },
        "stall-no-farmable",
      );
      noFarmableDropRef.current = null;
      return;
    }
    if (!activeDropInfo && targetGame) {
      const noFarmableKey = targetGame;
      const now = Date.now();
      const noFarmable = noFarmableDropRef.current;
      if (!noFarmable || noFarmable.key !== noFarmableKey) {
        noFarmableDropRef.current = { key: noFarmableKey, sinceAt: now };
        return;
      }
      if (now - noFarmable.sinceAt < NO_FARMABLE_DROP_GRACE_MS) {
        return;
      }
      if (channelsLoading && channels.length === 0) {
        return;
      }
      const candidateDrops = targetDrops.filter(
        (drop) => drop.status === "progress" && canEarnDrop(drop, { category: "in-progress" }),
      );
      for (const candidate of candidateDrops) {
        const nextChannel = pickStallRecoveryChannel({
          channels,
          watching,
          drop: {
            id: candidate.id,
            earnedMinutes: candidate.earnedMinutes,
            allowedChannelIds: candidate.allowedChannelIds,
            allowedChannelLogins: candidate.allowedChannelLogins,
          },
        });
        if (nextChannel) {
          setWatchingFromChannel(nextChannel);
          noFarmableDropRef.current = null;
          return;
        }
      }
      const allowlistRestriction = DropChannelRestriction.fromAllowlist(channelAllowlist);
      const fallbackChannel = allowlistRestriction.hasConstraints
        ? channels.find((channel) => allowlistRestriction.allowsChannel(channel))
        : channels[0];
      if (watching.game !== targetGame && fallbackChannel) {
        setWatchingFromChannel(fallbackChannel);
        noFarmableDropRef.current = null;
        return;
      }
      const stalledGame = activeTargetGame.trim() || targetGame.trim() || watching.game.trim();
      setStalledGameCooldown(stalledGame, NO_FARMABLE_GAME_COOLDOWN_MS, "stall-no-farmable");
      const currentForRetarget = activeTargetGame.trim() || targetGame.trim();
      const nextTargetGame = currentForRetarget
        ? getNextPriorityTargetGame(currentForRetarget)
        : "";
      if (nextTargetGame) {
        logInfo("watch-engine: retarget", {
          reason: "stall-no-farmable-direct",
          from: activeTargetGame,
          to: nextTargetGame,
        });
        setActiveTargetGame(nextTargetGame);
      }
      setAutoSelectEnabled(true);
      clearWatching();
      dispatchWatchEngineEvent(
        { type: "watch/stall_stop", activeTargetGame: stalledGame || activeTargetGame },
        "stall-no-farmable",
      );
      watchStallTrackerRef.current = null;
      noFarmableDropRef.current = null;
      return;
    }
    noFarmableDropRef.current = null;
    if (!activeDropInfo) {
      watchStallTrackerRef.current = null;
      return;
    }
    const dropId = activeDropInfo.id?.trim();
    if (!dropId) {
      watchStallTrackerRef.current = null;
      return;
    }
    const earnedMinutes = Math.max(0, Number(activeDropInfo.earnedMinutes) || 0);
    const key = buildWatchStallTrackerKey(watching, dropId);
    const now = Date.now();
    const nearEndNoProgressProbe = activeDropInfo.remainingMinutes <= CLAIM_PROBE_NEAR_END_MINUTES;
    const noProgressWindowMs = nearEndNoProgressProbe
      ? STALL_NO_PROGRESS_WINDOW_NEAR_END_MS
      : STALL_NO_PROGRESS_WINDOW_MS;
    const evaluation = evaluateNoProgressStall({
      tracker: watchStallTrackerRef.current,
      key,
      earnedMinutes,
      now,
      noProgressWindowMs,
      actionCooldownMs: STALL_RECOVERY_COOLDOWN_MS,
    });
    watchStallTrackerRef.current = evaluation.tracker;
    if (!evaluation.shouldRecover) return;
    const maxChannelRecoveryAttempts = nearEndNoProgressProbe
      ? STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END
      : STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS;
    const allowChannelRecovery = evaluation.tracker.recoveryCount <= maxChannelRecoveryAttempts;

    if (allowChannelRecovery) {
      const nextChannel = pickStallRecoveryChannel({
        channels,
        watching,
        drop: {
          id: activeDropInfo.id,
          earnedMinutes: activeDropInfo.earnedMinutes,
          allowedChannelIds: activeDropInfo.allowedChannelIds,
          allowedChannelLogins: activeDropInfo.allowedChannelLogins,
        },
      });
      if (nextChannel) {
        setWatchingFromChannel(nextChannel);
        return;
      }
      // No alternate channel currently visible: force-refresh state before game-level retarget.
      // This avoids premature target jumps when tracker/inventory snapshots are briefly stale.
      const recoveryGame = activeTargetGame.trim() || targetGame.trim() || watching.game.trim();
      logInfo("watch-engine: no-progress refresh", {
        reason: "stall-no-progress-refresh",
        game: recoveryGame || null,
        nearEndProbe: nearEndNoProgressProbe,
        noProgressWindowMs,
        attempts: evaluation.tracker.recoveryCount,
        maxChannelRecoveryAttempts,
      });
      if (recoveryGame) {
        void fetchChannels(recoveryGame, { force: true });
      }
      void fetchInventory({ forceLoading: true });
      return;
    } else {
      logInfo("watch-engine: retarget escalation", {
        reason: "stall-no-progress-recovery-budget",
        from: activeTargetGame || null,
        nearEndProbe: nearEndNoProgressProbe,
        noProgressWindowMs,
        attempts: evaluation.tracker.recoveryCount,
        maxChannelRecoveryAttempts,
      });
    }
    const stalledGame = activeTargetGame.trim() || targetGame.trim() || watching.game.trim();
    setStalledGameCooldown(stalledGame, NO_PROGRESS_GAME_COOLDOWN_MS, "stall-no-progress");
    const currentForRetarget = activeTargetGame.trim() || targetGame.trim();
    const nextTargetGame = currentForRetarget ? getNextPriorityTargetGame(currentForRetarget) : "";
    if (nextTargetGame) {
      logInfo("watch-engine: retarget", {
        reason: "stall-no-progress-direct",
        from: activeTargetGame,
        to: nextTargetGame,
      });
      setActiveTargetGame(nextTargetGame);
    }
    setAutoSelectEnabled(true);
    clearWatching();
    dispatchWatchEngineEvent(
      { type: "watch/stall_stop", activeTargetGame: stalledGame || activeTargetGame },
      "stall-no-progress",
    );
  }, [
    allowWatching,
    activeTargetGame,
    activeDropInfo,
    autoSelectEnabled,
    canWatchTarget,
    channels,
    channelAllowlist,
    channelsLoading,
    channelsRefreshing,
    clearWatching,
    dispatchWatchEngineEvent,
    getNextPriorityTargetGame,
    fetchChannels,
    fetchInventory,
    setAutoSelectEnabled,
    setActiveTargetGame,
    setStalledGameCooldown,
    setWatchingFromChannel,
    stallCheckHeartbeat,
    targetDrops,
    targetGame,
    watching,
  ]);

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
  const watchEngineSnapshot = useMemo(() => {
    const now = Date.now();
    const suppressionGame = watchEngineState.suppressedTargetGame.trim();
    const suppressionReason = watchEngineState.suppressionReason;
    const suppressionAt = watchEngineState.suppressedAt;
    const holdMs =
      suppressionReason === "stall-stop"
        ? STALL_STOP_SUPPRESSION_HOLD_MS
        : suppressionReason === "manual-stop"
          ? MANUAL_STOP_SUPPRESSION_HOLD_MS
          : 0;
    const suppressionHoldRemainingMs =
      holdMs && typeof suppressionAt === "number" && Number.isFinite(suppressionAt)
        ? Math.max(0, suppressionAt + holdMs - now)
        : 0;
    const activeCooldowns = Object.entries(stalledGameCooldownUntil)
      .map(([rawGame, until]) => ({ game: rawGame.trim(), until }))
      .filter(
        ({ game, until }) =>
          game.length > 0 && typeof until === "number" && Number.isFinite(until) && until > now,
      )
      .sort((a, b) => a.until - b.until)
      .map(({ game, until }) => ({
        game,
        until,
        remainingMs: Math.max(0, until - now),
      }));
    const allowlistRestriction = DropChannelRestriction.fromAllowlist(channelAllowlist);
    const allowlistedLiveChannels = allowlistRestriction.hasConstraints
      ? channels.filter((channel) => allowlistRestriction.allowsChannel(channel)).length
      : channels.length;
    const stallTracker = watchStallTrackerRef.current;
    const noProgressTracker =
      stallTracker && watching
        ? {
            recoveryCount: stallTracker.recoveryCount,
            sinceProgressMs: Math.max(0, now - stallTracker.lastProgressAt),
          }
        : null;
    const hasPredictiveProgress = Boolean(
      activeDropInfo &&
      typeof activeDropInfo.eta === "number" &&
      Number.isFinite(activeDropInfo.eta),
    );
    const hasFarmableActiveDrop = Boolean(activeDropInfo);
    const isRecoveringNoProgress = Boolean(
      noProgressTracker && noProgressTracker.recoveryCount > 0,
    );

    let decision:
      | "no-target"
      | "suppressed"
      | "cooldown"
      | "watching-progress"
      | "watching-recover"
      | "watching-no-farmable"
      | "watching-no-watchable"
      | "idle-loading-channels"
      | "idle-no-channels"
      | "idle-ready"
      | "idle-no-watchable-drops" = "no-target";
    const activeTarget = activeTargetGame.trim();
    if (suppressionGame && activeTarget && suppressionGame === activeTarget) {
      decision = "suppressed";
    } else if (targetGame && isGameInStallCooldown(targetGame, now)) {
      decision = "cooldown";
    } else if (!targetGame) {
      decision = "no-target";
    } else if (watching) {
      if (!canWatchTarget) {
        decision = "watching-no-watchable";
      } else if (isRecoveringNoProgress) {
        decision = "watching-recover";
      } else if (hasPredictiveProgress || hasFarmableActiveDrop) {
        decision = "watching-progress";
      } else {
        decision = "watching-no-farmable";
      }
    } else if (channelsLoading || channelsRefreshing) {
      decision = "idle-loading-channels";
    } else if (allowlistedLiveChannels === 0) {
      decision = "idle-no-channels";
    } else if (canWatchTarget) {
      decision = "idle-ready";
    } else {
      decision = "idle-no-watchable-drops";
    }

    return {
      decision,
      targetGame,
      activeTargetGame,
      suppression:
        suppressionGame && suppressionReason
          ? {
              game: suppressionGame,
              reason: suppressionReason,
              sinceAt: suppressionAt,
              holdRemainingMs: suppressionHoldRemainingMs,
            }
          : null,
      activeCooldowns,
      allowlistActive: allowlistRestriction.hasConstraints,
      allowlistedLiveChannels,
      totalLiveChannels: channels.length,
      noProgressTracker,
    };
  }, [
    activeDropInfo,
    activeTargetGame,
    canWatchTarget,
    channelAllowlist,
    channels,
    channelsLoading,
    channelsRefreshing,
    isGameInStallCooldown,
    stalledGameCooldownUntil,
    targetGame,
    watchEngineState.suppressedAt,
    watchEngineState.suppressedTargetGame,
    watchEngineState.suppressionReason,
    watching,
  ]);

  const navProps = {
    view,
    setView,
    auth,
    profile,
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
    targetGame: displayTargetGame,
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
    canWatchTarget,
    showNoDropsHint,
    lastWatchOk: watchStats.lastOk,
    watchError: watchStats.lastError,
    autoSwitchInfo,
    trackerStatus,
    watchEngineSnapshot,
  };

  const heroClaimableDrops = targetDrops.filter(
    (drop) => drop.status !== "claimed" && drop.isClaimable === true,
  ).length;
  const heroBlockedDrops = targetDrops.filter(
    (drop) =>
      drop.status !== "claimed" &&
      (drop.status === "locked" || drop.blocked === true || drop.excluded),
  ).length;

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
