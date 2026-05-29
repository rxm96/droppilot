import type { InventoryItem, WatchingState } from "@renderer/shared/types";
import { DropChannelRestriction } from "@renderer/shared/domain/dropDomain";

export type WatchEngineDecision =
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

export type WatchEngineSuppressionReason = "manual-stop" | "stall-stop";

export type WatchEngineTone = "ok" | "warn" | "neutral" | "hold";

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

/** Map decision to UI tone (drives status indicator color). */
export const watchEngineTone = (decision: WatchEngineDecision): WatchEngineTone => {
  switch (decision) {
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
};

export const mapWatchEngineDecisionLabel = (
  decision: WatchEngineDecision,
  suppressionReason: WatchEngineSuppressionReason | null,
  t: Translator,
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

export const mapWatchEngineSuppressionReasonLabel = (
  reason: WatchEngineSuppressionReason,
  t: Translator,
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

export const mapWatchEngineDecisionDetails = (
  decision: WatchEngineDecision,
  suppressionReason: WatchEngineSuppressionReason | null,
  t: Translator,
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

/** Format a millisecond duration as compact "Xh YYm" / "Xm YYs". */
export const formatDurationMs = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

/** Blocking reason helpers (preserved from ControlView). */
export const formatBlockingReason = (reason: string | undefined, t: Translator): string => {
  if (!reason) return t("inventory.blockReason.unknown");
  if (reason.startsWith("missing_prerequisite_drops:")) {
    const ids = reason.slice("missing_prerequisite_drops:".length).trim();
    return t("inventory.blockReason.missingPrerequisites", { ids: ids || "?" });
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

export const pickDisplayBlockingReason = (reasons: string[]): string | undefined => {
  const cleaned = reasons
    .map((reason) => (typeof reason === "string" ? reason.trim() : ""))
    .filter(Boolean);
  return cleaned[0];
};

/** Whether a drop can progress given the channel currently being watched. */
export const canDropProgressOnWatchingChannel = (
  drop: InventoryItem,
  watching: WatchingState,
): boolean => {
  if (!watching) return true;
  const restriction = DropChannelRestriction.fromInventoryItem(drop);
  return restriction.allowsWatching(watching);
};

/** Format a channel-restricted drop's reason text with allowed-login preview. */
export const formatChannelRestrictionReason = (drop: InventoryItem, t: Translator): string => {
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
