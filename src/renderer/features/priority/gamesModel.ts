// Pure view-model for the games view (UI polish phase 4): the user's ranked
// games with their pills and meta line, the other games that have drops, and
// the fallback rule as a choice. No React imports.

import type { FarmPlan } from "@renderer/shared/domain/farmPlan";
import { sameGameName } from "@renderer/shared/domain/gameName";
import type { InventoryItem } from "@renderer/shared/types";
import { formatEndsIn, padRank } from "@renderer/features/overview/formatters";
import { planRowStatus } from "@renderer/features/overview/planTable";
import { classifyDrop, gameCode } from "@renderer/features/inventory/dropsModel";

/**
 * What happens when none of the user's games can be farmed. Maps 1:1 onto
 * `obeyPriority`: "wait" = only the user's games are ever farmed (on), and
 * "farm-others" = any game with drops is farmed meanwhile (off).
 */
export type FallbackRule = "wait" | "farm-others";

export const fallbackRuleFor = (obeyPriority: boolean): FallbackRule =>
  obeyPriority ? "wait" : "farm-others";

export const obeyPriorityFor = (rule: FallbackRule): boolean => rule === "wait";

export type GameMeta = {
  /** Drops that are neither claimed nor in an expired campaign. */
  dropsLeft: number;
  /** Earliest end of those drops ("2d"); null when unknown. */
  endsIn: string | null;
  /** Live channels with drops; only known for the game whose channels are loaded. */
  live: number | null;
};

export type GamesRow = {
  /** The stored spelling: reorder and remove act on it. */
  game: string;
  rank: string;
  code: string;
  imageUrl?: string;
  /** The watched stream is for this game. */
  farming: boolean;
  /** A drop of this game waits for an account link (same rule as the plan table). */
  needsLink: boolean;
  isFirst: boolean;
  isLast: boolean;
  meta: GameMeta;
};

export type OtherGame = {
  game: string;
  code: string;
  imageUrl?: string;
  farming: boolean;
  meta: GameMeta;
};

export type GamesView = { rows: GamesRow[]; others: OtherGame[] };

/** The game to swap with for ▲ (-1) / ▼ (+1); null at the ends. */
export function adjacentGame(list: string[], game: string, direction: -1 | 1): string | null {
  const index = list.indexOf(game);
  if (index < 0) return null;
  return list[index + direction] ?? null;
}

export function buildGamesView(input: {
  /** The user's list as stored (settings). */
  priorityGames: string[];
  items: InventoryItem[];
  /** The overview's farm plan (buildFarmPlan). */
  plan: FarmPlan;
  /** Game of the watched stream; "" while paused or idle. */
  farmingGame: string;
  /** The loaded channel list's game and its live channels with drops. */
  liveChannels: { game: string; count: number } | null;
  now: number;
}): GamesView {
  const { items, now } = input;
  const openDrops = items.filter((item) => {
    const { bucket } = classifyDrop(item, { now });
    return bucket !== "claimed" && bucket !== "expired";
  });
  const itemById = new Map(items.map((item) => [item.id, item]));

  const tileImage = (game: string): string | undefined =>
    items
      .filter((item) => sameGameName(item.game, game))
      .map((item) => item.campaignImageUrl?.trim())
      .find(Boolean);

  const metaFor = (game: string): GameMeta => {
    const open = openDrops.filter((item) => sameGameName(item.game, game));
    const ends = open
      .map((item) => (item.endsAt ? Date.parse(item.endsAt) : Number.NaN))
      .filter((ts) => Number.isFinite(ts) && ts > now);
    const live =
      input.liveChannels && sameGameName(input.liveChannels.game, game)
        ? input.liveChannels.count
        : null;
    return {
      dropsLeft: open.length,
      endsIn: ends.length > 0 ? formatEndsIn(new Date(Math.min(...ends)).toISOString(), now) : null,
      live,
    };
  };

  const isFarming = (game: string): boolean =>
    input.farmingGame.trim() !== "" && sameGameName(game, input.farmingGame);

  const needsLink = (game: string): boolean =>
    input.plan.rows.some(
      (row) =>
        row.kind === "drop" &&
        sameGameName(row.game, game) &&
        planRowStatus(row, itemById.get(row.dropId)) === "needs-link",
    );

  const tile = (game: string) => {
    const imageUrl = tileImage(game);
    return { code: gameCode(game), ...(imageUrl ? { imageUrl } : {}) };
  };

  const rows: GamesRow[] = input.priorityGames.map((game, index, list) => ({
    game,
    rank: padRank(index + 1),
    ...tile(game),
    farming: isFarming(game),
    needsLink: needsLink(game),
    isFirst: index === 0,
    isLast: index === list.length - 1,
    meta: metaFor(game),
  }));

  const otherNames: string[] = [];
  for (const item of openDrops) {
    const listed = input.priorityGames.some((g) => sameGameName(g, item.game));
    if (listed || otherNames.some((g) => sameGameName(g, item.game))) continue;
    otherNames.push(item.game);
  }
  const others: OtherGame[] = otherNames
    .sort((a, b) => a.localeCompare(b))
    .map((game) => ({ game, ...tile(game), farming: isFarming(game), meta: metaFor(game) }));

  return { rows, others };
}
