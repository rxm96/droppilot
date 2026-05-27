import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PriorityRow } from "./PriorityRow";
import { derivePriorityRowState } from "./priorityHelpers";

export type PriorityListProps = {
  priorityGames: string[];
  activeTargetGame: string;
  watchingGame: string;
  liveGameSet: Set<string>;
  movePriorityGame: (active: string, over: string) => void;
  removeGame: (name: string) => void;
};

export function PriorityList({
  priorityGames,
  activeTargetGame,
  watchingGame,
  liveGameSet,
  movePriorityGame,
  removeGame,
}: PriorityListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) return;
      const activeGame = String(active.id);
      const overGame = String(over.id);
      if (!activeGame || !overGame || activeGame === overGame) return;
      movePriorityGame(activeGame, overGame);
    },
    [movePriorityGame],
  );

  if (priorityGames.length === 0) {
    return (
      <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-12 text-center">
        <p className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          no games prioritized yet
        </p>
        <p className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1 opacity-70">
          add a game from the panel on the left
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={priorityGames} strategy={verticalListSortingStrategy}>
          <ul className="list-none p-0 m-0">
            {priorityGames.map((game, index) => (
              <PriorityRow
                key={game}
                rank={index + 1}
                game={game}
                state={derivePriorityRowState(game, activeTargetGame, watchingGame, liveGameSet)}
                onRemove={removeGame}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
