import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { Language } from "../../renderer/i18n";
import {
  DEFAULT_UPDATE_CHANNEL,
  normalizeUpdateChannel,
  type UpdateChannel,
} from "../../shared/updateChannels";

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
  updateChannel: UpdateChannel;
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
  enableBadgesEmotes: boolean;
  allowUnlinkedGames: boolean;
};

const MIN_REFRESH_MS = 3_600_000;

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
  updateChannel: DEFAULT_UPDATE_CHANNEL,
  refreshMinMs: 3_600_000,
  refreshMaxMs: 4_200_000,
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
  enableBadgesEmotes: false,
  allowUnlinkedGames: false,
};

const normalizeRefreshIntervals = (
  minValue: unknown,
  maxValue: unknown,
): { min: number; max: number } => {
  const rawMin = Number.isFinite(minValue) ? (minValue as number) : defaultSettings.refreshMinMs;
  const rawMax = Number.isFinite(maxValue) ? (maxValue as number) : defaultSettings.refreshMaxMs;
  const clampedMin = Math.max(MIN_REFRESH_MS, Math.min(rawMin, rawMax));
  const clampedMax = Math.max(clampedMin, rawMax);
  return { min: clampedMin, max: clampedMax };
};

export type SettingsSaveData = Partial<SettingsData> & {
  betaUpdates?: boolean;
};

export async function loadSettings(): Promise<SettingsData> {
  try {
    const raw = await fs.readFile(settingsFile, "utf-8");
    const parsed = JSON.parse(raw);
    const refresh = normalizeRefreshIntervals(parsed?.refreshMinMs, parsed?.refreshMaxMs);
    return {
      ...defaultSettings,
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
      updateChannel: normalizeUpdateChannel(parsed?.updateChannel, parsed?.betaUpdates),
      refreshMinMs: refresh.min,
      refreshMaxMs: refresh.max,
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
      enableBadgesEmotes:
        typeof parsed?.enableBadgesEmotes === "boolean"
          ? parsed.enableBadgesEmotes
          : defaultSettings.enableBadgesEmotes,
      allowUnlinkedGames:
        typeof parsed?.allowUnlinkedGames === "boolean"
          ? parsed.allowUnlinkedGames
          : defaultSettings.allowUnlinkedGames,
    };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(data: SettingsSaveData): Promise<SettingsData> {
  const current = await loadSettings();
  const { betaUpdates: legacyBetaUpdates, ...restData } = data;
  const refresh = normalizeRefreshIntervals(
    Number.isFinite(restData.refreshMinMs) ? restData.refreshMinMs : current.refreshMinMs,
    Number.isFinite(restData.refreshMaxMs) ? restData.refreshMaxMs : current.refreshMaxMs,
  );
  const next: SettingsData = {
    ...current,
    ...restData,
    priorityGames: Array.isArray(restData.priorityGames)
      ? restData.priorityGames
      : current.priorityGames,
    excludeGames: Array.isArray(restData.excludeGames)
      ? restData.excludeGames
      : current.excludeGames,
    obeyPriority:
      typeof restData.obeyPriority === "boolean" ? restData.obeyPriority : current.obeyPriority,
    language:
      restData.language === "en" || restData.language === "de"
        ? restData.language
        : current.language,
    autoStart: typeof restData.autoStart === "boolean" ? restData.autoStart : current.autoStart,
    autoClaim: typeof restData.autoClaim === "boolean" ? restData.autoClaim : current.autoClaim,
    autoSelect: typeof restData.autoSelect === "boolean" ? restData.autoSelect : current.autoSelect,
    autoSwitch: typeof restData.autoSwitch === "boolean" ? restData.autoSwitch : current.autoSwitch,
    warmupEnabled:
      typeof restData.warmupEnabled === "boolean" ? restData.warmupEnabled : current.warmupEnabled,
    updateChannel:
      typeof restData.updateChannel === "string" || typeof legacyBetaUpdates === "boolean"
        ? normalizeUpdateChannel(restData.updateChannel, legacyBetaUpdates)
        : current.updateChannel,
    refreshMinMs: refresh.min,
    refreshMaxMs: refresh.max,
    demoMode: typeof restData.demoMode === "boolean" ? restData.demoMode : current.demoMode,
    debugEnabled:
      typeof restData.debugEnabled === "boolean" ? restData.debugEnabled : current.debugEnabled,
    alertsEnabled:
      typeof restData.alertsEnabled === "boolean" ? restData.alertsEnabled : current.alertsEnabled,
    alertsNotifyWhileFocused:
      typeof restData.alertsNotifyWhileFocused === "boolean"
        ? restData.alertsNotifyWhileFocused
        : current.alertsNotifyWhileFocused,
    alertsDropClaimed:
      typeof restData.alertsDropClaimed === "boolean"
        ? restData.alertsDropClaimed
        : current.alertsDropClaimed,
    alertsDropEndingSoon:
      typeof restData.alertsDropEndingSoon === "boolean"
        ? restData.alertsDropEndingSoon
        : current.alertsDropEndingSoon,
    alertsDropEndingMinutes:
      Number.isFinite(restData.alertsDropEndingMinutes) &&
      (restData.alertsDropEndingMinutes as number) > 0
        ? Math.min(60, Math.max(1, restData.alertsDropEndingMinutes as number))
        : current.alertsDropEndingMinutes,
    alertsWatchError:
      typeof restData.alertsWatchError === "boolean"
        ? restData.alertsWatchError
        : current.alertsWatchError,
    alertsAutoSwitch:
      typeof restData.alertsAutoSwitch === "boolean"
        ? restData.alertsAutoSwitch
        : current.alertsAutoSwitch,
    alertsNewDrops:
      typeof restData.alertsNewDrops === "boolean"
        ? restData.alertsNewDrops
        : current.alertsNewDrops,
    enableBadgesEmotes:
      typeof restData.enableBadgesEmotes === "boolean"
        ? restData.enableBadgesEmotes
        : current.enableBadgesEmotes,
    allowUnlinkedGames:
      typeof restData.allowUnlinkedGames === "boolean"
        ? restData.allowUnlinkedGames
        : current.allowUnlinkedGames,
  };
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(settingsFile, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export async function exportSettings(): Promise<SettingsData> {
  return loadSettings();
}

export async function importSettings(payload: SettingsSaveData): Promise<SettingsData> {
  // Reuse the same merge/validation logic as saveSettings
  return saveSettings(payload);
}
