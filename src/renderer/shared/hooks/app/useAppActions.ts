import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { ChannelEntry, FilterKey } from "@renderer/shared/types";
import type { AppSettings } from "../../../../shared/settingsSchema";
import { usePriorityActions } from "@renderer/shared/hooks/priority";
import type { AppUpdateStatus } from "./useAppBootstrap";
import { useUpdateActions } from "./useUpdateActions";
import { useWatchingActions } from "@renderer/shared/hooks/watch";

type Params = {
  newGame: string;
  setNewGame: (val: string) => void;
  selectedGame: string;
  priorityGames: string[];
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
  setAutoSelectEnabled: (next: boolean) => void;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<void>;
  isLinked: boolean;
  logout: () => Promise<void>;
  onManualStartWatching?: (channel: ChannelEntry) => void;
  setUpdateStatus: Dispatch<SetStateAction<AppUpdateStatus>>;
  setFilter: (next: FilterKey) => void;
};

export function useAppActions({
  newGame,
  setNewGame,
  selectedGame,
  priorityGames,
  saveSettings,
  setWatchingFromChannel,
  clearWatching,
  setAutoSelectEnabled,
  fetchInventory,
  isLinked,
  logout,
  onManualStartWatching,
  setUpdateStatus,
  setFilter,
}: Params) {
  const savePriorityGames = useCallback(
    (list: string[]) => saveSettings({ priorityGames: list }),
    [saveSettings],
  );

  const priorityActions = usePriorityActions({
    newGame,
    setNewGame,
    selectedGame,
    priorityGames,
    setAutoSelectEnabled,
    savePriorityGames,
  });

  const watchingActions = useWatchingActions({
    setWatchingFromChannel,
    clearWatching,
    setAutoSelectEnabled,
    fetchInventory,
    isLinked,
    logout,
    onManualStartWatching,
  });

  const updateActions = useUpdateActions({ setUpdateStatus });

  const handleFilterChange = useCallback((key: FilterKey) => setFilter(key), [setFilter]);

  return {
    ...priorityActions,
    ...watchingActions,
    ...updateActions,
    handleFilterChange,
  };
}
