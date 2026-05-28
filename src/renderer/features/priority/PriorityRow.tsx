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

const STATE_TONE: Record<PriorityRowState, "accent" | "ok" | "info" | "dim"> = {
  watching: "accent",
  target: "ok",
  live: "info",
  idle: "dim",
};

export function PriorityRow({ rank, game, state, onRemove }: PriorityRowProps) {
  const { t } = useI18n();

  const STATE_LABEL = React.useMemo<Record<PriorityRowState, string>>(
    () => ({
      watching: t("priorities.state.watching"),
      target: t("priorities.state.target"),
      live: t("priorities.state.live"),
      idle: t("priorities.state.idle"),
    }),
    [t],
  );

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
    gridTemplateColumns: "32px 40px 1fr 100px 32px",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group grid items-center gap-3 px-4 h-[52px] border-b border-[color:var(--dp-border-soft)] last:border-b-0",
        "transition-colors hover:bg-[color:var(--dp-bg-elevated-2)]",
        isDragging && "bg-[color:var(--dp-bg-elevated-2)] shadow-[0_4px_16px_rgba(0,0,0,0.4)]",
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
          "flex h-6 w-6 items-center justify-center rounded-[var(--dp-radius-xs)] cursor-grab active:cursor-grabbing",
          "text-[color:var(--dp-text-dimmer)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-accent)]",
          "hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text-dim)]",
          isDragging && "opacity-100",
        )}
      >
        <GripVertical size={13} strokeWidth={1.7} />
      </button>

      <span className="font-mono text-[12px] text-[color:var(--dp-text-dimmer)] tabular-nums">
        {padPriorityRank(rank)}
      </span>

      <span className="flex items-center gap-2 min-w-0">
        {state === "watching" && (
          <span
            aria-hidden="true"
            className="inline-block h-[5px] w-[5px] rounded-full bg-[color:var(--dp-accent)] flex-shrink-0 animate-pulse"
            style={{ boxShadow: "0 0 6px var(--dp-accent-glow)" }}
          />
        )}
        <span className="truncate text-[13px] text-[color:var(--dp-text)]">{game}</span>
      </span>

      <span className="flex justify-start">
        <Pill tone={STATE_TONE[state]} dot={state === "watching" || state === "target"}>
          {STATE_LABEL[state]}
        </Pill>
      </span>

      <button
        type="button"
        onClick={() => onRemove(game)}
        aria-label={t("priorities.row.removeAria", { game })}
        title={t("priorities.row.removeAria", { game })}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-[var(--dp-radius-xs)]",
          "text-[color:var(--dp-text-dimmer)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-signal-err)]",
          "hover:bg-[rgba(248,113,113,0.10)] hover:text-[color:var(--dp-signal-err)]",
          "transition-colors",
        )}
      >
        <X size={13} strokeWidth={1.8} />
      </button>
    </li>
  );
}
