import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "@renderer/shared/lib/icons";
import { Pill } from "@renderer/shared/components/ui/pill";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import { padPriorityRank, type PriorityRowState } from "./priorityHelpers";

export type PriorityRowProps = {
  rank: number;
  game: string;
  state: PriorityRowState;
  onRemove: (game: string) => void;
};

const GRID_COLS = "32px 40px 1fr 150px 32px";
const ROW_BASE = "group grid items-center gap-3 px-4 h-[52px]";

const STATE_TONE: Record<PriorityRowState, "accent" | "ok" | "info" | "dim"> = {
  watching: "accent",
  target: "ok",
  live: "info",
  idle: "dim",
};

function useStateLabels(): Record<PriorityRowState, string> {
  const { t } = useI18n();
  return React.useMemo(
    () => ({
      watching: t("priorities.state.watching"),
      target: t("priorities.state.target"),
      live: t("priorities.state.live"),
      idle: t("priorities.state.idle"),
    }),
    [t],
  );
}

/** Shared visual cells (rank / name / status pill) — grid columns 2–4. */
function RowCells({ rank, game, state }: { rank: number; game: string; state: PriorityRowState }) {
  const labels = useStateLabels();
  return (
    <>
      <span className="font-mono text-[12px] text-[color:var(--dp-text-dimmer)] tabular-nums">
        {padPriorityRank(rank)}
      </span>

      <span className="flex min-w-0 items-center gap-2">
        {state === "watching" && (
          <span
            aria-hidden="true"
            className="inline-block h-[5px] w-[5px] flex-shrink-0 animate-pulse rounded-full bg-[color:var(--dp-accent)]"
            style={{ boxShadow: "0 0 6px var(--dp-accent-glow)" }}
          />
        )}
        <span className="truncate text-[13px] text-[color:var(--dp-text)]">{game}</span>
      </span>

      <span className="flex justify-start">
        <Pill tone={STATE_TONE[state]} dot={state === "watching" || state === "target"}>
          {labels[state]}
        </Pill>
      </span>
    </>
  );
}

export function PriorityRow({ rank, game, state, onRemove }: PriorityRowProps) {
  const { t } = useI18n();

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: game });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridTemplateColumns: GRID_COLS,
    // While dragging, the visible "lifted" copy is rendered in the DragOverlay;
    // hide the original (keeps its slot) so there's no transform-reset flicker.
    opacity: isDragging ? 0 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        ROW_BASE,
        "border-b border-[color:var(--dp-border-soft)] last:border-b-0",
        "transition-colors hover:bg-[color:var(--dp-bg-elevated-2)]",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t("priorities.row.dragAria", { game })}
        title={t("priorities.row.dragAria", { game })}
        className={cn(
          "flex h-6 w-6 cursor-grab items-center justify-center rounded-[var(--dp-radius-xs)] active:cursor-grabbing",
          "text-[color:var(--dp-text-dimmer)] opacity-0 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-accent)] group-hover:opacity-100",
          "hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text-dim)]",
        )}
      >
        <GripVertical size={13} strokeWidth={1.7} />
      </button>

      <RowCells rank={rank} game={game} state={state} />

      <button
        type="button"
        onClick={() => onRemove(game)}
        aria-label={t("priorities.row.removeAria", { game })}
        title={t("priorities.row.removeAria", { game })}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-[var(--dp-radius-xs)]",
          "text-[color:var(--dp-text-dimmer)] opacity-0 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-signal-err)] group-hover:opacity-100",
          "hover:bg-[rgba(248,113,113,0.10)] hover:text-[color:var(--dp-signal-err)]",
          "transition-colors",
        )}
      >
        <X size={13} strokeWidth={1.8} />
      </button>
    </li>
  );
}

/** Presentational clone rendered inside the DndContext's DragOverlay. */
export function PriorityRowOverlay({
  rank,
  game,
  state,
}: {
  rank: number;
  game: string;
  state: PriorityRowState;
}) {
  return (
    <div
      style={{ gridTemplateColumns: GRID_COLS }}
      className={cn(
        ROW_BASE,
        "cursor-grabbing rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)]",
        "bg-[color:var(--dp-bg-elevated-2)] shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center text-[color:var(--dp-text-dim)]">
        <GripVertical size={13} strokeWidth={1.7} />
      </span>
      <RowCells rank={rank} game={game} state={state} />
      <span aria-hidden="true" />
    </div>
  );
}
