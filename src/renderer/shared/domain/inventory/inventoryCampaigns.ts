import type { CampaignSummary, InventoryItem } from "@renderer/shared/types";

const parseIsoMs = (value?: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const isCampaignActive = (startsAt?: string, endsAt?: string, now = Date.now()): boolean => {
  const startMs = parseIsoMs(startsAt);
  if (startMs !== null && now < startMs) return false;
  const endMs = parseIsoMs(endsAt);
  if (endMs !== null && now > endMs) return false;
  return true;
};

export const buildProgressAnchorByDropId = (
  items: InventoryItem[],
  at: number,
): Record<string, number> => {
  const next: Record<string, number> = {};
  for (const item of items) {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) continue;
    next[id] = at;
  }
  return next;
};

export const buildCampaignsFromInventory = (
  items: InventoryItem[],
  now = Date.now(),
): CampaignSummary[] => {
  type CampaignRecord = CampaignSummary & { startMs?: number; endMs?: number };
  const map = new Map<string, CampaignRecord>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const game = typeof item.game === "string" ? item.game.trim() : "";
    if (!game) continue;
    const campaignName = typeof item.campaignName === "string" ? item.campaignName.trim() : "";
    const rawId = typeof item.campaignId === "string" ? item.campaignId.trim() : "";
    const fallbackId = campaignName || game;
    const id = rawId || (fallbackId ? `campaign:${fallbackId.toLowerCase()}` : item.id);
    if (!id) continue;
    const entry = map.get(id) ?? {
      id,
      name: campaignName || `${game} Drops`,
      game,
      hasUnclaimedDrops: undefined,
    };
    if (!entry.name && campaignName) entry.name = campaignName;
    if (!entry.game) entry.game = game;
    const startMs = parseIsoMs(item.startsAt);
    if (startMs !== null && (entry.startMs === undefined || startMs < entry.startMs)) {
      entry.startMs = startMs;
      entry.startsAt = item.startsAt;
    }
    const endMs = parseIsoMs(item.endsAt);
    if (endMs !== null && (entry.endMs === undefined || endMs > entry.endMs)) {
      entry.endMs = endMs;
      entry.endsAt = item.endsAt;
    }
    if (typeof item.campaignStatus === "string" && item.campaignStatus.trim()) {
      entry.status = item.campaignStatus.trim();
    }
    if (item.linked === false) {
      entry.isAccountConnected = false;
    } else if (item.linked === true && entry.isAccountConnected !== false) {
      entry.isAccountConnected = true;
    }
    const campaignImage =
      typeof item.campaignImageUrl === "string" ? item.campaignImageUrl.trim() : "";
    const dropImage = typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
    if (!entry.imageUrl && (campaignImage || dropImage)) {
      entry.imageUrl = campaignImage || dropImage;
    }
    if (item.status !== "claimed") {
      entry.hasUnclaimedDrops = true;
    } else if (entry.hasUnclaimedDrops === undefined) {
      entry.hasUnclaimedDrops = false;
    }
    map.set(id, entry);
  }
  const result: CampaignSummary[] = [];
  for (const entry of map.values()) {
    result.push({
      id: entry.id,
      name: entry.name,
      game: entry.game,
      imageUrl: entry.imageUrl,
      isAccountConnected: entry.isAccountConnected,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      status: entry.status,
      hasUnclaimedDrops: entry.hasUnclaimedDrops,
      isActive: isCampaignActive(entry.startsAt, entry.endsAt, now),
    });
  }
  return result;
};
