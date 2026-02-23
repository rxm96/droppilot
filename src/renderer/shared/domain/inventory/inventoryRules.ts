import type { InventoryItem } from "@renderer/shared/types";

const CLAIM_RETRY_MAX_MS = 30 * 60_000;
const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;
const FORCE_FETCH_QUEUE_DEDUPE_MS = 8_000;

export const CLAIM_ATTEMPT_RETRY_MS = 90_000;

export const isWithinClaimWindow = (item: InventoryItem, now = Date.now()): boolean => {
  if (!item.endsAt) return true;
  const endMs = Date.parse(item.endsAt);
  if (!Number.isFinite(endMs)) return true;
  return now < endMs + CLAIM_WINDOW_MS;
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

