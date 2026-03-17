export const normalizePriorityGameName = (name: string): string => name.trim().toLocaleLowerCase();

export const hasPriorityGameName = (priorityGames: string[], name: string): boolean => {
  const normalized = normalizePriorityGameName(name);
  if (!normalized) return false;
  return priorityGames.some((game) => normalizePriorityGameName(game) === normalized);
};
