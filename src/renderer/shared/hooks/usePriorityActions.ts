import { useCallback } from "react";

type Params = {
  newGame: string;
  setNewGame: (val: string) => void;
  selectedGame: string;
  priorityGames: string[];
  dragIndex: number | null;
  setDragIndex: (val: number | null) => void;
  setDragOverIndex: (val: number | null) => void;
  savePriorityGames: (list: string[]) => Promise<void>;
};

export function usePriorityActions({
  newGame,
  setNewGame,
  selectedGame,
  priorityGames,
  dragIndex,
  setDragIndex,
  setDragOverIndex,
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
    void savePriorityGames(updated);
  }, [newGame, priorityGames, savePriorityGames, setNewGame]);

  const removeGame = useCallback(
    (name: string) => {
      const updated = priorityGames.filter((g) => g !== name);
      void savePriorityGames(updated);
    },
    [priorityGames, savePriorityGames],
  );

  const handleDropReorder = useCallback(
    (targetIndex: number) => {
      if (dragIndex === null || dragIndex === targetIndex) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }
      const updated = [...priorityGames];
      // Ensure dragIndex is within bounds of the current list before splicing.
      if (dragIndex < 0 || dragIndex >= updated.length) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }
      const [item] = updated.splice(dragIndex, 1);
      if (item === undefined) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }
      // Clamp targetIndex after removal so insertion is always in a valid range.
      const clampedTargetIndex = Math.max(0, Math.min(targetIndex, updated.length));
      updated.splice(clampedTargetIndex, 0, item);
      setDragIndex(null);
      setDragOverIndex(null);
      void savePriorityGames(updated);
    },
    [dragIndex, priorityGames, savePriorityGames, setDragIndex, setDragOverIndex],
  );

  const addGameFromSelect = useCallback(() => {
    const name = selectedGame.trim();
    if (!name) return;
    if (priorityGames.includes(name)) return;
    void savePriorityGames([...priorityGames, name]);
  }, [priorityGames, savePriorityGames, selectedGame]);

  return {
    addGame,
    removeGame,
    handleDropReorder,
    addGameFromSelect,
  };
}
