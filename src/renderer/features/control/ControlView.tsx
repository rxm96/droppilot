import type {
  AutoSwitchInfo,
  ChannelDiff,
  ChannelEntry,
  ChannelTrackerStatus,
  ClaimStatus,
  ErrorInfo,
  InventoryItem,
  WatchingState,
} from "@renderer/shared/types";
import { DropChannelRestriction } from "@renderer/shared/domain/dropDomain";
import { mapStatusLabel } from "@renderer/shared/utils";
import { useI18n } from "@renderer/shared/i18n";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@renderer/shared/components/ui/hover-card";
import { useEffect, useMemo, useRef, useState } from "react";
import { useControlViewState } from "./useControlViewState";

const CHANNEL_SKELETON = Array.from({ length: 4 }, (_, idx) => ({ key: `sk-${idx}` }));

const formatBlockingReason = (
  reason: string | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string => {
  if (!reason) return t("inventory.blockReason.unknown");
  if (reason.startsWith("missing_prerequisite_drops:")) {
    const ids = reason.slice("missing_prerequisite_drops:".length).trim();
    return t("inventory.blockReason.missingPrerequisites", {
      ids: ids || "?",
    });
  }
  switch (reason) {
    case "account_not_linked":
      return t("inventory.blockReason.accountNotLinked");
    case "campaign_not_started":
      return t("inventory.blockReason.campaignNotStarted");
    case "campaign_expired":
      return t("inventory.blockReason.campaignExpired");
    case "campaign_allow_disabled":
      return t("inventory.blockReason.campaignNotEligible");
    case "preconditions_not_met":
      return t("inventory.blockReason.preconditionsNotMet");
    case "missing_drop_instance_id":
      return t("inventory.blockReason.missingDropInstance");
    case "claim_window_closed":
      return t("inventory.blockReason.claimWindowClosed");
    default:
      return t("inventory.blockReason.unknown");
  }
};

const pickDisplayBlockingReason = (reasons: string[]): string | undefined => {
  const cleaned = reasons
    .map((reason) => (typeof reason === "string" ? reason.trim() : ""))
    .filter(Boolean);
  return cleaned[0];
};

const canDropProgressOnWatchingChannel = (
  drop: InventoryItem,
  watching: WatchingState,
): boolean => {
  if (!watching) return true;
  const restriction = DropChannelRestriction.fromInventoryItem(drop);
  return restriction.allowsWatching(watching);
};

const formatChannelRestrictionReason = (
  drop: InventoryItem,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string => {
  const allowedLogins = Array.from(DropChannelRestriction.fromInventoryItem(drop).logins);
  if (allowedLogins.length > 0) {
    const preview = allowedLogins
      .slice(0, 3)
      .map((login) => `@${login}`)
      .join(", ");
    return t("control.dropReason.channelRestrictedChannels", { channels: preview });
  }
  return t("control.dropReason.channelRestricted");
};

type WatchEngineDecision =
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

type WatchEngineSnapshot = {
  decision: WatchEngineDecision;
  targetGame: string;
  activeTargetGame: string;
  suppression: {
    game: string;
    reason: "manual-stop" | "stall-stop";
    sinceAt: number | null;
    holdRemainingMs: number;
  } | null;
  activeCooldowns: Array<{
    game: string;
    until: number;
    remainingMs: number;
  }>;
  allowlistActive: boolean;
  allowlistedLiveChannels: number;
  totalLiveChannels: number;
  noProgressTracker: {
    recoveryCount: number;
    sinceProgressMs: number;
  } | null;
};

const mapWatchEngineDecisionLabel = (
  decision: WatchEngineDecision,
  suppressionReason: "manual-stop" | "stall-stop" | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string => {
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

const mapWatchEngineSuppressionReasonLabel = (
  reason: "manual-stop" | "stall-stop",
  t: (key: string, vars?: Record<string, string | number>) => string,
): string => {
  switch (reason) {
    case "manual-stop":
      return t("control.watchEngineSuppression.manualStop");
    case "stall-stop":
      return t("control.watchEngineSuppression.stallStop");
    default:
      return reason;
  }
};

const mapWatchEngineDecisionDetails = (
  decision: WatchEngineDecision,
  suppressionReason: "manual-stop" | "stall-stop" | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): { why: string; next: string } => {
  switch (decision) {
    case "no-target":
      return {
        why: t("control.watchEngineWhy.noTarget"),
        next: t("control.watchEngineNext.noTarget"),
      };
    case "suppressed":
      if (suppressionReason === "manual-stop") {
        return {
          why: t("control.watchEngineWhy.suppressedManualStop"),
          next: t("control.watchEngineNext.suppressedManualStop"),
        };
      }
      return {
        why: t("control.watchEngineWhy.suppressed"),
        next: t("control.watchEngineNext.suppressed"),
      };
    case "cooldown":
      return {
        why: t("control.watchEngineWhy.cooldown"),
        next: t("control.watchEngineNext.cooldown"),
      };
    case "watching-progress":
      return {
        why: t("control.watchEngineWhy.watchingProgress"),
        next: t("control.watchEngineNext.watchingProgress"),
      };
    case "watching-recover":
      return {
        why: t("control.watchEngineWhy.watchingRecover"),
        next: t("control.watchEngineNext.watchingRecover"),
      };
    case "watching-no-farmable":
      return {
        why: t("control.watchEngineWhy.watchingNoFarmable"),
        next: t("control.watchEngineNext.watchingNoFarmable"),
      };
    case "watching-no-watchable":
      return {
        why: t("control.watchEngineWhy.watchingNoWatchable"),
        next: t("control.watchEngineNext.watchingNoWatchable"),
      };
    case "idle-loading-channels":
      return {
        why: t("control.watchEngineWhy.idleLoadingChannels"),
        next: t("control.watchEngineNext.idleLoadingChannels"),
      };
    case "idle-no-channels":
      return {
        why: t("control.watchEngineWhy.idleNoChannels"),
        next: t("control.watchEngineNext.idleNoChannels"),
      };
    case "idle-ready":
      return {
        why: t("control.watchEngineWhy.idleReady"),
        next: t("control.watchEngineNext.idleReady"),
      };
    case "idle-no-watchable-drops":
      return {
        why: t("control.watchEngineWhy.idleNoWatchableDrops"),
        next: t("control.watchEngineNext.idleNoWatchableDrops"),
      };
    default:
      return { why: decision, next: decision };
  }
};

type ControlProps = {
  targetGame: string;
  targetDrops: InventoryItem[];
  targetProgress: number;
  totalDrops: number;
  claimedDrops: number;
  inventoryRefreshing: boolean;
  inventoryFetchedAt: number | null;
  fetchInventory: () => void;
  refreshPriorityPlan: () => void;
  watching: WatchingState;
  lastWatchedChannelIdentity: {
    id: string;
    login: string;
  } | null;
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
    progressAnchorAt?: number;
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
  watchEngineSnapshot: WatchEngineSnapshot;
};

export function ControlView({
  targetGame,
  targetDrops,
  inventoryRefreshing,
  inventoryFetchedAt,
  fetchInventory,
  watching,
  lastWatchedChannelIdentity,
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
  watchEngineSnapshot,
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
    resumeChannel,
    activeThumb,
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
    lastWatchedChannelIdentity,
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
  const watchEngineSuppression = watchEngineSnapshot.suppression;
  const watchEngineSuppressionReason = watchEngineSuppression?.reason ?? null;
  const watchEngineDecisionLabel = mapWatchEngineDecisionLabel(
    watchEngineSnapshot.decision,
    watchEngineSuppressionReason,
    t,
  );
  const watchEngineDecisionDetails = mapWatchEngineDecisionDetails(
    watchEngineSnapshot.decision,
    watchEngineSuppressionReason,
    t,
  );
  const watchEngineDecisionMotionKey = watchEngineSnapshot.decision;
  const watchEngineAllowlistMode = watchEngineSnapshot.allowlistActive
    ? t("control.watchEngineAllowlistOn")
    : t("control.watchEngineAllowlistOff");
  const watchEngineAllowlistHint = t("control.watchEngineAllowlistHint");
  const watchEngineChannelsHint = t("control.watchEngineChannelsHint", {
    eligible: watchEngineSnapshot.allowlistedLiveChannels,
    total: watchEngineSnapshot.totalLiveChannels,
  });
  const watchEngineTargetText =
    watchEngineSnapshot.targetGame ||
    (watchEngineSuppression &&
    watchEngineSnapshot.activeTargetGame &&
    !watchEngineSnapshot.targetGame
      ? `${watchEngineSnapshot.activeTargetGame} (${t("control.watchEngineTargetSuppressed")})`
      : watchEngineSnapshot.activeTargetGame) ||
    t("control.noTarget");
  const watchEngineSuppressionText = watchEngineSuppression
    ? `${watchEngineSuppression.game} (${mapWatchEngineSuppressionReasonLabel(
        watchEngineSuppression.reason,
        t,
      )})${
        watchEngineSuppression.holdRemainingMs > 0
          ? `, ${t("control.watchEngineHold", {
              time: formatDuration(watchEngineSuppression.holdRemainingMs),
            })}`
          : ""
      }`
    : t("control.watchEngineNoSuppression");
  const watchEngineCooldownText =
    watchEngineSnapshot.activeCooldowns.length > 0
      ? watchEngineSnapshot.activeCooldowns
          .slice(0, 3)
          .map((cooldown) => `${cooldown.game} (${formatDuration(cooldown.remainingMs)})`)
          .join(" | ")
      : t("control.watchEngineNoCooldowns");
  const watchEngineNoProgressText = watchEngineSnapshot.noProgressTracker
    ? t("control.watchEngineNoProgressValue", {
        attempts: watchEngineSnapshot.noProgressTracker.recoveryCount,
        time: formatDuration(watchEngineSnapshot.noProgressTracker.sinceProgressMs),
      })
    : null;
  const watchEngineTone: "ok" | "warn" | "neutral" | "hold" = (() => {
    switch (watchEngineSnapshot.decision) {
      case "watching-progress":
      case "idle-ready":
        return "ok";
      case "suppressed":
      case "cooldown":
        return "hold";
      case "idle-loading-channels":
      case "no-target":
        return "neutral";
      default:
        return "warn";
    }
  })();
  const watchEngineDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const watchEngineSummaryRef = useRef<HTMLElement | null>(null);
  const watchEngineCollapseTopRef = useRef<number | null>(null);
  const handleWatchEngineSummaryClickCapture = () => {
    const details = watchEngineDetailsRef.current;
    const summary = watchEngineSummaryRef.current;
    if (!details || !summary || !details.open) {
      watchEngineCollapseTopRef.current = null;
      return;
    }
    watchEngineCollapseTopRef.current = summary.getBoundingClientRect().top;
  };
  const handleWatchEnginePanelToggle = () => {
    const details = watchEngineDetailsRef.current;
    const summary = watchEngineSummaryRef.current;
    const collapseTop = watchEngineCollapseTopRef.current;
    if (!details || !summary) {
      watchEngineCollapseTopRef.current = null;
      return;
    }
    if (!details.open && collapseTop !== null) {
      const nextTop = summary.getBoundingClientRect().top;
      const delta = nextTop - collapseTop;
      if (Math.abs(delta) > 0.5) {
        window.scrollBy({ top: delta, behavior: "auto" });
      }
    }
    watchEngineCollapseTopRef.current = null;
  };
  const watchEnginePanel = (
    <details
      ref={watchEngineDetailsRef}
      className={`control-watch-engine-disclosure tone-${watchEngineTone}`}
      onToggle={handleWatchEnginePanelToggle}
    >
      <summary
        ref={watchEngineSummaryRef}
        className="control-watch-engine-summary"
        onClickCapture={handleWatchEngineSummaryClickCapture}
      >
        <span className="control-watch-engine-summary-main">
          <span className="control-watch-engine-summary-k">{t("control.watchEngineTitle")}</span>
          <span className="control-watch-engine-summary-v">{watchEngineDecisionLabel}</span>
        </span>
        <span className="control-watch-engine-summary-chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
            <path
              d="M3.5 6.5 8 11l4.5-4.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </span>
      </summary>
      <div className="control-watch-engine-shell">
        <div className={`control-watch-engine tone-${watchEngineTone}`}>
          <div className="control-watch-engine-main">
            <div className="control-watch-engine-item is-now">
              <span className="control-watch-engine-item-label">{t("control.watchEngineNow")}</span>
              <span
                key={`watch-engine-now-${watchEngineDecisionMotionKey}`}
                className="control-watch-engine-item-value control-watch-engine-animated-value"
              >
                {watchEngineDecisionLabel}
              </span>
            </div>
            <div className="control-watch-engine-item">
              <span className="control-watch-engine-item-label">
                {t("control.watchEngineWhyLabel")}
              </span>
              <span
                key={`watch-engine-why-${watchEngineDecisionMotionKey}`}
                className="control-watch-engine-item-value control-watch-engine-animated-value"
              >
                {watchEngineDecisionDetails.why}
              </span>
            </div>
            <div className="control-watch-engine-item">
              <span className="control-watch-engine-item-label">
                {t("control.watchEngineNextLabel")}
              </span>
              <span
                key={`watch-engine-next-${watchEngineDecisionMotionKey}`}
                className="control-watch-engine-item-value control-watch-engine-animated-value"
              >
                {watchEngineDecisionDetails.next}
              </span>
            </div>
          </div>
          <div className="control-watch-engine-meta">
            <HoverCard openDelay={120} closeDelay={120}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  className="pill ghost small control-watch-engine-help-trigger"
                  aria-label={`${t("control.watchEngineAllowlist")}: ${watchEngineAllowlistMode}. ${watchEngineAllowlistHint}`}
                  title={watchEngineAllowlistHint}
                >
                  {t("control.watchEngineAllowlist")}: {watchEngineAllowlistMode}
                </button>
              </HoverCardTrigger>
              <HoverCardContent
                align="start"
                sideOffset={8}
                className="control-watch-engine-hovercard"
              >
                <p className="meta">{watchEngineAllowlistHint}</p>
              </HoverCardContent>
            </HoverCard>
            <HoverCard openDelay={120} closeDelay={120}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  className="pill ghost small control-watch-engine-help-trigger"
                  aria-label={`${t("control.watchEngineChannels")}: ${watchEngineSnapshot.allowlistedLiveChannels}/${watchEngineSnapshot.totalLiveChannels}. ${watchEngineChannelsHint}`}
                  title={watchEngineChannelsHint}
                >
                  {t("control.watchEngineChannels")}: {watchEngineSnapshot.allowlistedLiveChannels}/
                  {watchEngineSnapshot.totalLiveChannels}
                </button>
              </HoverCardTrigger>
              <HoverCardContent
                align="start"
                sideOffset={8}
                className="control-watch-engine-hovercard"
              >
                <p className="meta">{watchEngineChannelsHint}</p>
              </HoverCardContent>
            </HoverCard>
          </div>
          <div className="control-watch-engine-details" role="list">
            <p className="meta control-watch-engine-kv" role="listitem">
              <span className="control-watch-engine-k">{t("control.watchEngineTarget")}</span>
              <span className="control-watch-engine-v">{watchEngineTargetText}</span>
            </p>
            <p className="meta control-watch-engine-kv" role="listitem">
              <span className="control-watch-engine-k">{t("control.watchEngineSuppression")}</span>
              <span className="control-watch-engine-v">{watchEngineSuppressionText}</span>
            </p>
            <p className="meta control-watch-engine-kv" role="listitem">
              <span className="control-watch-engine-k">{t("control.watchEngineCooldowns")}</span>
              <span className="control-watch-engine-v">{watchEngineCooldownText}</span>
            </p>
            {watchEngineNoProgressText ? (
              <p className="meta control-watch-engine-kv" role="listitem">
                <span className="control-watch-engine-k">{t("control.watchEngineNoProgress")}</span>
                <span className="control-watch-engine-v">{watchEngineNoProgressText}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </details>
  );
  const watchControlLabel = watching ? t("control.stop") : t("control.resume");
  const watchControlClass = watching ? "ghost danger" : "ghost";
  const canToggleWatchControl = Boolean(watching || resumeChannel);
  const handleWatchControlToggle = () => {
    if (watching) {
      stopWatching();
      return;
    }
    if (resumeChannel) {
      startWatching(resumeChannel);
    }
  };
  const formatNumber = (val: number) =>
    new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(Math.max(0, val ?? 0));
  const formatViewers = (val: number) => formatNumber(val);
  const pausedThumb = resumeChannel?.thumbnail
    ? resumeChannel.thumbnail.replace("{width}", "640").replace("{height}", "360")
    : null;
  const streamCardChannel = watching ? activeChannel : resumeChannel;
  const streamCardThumb = watching ? activeThumb : pausedThumb;
  const streamCardViewers = streamCardChannel
    ? formatViewers(animatedViewersById[streamCardChannel.id] ?? streamCardChannel.viewers)
    : null;
  const streamCardLogin = streamCardChannel?.login ?? lastWatchedChannelIdentity?.login ?? "";
  const streamCardName = watching
    ? watching.name
    : (streamCardChannel?.displayName ??
      lastWatchedChannelIdentity?.login ??
      t("control.noChannel"));
  const streamCardGame = watching ? watching.game : (streamCardChannel?.game ?? targetGame);
  const streamStateNode = watching ? (
    <span className="live-dot" aria-label={t("control.live")} title={t("control.live")} />
  ) : streamCardChannel ? (
    <span className="pill ghost small">{t("control.streamPaused")}</span>
  ) : null;
  const streamCardNote = watching
    ? null
    : showNoDropsHint
      ? t("control.noDropsHint")
      : resumeChannel
        ? t("control.resumeHint", { channel: resumeChannel.displayName })
        : t("control.pickStream");
  const hasOpenTargetDrops = targetDrops.some((drop) => drop.status !== "claimed");
  const openTargetDropsCount = targetDrops.filter((drop) => drop.status !== "claimed").length;
  const inactiveDropText = showNoDropsHint
    ? t("control.noDropsHint")
    : watching && hasOpenTargetDrops
      ? t("control.noFarmableDrop")
      : t("control.allDone");
  const activeDropLiveEarnedMinutes = activeDropInfo
    ? Math.floor(
        Math.min(
          activeDropInfo.requiredMinutes,
          Math.max(
            activeDropInfo.earnedMinutes,
            activeDropInfo.virtualEarned +
              Math.max(0, Number(liveProgress.activeElapsedMinutesRaw) || 0),
          ),
        ),
      )
    : 0;
  const activeDropProgressPct =
    activeDropInfo && activeDropInfo.requiredMinutes > 0
      ? Math.min(
          100,
          Math.round((activeDropLiveEarnedMinutes / activeDropInfo.requiredMinutes) * 100),
        )
      : 0;
  const controlStateText = watching
    ? t("control.sidebarStateWatching")
    : resumeChannel
      ? t("control.sidebarStatePaused")
      : canWatchTarget
        ? t("control.sidebarStateReady")
        : t("control.sidebarStateIdle");
  const campaignPanels = useMemo(
    () =>
      campaignGroups.map((group) => {
        const campaignProgress = group.items.reduce(
          (acc, item) => {
            const req = Math.max(0, Number(item.requiredMinutes) || 0);
            const earned = Math.max(0, Number(item.earnedMinutes) || 0);
            const isInActiveCampaign =
              !!watching &&
              !!activeDropInfo &&
              (activeDropInfo.id === item.id ||
                (!!activeDropInfo.campaignId &&
                  !!item.campaignId &&
                  activeDropInfo.campaignId === item.campaignId));
            const liveEarned = isInActiveCampaign
              ? Math.max(
                  earned,
                  earned + Math.max(0, Number(liveProgress.activeElapsedMinutesRaw) || 0),
                )
              : earned;
            const normalizedEarned = Math.min(req, Math.floor(liveEarned));
            if (item.status === "claimed") {
              acc.required += req;
              acc.earned += normalizedEarned;
              return acc;
            }
            acc.required += Math.max(acc.openRequired, req) - acc.openRequired;
            acc.earned += Math.max(acc.openEarned, normalizedEarned) - acc.openEarned;
            acc.openRequired = Math.max(acc.openRequired, req);
            acc.openEarned = Math.max(acc.openEarned, normalizedEarned);
            return acc;
          },
          {
            required: 0,
            earned: 0,
            openRequired: 0,
            openEarned: 0,
          },
        );
        const requiredMinutes = campaignProgress.required;
        const earnedMinutes = campaignProgress.earned;
        const pct =
          requiredMinutes > 0
            ? Math.min(100, Math.round((earnedMinutes / requiredMinutes) * 100))
            : 0;
        const openDrops = group.items.filter((item) => item.status !== "claimed").length;
        return {
          ...group,
          requiredMinutes,
          earnedMinutes,
          pct,
          openDrops,
        };
      }),
    [activeDropInfo, campaignGroups, liveProgress.activeElapsedMinutesRaw, watching],
  );
  const hasMultipleCampaigns = campaignPanels.length > 1;
  const [selectedCampaignKey, setSelectedCampaignKey] = useState<string>("");
  useEffect(() => {
    const validKeys = new Set(campaignPanels.map((group) => group.key));
    const activeKey = campaignPanels.find((group) => group.active)?.key;
    if (selectedCampaignKey && validKeys.has(selectedCampaignKey)) return;
    setSelectedCampaignKey(activeKey ?? campaignPanels[0]?.key ?? "");
  }, [campaignPanels, selectedCampaignKey]);
  const selectedCampaign =
    campaignPanels.find((group) => group.key === selectedCampaignKey) ?? campaignPanels[0] ?? null;
  const hasTarget = Boolean(targetGame);
  const controlNowEmptyState = (
    <div className="control-now-empty">
      <p className="control-now-empty-title">{t("control.nowEmptyTitle")}</p>
      <p className="meta">{t("control.nowEmptyHint")}</p>
    </div>
  );
  const controlTargetEmptyState = (
    <div className="control-target-empty">
      <div className="control-target-empty-head">
        <p className="control-target-empty-title">{t("control.targetMissing")}</p>
        <p className="meta">{t("control.targetEmptyIntro")}</p>
      </div>
      <p className="meta">{t("control.targetEmptySummary")}</p>
      <p className="meta muted">{t("control.targetEmptyNext")}</p>
    </div>
  );
  const channelEmptyState = targetGame ? (
    <div className="channel-empty">
      <div className="channel-empty-body">
        <p className="channel-empty-title">
          {t("control.channelsEmptyTitle", { game: targetGame })}
        </p>
        <p className="meta">{t("control.channelsEmptyHint")}</p>
      </div>
    </div>
  ) : null;
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
          <section className={`control-drops${watching ? " is-live" : ""}`}>
            <div className="control-section-head">
              <div>
                <div className="label">{t("control.nowTitle")}</div>
                <p className="meta">{t("control.nowHint")}</p>
              </div>
              {lastWatchOk ? (
                <div className="meta muted">
                  {t("control.lastPingLabel")}: {new Date(lastWatchOk).toLocaleTimeString()}
                </div>
              ) : null}
            </div>
            <div className="control-now-grid">
              <section className={`control-now-stream${watching ? "" : " is-paused"}`}>
                <div
                  className="active-stream-thumb"
                  style={
                    streamCardThumb ? { backgroundImage: `url(${streamCardThumb})` } : undefined
                  }
                />
                <div className="active-stream-info">
                  <div className="label">{t("control.activeStream")}</div>
                  <div className="active-stream-name">
                    <span>{streamCardName}</span>
                    {streamStateNode}
                  </div>
                  <div className="meta">
                    {streamCardGame || t("control.noTarget")}
                    {watching
                      ? activeLoginMismatch
                        ? ` | @${activeLoginMismatch}`
                        : ""
                      : streamCardLogin
                        ? ` | @${streamCardLogin}`
                        : ""}
                  </div>
                  {streamCardNote ? <p className="meta muted">{streamCardNote}</p> : null}
                </div>
                <div className="active-stream-actions">
                  {streamCardChannel && streamCardViewers ? (
                    <span className="pill viewers-chip small">
                      {streamCardViewers} {t("control.viewers")}
                    </span>
                  ) : (
                    <span className="pill ghost small">{t("control.streamInfoUnavailable")}</span>
                  )}
                </div>
              </section>
              <section
                className={`control-now-drop-card${activeDropInfo ? " has-active-drop" : " is-empty"}`}
              >
                <div className="control-now-drop-head">
                  <div>
                    <div className="label">{t("control.currentDrop")}</div>
                    <div
                      className={`active-drop-title control-now-drop-title${activeDropInfo ? "" : " active-drop-placeholder"}`}
                      title={activeDropInfo?.title ?? inactiveDropText}
                    >
                      {activeDropInfo?.title ?? inactiveDropText}
                    </div>
                  </div>
                  <span className="pill ghost small">
                    {activeDropInfo ? `${activeDropProgressPct}%` : "--"}
                  </span>
                </div>
                {activeDropInfo ? (
                  <>
                    <div className="control-now-drop-progress">
                      <div className="control-now-drop-minutes">
                        {activeDropLiveEarnedMinutes}/{activeDropInfo.requiredMinutes}
                        <span> min</span>
                      </div>
                      <div className="meta">
                        {liveProgress.activeRemainingMinutes > 0
                          ? t("control.rest", {
                              time: formatDuration(liveProgress.activeRemainingMinutes * 60_000),
                            })
                          : t("control.done")}
                      </div>
                    </div>
                    <div className="progress-bar">
                      <span style={{ width: `${activeDropProgressPct}%` }} />
                    </div>
                    {activeEtaText ? (
                      <div className="control-now-drop-meta">
                        <span className="pill ghost small">
                          {t("control.eta", { time: activeEtaText })}
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="control-now-drop-empty">
                    <div className="meta">{inactiveDropText}</div>
                    <div className="progress-bar small">
                      <span style={{ width: "0%" }} />
                    </div>
                  </div>
                )}
              </section>
            </div>
            {(autoSwitchInfo || watchErrorText) && (
              <div className="control-status-strip">
                {autoSwitchInfo ? (
                  <span className="pill ghost small">
                    Auto-Switch ({autoSwitchInfo.reason}): {autoSwitchInfo.from?.name ?? "Unknown"}{" "}
                    -{">"} {autoSwitchInfo.to.name}
                  </span>
                ) : null}
                {watchErrorText ? (
                  <span className="pill ghost small danger-chip">
                    {t("control.pingError")}: {watchErrorText}
                  </span>
                ) : null}
              </div>
            )}
            {autoSwitchInfo ? (
              <p className="meta muted">
                {t("control.lastSwitchLabel")}: {new Date(autoSwitchInfo.at).toLocaleTimeString()}
              </p>
            ) : null}
            {targetGame ? (
              <>
                {campaignGroups.length > 0 && (
                  <div className="control-campaigns-block">
                    <div className="control-section-head">
                      <div>
                        <div className="label">{t("control.dropCampaignsTitle")}</div>
                      </div>
                    </div>
                    <div className="drop-campaigns">
                      {hasMultipleCampaigns ? (
                        <div
                          className="drop-campaign-selector"
                          role="tablist"
                          aria-label={t("control.dropCampaignsTitle")}
                        >
                          {campaignPanels.map((group) => (
                            <button
                              key={group.key}
                              type="button"
                              role="tab"
                              aria-selected={selectedCampaign?.key === group.key}
                              className={`drop-campaign-chip${selectedCampaign?.key === group.key ? " active" : ""}`}
                              onClick={() => setSelectedCampaignKey(group.key)}
                            >
                              <span className="drop-campaign-chip-title">{group.title}</span>
                              <span className="drop-campaign-chip-meta">
                                {group.pct}% •{" "}
                                {t("control.campaignDrops", { count: group.openDrops })}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {selectedCampaign ? (
                        <section
                          key={selectedCampaign.key}
                          className={`drop-campaign-group ${selectedCampaign.active ? "active" : ""}`}
                        >
                          <>
                            <div className="drop-campaign-head">
                              <div className="drop-campaign-head-main">
                                <div
                                  className="drop-campaign-title"
                                  title={selectedCampaign.tooltip}
                                >
                                  {selectedCampaign.title}
                                </div>
                                <div className="drop-campaign-meta">
                                  <span>
                                    {t("control.campaignMinutes", {
                                      earned: selectedCampaign.earnedMinutes,
                                      required: selectedCampaign.requiredMinutes,
                                    })}
                                  </span>
                                  <span>{selectedCampaign.pct}%</span>
                                  {selectedCampaign.openDrops > 0 ? (
                                    <span>
                                      {t("control.campaignDrops", {
                                        count: selectedCampaign.openDrops,
                                      })}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <div className="progress-bar small drop-campaign-progress">
                              <span style={{ width: `${selectedCampaign.pct}%` }} />
                            </div>
                            <ul className="drop-grid">
                              {selectedCampaign.items.map((d, idx) => {
                                const req = Math.max(0, Number(d.requiredMinutes) || 0);
                                const earned = Math.max(0, Number(d.earnedMinutes) || 0);
                                const isActive = activeDropInfo?.id === d.id;
                                const isInActiveCampaign =
                                  !!watching &&
                                  !!activeDropInfo &&
                                  (isActive ||
                                    (!!activeDropInfo.campaignId &&
                                      !!d.campaignId &&
                                      activeDropInfo.campaignId === d.campaignId));
                                const campaignLiveEarnedRaw = isInActiveCampaign
                                  ? Math.max(
                                      0,
                                      earned +
                                        Math.max(
                                          0,
                                          Number(liveProgress.activeElapsedMinutesRaw) || 0,
                                        ),
                                    )
                                  : earned;
                                const campaignLiveEarned = Math.floor(campaignLiveEarnedRaw);
                                const earnedDisplay = Math.min(
                                  req,
                                  Math.max(earned, campaignLiveEarned),
                                );
                                const pct = req
                                  ? Math.min(100, Math.round((earnedDisplay / req) * 100))
                                  : 0;
                                const liveProgressVisible =
                                  isInActiveCampaign && !!watching && earnedDisplay > earned;
                                const displayStatus =
                                  liveProgressVisible && d.status === "locked"
                                    ? "progress"
                                    : d.status;
                                const statusLabel = mapStatusLabel(displayStatus, (key) => t(key));
                                const statusClass =
                                  displayStatus === "claimed"
                                    ? "claimed"
                                    : displayStatus === "progress"
                                      ? "progress"
                                      : "locked";
                                const animate = !firstRenderRef.current && dropChangedIds.has(d.id);
                                const dropImage =
                                  typeof d.imageUrl === "string" ? d.imageUrl.trim() : "";
                                const campaignImage =
                                  typeof d.campaignImageUrl === "string"
                                    ? d.campaignImageUrl.trim()
                                    : "";
                                const hasDropImage = Boolean(dropImage);
                                const hasCampaignImage = Boolean(campaignImage);
                                const blockingReasonCode = pickDisplayBlockingReason(
                                  d.blockingReasonHints ?? [],
                                );
                                const blockingReasonLabel = blockingReasonCode
                                  ? formatBlockingReason(blockingReasonCode, t)
                                  : null;
                                const watchingWrongGame =
                                  Boolean(watching && targetGame && watching.game !== targetGame) &&
                                  d.status !== "claimed";
                                const channelRestricted =
                                  Boolean(watching) &&
                                  !watchingWrongGame &&
                                  d.status !== "claimed" &&
                                  !canDropProgressOnWatchingChannel(d, watching);
                                const channelRestrictionLabel = channelRestricted
                                  ? formatChannelRestrictionReason(d, t)
                                  : null;
                                const dropReasonLabel =
                                  blockingReasonLabel ??
                                  (watchingWrongGame ? t("control.dropReason.wrongGame") : null) ??
                                  channelRestrictionLabel;
                                const showDropReason =
                                  Boolean(dropReasonLabel) &&
                                  displayStatus !== "progress" &&
                                  displayStatus !== "claimed";
                                return (
                                  <li
                                    key={d.id}
                                    className={`drop-card ${statusClass} ${isActive ? "active" : ""} ${animate ? "animate-item" : ""}`}
                                    style={
                                      animate ? { animationDelay: `${idx * 30}ms` } : undefined
                                    }
                                  >
                                    {hasDropImage ? (
                                      <div className="drop-image-frame">
                                        <img src={dropImage} alt="" loading="lazy" />
                                      </div>
                                    ) : hasCampaignImage ? (
                                      <div
                                        className="drop-image-frame is-fallback"
                                        style={{
                                          backgroundImage: `url(${campaignImage})`,
                                        }}
                                      />
                                    ) : null}
                                    <div className="drop-main">
                                      <div className="drop-body">
                                        <div className="drop-header">
                                          <div className="drop-title">
                                            <span className="drop-title-text">{d.title}</span>
                                          </div>
                                        </div>
                                        {showDropReason ? (
                                          <div className="drop-reason" title={dropReasonLabel}>
                                            {dropReasonLabel}
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className={`drop-progress-column ${statusClass}`}>
                                        <div className="drop-meta-line">
                                          <span className="drop-meta-item">
                                            {Math.floor(earnedDisplay)}/{req} min
                                          </span>
                                          <span className="pill ghost small">{statusLabel}</span>
                                        </div>
                                        <div className="progress-bar small">
                                          <span style={{ width: `${pct}%` }} />
                                        </div>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        </section>
                      ) : null}
                    </div>
                  </div>
                )}
              </>
            ) : (
              controlNowEmptyState
            )}
          </section>
        </div>

        <section className={`control-target${hasTarget ? "" : " is-empty"}`}>
          <div className="control-target-head">
            <div>
              <div className="label">{t("control.watchControlsTitle")}</div>
              <p className="meta">{t("control.sidebarHint")}</p>
            </div>
            <div className="control-target-actions">
              <button
                type="button"
                className={watchControlClass}
                onClick={handleWatchControlToggle}
                disabled={!canToggleWatchControl}
              >
                {watchControlLabel}
              </button>
            </div>
          </div>
          {hasTarget ? (
            <>
              <div className="control-target-summary" role="list">
                <div className="control-target-stat" role="listitem">
                  <span className="control-target-stat-k">{t("control.activeTarget")}</span>
                  <strong className="control-target-stat-v">{targetGame}</strong>
                  <p className="meta">{controlStateText}</p>
                </div>
                <div className="control-target-stat" role="listitem">
                  <span className="control-target-stat-k">{t("control.streamsFound")}</span>
                  <strong className="control-target-stat-v">
                    {channels.length > 0 ? channels.length : 0}
                  </strong>
                  <p className="meta">
                    {t("control.dropsOpen")}: {openTargetDropsCount}
                  </p>
                </div>
              </div>
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
              <div className="control-target-engine">{watchEnginePanel}</div>
            </>
          ) : (
            controlTargetEmptyState
          )}
          {hasTarget ? (
            <div className="control-channel-block">
              <div className="control-target-subhead">
                <div className="label">{t("control.channelListTitle")}</div>
                <p className="meta">{t("control.channelListHint")}</p>
              </div>
              {channelsLoading ? (
                <p className="meta inline-loader">
                  <span className="spinner" />
                  {t("control.channelsLoading")}
                </p>
              ) : null}
              {channelErrorText ? (
                <p className="error">
                  {t("control.channelError")}: {channelErrorText}
                </p>
              ) : null}
              <div className={`channel-grid-wrapper ${channelGridStateClass}`}>
                {channels.length > 0 ? (
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
                          className={`channel-tile-shell ${
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
                        >
                          <button
                            type="button"
                            className={`channel-tile ${isActive ? "active" : ""}`}
                            onClick={() => {
                              if (!canWatchTarget) return;
                              startWatching(c);
                            }}
                            disabled={!canWatchTarget}
                            aria-pressed={isActive}
                            aria-label={
                              title
                                ? `${c.displayName} - ${c.game}. ${title}`
                                : `${c.displayName} - ${c.game}`
                            }
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
                              {metaLine ? (
                                <div className="meta muted ellipsis">{metaLine}</div>
                              ) : null}
                              {title ? <div className="meta muted ellipsis">{title}</div> : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {!channelsLoading && !channelError && targetGame && channels.length === 0
                  ? channelEmptyState
                  : null}
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
          ) : null}
        </section>
      </div>
    </>
  );
}
