import type { InventoryItem } from "@renderer/shared/types";

/** "Twitch Drop" fallback for empty drop titles. */
export const dropTitleFallback = (item: InventoryItem): string => {
  const t = item.title?.trim();
  if (t) return t;
  return item.campaignName?.trim() || item.game || "Twitch drop";
};
