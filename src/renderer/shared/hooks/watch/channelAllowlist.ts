import {
  DropChannelRestriction,
  InventoryDrop,
  type ChannelAllowlist,
} from "@renderer/shared/domain/dropDomain";
import type { InventoryItem } from "@renderer/shared/types";

export type WithCategory = { item: InventoryItem; category: string };

const isActionableCategory = (category: string, allowUpcoming = false): boolean =>
  category === "in-progress" || (allowUpcoming && category === "upcoming");

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
    if (!isActionableCategory(category, allowUpcoming)) continue;
    if (item.status === "claimed") continue;
    if (drop.isBlocked) continue;
    if (!drop.restriction.hasConstraints) continue;
    combinedRestriction = combinedRestriction.mergedWith(drop.restriction);
  }

  return combinedRestriction.toAllowlist();
};
