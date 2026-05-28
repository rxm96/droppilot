import * as React from "react";
import { Input } from "@renderer/shared/components/ui/input";
import { Button } from "@renderer/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";
import { Search, RotateCw, ExternalLink } from "@renderer/shared/lib/icons";
import { useI18n } from "@renderer/shared/i18n";

export type InventoryHeaderProps = {
  totalDrops: number;
  filteredDrops: number;
  search: string;
  onSearchChange: (next: string) => void;
  gameFilter: string;
  onGameFilterChange: (next: string) => void;
  uniqueGames: string[];
  refreshing: boolean;
  refreshDisabled: boolean;
  onRefresh: () => void;
  unlinkedCount: number;
  onOpenAccountLink: () => void;
};

export function InventoryHeader({
  totalDrops,
  filteredDrops,
  search,
  onSearchChange,
  gameFilter,
  onGameFilterChange,
  uniqueGames,
  refreshing,
  refreshDisabled,
  onRefresh,
  unlinkedCount,
  onOpenAccountLink,
}: InventoryHeaderProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[color:var(--dp-text)] leading-tight">
            {t("inventory.header.title")}
          </h2>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mt-1">
            {t(
              totalDrops === 1 ? "inventory.header.countOf.one" : "inventory.header.countOf.other",
              { shown: filteredDrops, total: totalDrops },
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={13}
              strokeWidth={1.7}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--dp-text-dimmer)] pointer-events-none"
            />
            <Input
              tone="dp"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("inventory.header.searchPlaceholder")}
              className="pl-7 w-[200px]"
            />
          </div>
          <Select value={gameFilter} onValueChange={onGameFilterChange}>
            <SelectTrigger tone="dp" className="min-w-[160px]" aria-label="Filter by game">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("inventory.header.allGames")}</SelectItem>
                {uniqueGames.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="dp-secondary"
            size="dp-md"
            onClick={onRefresh}
            disabled={refreshDisabled}
            title={t("inventory.header.refreshTitle")}
          >
            <RotateCw
              size={11}
              strokeWidth={1.8}
              className={refreshing ? "animate-spin" : undefined}
            />
            {refreshing ? t("inventory.header.refreshing") : t("inventory.header.refresh")}
          </Button>
        </div>
      </div>

      {unlinkedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--dp-radius-md)] border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.06)] px-4 py-2">
          <div className="font-mono text-[11px] text-[color:var(--dp-signal-warn)]">
            {t(
              unlinkedCount === 1
                ? "inventory.header.dropsNeedLink.one"
                : "inventory.header.dropsNeedLink.other",
              { count: unlinkedCount },
            )}
          </div>
          <Button variant="dp-outline" size="dp-sm" onClick={onOpenAccountLink}>
            <ExternalLink size={11} strokeWidth={1.8} /> {t("inventory.header.linkAccount")}
          </Button>
        </div>
      )}
    </div>
  );
}
