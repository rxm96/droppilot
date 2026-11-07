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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DropStatusPill } from "@renderer/shared/components/DropStatusPill";
import { GameTile } from "@renderer/shared/components/GameTile";
import { Button } from "@renderer/shared/components/ui/button";
import { ChevronDown, ChevronUp, GripVertical, X } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import { FarmingPill, GameMetaLine } from "./GameMetaLine";
import { adjacentGame, type GamesRow } from "./gamesModel";

export type GamesOrderPanelProps = {
  rows: GamesRow[];
  priorityGames: string[];
  movePriorityGame: (activeGame: string, overGame: string) => void;
  removeGame: (name: string) => void;
  newGame: string;
  setNewGame: (val: string) => void;
  addGame: () => void;
};

const ICON_BUTTON = cn(
  "grid h-[30px] w-[30px] flex-none place-items-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] transition-colors",
  "hover:bg-[color:var(--dp-bg-elevated-2)] hover:text-[color:var(--dp-text)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dp-accent)]",
  "disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[color:var(--dp-text-dimmer)]",
);

const ROW_BASE = "relative flex items-center gap-3.5 py-3 pl-[18px] pr-3";

/** Rank, tile, name with pills and the meta line. */
function RowSummary({ row }: { row: GamesRow }) {
  return (
    <>
      <span
        className={cn(
          "w-5 flex-none font-mono text-[12px] tabular-nums",
          row.farming ? "text-[color:var(--dp-accent)]" : "text-[color:var(--dp-text-dimmer)]",
        )}
      >
        {row.rank}
      </span>
      <GameTile url={row.imageUrl} code={row.code} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-[color:var(--dp-text)]">
          <span className="truncate">{row.game}</span>
          {row.farming && <FarmingPill />}
          {row.needsLink && <DropStatusPill status="needs-link" />}
        </div>
        <GameMetaLine meta={row.meta} variant="left" />
      </div>
    </>
  );
}

function OrderRow({
  row,
  onMove,
  onRemove,
}: {
  row: GamesRow;
  onMove: (game: string, direction: -1 | 1) => void;
  onRemove: (game: string) => void;
}) {
  const { t } = useI18n();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.game });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // While dragging, the lifted copy is rendered in the DragOverlay; hide
        // the original (it keeps its slot) so there is no transform-reset flicker.
        opacity: isDragging ? 0 : 1,
      }}
      className={cn(
        ROW_BASE,
        "group border-t border-[color:var(--dp-border)] first:border-t-0",
        row.farming && "bg-[color:var(--dp-accent-soft)]",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t("games.row.drag", { game: row.game })}
        title={t("games.row.drag", { game: row.game })}
        className={cn(
          "absolute left-0.5 top-1/2 grid h-6 w-4 -translate-y-1/2 cursor-grab place-items-center text-[color:var(--dp-text-dimmer)] active:cursor-grabbing",
          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[color:var(--dp-accent)]",
        )}
      >
        <GripVertical size={12} strokeWidth={1.7} />
      </button>
      <RowSummary row={row} />
      <button
        type="button"
        className={ICON_BUTTON}
        disabled={row.isFirst}
        onClick={() => onMove(row.game, -1)}
        aria-label={t("games.row.moveUp", { game: row.game })}
        title={t("games.row.moveUp", { game: row.game })}
      >
        <ChevronUp size={14} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className={ICON_BUTTON}
        disabled={row.isLast}
        onClick={() => onMove(row.game, 1)}
        aria-label={t("games.row.moveDown", { game: row.game })}
        title={t("games.row.moveDown", { game: row.game })}
      >
        <ChevronDown size={14} strokeWidth={1.7} />
      </button>
      <button
        type="button"
        className={cn(ICON_BUTTON, "hover:text-[color:var(--dp-signal-err)]")}
        onClick={() => onRemove(row.game)}
        aria-label={t("games.row.remove", { game: row.game })}
        title={t("games.row.remove", { game: row.game })}
      >
        <X size={14} strokeWidth={1.7} />
      </button>
    </li>
  );
}

/** "your order": the ranked list (▲ ▼ ✕, drag) and the add-by-name field. */
export function GamesOrderPanel({
  rows,
  priorityGames,
  movePriorityGame,
  removeGame,
  newGame,
  setNewGame,
  addGame,
}: GamesOrderPanelProps) {
  const { t } = useI18n();
  const headingId = React.useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [draggedGame, setDraggedGame] = React.useState<string | null>(null);
  const handleDragStart = React.useCallback(({ active }: DragStartEvent) => {
    setDraggedGame(String(active.id));
  }, []);
  const handleDragCancel = React.useCallback(() => setDraggedGame(null), []);
  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      setDraggedGame(null);
      if (!over) return;
      const activeGame = String(active.id);
      const overGame = String(over.id);
      if (activeGame !== overGame) movePriorityGame(activeGame, overGame);
    },
    [movePriorityGame],
  );

  const handleMove = React.useCallback(
    (game: string, direction: -1 | 1) => {
      const neighbour = adjacentGame(priorityGames, game, direction);
      if (neighbour !== null) movePriorityGame(game, neighbour);
    },
    [movePriorityGame, priorityGames],
  );

  const draggedRow = draggedGame ? rows.find((row) => row.game === draggedGame) : undefined;

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]"
    >
      <div className="flex items-center justify-between border-b border-[color:var(--dp-border)] px-[18px] py-3.5">
        <h2
          id={headingId}
          className="m-0 font-mono text-[11px] font-normal text-[color:var(--dp-text-dimmer)]"
        >
          {t("games.order.title")}
        </h2>
        <span className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t(rows.length === 1 ? "games.count.one" : "games.count.other", { count: rows.length })}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="m-0 px-[18px] py-6 text-[13px] text-[color:var(--dp-text-dim)]">
          {t("games.order.empty")}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={priorityGames} strategy={verticalListSortingStrategy}>
            <ol className="m-0 list-none p-0">
              {rows.map((row) => (
                <OrderRow key={row.game} row={row} onMove={handleMove} onRemove={removeGame} />
              ))}
            </ol>
          </SortableContext>
          <DragOverlay>
            {draggedRow ? (
              <div
                className={cn(
                  ROW_BASE,
                  "cursor-grabbing rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated-2)] shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
                )}
              >
                <RowSummary row={draggedRow} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      <form
        className="flex gap-2 border-t border-[color:var(--dp-border)] bg-[color:var(--dp-bg-app)] px-[18px] py-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          addGame();
        }}
      >
        <label className="flex h-9 min-w-0 flex-1 items-center rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-3 font-mono text-[12px] focus-within:border-[color:var(--dp-accent)]">
          <span className="sr-only">{t("games.add.label")}</span>
          <input
            value={newGame}
            onChange={(e) => setNewGame(e.target.value)}
            placeholder={t("games.add.placeholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-[color:var(--dp-text)] outline-none placeholder:text-[color:var(--dp-text-dimmer)]"
          />
        </label>
        <Button type="submit" variant="dp-outline" size="dp-lg" disabled={!newGame.trim()}>
          {t("games.add.button")}
        </Button>
      </form>
    </section>
  );
}
