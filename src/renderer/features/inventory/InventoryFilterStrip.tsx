import * as React from "react";
import type { FilterKey } from "@renderer/shared/types";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";

export type FilterChipKey = Exclude<FilterKey, "excluded">;

export type InventoryFilterStripProps = {
  filter: FilterKey;
  onFilterChange: (key: FilterKey) => void;
  counts?: Partial<Record<FilterChipKey, number>>;
};

export function InventoryFilterStrip({
  filter,
  onFilterChange,
  counts,
}: InventoryFilterStripProps) {
  const { t } = useI18n();

  const CHIP_DEFS = React.useMemo(
    () => [
      { key: "all" as FilterChipKey, label: t("inventory.filter.all") },
      { key: "priority-games" as FilterChipKey, label: t("inventory.filter.priority") },
      { key: "in-progress" as FilterChipKey, label: t("inventory.filter.live") },
      { key: "upcoming" as FilterChipKey, label: t("inventory.filter.upcoming") },
      { key: "finished" as FilterChipKey, label: t("inventory.filter.claimed") },
      { key: "not-linked" as FilterChipKey, label: t("inventory.filter.notLinked") },
      { key: "expired" as FilterChipKey, label: t("inventory.filter.expired") },
    ],
    [t],
  );

  const active: FilterChipKey = filter === "excluded" ? "all" : (filter as FilterChipKey);
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("inventory.filter.aria")}>
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
