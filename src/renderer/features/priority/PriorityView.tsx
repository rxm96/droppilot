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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useI18n } from "@renderer/shared/i18n";
import { useEffect, type ButtonHTMLAttributes, type CSSProperties } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";

type PriorityViewProps = {
  uniqueGames: string[];
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

type PriorityCardProps = {
  game: string;
  dragLabel: string;
  removeLabel: string;
  onRemove: (name: string) => void;
  dragHandleProps: ButtonHTMLAttributes<HTMLButtonElement>;
  setDragHandleRef?: (element: HTMLButtonElement | null) => void;
};

const NO_GAME_SELECT_VALUE = "__dp_none__";

export const getSelectableDropGames = (
  uniqueGames: string[],
  priorityGames: string[],
): string[] => uniqueGames.filter((game) => !priorityGames.includes(game));

function PriorityCard({
  game,
  dragLabel,
  removeLabel,
  onRemove,
  dragHandleProps,
  setDragHandleRef,
}: PriorityCardProps) {
  return (
    <div className="priority-list-card">
      <div className="priority-item-main">
        <button
          type="button"
          className="ghost priority-drag-handle"
          aria-label={dragLabel}
          title={dragLabel}
          ref={setDragHandleRef}
          {...dragHandleProps}
        >
          <span className="priority-drag-grip" aria-hidden="true">
            {Array.from({ length: 6 }, (_, gripIdx) => (
              <span key={gripIdx} />
            ))}
          </span>
        </button>
        <span className="priority-game-name">{game}</span>
      </div>
      <div className="priority-actions">
        <button type="button" className="ghost" onClick={() => onRemove(game)}>
          {removeLabel}
        </button>
      </div>
    </div>
  );
}

type SortablePriorityItemProps = {
  game: string;
  dragLabel: string;
  removeLabel: string;
  onRemove: (name: string) => void;
};

function SortablePriorityItem({
  game,
  dragLabel,
  removeLabel,
  onRemove,
}: SortablePriorityItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: game });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li ref={setNodeRef} style={style} className={isDragging ? "priority-list-item sortable-dragging" : "priority-list-item"}>
      <PriorityCard
        game={game}
        dragLabel={dragLabel}
        removeLabel={removeLabel}
        onRemove={onRemove}
        setDragHandleRef={setActivatorNodeRef}
        dragHandleProps={{
          ...attributes,
          ...listeners,
        } as ButtonHTMLAttributes<HTMLButtonElement>}
      />
    </li>
  );
}

export function PriorityView({
  uniqueGames,
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
  const { t } = useI18n();
  const countLabel = t("priorities.count", { count: priorityGames.length });
  const selectableDropGames = getSelectableDropGames(uniqueGames, priorityGames);
  const hasSelectableSelectedGame = selectableDropGames.includes(selectedGame);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!selectedGame || hasSelectableSelectedGame) return;
    setSelectedGame("");
  }, [hasSelectableSelectedGame, selectedGame, setSelectedGame]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const activeGame = String(active.id);
    const overGame = String(over.id);
    if (!activeGame || !overGame || activeGame === overGame) return;
    movePriorityGame(activeGame, overGame);
  };

  return (
    <div className="priority-view">
      <div className="priority-head">
        <div>
          <h2>{t("priorities.title")}</h2>
          <p className="meta">{t("priorities.subtitle")}</p>
        </div>
        <span className="priority-count">{countLabel}</span>
      </div>
      <div className="priority-split">
        <section className="priority-panel">
          <div className="label">{t("settings.addFromDrops")}</div>
          <p className="meta">{t("settings.addFromDropsOption")}</p>
          {selectableDropGames.length > 0 && (
            <div className="settings-row">
              <Select
                value={hasSelectableSelectedGame ? selectedGame : NO_GAME_SELECT_VALUE}
                onValueChange={(value) =>
                  setSelectedGame(value === NO_GAME_SELECT_VALUE ? "" : value)
                }
              >
                <SelectTrigger aria-label={t("settings.addFromDrops")}>
                  <SelectValue placeholder={t("settings.addFromDropsOption")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GAME_SELECT_VALUE}>
                    {t("settings.addFromDropsOption")}
                  </SelectItem>
                  {selectableDropGames.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={addGameFromSelect}
                disabled={!hasSelectableSelectedGame}
              >
                {t("settings.add")}
              </button>
            </div>
          )}
          <div className="settings-row">
            <input
              type="text"
              className="input"
              placeholder={t("settings.addGamePlaceholder")}
              value={newGame}
              onChange={(e) => setNewGame(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addGame();
                }
              }}
              aria-label={t("settings.addGamePlaceholder")}
            />
            <button type="button" onClick={addGame}>
              {t("settings.add")}
            </button>
          </div>
          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={obeyPriority}
                onChange={(e) => {
                  setObeyPriority(e.target.checked);
                }}
              />
              <span>{t("settings.obey")}</span>
            </label>
          </div>
        </section>
        <section className="priority-panel priority-panel-list">
          <div className="label">{t("settings.priorityGames")}</div>
          <p className="meta">{t("settings.drag")}</p>
          {priorityGames.length === 0 ? <p className="meta">{t("settings.noneEntries")}</p> : null}
          {priorityGames.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={priorityGames} strategy={verticalListSortingStrategy}>
                <ul className="priority-list">
                  {priorityGames.map((game) => (
                    <SortablePriorityItem
                      key={game}
                      game={game}
                      dragLabel={t("settings.drag")}
                      removeLabel={t("settings.remove")}
                      onRemove={removeGame}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </section>
      </div>
    </div>
  );
}
