import { useCallback, useEffect, useState } from "react";
import {
  SETTINGS_DEFAULTS,
  applySettingsPatch,
  automationResetPatch,
  normalizeSettings,
  type AppSettings,
  type SettingKey,
  type SettingsSetter,
} from "../../../../shared/settingsSchema";

type SettingsHook = {
  settings: AppSettings;
  /** Persist any subset of settings. Optimistic local apply, then canonical response. */
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** Typed single-key sugar over saveSettings (fire-and-forget). */
  setSetting: SettingsSetter;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => Promise<void>;
  importSettings: () => Promise<void>;
  settingsInfo: string | null;
  settingsError: string | null;
};

const toErrorMessage = (err: unknown, fallbackKey: string): string => {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallbackKey;
};

export function useSettingsStore(): SettingsHook {
  const [settings, setSettings] = useState<AppSettings>(SETTINGS_DEFAULTS);
  const [settingsJson, setSettingsJson] = useState<string>("");
  const [settingsInfo, setSettingsInfo] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Main's response is canonical (it merged against the on-disk state); the
  // defensive normalize types the IPC boundary and protects against a stale
  // main build. The JSON preview keeps the RAW response (incl. windowBounds).
  const applyResponse = useCallback((saved: unknown) => {
    setSettings(normalizeSettings(saved));
    setSettingsJson(JSON.stringify(saved, null, 2));
  }, []);

  useEffect(() => {
    void window.electronAPI.settings
      .get()
      .then((res) => applyResponse(res))
      .catch((err) => {
        console.error("settings load failed", err);
        setSettingsError(toErrorMessage(err, "error.settings.load_failed"));
      });
  }, [applyResponse]);

  const saveSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      setSettings((prev) => applySettingsPatch(prev, patch)); // optimistic
      try {
        const saved = await window.electronAPI.settings.save(patch);
        applyResponse(saved);
      } catch (err) {
        // Matches legacy behavior: the optimistic value stays, only the error
        // banner is raised (rollback would be a behavior change — see spec).
        setSettingsError(toErrorMessage(err, "error.settings.save_failed"));
      }
    },
    [applyResponse],
  );

  const setSetting = useCallback(
    <K extends SettingKey>(key: K, value: AppSettings[K]) => {
      void saveSettings({ [key]: value } as Partial<AppSettings>);
    },
    [saveSettings],
  );

  const setRefreshIntervals = useCallback(
    (minMs: number, maxMs: number) => {
      // Cross-field clamping happens inside applySettingsPatch/main.
      void saveSettings({ refreshMinMs: minMs, refreshMaxMs: maxMs });
    },
    [saveSettings],
  );

  const resetAutomation = useCallback(() => {
    void saveSettings(automationResetPatch());
  }, [saveSettings]);

  const exportSettings = useCallback(async () => {
    try {
      const res = await window.electronAPI.settings.export();
      const json = JSON.stringify(res, null, 2);
      setSettingsJson(json);
      setSettingsInfo("settings.info.exported");
      setSettingsError(null);
      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(json);
        } catch {
          // ignore clipboard failure
        }
      }
    } catch (err) {
      setSettingsError(toErrorMessage(err, "error.settings.export_failed"));
    }
  }, []);

  const importSettings = useCallback(async () => {
    try {
      const parsed: unknown = JSON.parse(settingsJson);
      const saved = await window.electronAPI.settings.import(parsed as Partial<AppSettings>);
      applyResponse(saved);
      setSettingsInfo("settings.info.imported");
      setSettingsError(null);
    } catch (err) {
      setSettingsError(toErrorMessage(err, "error.settings.import_failed"));
    }
  }, [applyResponse, settingsJson]);

  useEffect(() => {
    if (!settingsInfo && !settingsError) return;
    const id = window.setTimeout(() => {
      setSettingsInfo(null);
      setSettingsError(null);
    }, 8000);
    return () => window.clearTimeout(id);
  }, [settingsInfo, settingsError]);

  return {
    settings,
    saveSettings,
    setSetting,
    setRefreshIntervals,
    resetAutomation,
    settingsJson,
    setSettingsJson,
    exportSettings,
    importSettings,
    settingsInfo,
    settingsError,
  };
}
