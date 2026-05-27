import * as React from "react";
import type { InventoryItem } from "@renderer/shared/types";
import { Table, TableHead, TableRow, TableCell } from "@renderer/shared/components/ui/table";
import { Pill } from "@renderer/shared/components/ui/pill";
import { ChevronUp, ChevronDown } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import type { DropSortKey, SortDirection } from "./inventoryFilters";
import { dropStatusLabel, dropStatusTone, dropTitleFallback } from "./inventoryFormatters";
import { formatHourMinute, formatPercent } from "@renderer/features/overview/formatters";

export type InventoryTableProps = {
  items: InventoryItem[];
  sort: { key: DropSortKey; direction: SortDirection } | null;
  onToggleSort: (key: DropSortKey) => void;
  selectedDropId: string | null;
  onSelectDrop: (id: string) => void;
  emptyMessage: string;
};

type ColumnDef = {
  key: DropSortKey | null;
  label: string;
  sortable: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: null, label: "", sortable: false }, // thumbnail
  { key: "title", label: "drop · game", sortable: true },
  { key: "watched", label: "watched", sortable: true },
  { key: "progress", label: "progress", sortable: true },
  { key: "status", label: "status", sortable: true },
];

const COLUMNS_TEMPLATE = "36px 2fr 1fr 1.4fr 100px";

export function InventoryTable({
  items,
  sort,
  onToggleSort,
  selectedDropId,
  onSelectDrop,
  emptyMessage,
}: InventoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-12 text-center">
        <p className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] overflow-hidden">
      <Table columns={COLUMNS_TEMPLATE}>
        <TableHead>
          {COLUMNS.map((col, idx) => (
            <SortHeader key={idx} col={col} sort={sort} onToggleSort={onToggleSort} />
          ))}
        </TableHead>
        {items.map((item) => {
          const isSelected = item.id === selectedDropId;
          const progressPct =
            item.requiredMinutes > 0
              ? Math.round((item.earnedMinutes / item.requiredMinutes) * 100)
              : 0;
          const thumbUrl = item.imageUrl?.trim() || item.campaignImageUrl?.trim() || "";
          return (
            <TableRow
              key={item.id}
              interactive
              onClick={() => onSelectDrop(item.id)}
              className={isSelected ? "bg-[color:var(--dp-bg-elevated-2)]" : undefined}
            >
              <TableCell>
                <DropThumb url={thumbUrl} game={item.game} />
              </TableCell>
              <TableCell>
                <div className="truncate text-[color:var(--dp-text)]">
                  {dropTitleFallback(item)}
                </div>
                <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mt-0.5 truncate">
                  {item.game || "—"}
                </div>
              </TableCell>
              <TableCell mono dim={item.earnedMinutes === 0}>
                {item.earnedMinutes > 0 ? formatHourMinute(item.earnedMinutes) : "—"}
              </TableCell>
              <TableCell>
                <ProgressCell pct={progressPct} status={item.status} />
              </TableCell>
              <TableCell>
                <Pill tone={dropStatusTone(item)} dot={item.status === "progress"}>
                  {dropStatusLabel(item)}
                </Pill>
              </TableCell>
            </TableRow>
          );
        })}
      </Table>
    </div>
  );
}

function SortHeader({
  col,
  sort,
  onToggleSort,
}: {
  col: ColumnDef;
  sort: InventoryTableProps["sort"];
  onToggleSort: InventoryTableProps["onToggleSort"];
}) {
  if (!col.sortable || !col.key) {
    return <span>{col.label}</span>;
  }
  const isActive = sort?.key === col.key;
  const dir = isActive ? sort.direction : null;
  return (
    <button
      type="button"
      onClick={() => onToggleSort(col.key!)}
      className={cn(
        "inline-flex items-center gap-1 transition-colors cursor-pointer",
        "font-mono text-[9px] uppercase tracking-[0.12em]",
        isActive
          ? "text-[color:var(--dp-accent)]"
          : "text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-text-dim)]",
      )}
    >
      {col.label}
      {dir === "asc" && <ChevronUp size={10} strokeWidth={2} />}
      {dir === "desc" && <ChevronDown size={10} strokeWidth={2} />}
    </button>
  );
}

function DropThumb({ url, game }: { url: string; game: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="block w-9 h-9 rounded-[var(--dp-radius-md)] object-cover border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated-2)]"
      />
    );
  }
  const initials = (game || "?").trim().slice(0, 2).toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center w-9 h-9 rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-accent-soft)] font-mono text-[10px] text-[color:var(--dp-accent)]"
    >
      {initials}
    </div>
  );
}

function ProgressCell({ pct, status }: { pct: number; status: InventoryItem["status"] }) {
  const safePct = Math.max(0, Math.min(100, pct));
  const fillColor =
    status === "claimed"
      ? "var(--dp-signal-ok)"
      : status === "progress"
        ? "var(--dp-accent)"
        : "var(--dp-text-dimmer)";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-[3px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
        <div
          className="h-full"
          style={{
            width: `${safePct}%`,
            background: fillColor,
          }}
        />
      </div>
      <span className="font-mono text-[11px] text-[color:var(--dp-text-dim)] flex-shrink-0 tabular-nums w-[34px] text-right">
        {formatPercent(safePct)}
      </span>
    </div>
  );
}
