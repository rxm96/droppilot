import * as React from "react";
import { PriorityHeader } from "./PriorityHeader";
import { PriorityAddPanel } from "./PriorityAddPanel";
import { PriorityList } from "./PriorityList";
import { getSelectableDropGames } from "./priorityHelpers";

// Re-export for PriorityView.test.ts (back-compat)
export { getSelectableDropGames } from "./priorityHelpers";

type PriorityViewProps = {
  uniqueGames: string[];
  activeTargetGame: string;
  watchingGame: string;
  selectedGame: string;
  setSelectedGame: (val: string) => void;
  newGame: string;
  setNewGame: (val: string) => void;
  addGame: () => void;
  addGameFromSelect: () => void;
  priorityGames: string[];
  removeGame: (name: string) => void;
  movePriorityGame: (activeGame: string, overGame: string) => void;
  obeyPriority: boolean;
  setObeyPriority: (val: boolean) => void;
};

export function PriorityView({
  uniqueGames,
  activeTargetGame,
  watchingGame,
  selectedGame,
  setSelectedGame,
  newGame,
  setNewGame,
  addGame,
  addGameFromSelect,
  priorityGames,
  removeGame,
  movePriorityGame,
  obeyPriority,
  setObeyPriority,
}: PriorityViewProps) {
  const selectableDropGames = React.useMemo(
    () => getSelectableDropGames(uniqueGames, priorityGames),
    [uniqueGames, priorityGames],
  );

  const liveGameSet = React.useMemo(() => new Set(uniqueGames), [uniqueGames]);

  const livePriorityCount = React.useMemo(
    () => priorityGames.filter((game) => liveGameSet.has(game)).length,
    [priorityGames, liveGameSet],
  );

  const topGame = priorityGames[0] ?? "";

  const hasSelectableSelectedGame = selectableDropGames.includes(selectedGame);
  React.useEffect(() => {
    if (!selectedGame || hasSelectableSelectedGame) return;
    setSelectedGame("");
  }, [hasSelectableSelectedGame, selectedGame, setSelectedGame]);

  return (
    <div className="flex flex-col gap-5">
      <PriorityHeader
        totalCount={priorityGames.length}
        livePriorityCount={livePriorityCount}
        activeTargetGame={activeTargetGame}
        watchingGame={watchingGame}
        topGame={topGame}
        obeyPriority={obeyPriority}
      />

      <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(320px, 1fr) 1.4fr" }}>
        <PriorityAddPanel
          selectableDropGames={selectableDropGames}
          selectedGame={selectedGame}
          setSelectedGame={setSelectedGame}
          addGameFromSelect={addGameFromSelect}
          newGame={newGame}
          setNewGame={setNewGame}
          addGame={addGame}
          obeyPriority={obeyPriority}
          setObeyPriority={setObeyPriority}
        />

        <PriorityList
          priorityGames={priorityGames}
          activeTargetGame={activeTargetGame}
          watchingGame={watchingGame}
          liveGameSet={liveGameSet}
          movePriorityGame={movePriorityGame}
          removeGame={removeGame}
        />
      </div>
    </div>
  );
}
