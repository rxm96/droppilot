import type {
  AutoSwitchInfo,
  ChannelEntry,
  ClaimStatus,
  ErrorInfo,
  PriorityPlan,
  InventoryItem,
  WatchingState,
} from "../../types";
import { mapStatusLabel } from "../../shared/utils/inventory";
import { useI18n } from "../../i18n";
import { resolveErrorMessage } from "../../shared/utils/errors";
import { useAnimatedChannels } from "./useAnimatedChannels";
import { useDropChanges } from "./useDropChanges";
import { useFormatters } from "../../shared/hooks/useFormatters";
import { useIsFirstRender } from "../../shared/hooks/useIsFirstRender";

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
  fetchInventory: () => void;
  refreshPriorityPlan: () => void;
  watching: WatchingState;
  stopWatching: () => void;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelError: ErrorInfo | null;
  startWatching: (ch: ChannelEntry) => void;
  liveDeltaApplied: number;
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
  nextWatchIn: number;
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
  targetProgress,
  totalDrops,
  claimedDrops,
  totalEarnedMinutes,
  totalRequiredMinutes,
  fetchInventory,
  refreshPriorityPlan,
  watching,
  stopWatching,
  channels,
  channelsLoading,
  channelError,
  startWatching,
  liveDeltaApplied,
  activeDropInfo,
  claimStatus,
  canWatchTarget,
  showNoDropsHint,
  nextWatchIn,
  lastWatchOk,
  watchError,
  autoSwitchInfo,
}: ControlProps) {
  const { t, language } = useI18n();
  const { formatDuration, formatTime, formatViewers } = useFormatters(language);
  const firstRenderRef = useIsFirstRender();
  const { changedIds: dropChangedIds } = useDropChanges(targetDrops);
  const { combinedChannels, changedIds: channelChangedIds } = useAnimatedChannels(channels);
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
  const activeEtaText = activeDropInfo?.eta ? formatTime(activeDropInfo.eta) : null;
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
  return (
    <>
      <div className="panel-head">
        <div>
          <h2>{t("control.title")}</h2>
          <p className="meta">{t("control.subtitle")}</p>
        </div>
        <div className="status-row">
          {watchError ? (
            <span className="pill ghost danger-chip">{t("control.pingError")}</span>
          ) : null}
        </div>
      </div>
      {claimStatus && (
        <p className={`meta ${claimStatus.kind === "error" ? "error" : ""}`}>
          {t("control.autoClaim")}: {claimStatusText}
        </p>
      )}
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
                  Auto-Switch ({autoSwitchInfo.reason}): {autoSwitchInfo.from?.name ?? "Unknown"} -
                  {">"} {autoSwitchInfo.to.name} um{" "}
                  {formatTime(autoSwitchInfo.at)}
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
      <div className="overview-grid">
        <div className="card">
          <div className="card-header-row">
            <div className="label">{t("control.progress")}</div>
            <button type="button" className="ghost subtle-btn" onClick={fetchInventory}>
              {t("control.refresh")}
            </button>
          </div>
          {targetGame ? (
            <>
              <p className="meta">
                {t("control.gameLabel")}: {targetGame}
              </p>
              <div className="progress-summary">
                <div className="stat-pill">
                  <span className="stat-label">{t("control.dropsLabel")}</span>
                  <span className="stat-value">
                    {claimedDrops}/{totalDrops}
                  </span>
                </div>
                <div className="stat-pill">
                  <span className="stat-label">{t("control.minutesLabel")}</span>
                  <span className="stat-value">
                    {Math.round(totalEarnedMinutes + liveDeltaApplied)}/{totalRequiredMinutes}
                  </span>
                </div>
                <div className="stat-pill">
                  <span className="stat-label">{t("control.progressLabel")}</span>
                  <span className="stat-value">{Math.round(targetProgress)}%</span>
                </div>
                {activeDropInfo ? (
                  <div className="stat-pill accent">
                    <span className="stat-label">{t("control.activeDrop")}</span>
                    <span className="stat-value">
                      {activeDropInfo.title}
                      {activeEtaText ? ` | ${t("control.eta", { time: activeEtaText })}` : ""}
                    </span>
                  </div>
                ) : null}
              </div>
              {activeDropInfo ? (
                <div className="active-drop-row">
                  <div>
                    <div className="meta">{t("control.currentDrop")}</div>
                    <div className="active-drop-title">{activeDropInfo.title}</div>
                  </div>
                  <div className="pill-row">
                    <span className="pill ghost small">
                      {activeDropInfo.remainingMinutes > 0
                        ? t("control.rest", {
                            time: formatDuration(activeDropInfo.remainingMinutes * 60_000),
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
              <div className="progress-bar">
                <span style={{ width: `${targetProgress}%` }} />
              </div>
              {targetDrops.length > 0 && (
                <ul className="drop-grid">
                  {targetDrops.map((d, idx) => {
                    const req = Math.max(0, Number(d.requiredMinutes) || 0);
                    const earned = Math.max(0, Number(d.earnedMinutes) || 0);
                    const isActive = activeDropInfo?.id === d.id;
                    const virtualEarned = isActive
                      ? Math.min(req, earned + liveDeltaApplied)
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
                          <div>
                            <div className="drop-title">{d.title}</div>
                            <div className="meta muted">
                              {Math.round(virtualEarned)}/{req} min
                              {isActive && liveDeltaApplied > 0
                                ? ` | +${Math.round(liveDeltaApplied)}m live`
                                : ""}
                              {isActive && remainingMs > 0
                                ? ` | ${t("control.eta", { time: formatDuration(remainingMs) })}`
                                : ""}
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
              {lastWatchOk ? (
                <p className="meta muted" style={{ marginTop: 8 }}>
                  Last ping: {formatTime(lastWatchOk)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="meta">{t("control.targetMissing")}</p>
          )}
        </div>
        <div className="card">
          <div className="label">{t("control.targetTitle")}</div>
          <div className="filters-row" style={{ marginBottom: 8 }}>
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
          {targetGame ? (
            <>
              <p className="meta">
                {t("control.activeTarget")}: {targetGame}
              </p>
              <p className="meta muted">
                {t("control.streamsFound")}: {channels.length > 0 ? channels.length : 0} |{" "}
                {t("control.dropsOpen")}: {totalDrops}
              </p>
            </>
          ) : (
            <p className="meta">{t("control.targetMissing")}</p>
          )}
          {showNoDropsHint ? <p className="meta muted">{t("control.noDropsHint")}</p> : null}
          {canWatchTarget && channelsLoading ? (
            <p className="meta inline-loader">
              <span className="spinner" />
              {t("control.channelsLoading")}
            </p>
          ) : null}
          {canWatchTarget && channelErrorText && (
            <p className="error">
              {t("control.channelError")}: {channelErrorText}
            </p>
          )}
          <div className={`channel-grid-wrapper ${channelsLoading ? "loading" : ""}`}>
            {canWatchTarget && channels.length > 0 ? (
              <ul className="channel-grid">
                {combinedChannels.map((c, idx) => {
                  const thumb = c.thumbnail
                    ? c.thumbnail.replace("{width}", "320").replace("{height}", "180")
                    : null;
                  const isActive = watching?.id === c.id;
                  const loginLabel =
                    c.login &&
                    c.displayName &&
                    c.displayName.toLowerCase() !== c.login.toLowerCase()
                      ? `@${c.login}`
                      : "";
                  const languageTag = c.language ? c.language.toUpperCase() : "";
                  const metaParts = [languageTag, loginLabel].filter(Boolean);
                  const metaLine = metaParts.join(" • ");
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
                      onClick={() => startWatching(c)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(evt) => {
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
                      <span className="viewer-badge">{formatViewers(c.viewers)}</span>
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
            {!channelsLoading && !channelError && canWatchTarget && channels.length === 0 ? (
              <div className="channel-empty">{t("control.channelsEmpty")}</div>
            ) : null}
            {channelsLoading && canWatchTarget ? (
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
