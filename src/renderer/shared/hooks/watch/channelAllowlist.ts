import {
  DropChannelRestriction,
  InventoryDrop,
  type ChannelAllowlist,
} from "@renderer/shared/domain/dropDomain";
import { canEarnDrop } from "@renderer/shared/domain/inventory";
import type { InventoryItem } from "@renderer/shared/types";

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

  for (const { item, category } of withCategories) {
    const drop = new InventoryDrop(item);
    if (drop.game !== game) continue;
    if (!canEarnDrop(item, { category, allowUpcoming })) continue;
    if (!drop.restriction.hasConstraints) continue;
    combinedRestriction = combinedRestriction.mergedWith(drop.restriction);
  }

  return combinedRestriction.toAllowlist();
};
