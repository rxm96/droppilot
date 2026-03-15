import type {
  ChannelTrackerStatus,
  ErrorInfo,
  InventoryItem,
  InventoryState,
  StatsState,
} from "@renderer/shared/types";
import { useI18n } from "@renderer/shared/i18n";
import { useInterval } from "@renderer/shared/hooks/useInterval";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@renderer/shared/components/ui/alert-dialog";
import { useEffect, useState } from "react";

type OverviewProps = {
  inventory: InventoryState;
  stats: StatsState;
  resetStats: () => void;
  activeGame: string;
  activeDropTitle?: string;
  activeDropRemainingMinutes?: number;
  activeDropEta?: number | null;
  targetProgress: number;
  totalDrops: number;
  claimedDrops: number;
  claimableDrops: number;
  blockedDrops: number;
  channelsCount: number;
  canWatchTarget: boolean;
  watchDecision:
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
    | "idle-no-watchable-drops";
  watchSuppressionReason: "manual-stop" | "stall-stop" | null;
  lastWatchOk?: number | null;
  inventoryFetchedAt?: number | null;
  trackerStatus?: ChannelTrackerStatus | null;
  watchError?: ErrorInfo | null;
};

type AttentionItem = {
  tone: "danger" | "warn" | "info";
  title: string;
  detail: string;
};

const mapOverviewWatchStateLabel = (
  decision: OverviewProps["watchDecision"],
  suppressionReason: OverviewProps["watchSuppressionReason"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) => {
  switch (decision) {
    case "no-target":
      return t("control.watchEngineDecision.noTarget");
    case "suppressed":
      if (suppressionReason === "manual-stop") {
        return t("control.watchEngineDecision.suppressedManualStop");
      }
      return t("control.watchEngineDecision.suppressed");
    case "cooldown":
      return t("control.watchEngineDecision.cooldown");
    case "watching-progress":
      return t("control.watchEngineDecision.watchingProgress");
    case "watching-recover":
      return t("control.watchEngineDecision.watchingRecover");
    case "watching-no-farmable":
      return t("control.watchEngineDecision.watchingNoFarmable");
    case "watching-no-watchable":
      return t("control.watchEngineDecision.watchingNoWatchable");
    case "idle-loading-channels":
      return t("control.watchEngineDecision.idleLoadingChannels");
    case "idle-no-channels":
      return t("control.watchEngineDecision.idleNoChannels");
    case "idle-ready":
      return t("control.watchEngineDecision.idleReady");
    case "idle-no-watchable-drops":
      return t("control.watchEngineDecision.idleNoWatchableDrops");
    default:
      return decision;
  }
};

const formatDuration = (minutes?: number) => {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "--";
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes < 60) return `${safeMinutes}m`;
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;
  return `${hours}h ${restMinutes.toString().padStart(2, "0")}m`;
};

const formatRemainingSeconds = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds < 60) return `${safeSeconds}s`;
  if (safeSeconds < 3600) {
    const minutes = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
  }
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
};

const groupCampaigns = (items: InventoryItem[]) => {
  const groups = new Map<
    string,
    {
      key: string;
      title: string;
      game: string;
      required: number;
      earned: number;
      openRequired: number;
      openEarned: number;
      claimedCount: number;
      openCount: number;
      inProgressCount: number;
      claimableCount: number;
      blockedCount: number;
    }
  >();

  for (const item of items) {
    const key = item.campaignId?.trim() || item.campaignName?.trim() || item.id;
    const existing = groups.get(key) ?? {
      key,
      title: item.campaignName?.trim() || item.game,
      game: item.game,
      required: 0,
      earned: 0,
      openRequired: 0,
      openEarned: 0,
      claimedCount: 0,
      openCount: 0,
      inProgressCount: 0,
      claimableCount: 0,
      blockedCount: 0,
    };
    const required = Math.max(0, Number(item.requiredMinutes) || 0);
    const earned = Math.min(required, Math.max(0, Number(item.earnedMinutes) || 0));
    if (item.status === "claimed") {
      existing.required += required;
      existing.earned += earned;
      existing.claimedCount += 1;
    } else {
      existing.required += required;
      existing.earned += earned;
      existing.openRequired += required;
      existing.openEarned += earned;
      existing.openCount += 1;
      if (item.status === "progress") existing.inProgressCount += 1;
      if (item.isClaimable) existing.claimableCount += 1;
      if (item.blocked || item.excluded) existing.blockedCount += 1;
    }
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      pct:
        group.openRequired > 0
          ? Math.min(100, Math.round((group.openEarned / group.openRequired) * 100))
          : group.required > 0
            ? Math.min(100, Math.round((group.earned / group.required) * 100))
            : 0,
      remainingMinutes: Math.max(0, group.openRequired - group.openEarned),
    }))
    .sort((a, b) => {
      const aHasOpen = a.openCount > 0 ? 1 : 0;
      const bHasOpen = b.openCount > 0 ? 1 : 0;
      if (aHasOpen !== bHasOpen) return bHasOpen - aHasOpen;
      if (a.inProgressCount !== b.inProgressCount) return b.inProgressCount - a.inProgressCount;
      if (a.claimableCount !== b.claimableCount) return b.claimableCount - a.claimableCount;
      if (a.remainingMinutes !== b.remainingMinutes) return a.remainingMinutes - b.remainingMinutes;
      if (a.pct !== b.pct) return b.pct - a.pct;
      return b.openCount - a.openCount;
    });
};

