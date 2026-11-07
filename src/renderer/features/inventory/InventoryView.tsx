import * as React from "react";
import type {
  CampaignSummary,
  FilterKey,
  InventoryItem,
  InventoryState,
} from "@renderer/shared/types";
import type { FarmPlan } from "@renderer/shared/domain/farmPlan";
import { ChevronDown } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";
import { useI18n } from "@renderer/shared/i18n";
import { buildDropsView } from "./dropsModel";
import { useInventoryViewState } from "./useInventoryViewState";
import { DropsHeader } from "./DropsHeader";
import { DropsFilter } from "./DropsFilter";
import { DropGroup } from "./DropGroup";

type InventoryProps = {
  inventory: InventoryState;
  filter: FilterKey;
  onFilterChange: (key: FilterKey) => void;
  refreshing: boolean;
  onRefresh: () => void;
  campaigns: CampaignSummary[];
  isLinked: boolean;
  /** The overview's farm plan: ready times and farm order. */
  farmPlan: FarmPlan;
  /** The user's ranked games (resolvePriorityGameNames). */
  rankedGames: string[];
  /** The watched drop with its live minutes; null while paused or idle. */
  activeDrop: { id: string; earnedMinutes: number } | null;
  watchingChannel: string | null;
  onAddPriorityGame: (game: string) => void;
  onOpenAccountLink: (url?: string) => void;
};

/** The drops view: every drop, grouped by game in farm order. */
export function InventoryView({
  inventory,
  filter,
  onFilterChange,
  refreshing,
  onRefresh,
  campaigns,
  isLinked,
  farmPlan,
  rankedGames,
  activeDrop,
  watchingChannel,
  onAddPriorityGame,
  onOpenAccountLink,
}: InventoryProps) {
  const { t } = useI18n();
  const state = useInventoryViewState();

  const allItems: InventoryItem[] = React.useMemo(() => {
    if (inventory.status === "ready") return inventory.items;
    if (inventory.status === "error" && inventory.items) return inventory.items;
    return [];
  }, [inventory]);

  const view = React.useMemo(
    () =>
      buildDropsView({
        items: allItems,
        campaigns,
        plan: farmPlan,
        rankedGames,
        activeDrop,
        watchingChannel,
        filter,
        search: state.search,
        now: Date.now(),
      }),
    [activeDrop, allItems, campaigns, farmPlan, filter, rankedGames, state.search, watchingChannel],
  );

  const inventoryErrorText =
    inventory.status === "error"
      ? resolveErrorMessage(t, { code: inventory.code, message: inventory.message })
      : null;
  const isLoading = inventory.status === "loading";
  const emptyMessage = !isLinked
    ? t("drops.empty.signedOut")
    : isLoading
      ? t("drops.empty.loading")
      : allItems.length > 0
        ? t("drops.empty.noMatch")
        : t("drops.empty.none");

  // From the plan, not the filtered view: a search can hide the watching row.
  const farmingGame =
    farmPlan.rows.find((r) => r.kind === "drop" && r.status === "watching")?.game ?? null;

  const groupProps = {
    openDropId: state.openDropId,
    onToggleDrop: state.toggleDrop,
    campaigns,
    rankedGames,
    farmingGame,
    onAddPriorityGame,
    onOpenAccountLink,
  };

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-[18px]">
      <DropsHeader
        totalDrops={view.totalDrops}
        totalGames={view.totalGames}
        search={state.search}
        onSearchChange={state.setSearch}
        refreshing={refreshing}
        refreshDisabled={refreshing || isLoading}
        onRefresh={onRefresh}
      />

      <DropsFilter filter={filter} counts={view.counts} onFilterChange={onFilterChange} />

      {view.groups.length === 0 ? (
        <div className="rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-12 text-center text-[13px] text-[color:var(--dp-text-dimmer)]">
          {emptyMessage}
        </div>
      ) : (
        view.groups.map((group) => (
          <DropGroup key={group.game} group={group} actions {...groupProps} />
        ))
      )}

      {view.expired.length > 0 && (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={state.expiredOpen}
            onClick={state.toggleExpired}
            className="inline-flex items-center gap-2 self-start font-mono text-[12px] text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-text)]"
          >
            <ChevronDown
              size={12}
              strokeWidth={1.8}
              className={cn("transition-transform", !state.expiredOpen && "-rotate-90")}
            />
            {t("drops.expired.toggle", { count: view.expiredCount })}
          </button>
          {state.expiredOpen &&
            view.expired.map((group) => (
              <DropGroup key={group.game} group={group} actions={false} {...groupProps} />
            ))}
        </section>
      )}

      {inventoryErrorText && (
        <div className="rounded-[var(--dp-radius-md)] border border-[color-mix(in_srgb,var(--dp-signal-err)_30%,transparent)] bg-[color-mix(in_srgb,var(--dp-signal-err)_8%,transparent)] px-4 py-3 text-[12px] text-[color:var(--dp-signal-err)]">
          {inventoryErrorText}
        </div>
      )}
    </div>
  );
}
