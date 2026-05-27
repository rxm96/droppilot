import * as React from "react";
import type {
  CampaignSummary,
  FilterKey,
  InventoryItem,
  InventoryState,
} from "@renderer/shared/types";
import { Button } from "@renderer/shared/components/ui/button";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";
import { useI18n } from "@renderer/shared/i18n";
import {
  createPriorityGameSet,
  shouldDisplayDropEntry,
  compareDropsByKey,
  type CampaignLookup,
} from "./inventoryFilters";
import { useInventoryViewState } from "./useInventoryViewState";
import { InventoryHeader } from "./InventoryHeader";
import { InventoryFilterStrip } from "./InventoryFilterStrip";
import { InventoryTable } from "./InventoryTable";
import { InventoryDrawer } from "./InventoryDrawer";

// Re-export legacy helpers for InventoryView.test.ts (back-compat)
export {
  shouldDisplayCampaignEntry,
  createPriorityGameSet,
  isCampaignInPriorityGames,
  compareCampaignDropsByDuration,
} from "./inventoryFilters";

const PAGE_SIZE = 25;

type InventoryProps = {
  inventory: InventoryState;
  filter: FilterKey;
  onFilterChange: (key: FilterKey) => void;
  gameFilter: string;
  onGameFilterChange: (val: string) => void;
  uniqueGames: string[];
  refreshing: boolean;
  onRefresh: () => void;
  campaigns: CampaignSummary[];
  campaignsLoading: boolean;
  isLinked: boolean;
  allowUnlinkedGames: boolean;
  priorityGames: string[];
  onAddPriorityGame: (game: string) => void;
  onOpenAccountLink: (url?: string) => void;
};

