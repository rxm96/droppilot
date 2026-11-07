import { Button } from "@renderer/shared/components/ui/button";
import { Search, RotateCw } from "@renderer/shared/lib/icons";
import { useI18n } from "@renderer/shared/i18n";

export type DropsHeaderProps = {
  totalDrops: number;
  totalGames: number;
  search: string;
  onSearchChange: (next: string) => void;
  refreshing: boolean;
  refreshDisabled: boolean;
  onRefresh: () => void;
};

/** "Drops" title, the mono count line, search and refresh. */
export function DropsHeader({
  totalDrops,
  totalGames,
  search,
  onSearchChange,
  refreshing,
  refreshDisabled,
  onRefresh,
}: DropsHeaderProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="m-0 text-[22px] font-semibold text-[color:var(--dp-text)]">
          {t("drops.title")}
        </h1>
        <div className="mt-1 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t(totalDrops === 1 ? "drops.count.one" : "drops.count.other", { count: totalDrops })}
          {" · "}
          {t(totalGames === 1 ? "drops.games.one" : "drops.games.other", { count: totalGames })}
          {" · "}
          {t("drops.sorted")}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 w-[260px] max-w-full items-center gap-2 rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-3 font-mono text-[12px] text-[color:var(--dp-text-dimmer)] focus-within:border-[color:var(--dp-accent)]">
          <Search size={14} strokeWidth={1.7} aria-hidden="true" />
          <span className="sr-only">{t("drops.searchLabel")}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("drops.searchPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-[color:var(--dp-text)] outline-none placeholder:text-[color:var(--dp-text-dimmer)]"
          />
        </label>
        <Button
          variant="dp-outline"
          size="dp-lg"
          onClick={onRefresh}
          disabled={refreshDisabled}
          title={t("drops.refreshTitle")}
        >
          <RotateCw
            size={14}
            strokeWidth={1.7}
            className={refreshing ? "animate-spin" : undefined}
          />
          {refreshing ? t("drops.refreshing") : t("drops.refresh")}
        </Button>
      </div>
    </div>
  );
}
