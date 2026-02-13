import type {
  AutoSwitchInfo,
  ChannelDiff,
  ChannelEntry,
  ChannelTrackerStatus,
  ClaimStatus,
  ErrorInfo,
  PriorityPlan,
  InventoryItem,
  WatchingState,
} from "../types";
import { mapStatusLabel } from "../utils";
import { useI18n } from "../i18n";
import { useMemo, useRef, useEffect, useState } from "react";
import { resolveErrorMessage } from "../utils/errors";

const CHANNEL_SKELETON = Array.from({ length: 4 }, (_, idx) => ({ key: `sk-${idx}` }));
type ChannelDensity = "comfortable" | "balanced" | "compact";

const resolveChannelDensity = (count: number, current: ChannelDensity): ChannelDensity => {
  if (current === "comfortable") {
    return count >= 10 ? "balanced" : "comfortable";
  }
  if (current === "compact") {
    return count <= 14 ? "balanced" : "compact";
  }
  if (count <= 6) return "comfortable";
  if (count >= 18) return "compact";
  return "balanced";
};

type ControlProps = {
  priorityPlan: PriorityPlan | null;
  priorityGames: string[];
  targetGame: string;
  setActiveTargetGame: (val: string) => void;
  targetDrops: InventoryItem[];
  targetProgress: number;
  totalDrops: number;
  claimedDrops: number;
  totalEarnedMinutes: number;
  totalRequiredMinutes: number;
  inventoryRefreshing: boolean;
  inventoryFetchedAt: number | null;
  fetchInventory: () => void;
  refreshPriorityPlan: () => void;
  watching: WatchingState;
  stopWatching: () => void;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  channelDiff: ChannelDiff | null;
  channelError: ErrorInfo | null;
  startWatching: (ch: ChannelEntry) => void;
  activeDropInfo: {
    id: string;
    title: string;
    requiredMinutes: number;
    earnedMinutes: number;
    virtualEarned: number;
    remainingMinutes: number;
    eta: number | null;
    dropInstanceId?: string;
    campaignId?: string;
  } | null;
  claimStatus: ClaimStatus | null;
  canWatchTarget: boolean;
  showNoDropsHint: boolean;
  lastWatchOk?: number;
  watchError?: ErrorInfo | null;
  autoSwitchInfo?: AutoSwitchInfo | null;
  trackerStatus?: ChannelTrackerStatus | null;
};

