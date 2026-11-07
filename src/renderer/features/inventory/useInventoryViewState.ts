import * as React from "react";

export type InventoryViewState = {
  search: string;
  setSearch: (next: string) => void;
  /** The drop whose details strip is open; one at a time. */
  openDropId: string | null;
  /** Opens a drop's details, or closes them when that drop is already open. */
  toggleDrop: (id: string) => void;
  expiredOpen: boolean;
  toggleExpired: () => void;
};

/** Local UI state of the drops view: search, the open drop, the expired section. */
export function useInventoryViewState(): InventoryViewState {
  const [search, setSearch] = React.useState<string>("");
  const [openDropId, setOpenDropId] = React.useState<string | null>(null);
  const toggleDrop = React.useCallback(
    (id: string) => setOpenDropId((current) => (current === id ? null : id)),
    [],
  );
  const [expiredOpen, setExpiredOpen] = React.useState(false);
  const toggleExpired = React.useCallback(() => setExpiredOpen((open) => !open), []);

  return {
    search,
    setSearch,
    openDropId,
    toggleDrop,
    expiredOpen,
    toggleExpired,
  };
}
