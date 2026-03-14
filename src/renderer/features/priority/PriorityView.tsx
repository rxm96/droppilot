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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";

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

type PriorityCardProps = {
  rank: number;
  game: string;
  isTarget: boolean;
  isWatching: boolean;
  isLive: boolean;
  dragLabel: string;
  removeLabel: string;
  onRemove: (name: string) => void;
  dragHandleProps: ButtonHTMLAttributes<HTMLButtonElement>;
  setDragHandleRef?: (element: HTMLButtonElement | null) => void;
};

const NO_GAME_SELECT_VALUE = "__dp_none__";

export const getSelectableDropGames = (uniqueGames: string[], priorityGames: string[]): string[] =>
  uniqueGames.filter((game) => !priorityGames.includes(game));

function PriorityCard({
  rank,
  game,
  isTarget,
  isWatching,
  isLive,
  dragLabel,
  removeLabel,
  onRemove,
  dragHandleProps,
  setDragHandleRef,
}: PriorityCardProps) {
  const { t } = useI18n();
  const stateLabel = isWatching
    ? t("priorities.state.watching")
    : isTarget
      ? t("priorities.state.target")
      : isLive
        ? t("priorities.state.live")
        : t("priorities.state.idle");
  return (
    <div className="priority-list-card">
      <div className="priority-item-main">
        <div className="priority-rank" aria-label={t("priorities.rank", { rank })}>
          {rank}
        </div>
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
        <div className="priority-game-copy">
          <span className="priority-game-name">{game}</span>
          <span className="priority-game-meta">{stateLabel}</span>
        </div>
      </div>
      <div className="priority-actions">
        {(isTarget || isWatching) && (
          <span className={isWatching ? "priority-state-chip is-watching" : "priority-state-chip"}>
            {isWatching ? t("priorities.badge.watching") : t("priorities.badge.target")}
          </span>
        )}
        <button type="button" className="ghost" onClick={() => onRemove(game)}>
          {removeLabel}
        </button>
      </div>
    </div>
  );
}

type SortablePriorityItemProps = {
  rank: number;
  game: string;
  isTarget: boolean;
  isWatching: boolean;
  isLive: boolean;
  dragLabel: string;
  removeLabel: string;
  onRemove: (name: string) => void;
};

function SortablePriorityItem({
  rank,
  game,
  isTarget,
  isWatching,
  isLive,
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
    <li
      ref={setNodeRef}
      style={style}
      className={isDragging ? "priority-list-item sortable-dragging" : "priority-list-item"}
    >
      <PriorityCard
        rank={rank}
        game={game}
        isTarget={isTarget}
        isWatching={isWatching}
        isLive={isLive}
        dragLabel={dragLabel}
        removeLabel={removeLabel}
        onRemove={onRemove}
        setDragHandleRef={setActivatorNodeRef}
        dragHandleProps={
          {
            ...attributes,
            ...listeners,
          } as ButtonHTMLAttributes<HTMLButtonElement>
        }
      />
    </li>
  );
}

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
  const { t } = useI18n();
  const countLabel = t("priorities.count", { count: priorityGames.length });
  const selectableDropGames = getSelectableDropGames(uniqueGames, priorityGames);
  const hasSelectableSelectedGame = selectableDropGames.includes(selectedGame);
  const liveGameSet = new Set(uniqueGames);
  const livePriorityCount = priorityGames.filter((game) => liveGameSet.has(game)).length;
  const topGame = priorityGames[0] ?? "";
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
      <div className="priority-summary-grid">
        <section className="priority-summary-card">
          <span className="label">{t("priorities.currentTarget")}</span>
          <strong className="priority-summary-value">
            {activeTargetGame || t("priorities.noneSelected")}
          </strong>
          <p className="meta">
            {watchingGame
              ? t("priorities.currentTargetWatching", { game: watchingGame })
              : obeyPriority
                ? t("priorities.modeStrict")
                : t("priorities.modeFlexible")}
          </p>
        </section>
        <section className="priority-summary-card">
          <span className="label">{t("priorities.queueHealth")}</span>
          <strong className="priority-summary-value">
            {livePriorityCount}/{priorityGames.length || 0}
          </strong>
          <p className="meta">{t("priorities.queueHealthHint")}</p>
        </section>
        <section className="priority-summary-card">
          <span className="label">{t("priorities.topSlot")}</span>
          <strong className="priority-summary-value">
            {topGame || t("priorities.noneSelected")}
          </strong>
          <p className="meta">{t("priorities.topSlotHint")}</p>
        </section>
      </div>
      <div className="priority-split">
        <section className="priority-panel">
          <div className="priority-panel-head">
            <div>
              <div className="label">{t("priorities.addTitle")}</div>
              <p className="meta">{t("priorities.addHint")}</p>
            </div>
          </div>
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
                  <SelectGroup>
                    <SelectItem value={NO_GAME_SELECT_VALUE}>
                      {t("settings.addFromDropsOption")}
                    </SelectItem>
                    {selectableDropGames.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={addGameFromSelect}
                disabled={!hasSelectableSelectedGame}
                className="priority-add-button"
              >
                {t("settings.add")}
              </button>
            </div>
          )}
          {selectableDropGames.length === 0 && (
            <div className="priority-empty-note">{t("priorities.addEmpty")}</div>
          )}
          <div className="priority-manual-block">
            <div className="label">{t("priorities.manualTitle")}</div>
            <p className="meta">{t("priorities.manualHint")}</p>
          </div>
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
            <button type="button" onClick={addGame} className="priority-add-button">
              {t("settings.add")}
            </button>
          </div>
          <div className="priority-rule-card">
            <div>
              <div className="label">{t("priorities.ruleTitle")}</div>
              <p className="meta">
                {obeyPriority ? t("priorities.ruleStrictHint") : t("priorities.ruleFlexibleHint")}
              </p>
            </div>
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
          <div className="priority-panel-head">
            <div>
              <div className="label">{t("settings.priorityGames")}</div>
              <p className="meta">{t("priorities.queueHint")}</p>
            </div>
          </div>
          {priorityGames.length === 0 ? <p className="meta">{t("settings.noneEntries")}</p> : null}
          {priorityGames.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={priorityGames} strategy={verticalListSortingStrategy}>
                <ul className="priority-list">
                  {priorityGames.map((game, index) => (
                    <SortablePriorityItem
                      key={game}
                      rank={index + 1}
                      game={game}
                      isTarget={game === activeTargetGame}
                      isWatching={game === watchingGame}
                      isLive={liveGameSet.has(game)}
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
