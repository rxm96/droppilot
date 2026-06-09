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
  WATCH_INTERVAL_MS,
  useWatchingController,
  useWatchingSince,
  useStalledGameCooldowns,
  buildWatchStallTrackerKey,
  evaluateNoProgressStall,
  pickStallRecoveryChannel,
  shouldProbeNoProgressConfirmation,
  STALL_STOP_SUPPRESSION_HOLD_MS,
  MANUAL_STOP_SUPPRESSION_HOLD_MS,
  CLAIM_PROBE_NEAR_END_MINUTES,
  selectVisibleTargetGame,
  shouldForceClearWatchingOnSuppressedTarget,
  useDropProgressPoll,
  useWatchEngine,
  useWatchSessionMeta,
  useWatchSuppressionSync,
  rotateToNextPriorityTarget,
  type WatchStallTracker,
} from "@renderer/shared/hooks/watch";
import { useActiveCampaignDebugLog } from "./useActiveCampaignDebugLog";
import { useActivityFeedWiring } from "./useActivityFeedWiring";
import { useDebugCpu } from "./useDebugCpu";
import { useDebugSnapshot } from "./useDebugSnapshot";
import { isGameActionable, usePriorityOrchestration } from "@renderer/shared/hooks/priority";
import { useSettingsStore } from "./useSettingsStore";
import { useSmartAlerts } from "./useSmartAlerts";
import { useStats } from "./useStats";
import { useAccent, useFontPair, useTheme } from "@renderer/shared/theme";
import { DropChannelRestriction } from "@renderer/shared/domain/dropDomain";
import { canEarnDrop } from "@renderer/shared/domain/inventory";
import { sameGameName } from "@renderer/shared/domain/gameName";
import type { FilterKey, View } from "@renderer/shared/types";
import { isVerboseLoggingEnabled, logInfo } from "@renderer/shared/utils/logger";

const STALL_NO_PROGRESS_WINDOW_MS = 15 * 60_000;
const STALL_NO_PROGRESS_WINDOW_NEAR_END_MS = 3 * 60_000;
const STALL_RECOVERY_COOLDOWN_MS = 60_000;
const STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS = 2;
const STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END = 1;
const STALL_CONFIRMATION_PROBE_COOLDOWN_MS = 60_000;
const NO_FARMABLE_DROP_GRACE_MS = 30_000;
const NO_FARMABLE_GAME_COOLDOWN_MS = 10 * 60_000;
const NO_PROGRESS_GAME_COOLDOWN_MS = 30 * 60_000;

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
  const watchStallTrackerRef = useRef<WatchStallTracker | null>(null);
  const watchConfirmationProbeRef = useRef<{
    key: string;
    baselineProgressAt: number;
    lastProbeAt: number;
  } | null>(null);
  const noFarmableDropRef = useRef<{ key: string; sinceAt: number } | null>(null);
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
  const getNextPriorityTargetGame = useCallback(
    (currentGame: string): string =>
      rotateToNextPriorityTarget({
        priorityOrder,
        currentGame,
        isGameBlocked: (game) => isGameInStallCooldown(game),
        isGameActionable: (game) =>
          isGameActionable(game, orchestrationCategories, { allowUpcoming: allowUnlinkedGames }),
      }),
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

  useWatchSuppressionSync({
    watchEngineState,
    dispatchWatchEngineEvent,
    activeTargetGame,
    watchingGame: watching?.game ?? "",
    shouldClearSuppressedWatching,
    clearWatching,
  });

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

  useEffect(() => {
    if (!watching) {
      watchStallTrackerRef.current = null;
      watchConfirmationProbeRef.current = null;
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
      if (!sameGameName(watching.game, targetGame) && fallbackChannel) {
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
      watchConfirmationProbeRef.current = null;
      noFarmableDropRef.current = null;
      return;
    }
    noFarmableDropRef.current = null;
    if (!activeDropInfo) {
      watchStallTrackerRef.current = null;
      watchConfirmationProbeRef.current = null;
      return;
    }
    const dropId = activeDropInfo.id?.trim();
    if (!dropId) {
      watchStallTrackerRef.current = null;
      watchConfirmationProbeRef.current = null;
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
    const activeProbe = watchConfirmationProbeRef.current;
    if (
      activeProbe &&
      (activeProbe.key !== key ||
        activeProbe.baselineProgressAt < evaluation.tracker.lastProgressAt)
    ) {
      watchConfirmationProbeRef.current = null;
    }
    const probeLeadMs = Math.min(2 * 60_000, Math.floor(noProgressWindowMs / 3));
    const recentWatchPingGraceMs = WATCH_INTERVAL_MS + 30_000;
    const lastProbeAt =
      watchConfirmationProbeRef.current?.key === key &&
      watchConfirmationProbeRef.current?.baselineProgressAt === evaluation.tracker.lastProgressAt
        ? watchConfirmationProbeRef.current.lastProbeAt
        : 0;
    if (
      shouldProbeNoProgressConfirmation({
        tracker: evaluation.tracker,
        key,
        now,
        noProgressWindowMs,
        probeLeadMs,
        lastWatchOk: watchStats.lastOk,
        watchPingGraceMs: recentWatchPingGraceMs,
        lastProbeAt,
        probeCooldownMs: STALL_CONFIRMATION_PROBE_COOLDOWN_MS,
      })
    ) {
      watchConfirmationProbeRef.current = {
        key,
        baselineProgressAt: evaluation.tracker.lastProgressAt,
        lastProbeAt: now,
      };
      logInfo("watch-engine: confirmation probe", {
        reason: "stall-no-progress-confirmation-probe",
        key,
        noProgressWindowMs,
        probeLeadMs,
        lastConfirmedProgressMsAgo: Math.max(0, now - evaluation.tracker.lastProgressAt),
      });
      void fetchInventory({ forceLoading: true });
    }
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
    watchStats.lastOk,
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
    trackerStatus,
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