export function OverviewView({
  inventory,
  stats,
  resetStats,
  activeGame,
  activeDropTitle,
  activeDropRemainingMinutes,
  activeDropEta,
  targetProgress,
  totalDrops,
  claimedDrops,
  claimableDrops,
  blockedDrops,
  channelsCount,
  canWatchTarget,
  watchDecision,
  watchSuppressionReason,
  lastWatchOk,
  inventoryFetchedAt,
  trackerStatus,
  watchError,
}: OverviewProps) {
  const { t, language } = useI18n();
  const [nowTick, setNowTick] = useState(() => Date.now());
  const watchState = mapOverviewWatchStateLabel(watchDecision, watchSuppressionReason, t);
  const statsErrorText =
    stats.status === "error"
      ? resolveErrorMessage(t, { code: stats.code, message: stats.message })
      : null;
  const watchErrorText = watchError ? resolveErrorMessage(t, watchError) : null;
  const items =
    inventory.status === "ready"
      ? inventory.items
      : inventory.status === "error"
        ? (inventory.items ?? [])
        : [];
  const inProgressDrops = items.filter((i) => i.status === "progress").length;
  const upcomingDrops = items.filter((i) => i.status === "locked").length;
  const openDrops = Math.max(0, totalDrops - claimedDrops);
  const statsData = stats.status === "ready" ? stats.data : null;
  const topGameEntries = statsData?.claimsByGame
    ? Object.entries(statsData.claimsByGame)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];
  const maxGameClaims =
    topGameEntries.length > 0 ? Math.max(...topGameEntries.map((entry) => entry[1])) : 0;
  const formatNumber = (val: number) =>
    new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(
      Math.max(0, Math.round(val)),
    );
  const formatTime = (ts?: number | null) => (ts ? new Date(ts).toLocaleTimeString() : "--");
  const hasActiveEta = typeof activeDropEta === "number" && Number.isFinite(activeDropEta);
  const shouldTickRemaining = Boolean(activeDropTitle?.trim()) && hasActiveEta;
  useEffect(() => {
    if (shouldTickRemaining) setNowTick(Date.now());
  }, [shouldTickRemaining, activeDropEta]);
  useInterval(() => setNowTick(Date.now()), 1_000, shouldTickRemaining);
  const activeDropRemainingSeconds =
    shouldTickRemaining && hasActiveEta
      ? Math.max(0, Math.ceil((activeDropEta - nowTick) / 1000))
      : typeof activeDropRemainingMinutes === "number"
        ? Math.max(0, Math.ceil(activeDropRemainingMinutes * 60))
        : null;
  const activeDropMeta = activeDropTitle?.trim()
    ? `${t("control.rest", {
        time:
          activeDropRemainingSeconds !== null
            ? formatRemainingSeconds(activeDropRemainingSeconds)
            : formatDuration(activeDropRemainingMinutes),
      })}${hasActiveEta ? ` • ${t("control.eta", { time: formatTime(activeDropEta) })}` : ""}`
    : t("overview.noTargetSelected");

  const attentionItems: AttentionItem[] = [];
  if (claimableDrops > 0) {
    attentionItems.push({
      tone: "warn",
      title: t("overview.attentionClaimableTitle", { count: claimableDrops }),
      detail: t("overview.attentionClaimableDetail"),
    });
  }
  if (watchErrorText) {
    attentionItems.push({
      tone: "danger",
      title: t("overview.attentionWatchErrorTitle"),
      detail: watchErrorText,
    });
  }
  if (
    trackerStatus?.connectionState &&
    trackerStatus.connectionState !== "connected" &&
    trackerStatus.connectionState !== "connecting"
  ) {
    attentionItems.push({
      tone: "warn",
      title: t("overview.attentionTrackerTitle"),
      detail: t(`control.trackerConn.${trackerStatus.connectionState}`),
    });
  }
  if (activeGame && channelsCount === 0) {
    attentionItems.push({
      tone: "info",
      title: t("overview.attentionNoChannelsTitle"),
      detail: canWatchTarget
        ? t("overview.attentionNoChannelsDetail")
        : t("overview.attentionNoWatchableDetail"),
    });
  }

  const nextRewards = items
    .filter((item) => item.status !== "claimed")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "progress" ? -1 : 1;
      const remainingA = Math.max(0, a.requiredMinutes - a.earnedMinutes);
      const remainingB = Math.max(0, b.requiredMinutes - b.earnedMinutes);
      return remainingA - remainingB;
    })
    .slice(0, 5);

  const campaignLandscape = groupCampaigns(items).slice(0, 5);

  return (
    <>
      <div className="panel-head">
        <div>
          <h2>{t("overview.title")}</h2>
          <p className="meta">{t("overview.subtitle")}</p>
        </div>
      </div>

      <div className="overview-shell">
        <section className="overview-spotlight">
          <div className="overview-spotlight-main">
            <div className="overview-spotlight-head">
              <div>
                <div className="label">{t("overview.nowTitle")}</div>
                <h3 className="overview-now-title">{activeGame || t("hero.noTarget")}</h3>
                <p className="meta">{t("overview.nowHint")}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button type="button" className="ghost subtle-btn">
                    {t("overview.reset")}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("overview.resetConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("overview.resetConfirmDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("overview.resetCancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={resetStats}>
                      {t("overview.resetConfirmAction")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="overview-now-grid">
              <div className="overview-now-card overview-now-card-primary">
                <span className="overview-card-k">{t("overview.currentDrop")}</span>
                <strong className="overview-card-v">
                  {activeDropTitle?.trim() || t("overview.noActiveDrop")}
                </strong>
                <p className="meta">{activeDropMeta}</p>
              </div>
              <div className="overview-now-card overview-now-card-state">
                <span className="overview-card-k">{t("overview.watchState")}</span>
                <strong className="overview-card-v">{watchState}</strong>
                <p className="meta">
                  {t("hero.targetProgress")}:{" "}
                  {Math.max(0, Math.min(100, Math.round(targetProgress)))}%
                </p>
              </div>
              <div className="overview-now-card overview-now-card-sync">
                <span className="overview-card-k">{t("overview.syncHealth")}</span>
                <strong className="overview-card-v">{formatTime(lastWatchOk)}</strong>
                <p className="meta">
                  {t("hero.inventorySync")}: {formatTime(inventoryFetchedAt)}
                </p>
              </div>
            </div>

            <div className="overview-hero-kpis">
              <div className="overview-kpi">
                <span className="overview-kpi-value">{formatNumber(openDrops)}</span>
                <span className="overview-kpi-label">{t("overview.openDrops")}</span>
              </div>
              <div className="overview-kpi">
                <span className="overview-kpi-value">{formatNumber(claimableDrops)}</span>
                <span className="overview-kpi-label">{t("overview.claimsReady")}</span>
              </div>
              <div className="overview-kpi">
                <span className="overview-kpi-value">{formatNumber(channelsCount)}</span>
                <span className="overview-kpi-label">{t("control.streamsFound")}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="overview-card overview-attention">
          <div className="card-header-row">
            <div>
              <div className="label">{t("overview.attentionTitle")}</div>
              <p className="meta">{t("overview.attentionHint")}</p>
            </div>
          </div>
          {attentionItems.length === 0 ? (
            <div className="overview-attention-empty">
              <strong>{t("overview.attentionClearTitle")}</strong>
              <p className="meta">{t("overview.attentionClearDetail")}</p>
            </div>
          ) : (
            <div className="overview-attention-list">
              {attentionItems.map((item) => (
                <article
                  key={`${item.title}:${item.detail}`}
                  className={`overview-attention-item tone-${item.tone}`}
                >
                  <strong>{item.title}</strong>
                  <p className="meta">{item.detail}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="overview-trend-grid">
          <section className="overview-card">
            <div className="card-header-row">
              <div>
                <div className="label">{t("overview.landscapeTitle")}</div>
                <p className="meta">{t("overview.landscapeHint")}</p>
              </div>
            </div>
            {inventory.status === "loading" ? (
              <p className="meta">{t("inventory.loading")}</p>
            ) : inventory.status === "error" ? (
              <p className="error">{t("inventory.error")}</p>
            ) : inventory.status === "idle" ? (
              <p className="meta">{t("inventory.idle")}</p>
            ) : (
              <>
                <div className="overview-breakdown overview-breakdown-compact">
                  <div className="overview-breakdown-item claimed">
                    <span className="overview-breakdown-dot" />
                    <span>{t("inventory.status.claimed")}</span>
                    <span className="overview-breakdown-value">{formatNumber(claimedDrops)}</span>
                  </div>
                  <div className="overview-breakdown-item progress">
                    <span className="overview-breakdown-dot" />
                    <span>{t("inventory.status.progress")}</span>
                    <span className="overview-breakdown-value">
                      {formatNumber(inProgressDrops)}
                    </span>
                  </div>
                  <div className="overview-breakdown-item locked">
                    <span className="overview-breakdown-dot" />
                    <span>{t("inventory.status.locked")}</span>
                    <span className="overview-breakdown-value">{formatNumber(upcomingDrops)}</span>
                  </div>
                  <div className="overview-breakdown-item excluded">
                    <span className="overview-breakdown-dot" />
                    <span>{t("overview.blocked")}</span>
                    <span className="overview-breakdown-value">{formatNumber(blockedDrops)}</span>
                  </div>
                </div>

                <div className="overview-campaign-list">
                  {campaignLandscape.map((campaign) => (
                    <div key={campaign.key} className="overview-campaign-row">
                      <div className="overview-campaign-head">
                        <span className="overview-campaign-name">{campaign.title}</span>
                        <span className="overview-game-count">{campaign.pct}%</span>
                      </div>
                      <p className="meta">
                        {campaign.openCount > 0
                          ? `${campaign.game} • ${t("overview.openRewards", { count: campaign.openCount })} • ${t("overview.remainingMinutesShort", { count: campaign.remainingMinutes })}`
                          : `${campaign.game} • ${t("overview.allRewardsClaimed")}`}
                      </p>
                      <div className="overview-game-bar">
                        <span style={{ width: `${campaign.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="overview-card">
            <div className="card-header-row">
              <div>
                <div className="label">{t("overview.trendTitle")}</div>
                <p className="meta">{t("overview.trendHint")}</p>
              </div>
            </div>
            {stats.status === "loading" ? (
              <p className="meta">{t("overview.loading")}</p>
            ) : stats.status === "error" ? (
              <p className="error">{statsErrorText}</p>
            ) : (
              <>
                <div className="overview-hero-kpis overview-hero-kpis-tight">
                  <div className="overview-kpi">
                    <span className="overview-kpi-value">
                      {statsData ? formatNumber(statsData.totalMinutes) : "--"}
                    </span>
                    <span className="overview-kpi-label">{t("overview.totalMinutes")}</span>
                  </div>
                  <div className="overview-kpi">
                    <span className="overview-kpi-value">
                      {statsData ? formatNumber(statsData.totalClaims) : "--"}
                    </span>
                    <span className="overview-kpi-label">{t("overview.claims")}</span>
                  </div>
                  <div className="overview-kpi">
                    <span className="overview-kpi-value">
                      {statsData?.lastGame ? statsData.lastGame : "--"}
                    </span>
                    <span className="overview-kpi-label">{t("overview.lastGame")}</span>
                  </div>
                </div>

                <div className="overview-dual-list">
                  <div className="overview-subpanel">
                    <div className="card-header-row">
                      <div className="label">{t("overview.topGames")}</div>
                      <span className="meta">{t("overview.claims")}</span>
                    </div>
                    {topGameEntries.length === 0 ? (
                      <p className="meta">{t("overview.noGameClaims")}</p>
                    ) : (
                      <div className="overview-game-list">
                        {topGameEntries.map(([game, count]) => {
                          const pct = maxGameClaims ? Math.round((count / maxGameClaims) * 100) : 0;
                          return (
                            <div key={game} className="overview-game-row">
                              <div className="overview-game-head">
                                <span className="overview-game-name">{game}</span>
                                <span className="overview-game-count">{formatNumber(count)}</span>
                              </div>
                              <div className="overview-game-bar">
                                <span style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="overview-subpanel">
                    <div className="card-header-row">
                      <div className="label">{t("overview.nextRewardsTitle")}</div>
                      <span className="meta">{t("overview.closestFirst")}</span>
                    </div>
                    {nextRewards.length === 0 ? (
                      <p className="meta">{t("overview.noNextRewards")}</p>
                    ) : (
                      <div className="overview-reward-list">
                        {nextRewards.map((reward) => {
                          const remaining = Math.max(
                            0,
                            reward.requiredMinutes - reward.earnedMinutes,
                          );
                          return (
                            <div key={reward.id} className="overview-reward-row">
                              <div className="overview-reward-head">
                                <span className="overview-game-name">{reward.title}</span>
                                <span className="overview-game-count">{remaining}m</span>
                              </div>
                              <p className="meta">{reward.game}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
