import * as React from "react";
import type { FilterKey } from "@renderer/shared/types";
import { cn } from "@renderer/shared/lib/utils";

export type FilterChipKey = Exclude<FilterKey, "excluded">;

export type InventoryFilterStripProps = {
  filter: FilterKey;
  onFilterChange: (key: FilterKey) => void;
  counts?: Partial<Record<FilterChipKey, number>>;
};

const CHIP_DEFS: Array<{ key: FilterChipKey; label: string }> = [
  { key: "all", label: "all" },
  { key: "priority-games", label: "priority" },
  { key: "in-progress", label: "live" },
  { key: "upcoming", label: "upcoming" },
  { key: "finished", label: "claimed" },
  { key: "not-linked", label: "not linked" },
  { key: "expired", label: "expired" },
];

export function InventoryFilterStrip({
  filter,
  onFilterChange,
  counts,
}: InventoryFilterStripProps) {
  const active: FilterChipKey = filter === "excluded" ? "all" : (filter as FilterChipKey);
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Inventory filter">
      {CHIP_DEFS.map((def) => {
        const isActive = def.key === active;
        const count = counts?.[def.key];
        return (
          <button
            key={def.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onFilterChange(def.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--dp-radius-sm)] border px-2.5 py-1",
              "font-mono text-[11px] tracking-[0.02em] transition-colors",
              isActive
                ? "border-[color:var(--dp-accent-soft)] bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]"
                : "border-[color:var(--dp-border)] bg-transparent text-[color:var(--dp-text-dim)] hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text)]",
            )}
          >
            <span>{def.label}</span>
            {typeof count === "number" && (
              <span
                className={cn(
                  "font-mono text-[10px]",
                  isActive
                    ? "text-[color:var(--dp-accent)] opacity-90"
                    : "text-[color:var(--dp-text-dimmer)]",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