export function ControlView({
  priorityPlan,
  priorityGames,
  targetGame,
  setActiveTargetGame,
  targetDrops,
  totalEarnedMinutes,
  totalRequiredMinutes,
  inventoryRefreshing,
  inventoryFetchedAt,
  fetchInventory,
  watching,
  stopWatching,
  channels,
  channelsLoading,
  channelsRefreshing,
  channelDiff,
  channelError,
  startWatching,
  activeDropInfo,
  claimStatus,
  canWatchTarget,
  showNoDropsHint,
  lastWatchOk,
  watchError,
  autoSwitchInfo,
  trackerStatus,
}: ControlProps) {
  const { t, language } = useI18n();
  const prevDropsRef = useRef<Map<string, { earned: number; status: string }>>(new Map());
  const prevChannelsRef = useRef<Map<string, ChannelEntry>>(new Map());
  const firstRenderRef = useRef(true);
  const wasSwitchingRef = useRef(false);
  const didInitDensityRef = useRef(false);
  const densityApplyTimerRef = useRef<number | null>(null);
  const densitySettleTimerRef = useRef<number | null>(null);
  const viewerAnimFrameRef = useRef<number | null>(null);
  const [exitingChannels, setExitingChannels] = useState<ChannelEntry[]>([]);
  const [animatedViewersById, setAnimatedViewersById] = useState<Record<string, number>>({});
  const [channelDensityClass, setChannelDensityClass] = useState<ChannelDensity>(() =>
    resolveChannelDensity(channels.length, "balanced"),
  );
  const [isDensityTransitioning, setIsDensityTransitioning] = useState(false);
  const watchErrorText = watchError ? resolveErrorMessage(t, watchError) : null;
  const channelErrorText = channelError ? resolveErrorMessage(t, channelError) : null;
  const claimErrorText =
    claimStatus?.kind === "error"
      ? resolveErrorMessage(t, { code: claimStatus.code, message: claimStatus.message })
      : null;
  const claimStatusText =
    claimStatus?.kind === "success"
      ? (claimStatus.message ?? "")
      : claimErrorText
        ? `${claimErrorText}${claimStatus?.title ? `: ${claimStatus.title}` : ""}`
        : "";

  const dropChangedIds = useMemo(() => {
    const prev = prevDropsRef.current;
    if (prev.size === 0) return new Set<string>();
    const changed = new Set<string>();
    for (const d of targetDrops) {
      if (!prev.has(d.id)) {
        changed.add(d.id);
      }
    }
    return changed;
  }, [targetDrops]);

  const channelChangedIds = useMemo(() => {
    if (!channelDiff) return new Set<string>();
    const changed = new Set<string>(channelDiff.addedIds);
    const viewerOnlyIds = new Set(Object.keys(channelDiff.viewerDeltaById));
    const titleChanged = new Set(channelDiff.titleChangedIds);
    for (const id of channelDiff.updatedIds) {
      if (titleChanged.has(id) || !viewerOnlyIds.has(id)) {
        changed.add(id);
      }
    }
    for (const id of titleChanged) {
      changed.add(id);
    }
    return changed;
  }, [channelDiff]);
  useEffect(() => {
    setAnimatedViewersById((prev) => {
      const next: Record<string, number> = {};
      for (const channel of channels) {
        next[channel.id] = prev[channel.id] ?? channel.viewers;
      }
      return next;
    });
  }, [channels]);

  useEffect(() => {
    if (!channelDiff) return;
    const entries = Object.entries(channelDiff.viewerDeltaById).filter(([, delta]) => Boolean(delta));
    if (entries.length === 0) return;
    const starts = new Map<string, number>();
    const targets = new Map<string, number>();
    const channelById = new Map(channels.map((channel) => [channel.id, channel]));
    for (const [id, delta] of entries) {
      const channel = channelById.get(id);
      if (!channel) continue;
      const target = Math.max(0, channel.viewers);
      const start = Math.max(0, target - delta);
      starts.set(id, start);
      targets.set(id, target);
    }
    if (targets.size === 0) return;
    if (viewerAnimFrameRef.current !== null) {
      window.cancelAnimationFrame(viewerAnimFrameRef.current);
      viewerAnimFrameRef.current = null;
    }
    const durationMs = 440;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setAnimatedViewersById((prev) => {
        const next = { ...prev };
        for (const [id, target] of targets) {
          const start = starts.get(id) ?? target;
          next[id] = Math.round(start + (target - start) * eased);
        }
        return next;
      });
      if (progress < 1) {
        viewerAnimFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        viewerAnimFrameRef.current = null;
      }
    };
    viewerAnimFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (viewerAnimFrameRef.current !== null) {
        window.cancelAnimationFrame(viewerAnimFrameRef.current);
        viewerAnimFrameRef.current = null;
      }
    };
  }, [channelDiff, channels]);

  useEffect(() => {
    const next = new Map<string, { earned: number; status: string }>();
    for (const d of targetDrops) {
      next.set(d.id, { earned: Number(d.earnedMinutes) || 0, status: d.status });
    }
    prevDropsRef.current = next;
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
    }
  }, [targetDrops]);

  useEffect(() => {
    const next = new Map<string, ChannelEntry>();
    for (const c of channels) {
      next.set(c.id, c);
    }
    const prevFirst = prevChannelsRef.current.values().next().value as ChannelEntry | undefined;
    const nextFirst = channels[0];
    const gameSwitched =
      Boolean(prevFirst?.game) && Boolean(nextFirst?.game) && prevFirst?.game !== nextFirst?.game;
    if (gameSwitched) {
      // Hard game switches should not animate all previous channels as "exiting".
      setExitingChannels([]);
      prevChannelsRef.current = next;
      if (firstRenderRef.current) {
        firstRenderRef.current = false;
      }
      return;
    }
    // detect removed channels
    const removedIds: string[] = [];
    for (const [id] of prevChannelsRef.current) {
      if (!next.has(id)) removedIds.push(id);
    }
    if (removedIds.length > 0) {
      const removedChannels: ChannelEntry[] = [];
      for (const id of removedIds) {
        const prev = prevChannelsRef.current.get(id);
        if (prev) removedChannels.push(prev);
      }
      setExitingChannels((prev) => {
        const existing = new Set(prev.map((c) => c.id));
        const toAdd = removedChannels.filter((c) => !existing.has(c.id));
        return [...prev, ...toAdd];
      });
      // cleanup after animation
      window.setTimeout(() => {
        setExitingChannels((prev) => prev.filter((c) => !removedIds.includes(c.id)));
      }, 240);
    }
    prevChannelsRef.current = next;
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
    }
  }, [channels]);

  const combinedChannels: Array<ChannelEntry & { exiting?: boolean }> = useMemo(() => {
    const exitingMap = new Map(exitingChannels.map((c) => [c.id, c]));
    const merged: Array<ChannelEntry & { exiting?: boolean }> = [];
    for (const c of channels) {
      merged.push({ ...c, exiting: false });
      exitingMap.delete(c.id);
    }
    for (const c of exitingMap.values()) {
      merged.push({ ...c, exiting: true });
    }
    return merged;
  }, [channels, exitingChannels]);

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  };
  const [progressNow, setProgressNow] = useState(() => Date.now());
  const shouldTickProgress = Boolean(
    watching &&
    inventoryFetchedAt &&
    activeDropInfo &&
    activeDropInfo.requiredMinutes > activeDropInfo.earnedMinutes,
  );
  useEffect(() => {
    if (!shouldTickProgress) return;
    setProgressNow(Date.now());
    const timer = window.setInterval(() => setProgressNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [shouldTickProgress, activeDropInfo?.id, inventoryFetchedAt]);
  const liveProgress = useMemo(() => {
    if (!activeDropInfo || !watching || !inventoryFetchedAt) {
      return {
        activeRemainingMinutes: activeDropInfo?.remainingMinutes ?? 0,
        activeEta: activeDropInfo?.eta ?? null,
      };
    }
    const activeRemainingBase = Math.max(0, activeDropInfo.requiredMinutes - activeDropInfo.earnedMinutes);
    const elapsedMinutesRaw = Math.max(0, (progressNow - inventoryFetchedAt) / 60_000);
    const elapsedApplied = Math.min(elapsedMinutesRaw, activeRemainingBase);
    const activeRemainingMinutes = Math.max(0, activeRemainingBase - elapsedApplied);
    const activeEta =
      activeRemainingMinutes > 0 ? progressNow + activeRemainingMinutes * 60_000 : null;
    return { activeRemainingMinutes, activeEta };
  }, [activeDropInfo, inventoryFetchedAt, progressNow, watching]);
  const formatNumber = (val: number) =>
    new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(Math.max(0, val ?? 0));
  const formatViewers = (val: number) => formatNumber(val);
  const formatCampaignId = (value?: string) => {
    const normalized = value?.trim();
    if (!normalized) return null;
    if (normalized.length <= 12) return normalized;
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
  };
  const campaignGroups = useMemo(() => {
    type CampaignGroup = {
      key: string;
      title: string;
      tooltip?: string;
      items: InventoryItem[];
      active: boolean;
    };
    const groups: CampaignGroup[] = [];
    const indexByKey = new Map<string, number>();
    for (const drop of targetDrops) {
      const campaignName = drop.campaignName?.trim();
      const campaignId = drop.campaignId?.trim();
      const key = campaignId
        ? `id:${campaignId}`
        : campaignName
          ? `name:${campaignName.toLowerCase()}`
          : `drop:${drop.id}`;
      const isActiveInGroup = activeDropInfo?.campaignId
        ? campaignId === activeDropInfo.campaignId
        : activeDropInfo?.id === drop.id;
      const existingIndex = indexByKey.get(key);
      if (existingIndex !== undefined) {
        groups[existingIndex].items.push(drop);
        if (isActiveInGroup) groups[existingIndex].active = true;
        continue;
      }
      const fallbackId = formatCampaignId(campaignId);
      const title = campaignName
        ? campaignName
        : fallbackId
          ? t("control.campaignFallback", { id: fallbackId })
          : t("control.campaignUnknown");
      const tooltip =
        campaignName && campaignId
          ? `${campaignName} (${campaignId})`
          : campaignName || campaignId || undefined;
      indexByKey.set(key, groups.length);
      groups.push({
        key,
        title,
        tooltip,
        items: [drop],
        active: Boolean(isActiveInGroup),
      });
    }
    return groups;
  }, [activeDropInfo?.campaignId, activeDropInfo?.id, targetDrops, t]);
  const activeEtaText = liveProgress.activeEta
    ? new Date(liveProgress.activeEta).toLocaleTimeString()
    : null;
  const activeChannel =
    watching && channels.length
      ? channels.find((c) => c.id === watching.id || c.login === watching.login)
      : null;
  const activeThumb = activeChannel?.thumbnail
    ? activeChannel.thumbnail.replace("{width}", "640").replace("{height}", "360")
    : null;
  const activeViewerCount = activeChannel
    ? (animatedViewersById[activeChannel.id] ?? activeChannel.viewers)
    : null;
  const activeViewers = activeViewerCount !== null ? formatViewers(activeViewerCount) : null;
  const activeLoginMismatch =
    activeChannel?.login &&
    watching?.name &&
    activeChannel.login.toLowerCase() !== watching.name.toLowerCase()
      ? activeChannel.login
      : null;
  const visibleGame = channels[0]?.game ?? "";
  const isGameSwitchLoading =
    Boolean(targetGame) && channelsLoading && channels.length > 0 && visibleGame !== targetGame;
  const channelGridStateClass = isGameSwitchLoading
    ? "switching"
    : channelsLoading
      ? "loading"
      : channelsRefreshing
        ? "refreshing"
        : "";
  const showChannelSkeleton = Boolean(targetGame) && channelsLoading && channels.length === 0;
  const visibleChannelCount = Math.max(channels.length, combinedChannels.length);
  useEffect(() => {
    const clearTimers = () => {
      if (densityApplyTimerRef.current !== null) {
        window.clearTimeout(densityApplyTimerRef.current);
        densityApplyTimerRef.current = null;
      }
      if (densitySettleTimerRef.current !== null) {
        window.clearTimeout(densitySettleTimerRef.current);
        densitySettleTimerRef.current = null;
      }
    };
    if (isGameSwitchLoading) {
      wasSwitchingRef.current = true;
      clearTimers();
      setIsDensityTransitioning(false);
      return clearTimers;
    }
    const nextDensity = resolveChannelDensity(visibleChannelCount, channelDensityClass);
    if (!didInitDensityRef.current) {
      didInitDensityRef.current = true;
      clearTimers();
      if (nextDensity !== channelDensityClass) {
        setChannelDensityClass(nextDensity);
      }
      setIsDensityTransitioning(false);
      wasSwitchingRef.current = false;
      return clearTimers;
    }
    if (nextDensity === channelDensityClass) {
      if (wasSwitchingRef.current) {
        wasSwitchingRef.current = false;
      }
      return clearTimers;
    }
    if (wasSwitchingRef.current) {
      clearTimers();
      setChannelDensityClass(nextDensity);
      setIsDensityTransitioning(false);
      wasSwitchingRef.current = false;
      return clearTimers;
    }
    clearTimers();
    setIsDensityTransitioning(true);
    densityApplyTimerRef.current = window.setTimeout(() => {
      setChannelDensityClass(nextDensity);
      densityApplyTimerRef.current = null;
    }, 70);
    densitySettleTimerRef.current = window.setTimeout(() => {
      setIsDensityTransitioning(false);
      densitySettleTimerRef.current = null;
    }, 230);
    return clearTimers;
  }, [visibleChannelCount, channelDensityClass, isGameSwitchLoading]);

  useEffect(() => {
    return () => {
      if (viewerAnimFrameRef.current !== null) {
        window.cancelAnimationFrame(viewerAnimFrameRef.current);
        viewerAnimFrameRef.current = null;
      }
      if (densityApplyTimerRef.current !== null) {
        window.clearTimeout(densityApplyTimerRef.current);
        densityApplyTimerRef.current = null;
      }
      if (densitySettleTimerRef.current !== null) {
        window.clearTimeout(densitySettleTimerRef.current);
        densitySettleTimerRef.current = null;
      }
    };
  }, []);

  const channelGridClass = `channel-grid channel-grid-${channelDensityClass}${
    isDensityTransitioning && !isGameSwitchLoading ? " is-density-transitioning" : ""
  }`;
  const trackerFallbackRemainingMs =
    trackerStatus?.fallbackActive && trackerStatus.fallbackUntil
      ? Math.max(0, trackerStatus.fallbackUntil - Date.now())
      : null;
  return (
    <>
      <div className="panel-head control-head">
        <div>
          <h2>{t("control.title")}</h2>
          <p className="meta">{t("control.subtitle")}</p>
        </div>
        <div className="status-row control-head-actions">
          <button
            type="button"
            className="ghost subtle-btn"
            onClick={fetchInventory}
            disabled={inventoryRefreshing}
          >
            {inventoryRefreshing ? (
              <span className="inline-loader">
                <span className="spinner" />
                {t("control.refreshing")}
              </span>
            ) : (
              t("control.refresh")
            )}
          </button>
          {claimStatusText ? (
            <span className={`pill small ${claimStatus?.kind === "error" ? "danger-chip" : ""}`}>
              {t("control.autoClaim")}: {claimStatusText}
            </span>
          ) : null}
          {watchError ? (
            <span className="pill ghost danger-chip">{t("control.pingError")}</span>
          ) : null}
        </div>
      </div>
      <div className="control-layout">
        <div className="control-left">
          <div className="card watch-card">
            <div
              className="watch-visual"
              style={
                activeThumb
                  ? {
                      backgroundImage: `linear-gradient(120deg, rgba(5,10,22,0.8), rgba(8,12,26,0.8)), url(${activeThumb})`,
                    }
                  : undefined
              }
            />
            <div className="watch-body">
              <div className="label">{t("control.activeStream")}</div>
              {watching ? (
                <>
                  <div className="watch-heading">
                    <div>
                      <div className="watch-name">
                        <span>{watching.name}</span>
                        <span
                          className="live-dot"
                          aria-label={t("control.live")}
                          title={t("control.live")}
                        />
                      </div>
                      <div className="meta">
                        {watching.game}
                        {activeLoginMismatch ? `  @${activeLoginMismatch}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="watch-meta">
                    {activeChannel ? (
                      <span className="pill viewers-chip small">
                        {activeViewers} {t("control.viewers")}
                      </span>
                    ) : (
                      <span className="pill ghost small">Channel-Metadaten fehlen</span>
                    )}
                  </div>
                  <div className="watch-actions">
                    <button type="button" className="ghost danger" onClick={stopWatching}>
                      {t("control.stop")}
                    </button>
                  </div>
                  {autoSwitchInfo ? (
                    <p className="meta muted">
                      Auto-Switch ({autoSwitchInfo.reason}):{" "}
                      {autoSwitchInfo.from?.name ?? "Unknown"} -{">"} {autoSwitchInfo.to.name} um{" "}
                      {new Date(autoSwitchInfo.at).toLocaleTimeString()}
                    </p>
                  ) : null}
                  {watchErrorText ? (
                    <p className="error">
                      {t("control.pingError")}: {watchErrorText}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="watch-empty">
                  <p className="meta">{t("control.noChannel")}</p>
                  <p className="meta muted">
                    {showNoDropsHint ? t("control.noDropsHint") : t("control.pickStream")}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="card control-drops">
            <div className="card-header-row">
              <div className="label">{t("control.progress")}</div>
              {lastWatchOk ? (
                <div className="meta muted">
                  Last ping: {new Date(lastWatchOk).toLocaleTimeString()}
                </div>
              ) : null}
            </div>
            {targetGame ? (
              <>
                {activeDropInfo ? (
                  <div className="active-drop-row">
                    <div>
                      <div className="meta">{t("control.currentDrop")}</div>
                      <div className="active-drop-title">{activeDropInfo.title}</div>
                    </div>
                    <div className="pill-row">
                      <span className="pill ghost small">
                        {liveProgress.activeRemainingMinutes > 0
                          ? t("control.rest", {
                              time: formatDuration(liveProgress.activeRemainingMinutes * 60_000),
                            })
                          : t("control.done")}
                      </span>
                      {activeEtaText ? (
                        <span className="pill ghost small">
                          {t("control.eta", { time: activeEtaText })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="meta muted" style={{ marginTop: 6 }}>
                    {showNoDropsHint ? t("control.noDropsHint") : t("control.allDone")}
                  </p>
                )}
                {campaignGroups.length > 0 && (
                  <div className="drop-campaigns">
                    {campaignGroups.map((group, groupIdx) => (
                      <section
                        key={group.key}
                        className={`drop-campaign-group ${group.active ? "active" : ""}`}
                      >
                        <div className="drop-campaign-head">
                          <div className="drop-campaign-title" title={group.tooltip}>
                            {group.title}
                          </div>
                          <span className="pill ghost small">
                            {t("control.campaignDrops", { count: group.items.length })}
                          </span>
                        </div>
                        <ul className="drop-grid">
                          {group.items.map((d, idx) => {
                            const req = Math.max(0, Number(d.requiredMinutes) || 0);
                            const earned = Math.max(0, Number(d.earnedMinutes) || 0);
                            const isActive = activeDropInfo?.id === d.id;
                            const earnedDisplay = Math.min(req, earned);
                            const pct = req ? Math.min(100, Math.round((earnedDisplay / req) * 100)) : 0;
                            const statusLabel = mapStatusLabel(d.status, (key) => t(key));
                            const statusClass =
                              d.status === "claimed"
                                ? "claimed"
                                : d.status === "progress"
                                  ? "progress"
                                  : "locked";
                            const animate = !firstRenderRef.current && dropChangedIds.has(d.id);
                            return (
                              <li
                                key={d.id}
                                className={`drop-card ${statusClass} ${isActive ? "active" : ""} ${animate ? "animate-item" : ""}`}
                                style={
                                  animate
                                    ? { animationDelay: `${(groupIdx * 8 + idx) * 30}ms` }
                                    : undefined
                                }
                              >
                                <div className="drop-header">
                                  <div className="drop-title">{d.title}</div>
                                  <span className="pill ghost small">{statusLabel}</span>
                                </div>
                                <div className="meta muted drop-meta-line">
                                  <span className="drop-meta-item">
                                    {earnedDisplay}/{req} min
                                  </span>
                                </div>
                                <div className="progress-bar small">
                                  <span style={{ width: `${pct}%` }} />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="meta">{t("control.targetMissing")}</p>
            )}
          </div>
        </div>

        <div className="card control-target">
          <div className="control-target-head">
            <div className="label">{t("control.targetTitle")}</div>
            <div className="control-target-actions">
              <select
                className="select"
                value={targetGame}
                onChange={(e) => setActiveTargetGame(e.target.value)}
              >
                <option value="">{t("control.noTarget")}</option>
                {(priorityPlan?.order.length ? priorityPlan.order : priorityGames).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setActiveTargetGame("")} className="ghost">
                {t("control.reset")}
              </button>
            </div>
          </div>
          {targetGame ? (
            <>
              <p className="meta">
                {t("control.activeTarget")}: {targetGame}
              </p>
              <p className="meta muted">
                {t("control.streamsFound")}: {channels.length > 0 ? channels.length : 0}
              </p>
              {trackerStatus ? (
                <div className="status-row control-tracker-row">
                  {trackerStatus.connectionState &&
                  trackerStatus.connectionState !== "connected" ? (
                    <span className="pill ghost small">
                      {t("control.trackerConnection")}:{" "}
                      {t(`control.trackerConn.${trackerStatus.connectionState}`)}
                    </span>
                  ) : null}
                  {trackerStatus.fallbackActive ? (
                    <span className="pill small danger-chip">
                      {t("control.trackerFallback", {
                        time:
                          trackerFallbackRemainingMs !== null
                            ? formatDuration(trackerFallbackRemainingMs)
                            : "n/a",
                      })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="meta">{t("control.targetMissing")}</p>
          )}
          {targetGame && channelsLoading ? (
            <p className="meta inline-loader">
              <span className="spinner" />
              {t("control.channelsLoading")}
            </p>
          ) : null}
          {targetGame && channelErrorText && (
            <p className="error">
              {t("control.channelError")}: {channelErrorText}
            </p>
          )}
          <div className={`channel-grid-wrapper ${channelGridStateClass}`}>
            {targetGame && channels.length > 0 ? (
              <ul className={channelGridClass}>
                {combinedChannels.map((c, idx) => {
                  const thumb = c.thumbnail
                    ? c.thumbnail.replace("{width}", "320").replace("{height}", "180")
                    : null;
                  const isActive = watching?.id === c.id;
                  const animatedViewerCount = c.exiting
                    ? c.viewers
                    : (animatedViewersById[c.id] ?? c.viewers);
                  const loginLabel =
                    c.login &&
                    c.displayName &&
                    c.displayName.toLowerCase() !== c.login.toLowerCase()
                      ? `@${c.login}`
                      : "";
                  const languageTag = c.language ? c.language.toUpperCase() : "";
                  const metaParts = [languageTag, loginLabel].filter(Boolean);
                  const metaLine = metaParts.join(" â€¢ ");
                  const title = c.title?.trim() ?? "";
                  return (
                    <li
                      key={c.id}
                      className={`channel-tile ${isActive ? "active" : ""} ${
                        c.exiting
                          ? "animate-exit"
                          : !firstRenderRef.current && channelChangedIds.has(c.id)
                            ? "animate-item"
                            : ""
                      }`}
                      style={
                        !firstRenderRef.current && channelChangedIds.has(c.id) && !c.exiting
                          ? { animationDelay: `${idx * 30}ms` }
                          : undefined
                      }
                      onClick={() => {
                        if (!canWatchTarget) return;
                        startWatching(c);
                      }}
                      role="button"
                      tabIndex={canWatchTarget ? 0 : -1}
                      aria-disabled={!canWatchTarget}
                      onKeyDown={(evt) => {
                        if (!canWatchTarget) return;
                        if (evt.key === "Enter" || evt.key === " ") {
                          evt.preventDefault();
                          startWatching(c);
                        }
                      }}
                    >
                      {thumb ? (
                        <div
                          className="channel-thumb"
                          style={{ backgroundImage: `url(${thumb})` }}
                        />
                      ) : null}
                      <span className="viewer-badge">
                        <span className="viewer-main">
                          {formatViewers(animatedViewerCount)}
                        </span>
                      </span>
                      <div className="channel-content">
                        <div className="channel-header">
                          <div>
                            <div className="meta ellipsis">{c.game}</div>
                            <div className="channel-name ellipsis">{c.displayName}</div>
                          </div>
                        </div>
                        {metaLine ? <div className="meta muted ellipsis">{metaLine}</div> : null}
                        {title ? <div className="meta muted ellipsis">{title}</div> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {!channelsLoading && !channelError && targetGame && channels.length === 0 ? (
              <div className="channel-empty">{t("control.channelsEmpty")}</div>
            ) : null}
            {showChannelSkeleton ? (
              <ul className={`${channelGridClass} channel-grid-skeleton`} aria-hidden="true">
                {CHANNEL_SKELETON.map((sk) => (
                  <li key={sk.key} className="channel-tile skeleton-tile">
                    <div className="skeleton-head">
                      <div className="skeleton-line tiny" />
                      <div className="skeleton-chip" />
                    </div>
                    <div className="skeleton-line medium" />
                    <div className="skeleton-line short" />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
