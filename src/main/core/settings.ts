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
  /** When true, clicking the close button hides the window to the tray instead of quitting. */
  closeToTray: boolean;
  /** When true, minimizing the window hides it to the tray instead of leaving it in the taskbar. */
  minimizeToTray: boolean;
  /**
   * UI preferences. Durable here (the renderer's localStorage is only a fast
   * first-paint cache — file:// localStorage is not reliably persisted across
   * updates). `theme` is null until the user pins one (follow-system default).
   */
  theme: "light" | "dark" | null;
  accent: string | null;
  fontPair: string;
  /** Set once the renderer has migrated its localStorage UI prefs into here. */
  uiPrefsMigrated: boolean;
  /** Persisted window bounds. Undefined on first launch — main process falls back to defaults. */
  windowBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
    isMaximized: boolean;
  };
};

const MIN_REFRESH_MS = 3_600_000;

const settingsFile = join(app.getPath("userData"), "settings.json");
// Mirror of the last successfully-written settings. If the primary file is ever
// truncated/corrupted (e.g. a write interrupted by an update restart), load
// recovers from here instead of falling back to empty defaults — which a later
// save would otherwise persist over the real data.
const backupFile = join(app.getPath("userData"), "settings.bak.json");

// All writes flow through one promise chain so concurrent saves (window-bounds
// autosave + a settings toggle, etc.) can't interleave their read-modify-write.
let writeQueue: Promise<unknown> = Promise.resolve();
let tmpCounter = 0;

/**
 * Write atomically: write to a temp file, then rename over the target. rename
 * is atomic on the same volume (Windows + POSIX), so an interrupted or crashed
 * write never leaves a half-written, unparseable file behind.
 */
async function atomicWrite(file: string, contents: string): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const tmp = `${file}.${process.pid}.${++tmpCounter}.tmp`;
  await fs.writeFile(tmp, contents, "utf-8");
  await fs.rename(tmp, file);
}

type RawRead = { status: "ok"; raw: string } | { status: "missing" } | { status: "corrupt" };

async function readRawJson(file: string): Promise<RawRead> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return { status: "missing" };
    return { status: "corrupt" };
  }
  // An empty/whitespace file means a previous write was truncated mid-flight.
  if (!raw.trim()) return { status: "corrupt" };
  return { status: "ok", raw };
}

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
  closeToTray: true,
  minimizeToTray: false,
  theme: null,
  accent: null,
  fontPair: "pro-console",
  uiPrefsMigrated: false,
};

const normalizeWindowBounds = (raw: unknown): SettingsData["windowBounds"] => {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  const num = (val: unknown) => (typeof val === "number" && Number.isFinite(val) ? val : null);
  const x = num(candidate.x);
  const y = num(candidate.y);
  const width = num(candidate.width);
  const height = num(candidate.height);
  const isMaximized = typeof candidate.isMaximized === "boolean" ? candidate.isMaximized : false;
  if (x === null || y === null || width === null || height === null) return undefined;
  // Guard against degenerate bounds (e.g. 0x0 from a destroyed window snapshot)
  if (width < 200 || height < 200) return undefined;
  return { x, y, width, height, isMaximized };
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
  let source = await readRawJson(settingsFile);
  if (source.status === "corrupt") {
    // Primary file is unreadable/truncated. Preserve it for forensics (best
    // effort) and recover from the backup rather than returning empty defaults
    // that a subsequent save would persist over the user's real data.
    await fs.rename(settingsFile, `${settingsFile}.corrupt`).catch(() => undefined);
    const backup = await readRawJson(backupFile);
    if (backup.status === "ok") {
      source = backup;
      await atomicWrite(settingsFile, backup.raw).catch(() => undefined);
    }
  }
  if (source.status !== "ok") return { ...defaultSettings };

  try {
    const parsed = JSON.parse(source.raw);
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
      closeToTray:
        typeof parsed?.closeToTray === "boolean" ? parsed.closeToTray : defaultSettings.closeToTray,
      minimizeToTray:
        typeof parsed?.minimizeToTray === "boolean"
          ? parsed.minimizeToTray
          : defaultSettings.minimizeToTray,
      theme: parsed?.theme === "light" || parsed?.theme === "dark" ? parsed.theme : null,
      accent: typeof parsed?.accent === "string" ? parsed.accent : null,
      fontPair: typeof parsed?.fontPair === "string" ? parsed.fontPair : defaultSettings.fontPair,
      uiPrefsMigrated: parsed?.uiPrefsMigrated === true,
      windowBounds: normalizeWindowBounds(parsed?.windowBounds),
    };
  } catch {
    return { ...defaultSettings };
  }
}

export async function saveSettings(data: SettingsSaveData): Promise<SettingsData> {
  // Serialize through the write queue so overlapping saves (e.g. window-bounds
  // autosave racing a settings toggle) can't interleave their read-modify-write.
  const run = writeQueue.then(() => persistSettings(data));
  writeQueue = run.catch(() => undefined);
  return run;
}

async function persistSettings(data: SettingsSaveData): Promise<SettingsData> {
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
    closeToTray:
      typeof restData.closeToTray === "boolean" ? restData.closeToTray : current.closeToTray,
    minimizeToTray:
      typeof restData.minimizeToTray === "boolean"
        ? restData.minimizeToTray
        : current.minimizeToTray,
    theme:
      restData.theme === "light" || restData.theme === "dark" || restData.theme === null
        ? restData.theme
        : current.theme,
    accent:
      typeof restData.accent === "string" || restData.accent === null
        ? restData.accent
        : current.accent,
    fontPair: typeof restData.fontPair === "string" ? restData.fontPair : current.fontPair,
    uiPrefsMigrated:
      typeof restData.uiPrefsMigrated === "boolean"
        ? restData.uiPrefsMigrated
        : current.uiPrefsMigrated,
    windowBounds:
      restData.windowBounds !== undefined
        ? normalizeWindowBounds(restData.windowBounds)
        : current.windowBounds,
  };
  const serialized = JSON.stringify(next, null, 2);
  await atomicWrite(settingsFile, serialized);
  // Mirror to the backup so a future corrupt primary can be recovered.
  await atomicWrite(backupFile, serialized).catch(() => undefined);
  return next;
}

export async function exportSettings(): Promise<SettingsData> {
  return loadSettings();
}

export async function importSettings(payload: SettingsSaveData): Promise<SettingsData> {
  // Reuse the same merge/validation logic as saveSettings
  return saveSettings(payload);
}
