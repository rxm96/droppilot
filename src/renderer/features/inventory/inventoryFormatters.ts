import type { InventoryItem } from "@renderer/shared/types";

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
