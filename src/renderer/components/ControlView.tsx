import type {
  AutoSwitchInfo,
  ChannelDiff,
  ChannelEntry,
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

const CHANNEL_SKELETON = Array.from({ length: 6 }, (_, idx) => ({ key: `sk-${idx}` }));

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
}: ControlProps) {
  const { t, language } = useI18n();
  const prevDropsRef = useRef<Map<string, { earned: number; status: string }>>(new Map());
  const prevChannelsRef = useRef<Map<string, ChannelEntry>>(new Map());
  const firstRenderRef = useRef(true);
  const [exitingChannels, setExitingChannels] = useState<ChannelEntry[]>([]);
  const [viewerPulseSeq, setViewerPulseSeq] = useState<Record<string, number>>({});
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
  const viewerDeltaById = channelDiff?.viewerDeltaById ?? {};

  useEffect(() => {
    if (!channelDiff) return;
    const entries = Object.entries(channelDiff.viewerDeltaById).filter(([, delta]) => Boolean(delta));
    if (entries.length === 0) return;
    setViewerPulseSeq((prev) => {
      const next = { ...prev };
      for (const [id] of entries) {
        next[id] = (next[id] ?? 0) + 1;
      }
      return next;
    });
  }, [channelDiff]);

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
        liveDeltaApplied: 0,
        activeRemainingMinutes: activeDropInfo?.remainingMinutes ?? 0,
        activeEta: activeDropInfo?.eta ?? null,
      };
    }
    const totalRemainingMinutes = Math.max(0, totalRequiredMinutes - totalEarnedMinutes);
    const liveDeltaMinutesRaw = Math.max(0, (progressNow - inventoryFetchedAt) / 60_000);
    const liveDeltaMinutes = Math.min(liveDeltaMinutesRaw, totalRemainingMinutes);
    const activeRemainingBase = Math.max(
      0,
      activeDropInfo.requiredMinutes - activeDropInfo.earnedMinutes,
    );
    const liveDeltaApplied = Math.min(liveDeltaMinutes, activeRemainingBase);
    const activeVirtualEarned = Math.min(
      activeDropInfo.requiredMinutes,
      activeDropInfo.earnedMinutes + liveDeltaApplied,
    );
    const activeRemainingMinutes = Math.max(
      0,
      activeDropInfo.requiredMinutes - activeVirtualEarned,
    );
    const activeEta =
      activeRemainingMinutes > 0 ? progressNow + activeRemainingMinutes * 60_000 : null;
    return { liveDeltaApplied, activeRemainingMinutes, activeEta };
  }, [
    activeDropInfo,
    inventoryFetchedAt,
    progressNow,
    totalEarnedMinutes,
    totalRequiredMinutes,
    watching,
  ]);
  const formatNumber = (val: number) =>
    new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(Math.max(0, val ?? 0));
  const formatViewers = (val: number) => {
    try {
      return new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(Math.max(0, val ?? 0));
    } catch {
      return formatNumber(val);
    }
  };
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
  const activeViewers = activeChannel ? formatViewers(activeChannel.viewers) : null;
  const activeLoginMismatch =
    activeChannel?.login &&
    watching?.name &&
    activeChannel.login.toLowerCase() !== watching.name.toLowerCase()
      ? activeChannel.login
      : null;
  const channelGridStateClass = channelsLoading
    ? "loading"
    : channelsRefreshing
      ? "refreshing"
      : "";
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
                {targetDrops.length > 0 && (
                  <ul className="drop-grid">
                    {targetDrops.map((d, idx) => {
                      const req = Math.max(0, Number(d.requiredMinutes) || 0);
                      const earned = Math.max(0, Number(d.earnedMinutes) || 0);
                      const isActive = activeDropInfo?.id === d.id;
                      const virtualEarned = isActive
                        ? Math.min(req, earned + liveProgress.liveDeltaApplied)
                        : Math.min(req, earned);
                      const pct = req ? Math.min(100, Math.round((virtualEarned / req) * 100)) : 0;
                      const remainingMs = req ? Math.max(0, req - virtualEarned) * 60_000 : 0;
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
                          style={animate ? { animationDelay: `${idx * 35}ms` } : undefined}
                        >
                          <div className="drop-header">
                            <div className="drop-info">
                              <div className="drop-title">{d.title}</div>
                              <div className="meta muted drop-meta-line">
                                <span className="drop-meta-item">
                                  {Math.round(virtualEarned)}/{req} min
                                </span>
                                {isActive && liveProgress.liveDeltaApplied > 0 ? (
                                  <span className="drop-meta-item">
                                    +{Math.round(liveProgress.liveDeltaApplied)}m
                                  </span>
                                ) : null}
                                {isActive && remainingMs > 0 ? (
                                  <span className="drop-meta-item">
                                    ETA {formatDuration(remainingMs)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <span className="pill ghost small">{statusLabel}</span>
                          </div>
                          <div className="progress-bar small">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
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
              <ul className="channel-grid">
                {combinedChannels.map((c, idx) => {
                  const thumb = c.thumbnail
                    ? c.thumbnail.replace("{width}", "320").replace("{height}", "180")
                    : null;
                  const isActive = watching?.id === c.id;
                  const viewerDelta = c.exiting ? 0 : (viewerDeltaById[c.id] ?? 0);
                  const viewerPulse = viewerPulseSeq[c.id] ?? 0;
                  const viewerMainClass =
                    viewerDelta > 0 ? "up" : viewerDelta < 0 ? "down" : "";
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
                        <span
                          key={`${c.id}-${viewerPulse}`}
                          className={`viewer-main ${viewerMainClass} ${viewerPulse > 0 ? "pulse" : ""}`}
                        >
                          {formatViewers(c.viewers)}
                        </span>
                      </span>
                      <div className="channel-content">
                        <div className="channel-header">
                          <div>
                            <div className="meta">{c.game}</div>
                            <div className="channel-name">{c.displayName}</div>
                          </div>
                        </div>
                        {metaLine ? <div className="meta muted">{metaLine}</div> : null}
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
            {channelsLoading && targetGame ? (
              <div className="channel-skeleton-overlay">
                <ul className="channel-grid">
                  {CHANNEL_SKELETON.map((sk) => (
                    <li key={sk.key} className="channel-tile skeleton-tile">
                      <div className="channel-thumb skeleton-thumb skeleton-shine" />
                      <div className="channel-content">
                        <div className="channel-header">
                          <div>
                            <div className="skeleton-line tiny" />
                            <div className="skeleton-line medium" />
                          </div>
                          <div className="skeleton-chip" />
                        </div>
                        <div className="skeleton-line short" />
                        <div className="skeleton-line" />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
