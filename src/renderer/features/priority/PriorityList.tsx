import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PriorityRow, PriorityRowOverlay } from "./PriorityRow";
import { derivePriorityRowState } from "./priorityHelpers";
import { useI18n } from "@renderer/shared/i18n";

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
  const { t } = useI18n();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = React.useCallback(({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  }, []);

  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null);
      if (!over) return;
      const activeGame = String(active.id);
      const overGame = String(over.id);
      if (!activeGame || !overGame || activeGame === overGame) return;
      movePriorityGame(activeGame, overGame);
    },
    [movePriorityGame],
  );

  const handleDragCancel = React.useCallback(() => setActiveId(null), []);

  if (priorityGames.length === 0) {
    return (
      <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-12 text-center">
        <p className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("priorities.list.empty")}
        </p>
        <p className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1 opacity-70">
          {t("priorities.list.emptyHint")}
        </p>
      </div>
    );
  }

  const activeRank = activeId ? priorityGames.indexOf(activeId) + 1 : 0;

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
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
        <DragOverlay>
          {activeId ? (
            <PriorityRowOverlay
              rank={activeRank}
              game={activeId}
              state={derivePriorityRowState(activeId, activeTargetGame, watchingGame, liveGameSet)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
