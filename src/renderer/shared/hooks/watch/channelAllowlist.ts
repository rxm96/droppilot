import {
  DropChannelRestriction,
  InventoryDrop,
  type ChannelAllowlist,
} from "@renderer/shared/domain/dropDomain";
import { canEarnDrop } from "@renderer/shared/domain/inventory";
import type { ChannelEntry, InventoryItem } from "@renderer/shared/types";

export type WithCategory = { item: InventoryItem; category: string };

export const buildChannelAllowlist = ({
  targetGame,
  withCategories,
  allowUpcoming = false,
}: {
  targetGame: string;
  withCategories: WithCategory[];
  allowUpcoming?: boolean;
}): ChannelAllowlist | null => {
  const game = targetGame.trim();
  if (!game) return null;

  let combinedRestriction = new DropChannelRestriction();
  let sawActionableDrop = false;

  for (const { item, category } of withCategories) {
    const drop = new InventoryDrop(item);
    if (drop.game !== game) continue;
    if (!canEarnDrop(item, { category, allowUpcoming })) continue;
    sawActionableDrop = true;
    // If any actionable drop is unrestricted, the game can be farmed on any valid live channel.
    if (!drop.restriction.hasConstraints) {
      return null;
    }
    combinedRestriction = combinedRestriction.mergedWith(drop.restriction);
  }

  if (!sawActionableDrop) return null;
  return combinedRestriction.toAllowlist();
};

export const normalizeAllowlist = (
  allowlist?: ChannelAllowlist | null,
): DropChannelRestriction | null => {
  const restriction = DropChannelRestriction.fromAllowlist(allowlist);
  return restriction.hasConstraints ? restriction : null;
};

export const prioritizeChannelsByAllowlist = (
  channels: ChannelEntry[],
  allowlist?: ChannelAllowlist | null,
): ChannelEntry[] => {
  const normalized = normalizeAllowlist(allowlist);
  if (!normalized) return channels;
  const allowed: ChannelEntry[] = [];
  const fallback: ChannelEntry[] = [];
  let sawFallback = false;
  let requiresReorder = false;
  for (const channel of channels) {
    const allowedMatch = normalized.allowsChannel(channel);
    if (allowedMatch) {
      allowed.push(channel);
      if (sawFallback) requiresReorder = true;
    } else {
      fallback.push(channel);
      sawFallback = true;
    }
  }
  if (!requiresReorder) return channels;
  return [...allowed, ...fallback];
};

export const buildAllowlistKey = (allowlist?: ChannelAllowlist | null): string => {
  const normalized = normalizeAllowlist(allowlist);
  if (!normalized) return "";
  const ids = Array.from(normalized.ids).sort().join(",");
  const logins = Array.from(normalized.logins).sort().join(",");
  return `${ids}|${logins}`;
};
