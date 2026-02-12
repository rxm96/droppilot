import { Language } from "@renderer/i18n";
import { useEffect, useState } from "react";

type SettingsData = {
  priorityGames: string[];
  obeyPriority: boolean;
  excludeGames?: string[];
  language?: Language;
  autoStart?: boolean;
  autoClaim?: boolean;
  autoSelect?: boolean;
  autoSwitch?: boolean;
  refreshMinMs?: number;
  refreshMaxMs?: number;
  demoMode?: boolean;
  debugEnabled?: boolean;
  alertsEnabled?: boolean;
  alertsNotifyWhileFocused?: boolean;
  alertsDropClaimed?: boolean;
  alertsDropEndingSoon?: boolean;
  alertsDropEndingMinutes?: number;
  alertsWatchError?: boolean;
  alertsAutoSwitch?: boolean;
  alertsNewDrops?: boolean;
};

type SettingsHook = {
  priorityGames: string[];
  obeyPriority: boolean;
  language: Language;
  autoStart: boolean;
  autoClaim: boolean;
  autoSelect: boolean;
  autoSwitchEnabled: boolean;
  refreshMinMs: number;
  refreshMaxMs: number;
  demoMode: boolean;
  debugEnabled: boolean;
  alertsEnabled: boolean;
  alertsNotifyWhileFocused: boolean;
  alertsDropClaimed: boolean;
  alertsDropEndingSoon: boolean;
  alertsDropEndingMinutes: number;
  alertsWatchError: boolean;
  alertsAutoSwitch: boolean;
  alertsNewDrops: boolean;
  savePriorityGames: (list: string[]) => Promise<void>;
  saveObeyPriority: (val: boolean) => Promise<void>;
  saveLanguage: (val: Language) => Promise<void>;
  saveAutoStart: (val: boolean) => Promise<void>;
  saveAutoClaim: (val: boolean) => Promise<void>;
  saveAutoSelect: (val: boolean) => Promise<void>;
  saveAutoSwitchEnabled: (val: boolean) => Promise<void>;
  saveRefreshIntervals: (minMs: number, maxMs: number) => Promise<void>;
  saveDemoMode: (val: boolean) => Promise<void>;
  saveDebugEnabled: (val: boolean) => Promise<void>;
  saveAlertsEnabled: (val: boolean) => Promise<void>;
  saveAlertsNotifyWhileFocused: (val: boolean) => Promise<void>;
  saveAlertsDropClaimed: (val: boolean) => Promise<void>;
  saveAlertsDropEndingSoon: (val: boolean) => Promise<void>;
  saveAlertsDropEndingMinutes: (val: number) => Promise<void>;
  saveAlertsWatchError: (val: boolean) => Promise<void>;
  saveAlertsAutoSwitch: (val: boolean) => Promise<void>;
  saveAlertsNewDrops: (val: boolean) => Promise<void>;
  resetAutomation: () => Promise<void>;
  selectedGame: string;
  setSelectedGame: (val: string) => void;
  newGame: string;
  setNewGame: (val: string) => void;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => Promise<void>;
  importSettings: () => Promise<void>;
  settingsInfo: string | null;
  settingsError: string | null;
};

