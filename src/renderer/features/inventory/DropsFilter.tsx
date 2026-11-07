import type { FilterKey } from "@renderer/shared/types";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "drops.filter.all" },
  { key: "farming", label: "drops.filter.farming" },
  { key: "needs-you", label: "drops.filter.needsYou" },
  { key: "claimed", label: "drops.filter.claimed" },
  { key: "not-farmed", label: "drops.filter.notFarmed" },
];

export type DropsFilterProps = {
  filter: FilterKey;
  counts: Record<FilterKey, number>;
  onFilterChange: (key: FilterKey) => void;
};

/** Segmented filter: all · farming · needs you · claimed · not farmed, with counts. */
export function DropsFilter({ filter, counts, onFilterChange }: DropsFilterProps) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("drops.filter.aria")}
      className="flex flex-wrap gap-0.5 self-start rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-[3px]"
    >
      {FILTERS.map(({ key, label }) => {
        const active = key === filter;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onFilterChange(key)}
            className={cn(
              "inline-flex min-h-[30px] items-center gap-2 rounded-[var(--dp-radius-sm)] px-3 font-mono text-[12px] transition-colors",
              active
                ? "bg-[color:var(--dp-bg-elevated-2)] text-[color:var(--dp-text)]"
                : "text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-text)]",
            )}
          >
            {t(label)}
            <span className="text-[color:var(--dp-text-dimmer)] tabular-nums">{counts[key]}</span>
          </button>
        );
      })}
    </div>
  );
}
