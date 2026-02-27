import type { InventoryItem } from "@renderer/shared/types";

const CLAIM_RETRY_MAX_MS = 30 * 60_000;
const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;
const FORCE_FETCH_QUEUE_DEDUPE_MS = 8_000;
const SOFT_CLAIM_BLOCKER_REASONS = new Set([
  "missing_drop_instance_id",
  "account_not_linked",
  "campaign_allow_disabled",
]);

export const CLAIM_ATTEMPT_RETRY_MS = 90_000;

export const isWithinClaimWindow = (item: InventoryItem, now = Date.now()): boolean => {
  if (!item.endsAt) return true;
  const endMs = Date.parse(item.endsAt);
  if (!Number.isFinite(endMs)) return true;
  return now < endMs + CLAIM_WINDOW_MS;
};

export const isHardWatchingBlockerReason = (reason: string): boolean => {
  if (reason.startsWith("missing_prerequisite_drops:")) return true;
  switch (reason) {
    case "campaign_not_started":
    case "campaign_expired":
    case "preconditions_not_met":
      return true;
    default:
      return false;
  }
};

export const hasHardWatchingBlockers = (item: InventoryItem): boolean =>
  (item.blockingReasonHints ?? []).some((reason) =>
    typeof reason === "string" ? isHardWatchingBlockerReason(reason.trim()) : false,
  );

export const hasHardClaimBlockers = (item: InventoryItem): boolean =>
  (item.blockingReasonHints ?? []).some((reason) => !SOFT_CLAIM_BLOCKER_REASONS.has(reason));

export const hasClaimIdCandidate = (item: InventoryItem): boolean =>
  Boolean(item.dropInstanceId || (item.campaignId && item.id));

const getRequiredMinutes = (item: InventoryItem): number =>
  Math.max(0, Number(item.requiredMinutes) || 0);

const getEarnedMinutes = (item: InventoryItem): number =>
  Math.max(0, Number(item.earnedMinutes) || 0);

export const canEarnDrop = (
  item: InventoryItem,
  opts?: { category?: string; allowUpcoming?: boolean },
): boolean => {
  const category =
    opts?.category ??
    (item.status === "progress"
      ? "in-progress"
      : item.status === "locked"
        ? "upcoming"
        : "finished");
  const allowUpcoming = opts?.allowUpcoming === true;
  const required = getRequiredMinutes(item);
  const earned = getEarnedMinutes(item);

  if (item.status === "claimed") return false;
  if (required <= 0) return false;
  if (earned >= required) return false;
  if (item.blocked === true) return false;
  if (item.isClaimable === true) return false;
  if (hasHardWatchingBlockers(item)) return false;

  if (category === "in-progress") return true;
  if (category === "upcoming") return allowUpcoming;
  return false;
};

export const canClaimDrop = (
  item: InventoryItem,
  opts?: { now?: number; allowFallbackWhenNotExplicit?: boolean },
): boolean => {
  const now = opts?.now ?? Date.now();
  const allowFallbackWhenNotExplicit = opts?.allowFallbackWhenNotExplicit !== false;

  if (item.status === "claimed") return false;
  if (!isWithinClaimWindow(item, now)) return false;
  if (!hasClaimIdCandidate(item)) return false;

  const required = getRequiredMinutes(item);
  const earned = getEarnedMinutes(item);
  const progressDone = required === 0 || earned >= required;
  if (!progressDone) return false;

  if (item.isClaimable === true) return true;
  if (!allowFallbackWhenNotExplicit) return false;
  if (item.isClaimable === false && hasHardClaimBlockers(item)) return false;
  return true;
};

export const getClaimRetryDelay = (attempts: number): number =>
  Math.min(CLAIM_RETRY_MAX_MS, CLAIM_ATTEMPT_RETRY_MS * 2 ** Math.max(0, attempts - 1));

export const buildClaimRetrySignature = (item: InventoryItem): string =>
  [
    item.status,
    String(Math.max(0, Number(item.earnedMinutes) || 0)),
    String(Math.max(0, Number(item.requiredMinutes) || 0)),
    item.dropInstanceId ?? "",
    item.campaignId ?? "",
    typeof item.isClaimable === "boolean" ? String(item.isClaimable) : "",
    (item.blockingReasonHints ?? []).join("|"),
  ].join("#");

export const shouldDeduplicateInFlightForceFetch = ({
  now,
  inFlightStartedAt,
  inFlightForceLoading,
  nextForceLoading,
  dedupeWindowMs = FORCE_FETCH_QUEUE_DEDUPE_MS,
}: {
  now: number;
  inFlightStartedAt: number;
  inFlightForceLoading: boolean;
  nextForceLoading: boolean;
  dedupeWindowMs?: number;
}): boolean => {
  if (!nextForceLoading || !inFlightForceLoading) return false;
  if (!Number.isFinite(inFlightStartedAt) || inFlightStartedAt <= 0) return false;
  return now - inFlightStartedAt < dedupeWindowMs;
};
