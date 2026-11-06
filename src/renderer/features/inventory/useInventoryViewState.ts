import * as React from "react";

export type InventoryViewState = {
  search: string;
  setSearch: (next: string) => void;
  selectedDropId: string | null;
  selectDrop: (id: string | null) => void;
  expiredOpen: boolean;
  toggleExpired: () => void;
};

/** Local UI state of the drops view: search, the drawer's drop, the expired section. */
export function useInventoryViewState(): InventoryViewState {
  const [search, setSearch] = React.useState<string>("");
  const [selectedDropId, setSelectedDropId] = React.useState<string | null>(null);
  const [expiredOpen, setExpiredOpen] = React.useState(false);
  const toggleExpired = React.useCallback(() => setExpiredOpen((open) => !open), []);

  return {
    search,
    setSearch,
    selectedDropId,
    selectDrop: setSelectedDropId,
    expiredOpen,
    toggleExpired,
  };
}
