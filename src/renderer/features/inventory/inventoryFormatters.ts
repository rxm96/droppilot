import type { InventoryItem } from "@renderer/shared/types";

export type StatusPillTone = "accent" | "ok" | "warn" | "err" | "dim";

/** Tone for the status pill in the Inventory table. */
export const dropStatusTone = (item: InventoryItem): StatusPillTone => {
  if (item.status === "claimed") return "ok";
  if (item.status === "progress") {
    if (item.blocked) return "err";
    return "accent";
  }
  // locked
  if (item.blocked) return "warn";
  return "dim";
};

/** Short label for the status pill. */
export const dropStatusLabel = (item: InventoryItem): string => {
  if (item.status === "claimed") return "claimed";
  if (item.status === "progress") return item.blocked ? "blocked" : "live";
  return item.blocked ? "blocked" : "queued";
};

/** Human-readable blocking reason from a known hint code. */
export const formatBlockingReason = (reason: string | undefined): string => {
  if (!reason) return "unknown reason";
  if (reason.startsWith("missing_prerequisite_drops:")) {
    const ids = reason.slice("missing_prerequisite_drops:".length).trim();
    return `Missing prerequisite drops${ids ? ` (${ids})` : ""}`;
  }
  switch (reason) {
    case "account_not_linked":
      return "Account not linked to game";
    case "campaign_not_started":
      return "Campaign hasn't started";
    case "campaign_expired":
      return "Campaign expired";
    case "campaign_allow_disabled":
      return "Campaign not eligible";
    case "preconditions_not_met":
      return "Preconditions not met";
    case "missing_drop_instance_id":
      return "Missing drop instance";
    case "claim_window_closed":
      return "Claim window closed";
    default:
      return "unknown reason";
  }
};

/** Pick the most informative blocking reason hint to display. */
export const pickDisplayBlockingReason = (
  hints: string[] | undefined,
  suppressAccountNotLinked: boolean,
): string | undefined => {
  if (!hints || hints.length === 0) return undefined;
  const cleaned = hints
    .map((reason) => (typeof reason === "string" ? reason.trim() : ""))
    .filter(Boolean);
  if (cleaned.length === 0) return undefined;
  if (!suppressAccountNotLinked) return cleaned[0];
  return cleaned.find((reason) => reason !== "account_not_linked");
};

/** "Twitch Drop" fallback for empty drop titles. */
export const dropTitleFallback = (item: InventoryItem): string => {
  const t = item.title?.trim();
  if (t) return t;
  return item.campaignName?.trim() || item.game || "Twitch drop";
};
