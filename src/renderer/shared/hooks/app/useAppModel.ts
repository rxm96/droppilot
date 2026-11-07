import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAlertEffects } from "./useAlertEffects";
import { useAppActions } from "./useAppActions";
import { useAppBootstrap } from "./useAppBootstrap";
import { useAuth } from "./useAuth";
import {
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
  canAutoSelectGame,
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
import {
  computeFallbackOrder,
  resolvePriorityGameNames,
  usePriorityOrchestration,
} from "@renderer/shared/hooks/priority";
import { pickAutoSelectChannel } from "@renderer/shared/hooks/watch/channelEngine";
import { buildFarmPlan } from "@renderer/shared/domain/farmPlan";
import { resolveView } from "@renderer/shared/navigation";
import {
  buildNeedsYouItems,
  resolveAutopilotState,
  findResumeChannel,
  resolveHeroState,
} from "@renderer/features/overview/overviewModel";
import { buildPlanTable } from "@renderer/features/overview/planTable";
import { useSettingsStore } from "./useSettingsStore";
import { useSmartAlerts } from "./useSmartAlerts";
import { useStats } from "./useStats";
import { useAccent, useFontPair, useTheme } from "@renderer/shared/theme";
import { useInterval } from "@renderer/shared/hooks/useInterval";
import type { ChannelEntry, FilterKey, View } from "@renderer/shared/types";
import { isVerboseLoggingEnabled } from "@renderer/shared/utils/logger";

export function useAppModel() {
  const { auth, startLogin, logout, markExpired } = useAuth();
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();
  const { fontPair, setFontPair } = useFontPair();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setViewState] = useState<View>("inventory");
  const {
    priorityGames,
    obeyPriority,
    language,
    autoStart,
    autoClaim,
    autoSelect,
    autoSwitchEnabled,
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
    webhookEnabled,
    webhookUrl,
    webhookDropClaimed,
    webhookWatchError,
    webhookDropEndingSoon,
    webhookAutoSwitch,
    webhookNewDrops,
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
    saveWebhookEnabled,
    saveWebhookUrl,
    saveWebhookDropClaimed,
    saveWebhookWatchError,
    saveWebhookDropEndingSoon,
    saveWebhookAutoSwitch,
    saveWebhookNewDrops,
    saveEnableBadgesEmotes,
    saveAllowUnlinkedGames,
    saveCloseToTray,
    saveMinimizeToTray,
    resetAutomation,
    newGame,
    setNewGame,
    settingsJson,
    setSettingsJson,
    exportSettings,
    importSettings,
    settingsInfo,
    settingsError,
  } = useSettingsStore();
  // Every view change goes through resolveView, so a removed view (control)
  // or debug-while-disabled can never be rendered.
  const setView = useCallback(
    (next: string) => setViewState(resolveView(next, { debugEnabled })),
    [debugEnabled],
  );
  // The overview's "switch channel" popover; channels stay tracked while open.
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);
  // Channel the user picked in that popover. "your pick" shows only while this
  // exact channel is still the one being watched, so it disappears as soon as
  // the engine switches away (offline, stall recovery, new target game).
  const [manualPickChannelId, setManualPickChannelId] = useState<string | null>(null);
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
    alertsEnabled,
    notifyWhileFocused: alertsNotifyWhileFocused,
    osToggles: {
      "drop-claimed": alertsDropClaimed,
      "drop-ending-soon": alertsDropEndingSoon,
      "watch-error": alertsWatchError,
      "auto-switch": alertsAutoSwitch,
      "new-drops": alertsNewDrops,
    },
    webhookEnabled,
    webhookUrl,
    webhookToggles: {
      "drop-claimed": webhookDropClaimed,
      "drop-ending-soon": webhookDropEndingSoon,
      "watch-error": webhookWatchError,
      "auto-switch": webhookAutoSwitch,
      "new-drops": webhookNewDrops,
    },
  });
  const { handleDropClaimed, handleTestAlert } = useDropClaimAlerts({
    language,
    notify,
    bumpStats,
  });

  const {
    inventory,
    inventoryItems,
    campaigns,
    inventoryRefreshing,
    inventoryChanges,
    inventoryFetchedAt,
    progressAnchorByDropId,
    fetchInventory,
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
    priorityGames,
    savePriorityGames,
    saveObeyPriority,
    saveAutoStart,
    saveAutoClaim,
    saveAutoSelect,
    saveAutoSwitchEnabled,
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
    saveWebhookEnabled,
    saveWebhookUrl,
    saveWebhookDropClaimed,
    saveWebhookWatchError,
    saveWebhookDropEndingSoon,
    saveWebhookAutoSwitch,
    saveWebhookNewDrops,
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
    markExpired,
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

  const { targetDrops, totalDrops, claimedDrops, activeDropInfo, canWatchTarget } = useTargetDrops({
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
    channelsGame,
    channelsLoading,
    channelsRefreshing,
    autoSwitch,
    fetchChannels,
  } = useChannels({
    targetGame: displayTargetGame,
    channelPickerOpen,
    watching,
    setWatchingFromChannel,
    clearWatching,
    autoSelectEnabled,
    autoSwitchEnabled,
    forcePrioritySwitch: obeyPriority || priorityListPreemptionActive,
    allowWatching,
    canWatchTarget,
    canAutoSelectTarget: canAutoSelectGame(watchEngineState, displayTargetGame, canWatchTarget),
    trackerMode: trackerStatus?.mode,
    demoMode,
    onAuthError: forwardAuthError,
    channelAllowlist,
    manualWatchOverride,
  });

  const { autoSwitchInfo } = useAlertEffects({
    language,
    notify,
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
    channelsGame,
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
    appVersion,
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

  // --- Autopilot (nav chip + hero pause/resume) -------------------------
  const autopilotState = resolveAutopilotState({
    allowWatching,
    watching: Boolean(watching),
    autoSelectEnabled,
  });
  const pauseAutopilot = useCallback(() => {
    setManualPickChannelId(null);
    handleStopWatchingWithSuppressedTarget();
  }, [handleStopWatchingWithSuppressedTarget]);
  // Resume = the removed Control view's "resume": back to the last watched
  // channel while it is still live (same start path). If it went offline,
  // hand over to auto-select instead; the manual_start event lifts the
  // manual-stop hold on the target, as starting that game by hand would.
  const resumeAutopilot = useCallback(() => {
    setManualPickChannelId(null);
    const resumeChannel = findResumeChannel(channels, lastWatchedChannelIdentity);
    if (resumeChannel) {
      handleStartWatching(resumeChannel);
      return;
    }
    setAutoSelectEnabled(true);
    if (activeTargetGame) {
      dispatchWatchEngineEvent(
        { type: "watch/manual_start", watchingGame: activeTargetGame },
        "manual-resume",
      );
    }
  }, [
    activeTargetGame,
    channels,
    dispatchWatchEngineEvent,
    handleStartWatching,
    lastWatchedChannelIdentity,
  ]);
  const toggleAutopilot = useCallback(() => {
    if (autopilotState === "running") pauseAutopilot();
    else if (autopilotState === "paused") resumeAutopilot();
  }, [autopilotState, pauseAutopilot, resumeAutopilot]);

  // --- Switch channel popover --------------------------------------------
  const pickChannel = useCallback(
    (channel: ChannelEntry) => {
      setManualPickChannelId(channel.id);
      setChannelPickerOpen(false);
      handleStartWatching(channel);
    },
    [handleStartWatching],
  );
  const isManualPick = Boolean(watching && manualPickChannelId === watching.id);
  // "auto": drop the manual-pick override and move to the channel auto-select
  // itself would start (pickAutoSelectChannel), without a gap in watching.
  const returnToAuto = useCallback(() => {
    setManualPickChannelId(null);
    setManualWatchOverride(null);
    setChannelPickerOpen(false);
    const autoChannel = pickAutoSelectChannel(channels, channelAllowlist);
    if (autoChannel && autoChannel.id !== watching?.id) setWatchingFromChannel(autoChannel);
  }, [channelAllowlist, channels, setWatchingFromChannel, watching?.id]);
  const watchingChannel = watching
    ? (channels.find(
        (c) => c.id === watching.id || (Boolean(watching.login) && c.login === watching.login),
      ) ?? null)
    : null;
  const openStream = useCallback(
    (login: string) => openAccountLink(`https://www.twitch.tv/${encodeURIComponent(login)}`),
    [openAccountLink],
  );

  // --- Plan · today ---------------------------------------------------------
  // The plan and needs-you memos read the clock. While paused, idle or
  // watching without an ETA nothing else re-runs them for an hour (inventory
  // refresh), so ready times and expiries would stay anchored to the last
  // run. Tick once a minute (minute resolution, like the games view).
  const [nowMinute, setNowMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useInterval(() => setNowMinute(Math.floor(Date.now() / 60_000)), 60_000);
  const rankedGames = useMemo(
    () => resolvePriorityGameNames(priorityGames, inventoryItems),
    [inventoryItems, priorityGames],
  );
  const fallbackOrder = useMemo(
    () => computeFallbackOrder(withCategories, { allowUpcoming: allowUnlinkedGames }),
    [allowUnlinkedGames, withCategories],
  );
  // While paused or idle nothing is being earned: no "watching" row.
  const planActiveDropId = watching && activeDropInfo ? activeDropInfo.id : null;
  // The live ETA moves every second; the table only shows minutes. Floor,
  // like the hero clock, so both show the same minute.
  const planActiveEtaMinute =
    watching && activeDropInfo?.eta != null ? Math.floor(activeDropInfo.eta / 60_000) : null;
  const farmPlan = useMemo(
    () =>
      buildFarmPlan({
        withCategories,
        gameOrder: rankedGames,
        fallbackOrder,
        obeyPriority,
        activeTargetGame: displayTargetGame,
        activeDrop: planActiveDropId
          ? {
              id: planActiveDropId,
              eta: planActiveEtaMinute === null ? null : planActiveEtaMinute * 60_000,
            }
          : null,
        allowUpcoming: allowUnlinkedGames,
        now: nowMinute * 60_000,
      }),
    [
      allowUnlinkedGames,
      displayTargetGame,
      fallbackOrder,
      nowMinute,
      obeyPriority,
      planActiveDropId,
      planActiveEtaMinute,
      rankedGames,
      withCategories,
    ],
  );
  // The watched drop with its live minutes (plan table + drops view). Whole
  // minutes only, so the drops view's memo does not rebuild every second.
  const planActiveEarnedMinute =
    watching && activeDropInfo ? Math.floor(activeDropInfo.virtualEarned) : null;
  const planActiveDrop = useMemo(
    () =>
      planActiveDropId !== null && planActiveEarnedMinute !== null
        ? { id: planActiveDropId, earnedMinutes: planActiveEarnedMinute }
        : null,
    [planActiveDropId, planActiveEarnedMinute],
  );
  const planTable = buildPlanTable(farmPlan, {
    items: inventoryItems,
    gameOrder: rankedGames,
    activeDrop: planActiveDrop,
    now: Date.now(),
    limit: 8,
  });

  // --- Needs you ----------------------------------------------------------
  const needsYouItems = useMemo(
    () =>
      buildNeedsYouItems({
        authExpired: auth.status === "expired",
        items: inventoryItems,
        rankedGames,
        campaigns,
        allowUnlinkedGames,
        now: nowMinute * 60_000,
      }),
    [allowUnlinkedGames, auth.status, campaigns, inventoryItems, nowMinute, rankedGames],
  );
  const dropsNeedingYou = needsYouItems.filter((item) => item.kind !== "session-expired").length;

  const navProps = {
    view,
    setView,
    auth,
    profile,
    startLogin,
    logout,
    showDebug: debugEnabled,
    demoMode,
    autopilotState,
    toggleAutopilot,
    dropsNeedingYou,
  };
  const statsProps = { stats };
  // The active drop's own live completion %, so the hero's percent matches its
  // title + ETA. Null when there is no active drop; the hero then says so
  // instead of showing the game-wide aggregate.
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
  const activeDropItem = activeDropInfo
    ? (inventoryItems.find((item) => item.id === activeDropInfo.id) ?? null)
    : null;
  const heroState = resolveHeroState({
    autopilot: autopilotState,
    watching: Boolean(watching),
    hasActiveDrop: Boolean(activeDropInfo),
    activeGame: displayTargetGame,
    channelsCount: channels.length,
    channelsLoading,
    channelsFailed: channelError !== null,
    canWatchTarget,
  });
  const overviewProps = {
    hero: {
      state: heroState,
      activeGame: displayTargetGame,
      campaignName: activeDropItem?.campaignName,
      campaignEndsAt: activeDropItem?.endsAt,
      dropTitle: activeDropInfo?.title,
      dropEta: watching ? (activeDropInfo?.eta ?? null) : null,
      dropEarned: activeDropInfo?.virtualEarned ?? null,
      dropRequired: activeDropInfo?.requiredMinutes ?? null,
      dropProgress: activeDropProgress,
      autoClaim,
      watching,
      watchingViewers: watchingChannel?.viewers ?? null,
      isManualPick,
      lastWatchOk: watchStats.lastOk,
      claimStatus,
      onToggleAutopilot: toggleAutopilot,
      onOpenStream: openStream,
    },
    picker: {
      // Nothing watchable and nothing watched: no channels are fetched, so
      // the list would only ever be empty.
      disabled: !canWatchTarget && !watching,
      open: channelPickerOpen,
      onOpenChange: setChannelPickerOpen,
      targetGame: displayTargetGame,
      channels,
      channelsLoading,
      channelError,
      channelAllowlist,
      watchingId: watching?.id ?? null,
      isManualPick,
      onPick: pickChannel,
      onBackToAuto: returnToAuto,
    },
    needsYou: {
      items: needsYouItems,
      onClaimNow: claimNowAll,
      onRelogin: startLogin,
      onOpenLink: openAccountLink,
    },
    engine: {
      nextDropCheckAt: inventoryRefresh.nextAt || null,
      channelsWithDrops: watchEngineSnapshot.allowlistedLiveChannels,
      watchingSince,
      decision: watchEngineSnapshot.decision,
      suppression: watchEngineSnapshot.suppression,
      activeCooldowns: watchEngineSnapshot.activeCooldowns,
      watchError: watchStats.lastError,
    },
    plan: {
      table: planTable,
      onOpenGames: () => setView("priorities"),
    },
  };
  const statusbarProps = {
    autopilotState,
    decision: watchEngineSnapshot.decision,
    claimedDrops,
    totalDrops,
    lastWatchOk: watchStats.lastOk,
  };
  const inventoryProps = {
    inventory,
    filter,
    onFilterChange: actions.handleFilterChange,
    refreshing: inventoryRefreshing,
    onRefresh: actions.handleFetchInventory,
    campaigns,
    isLinked: isLinkedOrDemo,
    farmPlan,
    rankedGames,
    activeDrop: planActiveDrop,
    watchingChannel: watching?.name ?? null,
    onAddPriorityGame: actions.addGameByName,
    onOpenAccountLink: openAccountLink,
  };
  // Live channels with drops are only known for the game whose channel list
  // is loaded (the target); the games view shows the count for that game only.
  const channelsWithDrops = watchEngineSnapshot.allowlistedLiveChannels;
  const gamesLiveChannels = useMemo(
    () =>
      !channelsLoading && channelsGame.trim()
        ? { game: channelsGame, count: channelsWithDrops }
        : null,
    [channelsGame, channelsLoading, channelsWithDrops],
  );
  const priorityProps = {
    priorityGames,
    items: inventoryItems,
    farmPlan,
    farmingGame: watching?.game ?? "",
    liveChannels: gamesLiveChannels,
    newGame,
    setNewGame,
    addGame: actions.addGame,
    addGameByName: actions.addGameByName,
    removeGame: actions.removeGame,
    movePriorityGame: actions.movePriorityGame,
    obeyPriority,
    setObeyPriority: actions.handleSetObeyPriority,
  };
  const settingsProps = {
    isLinked,
    profile,
    version: appVersion,
    onOpenGames: () => setView("priorities"),
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
    webhookEnabled,
    setWebhookEnabled: actions.handleSetWebhookEnabled,
    webhookUrl,
    setWebhookUrl: actions.handleSetWebhookUrl,
    webhookDropClaimed,
    setWebhookDropClaimed: actions.handleSetWebhookDropClaimed,
    webhookWatchError,
    setWebhookWatchError: actions.handleSetWebhookWatchError,
    webhookDropEndingSoon,
    setWebhookDropEndingSoon: actions.handleSetWebhookDropEndingSoon,
    webhookAutoSwitch,
    setWebhookAutoSwitch: actions.handleSetWebhookAutoSwitch,
    webhookNewDrops,
    setWebhookNewDrops: actions.handleSetWebhookNewDrops,
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
    resetStats,
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
  const titleBarProps = {
    version: appVersion,
    theme,
    setTheme,
    updateStatus,
    onDownloadUpdate: actions.handleDownloadUpdate,
  };

  const updateDialogProps = {
    updateStatus,
    currentVersion: appVersion,
    onInstall: actions.handleInstallUpdate,
  };

  return {
    language,
    isMac,
    titleBarProps,
    updateDialogProps,
    navProps,
    overviewProps,
    statusbarProps,
    statsProps,
    inventoryProps,
    priorityProps,
    settingsProps,
    debugSnapshot,
    debugEnabled,
  };
}
