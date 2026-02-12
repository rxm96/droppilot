import { useCallback } from "react";
import type { FilterKey } from "../types";

type Params = {
  setFilter: (next: FilterKey) => void;
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
};

export function useSettingsActions({
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
}: Params) {
  const handleFilterChange = useCallback((key: FilterKey) => setFilter(key), [setFilter]);

  const handleSetObeyPriority = useCallback(
    (val: boolean) => {
      void saveObeyPriority(val);
    },
    [saveObeyPriority],
  );

  const handleSetAutoStart = useCallback(
    (val: boolean) => {
      void saveAutoStart(val);
    },
    [saveAutoStart],
  );

  const handleSetAutoClaim = useCallback(
    (val: boolean) => {
      void saveAutoClaim(val);
    },
    [saveAutoClaim],
  );

  const handleSetAutoSelect = useCallback(
    (val: boolean) => {
      void saveAutoSelect(val);
    },
    [saveAutoSelect],
  );

  const handleSetAutoSwitchEnabled = useCallback(
    (val: boolean) => {
      void saveAutoSwitchEnabled(val);
    },
    [saveAutoSwitchEnabled],
  );

  const handleSetDemoMode = useCallback(
    (val: boolean) => {
      void saveDemoMode(val);
    },
    [saveDemoMode],
  );

  const handleSetAlertsEnabled = useCallback(
    (val: boolean) => {
      void saveAlertsEnabled(val);
    },
    [saveAlertsEnabled],
  );

  const handleSetAlertsNotifyWhileFocused = useCallback(
    (val: boolean) => {
      void saveAlertsNotifyWhileFocused(val);
    },
    [saveAlertsNotifyWhileFocused],
  );

  const handleSetAlertsDropClaimed = useCallback(
    (val: boolean) => {
      void saveAlertsDropClaimed(val);
    },
    [saveAlertsDropClaimed],
  );

  const handleSetAlertsDropEndingSoon = useCallback(
    (val: boolean) => {
      void saveAlertsDropEndingSoon(val);
    },
    [saveAlertsDropEndingSoon],
  );

  const handleSetAlertsDropEndingMinutes = useCallback(
    (val: number) => {
      void saveAlertsDropEndingMinutes(val);
    },
    [saveAlertsDropEndingMinutes],
  );

  const handleSetAlertsWatchError = useCallback(
    (val: boolean) => {
      void saveAlertsWatchError(val);
    },
    [saveAlertsWatchError],
  );

  const handleSetAlertsAutoSwitch = useCallback(
    (val: boolean) => {
      void saveAlertsAutoSwitch(val);
    },
    [saveAlertsAutoSwitch],
  );

  const handleSetAlertsNewDrops = useCallback(
    (val: boolean) => {
      void saveAlertsNewDrops(val);
    },
    [saveAlertsNewDrops],
  );

  const handleSetRefreshIntervals = useCallback(
    (minMs: number, maxMs: number) => {
      void saveRefreshIntervals(minMs, maxMs);
    },
    [saveRefreshIntervals],
  );

  const handleResetAutomation = useCallback(() => {
    void resetAutomation();
  }, [resetAutomation]);

  return {
    handleFilterChange,
    handleSetObeyPriority,
    handleSetAutoStart,
    handleSetAutoClaim,
    handleSetAutoSelect,
    handleSetAutoSwitchEnabled,
    handleSetDemoMode,
    handleSetAlertsEnabled,
    handleSetAlertsNotifyWhileFocused,
    handleSetAlertsDropClaimed,
    handleSetAlertsDropEndingSoon,
    handleSetAlertsDropEndingMinutes,
    handleSetAlertsWatchError,
    handleSetAlertsAutoSwitch,
    handleSetAlertsNewDrops,
    handleSetRefreshIntervals,
    handleResetAutomation,
  };
}
