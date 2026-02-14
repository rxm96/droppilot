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
} from "@renderer/shared/types";
import { mapStatusLabel } from "@renderer/shared/utils";
import { useI18n } from "@renderer/shared/i18n";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";
import { useControlViewState } from "./useControlViewState";

const CHANNEL_SKELETON = Array.from({ length: 4 }, (_, idx) => ({ key: `sk-${idx}` }));

type ControlProps = {
  priorityPlan: PriorityPlan | null;
  priorityGames: string[];
  targetGame: string;
  setActiveTargetGame: (val: string) => void;
  targetDrops: InventoryItem[];
  targetProgress: number;
  totalDrops: number;
  claimedDrops: number;
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
  const {
    firstRenderRef,
    dropChangedIds,
    channelChangedIds,
    combinedChannels,
    animatedViewersById,
    channelGridClass,
    channelGridStateClass,
    showChannelSkeleton,
    liveProgress,
    activeEtaText,
    activeChannel,
    activeThumb,
    activeViewerCount,
    activeLoginMismatch,
    campaignGroups,
    trackerFallbackRemainingMs,
  } = useControlViewState({
    channels,
    channelDiff,
    channelsLoading,
    channelsRefreshing,
    targetGame,
    watching,
    targetDrops,
    activeDropInfo,
    inventoryFetchedAt,
    trackerStatus,
    t,
  });
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
  const formatNumber = (val: number) =>
    new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(Math.max(0, val ?? 0));
  const formatViewers = (val: number) => formatNumber(val);
  const activeViewers = activeViewerCount !== null ? formatViewers(activeViewerCount) : null;
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
          <div className="card control-drops">
            <div className="card-header-row">
              <div className="label">{t("control.progress")}</div>
              {lastWatchOk ? (
                <div className="meta muted">
                  Last ping: {new Date(lastWatchOk).toLocaleTimeString()}
                </div>
              ) : null}
            </div>
            {watching ? (
              <div
                className="active-stream-bar"
                style={
                  activeThumb
                    ? {
                        backgroundImage: `var(--active-stream-overlay), url(${activeThumb})`,
                      }
                    : undefined
                }
              >
                <div
                  className="active-stream-thumb"
                  style={activeThumb ? { backgroundImage: `url(${activeThumb})` } : undefined}
                />
                <div className="active-stream-info">
                  <div className="label">{t("control.activeStream")}</div>
                  <div className="active-stream-name">
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
                <div className="active-stream-actions">
                  {activeChannel ? (
                    <span className="pill viewers-chip small">
                      {activeViewers} {t("control.viewers")}
                    </span>
                  ) : (
                    <span className="pill ghost small">Channel-Metadaten fehlen</span>
                  )}
                  <button type="button" className="ghost danger" onClick={stopWatching}>
                    {t("control.stop")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="active-stream-bar empty">
                <div>
                  <div className="label">{t("control.activeStream")}</div>
                  <p className="meta">{t("control.noChannel")}</p>
                  <p className="meta muted">
                    {showNoDropsHint ? t("control.noDropsHint") : t("control.pickStream")}
                  </p>
                </div>
              </div>
            )}
            {autoSwitchInfo ? (
              <p className="meta muted">
                Auto-Switch ({autoSwitchInfo.reason}): {autoSwitchInfo.from?.name ?? "Unknown"} -{">"}{" "}
                {autoSwitchInfo.to.name} um {new Date(autoSwitchInfo.at).toLocaleTimeString()}
              </p>
            ) : null}
            {watchErrorText ? (
              <p className="error">
                {t("control.pingError")}: {watchErrorText}
              </p>
            ) : null}
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
                            const dropImage =
                              typeof d.imageUrl === "string" ? d.imageUrl.trim() : "";
                            const campaignImage =
                              typeof d.campaignImageUrl === "string"
                                ? d.campaignImageUrl.trim()
                                : "";
                            const imageSrc = dropImage || campaignImage;
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
                                {imageSrc ? (
                                  <div
                                    className="drop-image-frame"
                                    style={
                                      campaignImage
                                        ? {
                                            backgroundImage: `linear-gradient(150deg, rgba(5, 10, 22, 0.6), rgba(8, 12, 26, 0.8)), url(${campaignImage})`,
                                            backgroundSize: "cover",
                                            backgroundPosition: "center",
                                          }
                                        : undefined
                                    }
                                  >
                                    <img src={imageSrc} alt="" loading="lazy" />
                                  </div>
                                ) : null}
                                <div className="drop-body">
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