export function useSettingsStore(): SettingsHook {
  const [priorityGames, setPriorityGames] = useState<string[]>([]);
  const [obeyPriority, setObeyPriority] = useState<boolean>(false);
  const [language, setLanguage] = useState<Language>("de");
  const [autoStart, setAutoStart] = useState<boolean>(false);
  const [autoClaim, setAutoClaim] = useState<boolean>(true);
  const [autoSelect, setAutoSelect] = useState<boolean>(true);
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState<boolean>(true);
  const [refreshMinMs, setRefreshMinMs] = useState<number>(120_000);
  const [refreshMaxMs, setRefreshMaxMs] = useState<number>(240_000);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [debugEnabled, setDebugEnabled] = useState<boolean>(false);
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(true);
  const [alertsNotifyWhileFocused, setAlertsNotifyWhileFocused] = useState<boolean>(false);
  const [alertsDropClaimed, setAlertsDropClaimed] = useState<boolean>(true);
  const [alertsDropEndingSoon, setAlertsDropEndingSoon] = useState<boolean>(true);
  const [alertsDropEndingMinutes, setAlertsDropEndingMinutes] = useState<number>(5);
  const [alertsWatchError, setAlertsWatchError] = useState<boolean>(true);
  const [alertsAutoSwitch, setAlertsAutoSwitch] = useState<boolean>(true);
  const [alertsNewDrops, setAlertsNewDrops] = useState<boolean>(true);
  const [selectedGame, setSelectedGame] = useState<string>("");
  const [newGame, setNewGame] = useState<string>("");
  const [settingsJson, setSettingsJson] = useState<string>("");
  const [settingsInfo, setSettingsInfo] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      const res = await window.electronAPI.settings.get();
      setPriorityGames(res.priorityGames ?? []);
      setObeyPriority(res.obeyPriority ?? false);
      setLanguage(res.language === "en" ? "en" : "de");
      setAutoStart(res.autoStart === true);
      setAutoClaim(res.autoClaim !== false);
      setAutoSelect(res.autoSelect !== false);
      setAutoSwitchEnabled(res.autoSwitch !== false);
      setRefreshMinMs(
        Number.isFinite(res.refreshMinMs) && res.refreshMinMs ? res.refreshMinMs : 120_000,
      );
      setRefreshMaxMs(
        Number.isFinite(res.refreshMaxMs) && res.refreshMaxMs ? res.refreshMaxMs : 240_000,
      );
      setDemoMode(res.demoMode === true);
      setDebugEnabled(res.debugEnabled === true);
      setAlertsEnabled(res.alertsEnabled !== false);
      setAlertsNotifyWhileFocused(res.alertsNotifyWhileFocused === true);
      setAlertsDropClaimed(res.alertsDropClaimed !== false);
      setAlertsDropEndingSoon(res.alertsDropEndingSoon !== false);
      setAlertsDropEndingMinutes(
        Number.isFinite(res.alertsDropEndingMinutes) && res.alertsDropEndingMinutes
          ? Math.min(60, Math.max(1, res.alertsDropEndingMinutes))
          : 5,
      );
      setAlertsWatchError(res.alertsWatchError !== false);
      setAlertsAutoSwitch(res.alertsAutoSwitch !== false);
      setAlertsNewDrops(res.alertsNewDrops !== false);
      setSettingsJson(JSON.stringify(res, null, 2));
    } catch (err) {
      console.error("settings load failed", err);
      setSettingsError(err instanceof Error ? err.message : "Failed to load settings");
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const persist = async (data: Partial<SettingsData>) => {
    try {
      const saved = await window.electronAPI.settings.save(data);
      setPriorityGames(saved.priorityGames ?? []);
      setObeyPriority(saved.obeyPriority ?? false);
      setLanguage(saved.language === "en" ? "en" : "de");
      setAutoStart(saved.autoStart === true);
      setAutoClaim(saved.autoClaim !== false);
      setAutoSelect(saved.autoSelect !== false);
      setAutoSwitchEnabled(saved.autoSwitch !== false);
      setRefreshMinMs(
        Number.isFinite(saved.refreshMinMs) && saved.refreshMinMs ? saved.refreshMinMs : 120_000,
      );
      setRefreshMaxMs(
        Number.isFinite(saved.refreshMaxMs) && saved.refreshMaxMs ? saved.refreshMaxMs : 240_000,
      );
      setDemoMode(saved.demoMode === true);
      setDebugEnabled(saved.debugEnabled === true);
      setAlertsEnabled(saved.alertsEnabled !== false);
      setAlertsNotifyWhileFocused(saved.alertsNotifyWhileFocused === true);
      setAlertsDropClaimed(saved.alertsDropClaimed !== false);
      setAlertsDropEndingSoon(saved.alertsDropEndingSoon !== false);
      setAlertsDropEndingMinutes(
        Number.isFinite(saved.alertsDropEndingMinutes) && saved.alertsDropEndingMinutes
          ? Math.min(60, Math.max(1, saved.alertsDropEndingMinutes))
          : 5,
      );
      setAlertsWatchError(saved.alertsWatchError !== false);
      setAlertsAutoSwitch(saved.alertsAutoSwitch !== false);
      setAlertsNewDrops(saved.alertsNewDrops !== false);
      setSettingsJson(JSON.stringify(saved, null, 2));
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  const savePriorityGames = async (list: string[]) => {
    setPriorityGames(list);
    await persist({ priorityGames: list, obeyPriority });
  };

  const saveObeyPriority = async (val: boolean) => {
    setObeyPriority(val);
    await persist({ obeyPriority: val, priorityGames });
  };

  const saveLanguage = async (val: Language) => {
    setLanguage(val);
    await persist({ language: val });
  };

  const saveAutoStart = async (val: boolean) => {
    setAutoStart(val);
    await persist({ autoStart: val });
  };

  const saveAutoClaim = async (val: boolean) => {
    setAutoClaim(val);
    await persist({ autoClaim: val });
  };

  const saveAutoSelect = async (val: boolean) => {
    setAutoSelect(val);
    await persist({ autoSelect: val });
  };

  const saveAutoSwitchEnabled = async (val: boolean) => {
    setAutoSwitchEnabled(val);
    await persist({ autoSwitch: val });
  };

  const saveRefreshIntervals = async (minMs: number, maxMs: number) => {
    const clampedMin = Math.max(60_000, Math.min(minMs || 0, maxMs || minMs || 0));
    const clampedMax = Math.max(clampedMin, maxMs || clampedMin);
    const safeMin = clampedMin;
    const safeMax = clampedMax;
    setRefreshMinMs(safeMin);
    setRefreshMaxMs(safeMax);
    await persist({ refreshMinMs: safeMin, refreshMaxMs: safeMax });
  };

  const saveDemoMode = async (val: boolean) => {
    setDemoMode(val);
    await persist({ demoMode: val });
  };

  const saveDebugEnabled = async (val: boolean) => {
    setDebugEnabled(val);
    await persist({ debugEnabled: val });
  };

  const saveAlertsEnabled = async (val: boolean) => {
    setAlertsEnabled(val);
    await persist({ alertsEnabled: val });
  };

  const saveAlertsNotifyWhileFocused = async (val: boolean) => {
    setAlertsNotifyWhileFocused(val);
    await persist({ alertsNotifyWhileFocused: val });
  };

  const saveAlertsDropClaimed = async (val: boolean) => {
    setAlertsDropClaimed(val);
    await persist({ alertsDropClaimed: val });
  };

  const saveAlertsDropEndingSoon = async (val: boolean) => {
    setAlertsDropEndingSoon(val);
    await persist({ alertsDropEndingSoon: val });
  };

  const saveAlertsDropEndingMinutes = async (val: number) => {
    const safe = Math.min(60, Math.max(1, Math.round(val || 0) || 1));
    setAlertsDropEndingMinutes(safe);
    await persist({ alertsDropEndingMinutes: safe });
  };

  const saveAlertsWatchError = async (val: boolean) => {
    setAlertsWatchError(val);
    await persist({ alertsWatchError: val });
  };

  const saveAlertsAutoSwitch = async (val: boolean) => {
    setAlertsAutoSwitch(val);
    await persist({ alertsAutoSwitch: val });
  };

  const saveAlertsNewDrops = async (val: boolean) => {
    setAlertsNewDrops(val);
    await persist({ alertsNewDrops: val });
  };

  const resetAutomation = async () => {
    const defaults = {
      autoClaim: true,
      autoSelect: true,
      autoSwitch: true,
      refreshMinMs: 120_000,
      refreshMaxMs: 240_000,
      demoMode: false,
    };
    setAutoClaim(defaults.autoClaim);
    setAutoSelect(defaults.autoSelect);
    setAutoSwitchEnabled(defaults.autoSwitch);
    setRefreshMinMs(defaults.refreshMinMs);
    setRefreshMaxMs(defaults.refreshMaxMs);
    setDemoMode(defaults.demoMode);
    await persist(defaults);
  };

  const exportSettings = async () => {
    try {
      const res = await window.electronAPI.settings.export();
      const json = JSON.stringify(res, null, 2);
      setSettingsJson(json);
      setSettingsInfo("Settings exportiert.");
      setSettingsError(null);
      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(json);
        } catch {
          // ignore clipboard failure
        }
      }
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to export settings");
    }
  };

  const importSettings = async () => {
    try {
      const parsed = JSON.parse(settingsJson);
      const saved = await window.electronAPI.settings.import(parsed);
      setPriorityGames(saved.priorityGames ?? []);
      setObeyPriority(saved.obeyPriority ?? false);
      setLanguage(saved.language === "en" ? "en" : "de");
      setAutoStart(saved.autoStart === true);
      setAutoClaim(saved.autoClaim !== false);
      setAutoSelect(saved.autoSelect !== false);
      setAutoSwitchEnabled(saved.autoSwitch !== false);
      setRefreshMinMs(
        Number.isFinite(saved.refreshMinMs) && saved.refreshMinMs ? saved.refreshMinMs : 120_000,
      );
      setRefreshMaxMs(
        Number.isFinite(saved.refreshMaxMs) && saved.refreshMaxMs ? saved.refreshMaxMs : 240_000,
      );
      setDemoMode(saved.demoMode === true);
      setAlertsEnabled(saved.alertsEnabled !== false);
      setAlertsNotifyWhileFocused(saved.alertsNotifyWhileFocused === true);
      setAlertsDropClaimed(saved.alertsDropClaimed !== false);
      setAlertsDropEndingSoon(saved.alertsDropEndingSoon !== false);
      setAlertsDropEndingMinutes(
        Number.isFinite(saved.alertsDropEndingMinutes) && saved.alertsDropEndingMinutes
          ? Math.min(60, Math.max(1, saved.alertsDropEndingMinutes))
          : 5,
      );
      setAlertsWatchError(saved.alertsWatchError !== false);
      setAlertsAutoSwitch(saved.alertsAutoSwitch !== false);
      setAlertsNewDrops(saved.alertsNewDrops !== false);
      setSettingsJson(JSON.stringify(saved, null, 2));
      setSettingsInfo("Settings importiert.");
      setSettingsError(null);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to import settings");
    }
  };

  useEffect(() => {
    if (!settingsInfo && !settingsError) return;
    const id = window.setTimeout(() => {
      setSettingsInfo(null);
      setSettingsError(null);
    }, 8000);
    return () => window.clearTimeout(id);
  }, [settingsInfo, settingsError]);

  return {
    priorityGames,
    obeyPriority,
    language,
    autoStart,
    autoClaim,
    autoSelect,
    autoSwitchEnabled,
    refreshMinMs,
    refreshMaxMs,
    demoMode,
    debugEnabled,
    alertsEnabled,
    alertsNotifyWhileFocused,
    alertsDropClaimed,
    alertsDropEndingSoon,
    alertsDropEndingMinutes,
    alertsWatchError,
    alertsAutoSwitch,
    alertsNewDrops,
    savePriorityGames,
    saveObeyPriority,
    saveLanguage,
    saveAutoStart,
    saveAutoClaim,
    saveAutoSelect,
    saveAutoSwitchEnabled,
    saveRefreshIntervals,
    saveDemoMode,
    saveDebugEnabled,
    saveAlertsEnabled,
    saveAlertsNotifyWhileFocused,
    saveAlertsDropClaimed,
    saveAlertsDropEndingSoon,
    saveAlertsDropEndingMinutes,
    saveAlertsWatchError,
    saveAlertsAutoSwitch,
    saveAlertsNewDrops,
    resetAutomation,
    selectedGame,
    setSelectedGame,
    newGame,
    setNewGame,
    settingsJson,
    setSettingsJson,
    exportSettings,
    importSettings,
    settingsInfo,
    settingsError,
  };
}