export function InventoryView({
  inventory,
  filter,
  onFilterChange,
  gameFilter,
  onGameFilterChange,
  uniqueGames,
  refreshing,
  onRefresh,
  campaigns,
  isLinked,
  allowUnlinkedGames,
  priorityGames,
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

  const campaignsById = React.useMemo(() => {
    const map = new Map<string, CampaignSummary>();
    for (const c of campaigns) {
      if (c.id) map.set(c.id, c);
    }
    return map;
  }, [campaigns]);

  const campaignLinkMap = React.useMemo(() => {
    const map = new Map<string, { anyTrue: boolean; anyFalse: boolean }>();
    for (const item of allItems) {
      const id = item.campaignId?.trim();
      if (!id) continue;
      const entry = map.get(id) ?? { anyTrue: false, anyFalse: false };
      if (item.linked === true) entry.anyTrue = true;
      if (item.linked === false) entry.anyFalse = true;
      map.set(id, entry);
    }
    return map;
  }, [allItems]);

  const campaignLookup: CampaignLookup = React.useMemo(
    () => ({
      byId: (id) => (id ? (campaignsById.get(id) ?? null) : null),
      isUnlinked: (campaign) => {
        const id = campaign.id?.trim();
        if (id) {
          const entry = campaignLinkMap.get(id);
          if (entry?.anyTrue) return false;
          if (entry?.anyFalse) return true;
        }
        return campaign.isAccountConnected === false;
      },
    }),
    [campaignsById, campaignLinkMap],
  );

  const priorityGameSet = React.useMemo(
    () => createPriorityGameSet(priorityGames),
    [priorityGames],
  );

  // Apply filters + search
  const filteredItems = React.useMemo(() => {
    const normalizedFilter: FilterKey = filter === "excluded" ? "all" : filter;
    const searchLower = state.search.trim().toLowerCase();
    return allItems.filter((item) => {
      if (
        !shouldDisplayDropEntry(item, {
          normalizedFilter,
          priorityGameSet,
          gameFilter,
          campaignLookup,
        })
      ) {
        return false;
      }
      if (searchLower) {
        const title = (item.title ?? "").toLowerCase();
        const game = (item.game ?? "").toLowerCase();
        if (!title.includes(searchLower) && !game.includes(searchLower)) return false;
      }
      return true;
    });
  }, [allItems, filter, gameFilter, priorityGameSet, campaignLookup, state.search]);

  // Apply sort
  const sortedItems = React.useMemo(() => {
    if (!state.sort) return filteredItems;
    const { key, direction } = state.sort;
    return [...filteredItems].sort((a, b) => compareDropsByKey(a, b, key, direction));
  }, [filteredItems, state.sort]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const currentPage = Math.min(state.page, totalPages);
  const paginatedItems = React.useMemo(
    () => sortedItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sortedItems, currentPage],
  );

  // Reset page when filters change
  const resetPage = state.resetPage;
  React.useEffect(() => {
    resetPage();
  }, [filter, gameFilter, resetPage]);

  // Unlinked count for header banner
  const unlinkedCount = React.useMemo(() => {
    return filteredItems.filter((item) => {
      const campaign = campaignLookup.byId(item.campaignId);
      if (!campaign) return false;
      if (!campaignLookup.isUnlinked(campaign)) return false;
      return !allowUnlinkedGames;
    }).length;
  }, [filteredItems, campaignLookup, allowUnlinkedGames]);

  // Selected drop + its campaign (for drawer)
  const selectedDrop = React.useMemo(
    () =>
      state.selectedDropId ? (allItems.find((i) => i.id === state.selectedDropId) ?? null) : null,
    [allItems, state.selectedDropId],
  );
  const selectedCampaign = selectedDrop ? campaignLookup.byId(selectedDrop.campaignId) : null;
  const selectedIsPriority = selectedDrop
    ? priorityGameSet.has((selectedDrop.game ?? "").trim().toLowerCase())
    : false;

  // Error / empty states
  const inventoryErrorText =
    inventory.status === "error"
      ? resolveErrorMessage(t, { code: inventory.code, message: inventory.message })
      : null;

  const isLoading = inventory.status === "loading";
  const emptyMessage = !isLinked
    ? "Sign in to see your inventory."
    : isLoading
      ? "Loading drops…"
      : sortedItems.length === 0 && allItems.length > 0
        ? "No drops match the current filter."
        : "No drops in inventory yet.";

  return (
    <div className="flex flex-col gap-5">
      <InventoryHeader
        totalDrops={allItems.length}
        filteredDrops={sortedItems.length}
        search={state.search}
        onSearchChange={state.setSearch}
        gameFilter={gameFilter}
        onGameFilterChange={onGameFilterChange}
        uniqueGames={uniqueGames}
        refreshing={refreshing}
        refreshDisabled={refreshing || isLoading}
        onRefresh={onRefresh}
        unlinkedCount={unlinkedCount}
        onOpenAccountLink={() => onOpenAccountLink()}
      />

      <InventoryFilterStrip filter={filter} onFilterChange={onFilterChange} />

      <InventoryTable
        items={paginatedItems}
        sort={state.sort}
        onToggleSort={state.toggleSort}
        selectedDropId={state.selectedDropId}
        onSelectDrop={state.selectDrop}
        emptyMessage={emptyMessage}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between font-mono text-[11px] text-[color:var(--dp-text-dim)]">
          <Button
            variant="dp-ghost"
            size="dp-sm"
            onClick={() => state.setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            prev
          </Button>
          <span>
            page {currentPage} / {totalPages}
          </span>
          <Button
            variant="dp-ghost"
            size="dp-sm"
            onClick={() => state.setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            next
          </Button>
        </div>
      )}

      {inventoryErrorText && (
        <div className="rounded-[var(--dp-radius-md)] border border-[rgba(248,113,113,0.30)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-[12px] text-[color:var(--dp-signal-err)]">
          {inventoryErrorText}
        </div>
      )}

      <InventoryDrawer
        drop={selectedDrop}
        campaign={selectedCampaign}
        isPriorityGame={selectedIsPriority}
        onClose={() => state.selectDrop(null)}
        onOpenAccountLink={onOpenAccountLink}
        onAddPriorityGame={onAddPriorityGame}
      />
    </div>
  );
}
