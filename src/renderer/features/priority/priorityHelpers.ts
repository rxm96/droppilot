/**
 * Helpers for the Priorities view. Pure functions, no React.
 */

export const getSelectableDropGames = (uniqueGames: string[], priorityGames: string[]): string[] =>
  uniqueGames.filter((game) => !priorityGames.includes(game));

export type PriorityRowState = "watching" | "target" | "live" | "idle";

export const derivePriorityRowState = (
  game: string,
  activeTargetGame: string,
  watchingGame: string,
  liveGameSet: Set<string>,
): PriorityRowState => {
  if (game === watchingGame) return "watching";
  if (game === activeTargetGame) return "target";
  if (liveGameSet.has(game)) return "live";
  return "idle";
};

/** Pad rank to fixed-width mono display (e.g. "01", "02", ..., "12"). */
export const padPriorityRank = (rank: number, width: number = 2): string =>
  String(Math.max(1, Math.floor(rank))).padStart(width, "0");
