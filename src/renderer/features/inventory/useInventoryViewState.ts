import * as React from "react";
import type { DropSortKey, SortDirection } from "./inventoryFilters";

export type SortState = { key: DropSortKey; direction: SortDirection } | null;

export type InventoryViewState = {
  search: string;
  setSearch: (next: string) => void;
  sort: SortState;
  toggleSort: (key: DropSortKey) => void;
  page: number;
  setPage: (next: number) => void;
  resetPage: () => void;
  selectedDropId: string | null;
  selectDrop: (id: string | null) => void;
};

export const DEFAULT_SORT: SortState = { key: "status", direction: "asc" };

export function useInventoryViewState(): InventoryViewState {
  const [search, setSearchRaw] = React.useState<string>("");
  const [sort, setSort] = React.useState<SortState>(DEFAULT_SORT);
  const [page, setPage] = React.useState<number>(1);
  const [selectedDropId, setSelectedDropId] = React.useState<string | null>(null);

  const setSearch = React.useCallback((next: string) => {
    setSearchRaw(next);
    setPage(1);
  }, []);

  const toggleSort = React.useCallback((key: DropSortKey) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return DEFAULT_SORT;
    });
  }, []);

  const resetPage = React.useCallback(() => setPage(1), []);

  const selectDrop = React.useCallback((id: string | null) => {
    setSelectedDropId(id);
  }, []);

  return {
    search,
    setSearch,
    sort,
    toggleSort,
    page,
    setPage,
    resetPage,
    selectedDropId,
    selectDrop,
  };
}
