import { useCallback } from "react";
import { arrayMove } from "@dnd-kit/sortable";

type Params = {
  newGame: string;
  setNewGame: (val: string) => void;
  selectedGame: string;
  priorityGames: string[];
  setAutoSelectEnabled: (next: boolean) => void;
  savePriorityGames: (list: string[]) => Promise<void>;
};

export const reorderPriorityGamesByValue = (
  priorityGames: string[],
  activeGame: string,
  overGame: string,
): string[] => {
  const activeIndex = priorityGames.indexOf(activeGame);
  const overIndex = priorityGames.indexOf(overGame);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return priorityGames;
  return arrayMove(priorityGames, activeIndex, overIndex);
};

export function usePriorityActions({
  newGame,
  setNewGame,
  selectedGame,
  priorityGames,
  setAutoSelectEnabled,
  savePriorityGames,
}: Params) {
  const addGame = useCallback(() => {
    const name = newGame.trim();
    if (!name) return;
    if (priorityGames.includes(name)) {
      setNewGame("");
      return;
    }
    const updated = [...priorityGames, name];
    setNewGame("");
    setAutoSelectEnabled(true);
    void savePriorityGames(updated);
  }, [newGame, priorityGames, savePriorityGames, setAutoSelectEnabled, setNewGame]);

  const removeGame = useCallback(
    (name: string) => {
      const updated = priorityGames.filter((g) => g !== name);
      void savePriorityGames(updated);
    },
    [priorityGames, savePriorityGames],
  );

  const movePriorityGame = useCallback(
    (activeGame: string, overGame: string) => {
      const updated = reorderPriorityGamesByValue(priorityGames, activeGame, overGame);
      if (updated === priorityGames) return;
      setAutoSelectEnabled(true);
      void savePriorityGames(updated);
    },
    [priorityGames, savePriorityGames, setAutoSelectEnabled],
  );

  const addGameFromSelect = useCallback(() => {
    const name = selectedGame.trim();
    if (!name) return;
    if (priorityGames.includes(name)) return;
    setAutoSelectEnabled(true);
    void savePriorityGames([...priorityGames, name]);
  }, [priorityGames, savePriorityGames, selectedGame, setAutoSelectEnabled]);

  const addGameByName = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (priorityGames.includes(trimmed)) return;
      setAutoSelectEnabled(true);
      void savePriorityGames([...priorityGames, trimmed]);
    },
    [priorityGames, savePriorityGames, setAutoSelectEnabled],
  );

  return {
    addGame,
    removeGame,
    movePriorityGame,
    addGameFromSelect,
    addGameByName,
  };
}
