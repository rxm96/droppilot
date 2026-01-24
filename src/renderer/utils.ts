import type { InventoryItem } from "./types";

export function getCategory(
  item: InventoryItem,
  isLinked: boolean,
): "in-progress" | "upcoming" | "finished" | "not-linked" | "expired" | "excluded" {
  const now = Date.now();
  if (!isLinked) return "not-linked";
  if (item.excluded) return "excluded";
  if (item.status === "claimed") return "finished";
  const endsAt = item.endsAt ? Date.parse(item.endsAt) : undefined;
  if (item.campaignStatus === "EXPIRED" || (endsAt && endsAt < now)) return "expired";
  const earned = Math.max(0, Number(item.earnedMinutes) || 0);
  if (item.linked === false && item.status === "locked" && earned <= 0) return "not-linked";
  switch (item.status) {
    case "progress":
      return "in-progress";
    case "locked":
    default:
      return "upcoming";
  }
}

export function categoryLabel(
  cat: ReturnType<typeof getCategory>,
  t?: (key: string) => string,
): string {
  switch (cat) {
    case "in-progress":
      return t ? t("inventory.category.inProgress") : "Active";
    case "upcoming":
      return t ? t("inventory.category.upcoming") : "Upcoming";
    case "finished":
      return t ? t("inventory.category.finished") : "Finished";
    case "not-linked":
      return t ? t("inventory.category.notLinked") : "Not linked";
    case "expired":
      return t ? t("inventory.category.expired") : "Expired";
    case "excluded":
      return t ? t("inventory.category.excluded") : "Excluded";
    default:
      return cat;
  }
}

export function mapStatusLabel(
  status: InventoryItem["status"],
  t?: (key: string) => string,
): string {
  switch (status) {
    case "claimed":
      return t ? t("inventory.status.claimed") : "Claimed";
    case "progress":
      return t ? t("inventory.status.progress") : "In progress";
    default:
      return t ? t("inventory.status.locked") : "Locked";
  }
}

export function formatRange(
  start?: string,
  end?: string,
  t?: (key: string, vars?: Record<string, string>) => string,
): string {
  const fmt = (v?: string) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const s = fmt(start);
  const e = fmt(end);
  if (s && e) return `${s} - ${e}`;
  if (e) return t ? t("inventory.range.ends", { date: e }) : `Ends: ${e}`;
  if (s) return t ? t("inventory.range.starts", { date: s }) : `Starts: ${s}`;
  return t ? t("inventory.range.none") : "Kein Zeitraum";
}

export function formatRemaining(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "n/a";
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
