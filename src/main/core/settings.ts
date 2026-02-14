import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { Language } from "../../renderer/i18n";

export type SettingsData = {
  priorityGames: string[];
  excludeGames: string[];
  obeyPriority: boolean;
  language: Language;
  autoStart: boolean;
  autoClaim: boolean;
  autoSelect: boolean;
  autoSwitch: boolean;
  warmupEnabled: boolean;
  betaUpdates: boolean;
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
};

const settingsFile = join(app.getPath("userData"), "settings.json");

const defaultSettings: SettingsData = {
  priorityGames: [],
  excludeGames: [],
  obeyPriority: false,
  language: "de",
  autoStart: false,
  autoClaim: true,
  autoSelect: true,
  autoSwitch: true,
  warmupEnabled: true,
  betaUpdates: false,
  refreshMinMs: 120_000,
  refreshMaxMs: 240_000,
  demoMode: false,
  debugEnabled: false,
  alertsEnabled: true,
  alertsNotifyWhileFocused: false,
  alertsDropClaimed: true,
  alertsDropEndingSoon: true,
  alertsDropEndingMinutes: 5,
  alertsWatchError: true,
  alertsAutoSwitch: true,
  alertsNewDrops: true,
};

export async function loadSettings(): Promise<SettingsData> {
  try {
    const raw = await fs.readFile(settingsFile, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ...defaultSettings,
      ...parsed,
      priorityGames: Array.isArray(parsed?.priorityGames) ? parsed.priorityGames : [],
      excludeGames: Array.isArray(parsed?.excludeGames) ? parsed.excludeGames : [],
      obeyPriority:
        typeof parsed?.obeyPriority === "boolean"
          ? parsed.obeyPriority
          : defaultSettings.obeyPriority,
      language: parsed?.language === "en" ? "en" : "de",
      autoStart:
        typeof parsed?.autoStart === "boolean" ? parsed.autoStart : defaultSettings.autoStart,
      autoClaim:
        typeof parsed?.autoClaim === "boolean" ? parsed.autoClaim : defaultSettings.autoClaim,
      autoSelect:
        typeof parsed?.autoSelect === "boolean" ? parsed.autoSelect : defaultSettings.autoSelect,
      autoSwitch:
        typeof parsed?.autoSwitch === "boolean" ? parsed.autoSwitch : defaultSettings.autoSwitch,
      warmupEnabled:
        typeof parsed?.warmupEnabled === "boolean"
          ? parsed.warmupEnabled
          : defaultSettings.warmupEnabled,
      betaUpdates:
        typeof parsed?.betaUpdates === "boolean"
          ? parsed.betaUpdates
          : defaultSettings.betaUpdates,
      refreshMinMs:
        Number.isFinite(parsed?.refreshMinMs) && parsed.refreshMinMs > 0
          ? parsed.refreshMinMs
          : defaultSettings.refreshMinMs,
      refreshMaxMs:
        Number.isFinite(parsed?.refreshMaxMs) && parsed.refreshMaxMs > 0
          ? parsed.refreshMaxMs
          : defaultSettings.refreshMaxMs,
      demoMode: typeof parsed?.demoMode === "boolean" ? parsed.demoMode : defaultSettings.demoMode,
      debugEnabled:
        typeof parsed?.debugEnabled === "boolean"
          ? parsed.debugEnabled
          : defaultSettings.debugEnabled,
      alertsEnabled:
        typeof parsed?.alertsEnabled === "boolean"
          ? parsed.alertsEnabled
          : defaultSettings.alertsEnabled,
      alertsNotifyWhileFocused:
        typeof parsed?.alertsNotifyWhileFocused === "boolean"
          ? parsed.alertsNotifyWhileFocused
          : defaultSettings.alertsNotifyWhileFocused,
      alertsDropClaimed:
        typeof parsed?.alertsDropClaimed === "boolean"
          ? parsed.alertsDropClaimed
          : defaultSettings.alertsDropClaimed,
      alertsDropEndingSoon:
        typeof parsed?.alertsDropEndingSoon === "boolean"
          ? parsed.alertsDropEndingSoon
          : defaultSettings.alertsDropEndingSoon,
      alertsDropEndingMinutes:
        Number.isFinite(parsed?.alertsDropEndingMinutes) && parsed.alertsDropEndingMinutes > 0
          ? Math.min(60, Math.max(1, parsed.alertsDropEndingMinutes))
          : defaultSettings.alertsDropEndingMinutes,
      alertsWatchError:
        typeof parsed?.alertsWatchError === "boolean"
          ? parsed.alertsWatchError
          : defaultSettings.alertsWatchError,
      alertsAutoSwitch:
        typeof parsed?.alertsAutoSwitch === "boolean"
          ? parsed.alertsAutoSwitch
          : defaultSettings.alertsAutoSwitch,
      alertsNewDrops:
        typeof parsed?.alertsNewDrops === "boolean"
          ? parsed.alertsNewDrops
          : defaultSettings.alertsNewDrops,
    };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(data: Partial<SettingsData>): Promise<SettingsData> {
  const current = await loadSettings();
  const next: SettingsData = {
    ...current,
    ...data,
    priorityGames: Array.isArray(data.priorityGames) ? data.priorityGames : current.priorityGames,
    excludeGames: Array.isArray(data.excludeGames) ? data.excludeGames : current.excludeGames,
    obeyPriority: typeof data.obeyPriority === "boolean" ? data.obeyPriority : current.obeyPriority,
    language: data.language === "en" || data.language === "de" ? data.language : current.language,
    autoStart: typeof data.autoStart === "boolean" ? data.autoStart : current.autoStart,
    autoClaim: typeof data.autoClaim === "boolean" ? data.autoClaim : current.autoClaim,
    autoSelect: typeof data.autoSelect === "boolean" ? data.autoSelect : current.autoSelect,
    autoSwitch: typeof data.autoSwitch === "boolean" ? data.autoSwitch : current.autoSwitch,
    warmupEnabled:
      typeof data.warmupEnabled === "boolean" ? data.warmupEnabled : current.warmupEnabled,
    betaUpdates: typeof data.betaUpdates === "boolean" ? data.betaUpdates : current.betaUpdates,
    refreshMinMs:
      Number.isFinite(data.refreshMinMs) && (data.refreshMinMs as number) > 0
        ? (data.refreshMinMs as number)
        : current.refreshMinMs,
    refreshMaxMs:
      Number.isFinite(data.refreshMaxMs) && (data.refreshMaxMs as number) > 0
        ? (data.refreshMaxMs as number)
        : current.refreshMaxMs,
    demoMode: typeof data.demoMode === "boolean" ? data.demoMode : current.demoMode,
    debugEnabled: typeof data.debugEnabled === "boolean" ? data.debugEnabled : current.debugEnabled,
    alertsEnabled:
      typeof data.alertsEnabled === "boolean" ? data.alertsEnabled : current.alertsEnabled,
    alertsNotifyWhileFocused:
      typeof data.alertsNotifyWhileFocused === "boolean"
        ? data.alertsNotifyWhileFocused
        : current.alertsNotifyWhileFocused,
    alertsDropClaimed:
      typeof data.alertsDropClaimed === "boolean"
        ? data.alertsDropClaimed
        : current.alertsDropClaimed,
    alertsDropEndingSoon:
      typeof data.alertsDropEndingSoon === "boolean"
        ? data.alertsDropEndingSoon
        : current.alertsDropEndingSoon,
    alertsDropEndingMinutes:
      Number.isFinite(data.alertsDropEndingMinutes) && (data.alertsDropEndingMinutes as number) > 0
        ? Math.min(60, Math.max(1, data.alertsDropEndingMinutes as number))
        : current.alertsDropEndingMinutes,
    alertsWatchError:
      typeof data.alertsWatchError === "boolean" ? data.alertsWatchError : current.alertsWatchError,
    alertsAutoSwitch:
      typeof data.alertsAutoSwitch === "boolean" ? data.alertsAutoSwitch : current.alertsAutoSwitch,
    alertsNewDrops:
      typeof data.alertsNewDrops === "boolean" ? data.alertsNewDrops : current.alertsNewDrops,
  };
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(settingsFile, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export async function exportSettings(): Promise<SettingsData> {
  return loadSettings();
}

export async function importSettings(payload: Partial<SettingsData>): Promise<SettingsData> {
  // Reuse the same merge/validation logic as saveSettings
  return saveSettings(payload);
}
