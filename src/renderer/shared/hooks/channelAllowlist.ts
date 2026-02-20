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
}): { ids: string[]; logins: string[] } | null => {
  const game = targetGame.trim();
  if (!game) return null;

  const ids = new Set<string>();
  const logins = new Set<string>();

  for (const { item, category } of withCategories) {
    if (item.game !== game) continue;
    if (!isActionableCategory(category, allowUpcoming)) continue;
    if (item.status === "claimed") continue;
    if (item.blocked === true) continue;

    for (const rawId of item.allowedChannelIds ?? []) {
      const id = String(rawId).trim();
      if (id) ids.add(id);
    }
    for (const rawLogin of item.allowedChannelLogins ?? []) {
      const login = rawLogin.trim().toLowerCase();
      if (login) logins.add(login);
    }
  }

  if (ids.size === 0 && logins.size === 0) return null;
  return { ids: Array.from(ids), logins: Array.from(logins) };
};
