import type {
  ChannelTrackerStatus,
  ErrorInfo,
  InventoryItem,
  InventoryState,
  StatsState,
} from "@renderer/shared/types";
import { useI18n } from "@renderer/shared/i18n";
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

type OverviewProps = {
  inventory: InventoryState;
  stats: StatsState;
  resetStats: () => void;
  activeGame: string;
  totalDrops: number;
  claimedDrops: number;
  claimableDrops: number;
  blockedDrops: number;
  channelsCount: number;
  canWatchTarget: boolean;
  trackerStatus?: ChannelTrackerStatus | null;
  watchError?: ErrorInfo | null;
};

type AttentionItem = {
  tone: "danger" | "warn" | "info";
  title: string;
  detail: string;
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
  totalDrops: _totalDrops,
  claimedDrops,
  claimableDrops,
  blockedDrops,
  channelsCount,
  canWatchTarget,
  trackerStatus,
  watchError,
}: OverviewProps) {
  const { t, language } = useI18n();
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
  const statsData = stats.status === "ready" ? stats.data : null;
  const formatNumber = (val: number) =>
    new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(
      Math.max(0, Math.round(val)),
    );

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

        <div className="overview-action-grid">
          <section className="overview-card overview-card-primary">
            <div className="card-header-row">
              <div>
                <div className="label">{t("overview.nextRewardsTitle")}</div>
                <p className="meta">{t("overview.closestFirst")}</p>
              </div>
            </div>
            {inventory.status === "loading" ? (
              <p className="meta">{t("inventory.loading")}</p>
            ) : inventory.status === "error" ? (
              <p className="error">{t("inventory.error")}</p>
            ) : inventory.status === "idle" ? (
              <p className="meta">{t("inventory.idle")}</p>
            ) : nextRewards.length === 0 ? (
              <p className="meta">{t("overview.noNextRewards")}</p>
            ) : (
              <div className="overview-reward-list">
                {nextRewards.map((reward) => {
                  const remaining = Math.max(0, reward.requiredMinutes - reward.earnedMinutes);
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
          </section>

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
                <div className="overview-breakdown">
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
        </div>

        <section className="overview-history-bar">
          <div className="overview-history-copy">
            <div className="label">{t("overview.stats")}</div>
          </div>
          {stats.status === "loading" ? (
            <p className="meta">{t("overview.loading")}</p>
          ) : stats.status === "error" ? (
            <p className="error">{statsErrorText}</p>
          ) : (
            <div className="overview-history-stats">
              <div className="overview-history-item">
                <span className="overview-kpi-value">
                  {statsData ? formatNumber(statsData.totalMinutes) : "--"}
                </span>
                <span className="overview-kpi-label">{t("overview.totalMinutes")}</span>
              </div>
              <div className="overview-history-item">
                <span className="overview-kpi-value">
                  {statsData ? formatNumber(statsData.totalClaims) : "--"}
                </span>
                <span className="overview-kpi-label">{t("overview.claims")}</span>
              </div>
              <div className="overview-history-item">
                <span className="overview-kpi-value">
                  {statsData?.lastGame ? statsData.lastGame : "--"}
                </span>
                <span className="overview-kpi-label">{t("overview.lastGame")}</span>
              </div>
            </div>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="ghost subtle-btn">
                {t("overview.reset")}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("overview.resetConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("overview.resetConfirmDesc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("overview.resetCancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={resetStats}>
                  {t("overview.resetConfirmAction")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </div>
    </>
  );
}
