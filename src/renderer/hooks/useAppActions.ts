import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ChannelEntry, FilterKey } from "../types";
import { usePriorityActions } from "./usePriorityActions";
import { useSettingsActions } from "./useSettingsActions";
import type { AppUpdateStatus } from "./useAppBootstrap";
import { useUpdateActions } from "./useUpdateActions";
import { useWatchingActions } from "./useWatchingActions";

type Creds = {
  username: string;
  password: string;
  token: string;
};

type Params = {
  creds: Creds;
  startLoginWithCreds: (creds: Creds) => void;
  newGame: string;
  setNewGame: (val: string) => void;
  selectedGame: string;
  priorityGames: string[];
  dragIndex: number | null;
  setDragIndex: (val: number | null) => void;
  setDragOverIndex: (val: number | null) => void;
  savePriorityGames: (list: string[]) => Promise<void>;
  saveObeyPriority: (val: boolean) => Promise<void>;
  saveAutoStart: (val: boolean) => Promise<void>;
  saveAutoClaim: (val: boolean) => Promise<void>;
  saveAutoSelect: (val: boolean) => Promise<void>;
  saveAutoSwitchEnabled: (val: boolean) => Promise<void>;
  saveDemoMode: (val: boolean) => Promise<void>;
  saveAlertsEnabled: (val: boolean) => Promise<void>;
  saveAlertsNotifyWhileFocused: (val: boolean) => Promise<void>;
  saveAlertsDropClaimed: (val: boolean) => Promise<void>;
  saveAlertsDropEndingSoon: (val: boolean) => Promise<void>;
  saveAlertsDropEndingMinutes: (val: number) => Promise<void>;
  saveAlertsWatchError: (val: boolean) => Promise<void>;
  saveAlertsAutoSwitch: (val: boolean) => Promise<void>;
  saveAlertsNewDrops: (val: boolean) => Promise<void>;
  saveRefreshIntervals: (minMs: number, maxMs: number) => Promise<void>;
  resetAutomation: () => Promise<void>;
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
  setAutoSelectEnabled: (next: boolean) => void;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<void>;
  isLinked: boolean;
  logout: () => Promise<void>;
  setUpdateStatus: Dispatch<SetStateAction<AppUpdateStatus>>;
  setFilter: (next: FilterKey) => void;
};

export function useAppActions({
  creds,
  startLoginWithCreds,
  newGame,
  setNewGame,
  selectedGame,
  priorityGames,
  dragIndex,
  setDragIndex,
  setDragOverIndex,
  savePriorityGames,
  saveObeyPriority,
  saveAutoStart,
  saveAutoClaim,
  saveAutoSelect,
  saveAutoSwitchEnabled,
  saveDemoMode,
  saveAlertsEnabled,
  saveAlertsNotifyWhileFocused,
  saveAlertsDropClaimed,
  saveAlertsDropEndingSoon,
  saveAlertsDropEndingMinutes,
  saveAlertsWatchError,
  saveAlertsAutoSwitch,
  saveAlertsNewDrops,
  saveRefreshIntervals,
  resetAutomation,
  setWatchingFromChannel,
  clearWatching,
  setAutoSelectEnabled,
  fetchInventory,
  isLinked,
  logout,
  setUpdateStatus,
  setFilter,
}: Params) {
  const priorityActions = usePriorityActions({
    newGame,
    setNewGame,
    selectedGame,
    priorityGames,
    dragIndex,
    setDragIndex,
    setDragOverIndex,
    savePriorityGames,
  });

  const watchingActions = useWatchingActions({
    setWatchingFromChannel,
    clearWatching,
    setAutoSelectEnabled,
    fetchInventory,
    isLinked,
    logout,
  });

  const settingsActions = useSettingsActions({
    setFilter,
    saveObeyPriority,
    saveAutoStart,
    saveAutoClaim,
    saveAutoSelect,
    saveAutoSwitchEnabled,
    saveDemoMode,
    saveAlertsEnabled,
    saveAlertsNotifyWhileFocused,
    saveAlertsDropClaimed,
    saveAlertsDropEndingSoon,
    saveAlertsDropEndingMinutes,
    saveAlertsWatchError,
    saveAlertsAutoSwitch,
    saveAlertsNewDrops,
    saveRefreshIntervals,
    resetAutomation,
  });

  const updateActions = useUpdateActions({ setUpdateStatus });

  const handleStartLoginWithCreds = useCallback(
    () => startLoginWithCreds(creds),
    [startLoginWithCreds, creds],
  );

  return {
    ...priorityActions,
    ...watchingActions,
    ...updateActions,
    handleStartLoginWithCreds,
    ...settingsActions,
  };
}
