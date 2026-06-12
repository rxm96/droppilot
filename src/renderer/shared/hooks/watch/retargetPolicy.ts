/**
 * Pick the next target game after `currentGame` in priority order: rotate the
 * list so games after the current one come first, drop the current game and
 * anything blocked (in cooldown), prefer the first actionable candidate, and
 * otherwise fall back to the first candidate so the engine keeps moving.
 */
export const rotateToNextPriorityTarget = ({
  priorityOrder,
  currentGame,
  isGameBlocked,
  isGameActionable,
}: {
  priorityOrder: string[];
  currentGame: string;
  isGameBlocked: (game: string) => boolean;
  isGameActionable: (game: string) => boolean;
}): string => {
  const current = currentGame.trim();
  const ordered = priorityOrder
    .map((game) => game.trim())
    .filter((game, index, all) => game.length > 0 && all.indexOf(game) === index);
  if (ordered.length === 0) return "";
  const currentIndex = ordered.indexOf(current);
  const rotated =
    currentIndex >= 0
      ? [...ordered.slice(currentIndex + 1), ...ordered.slice(0, currentIndex)]
      : ordered;
  const candidates = rotated.filter((game) => game !== current && !isGameBlocked(game));
  if (candidates.length === 0) return "";
  const actionable = candidates.find((game) => isGameActionable(game));
  return actionable ?? candidates[0] ?? "";
};
