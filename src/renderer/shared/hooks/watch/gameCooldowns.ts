import type { WithCategory } from "@renderer/shared/hooks/priority";

export type CooldownReason = "stall-no-farmable" | "stall-no-progress";

/** game name (trimmed) → epoch ms until which the game is blocked. */
export type GameCooldownMap = Record<string, number>;

/** Monotonic-max upsert: a shorter cooldown never overwrites a longer one. Returns the same map on no-op. */
export const upsertCooldown = (
  map: GameCooldownMap,
  rawGame: string,
  until: number,
): GameCooldownMap => {
  const game = rawGame.trim();
  if (!game) return map;
  const current = map[game] ?? 0;
  if (current >= until) return map;
  return { ...map, [game]: until };
};

/** Returns the same map when the game has no entry. */
export const removeCooldown = (map: GameCooldownMap, rawGame: string): GameCooldownMap => {
  const game = rawGame.trim();
  if (!game || !(game in map)) return map;
  const next = { ...map };
  delete next[game];
  return next;
};

/** Drops expired and non-finite entries. Returns the same map when nothing changed. */
export const pruneExpiredCooldowns = (map: GameCooldownMap, now: number): GameCooldownMap => {
  let changed = false;
  const next: GameCooldownMap = {};
  for (const [game, until] of Object.entries(map)) {
    if (Number.isFinite(until) && until > now) {
      next[game] = until;
      continue;
    }
    changed = true;
  }
  return changed ? next : map;
};

export const nextCooldownExpiry = (map: GameCooldownMap): number | null => {
  const untils = Object.values(map).filter((until) => Number.isFinite(until));
  if (untils.length === 0) return null;
  return Math.min(...untils);
};

export const isGameInCooldown = (map: GameCooldownMap, rawGame: string, now: number): boolean => {
  const game = rawGame.trim();
  if (!game) return false;
  const until = map[game];
  return typeof until === "number" && Number.isFinite(until) && until > now;
};

/**
 * Hide the suppressed game and any cooled-down games from priority
 * orchestration so it advances to the next eligible target. Items without a
 * game name pass through. Identity fast-path when nothing is blocked.
 */
export const filterCategoriesForOrchestration = (
  withCategories: WithCategory[],
  {
    suppressedGame,
    cooldowns,
    now,
  }: { suppressedGame: string; cooldowns: GameCooldownMap; now: number },
): WithCategory[] => {
  if (!suppressedGame && Object.keys(cooldowns).length === 0) {
    return withCategories;
  }
  return withCategories.filter(({ item }) => {
    const game = item.game.trim();
    if (!game) return true;
    if (suppressedGame && game === suppressedGame) return false;
    return !isGameInCooldown(cooldowns, game, now);
  });
};
