import { app, BrowserWindow, shell, Tray, Menu, nativeImage, Notification } from "electron";
import { autoUpdater } from "electron-updater";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { format } from "node:url";
import { allowsPrereleaseBuilds } from "../shared/updateChannels";
import { AuthController } from "./auth";
import { loadSession, clearSession } from "./core/storage";
import { TwitchService } from "./twitch/service";
import { createChannelTracker, normalizeTrackerMode } from "./twitch/tracker";
import { UserPubSub } from "./twitch/userPubSub";
import { registerIpcHandlers } from "./ipc";
import { loadSettings, saveSettings, type SettingsData } from "./core/settings";
import { loadStats, saveStats, bumpStats, resetStats } from "./core/stats";

const isDev = !app.isPackaged;

/**
 * Behavior flags read on every close/minimize event. Seeded from settings
 * at startup; refreshed whenever the IPC layer saves new settings (see
 * registerIpcHandlers wiring below).
 */
let appBehavior: { closeToTray: boolean; minimizeToTray: boolean } = {
  closeToTray: true,
  minimizeToTray: false,
};

/**
 * Set to true in app.on("before-quit") so the close intercept knows the
 * user (or OS) wants to actually exit, not just hide to tray.
 */
let isQuitting = false;

/** Latest bounds snapshot used by persistBoundsNow; refreshed on resize/move. */
let lastBoundsSnapshot: SettingsData["windowBounds"] | undefined;
let boundsSaveTimer: NodeJS.Timeout | null = null;
const BOUNDS_SAVE_DEBOUNCE_MS = 500;

function snapshotWindowBounds(win: BrowserWindow): SettingsData["windowBounds"] | undefined {
  if (win.isDestroyed()) return undefined;
  // When maximized, save the pre-maximize "normal" bounds so restore on next
  // launch starts in the right place, then re-maximizes.
  const isMaximized = win.isMaximized();
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
  if (!bounds) return undefined;
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    isMaximized,
  };
}

function scheduleBoundsSave(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  lastBoundsSnapshot = snapshotWindowBounds(win);
  if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
  boundsSaveTimer = setTimeout(() => {
    boundsSaveTimer = null;
    if (!lastBoundsSnapshot) return;
    void saveSettings({ windowBounds: lastBoundsSnapshot }).catch((err) => {
      console.warn("window-bounds: save failed", err);
    });
  }, BOUNDS_SAVE_DEBOUNCE_MS);
}

function persistBoundsNow() {
  if (boundsSaveTimer) {
    clearTimeout(boundsSaveTimer);
    boundsSaveTimer = null;
  }
  if (!lastBoundsSnapshot) return;
  void saveSettings({ windowBounds: lastBoundsSnapshot }).catch((err) => {
    console.warn("window-bounds: final save failed", err);
  });
}
const devToolsEnabled = isDev;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
const debugLogsOptIn =
  process.argv.includes("--debug-logs") || process.env.DROPPILOT_DEBUG_LOGS === "1";
const verboseLogsEnabled = isDev || debugLogsOptIn;
const trackerMode = normalizeTrackerMode(process.env.DROPPILOT_TRACKER_MODE);
const auth = new AuthController();
const twitchService = new TwitchService(loadSession);
const channelTracker = createChannelTracker(twitchService, trackerMode);
const userPubSub = new UserPubSub(loadSession);
let tray: Tray | null = null;
let updateTimer: NodeJS.Timeout | null = null;
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
let lastUpdateNotice: string | null = null;

function extractReleaseNoteText(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return "";
  const record = entry as Record<string, unknown>;
  if (typeof record.note === "string") return record.note;
  if (typeof record.body === "string") return record.body;
  if (typeof record.releaseNotes === "string") return record.releaseNotes;
  return "";
}

function extractUserFacingSection(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const normalizeLine = (line: string) => line.replace(/[’`]/g, "'").trim();
  const userHeadingRe = /^(?:#{1,6}\s*)?what'?s new for users\s*$/i;
  const markdownHeadingRe = /^#{1,6}\s+\S/;
  const changelogHeadingRe =
    /^(?:#{1,6}\s*)?(full\s+changelog|what'?s changed|changelog)\b[:\s-]*.*$/i;
  const isUserHeading = (line: string) => userHeadingRe.test(normalizeLine(line));
  const isMarkdownHeading = (line: string) => markdownHeadingRe.test(normalizeLine(line));
  const isChangelogHeading = (line: string) => changelogHeadingRe.test(normalizeLine(line));
  const start = lines.findIndex((line) => isUserHeading(line));
  if (start < 0) {
    const changelogStart = lines.findIndex((line) => isChangelogHeading(line));
    const fallbackLines = changelogStart >= 0 ? lines.slice(0, changelogStart) : lines;
    return fallbackLines.join("\n").trim();
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (isChangelogHeading(lines[i])) {
      end = i;
      break;
    }
    if (isMarkdownHeading(lines[i]) && !isUserHeading(lines[i])) {
      end = i;
      break;
    }
  }
  return lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
}

function normalizeReleaseNotes(value: unknown): string | undefined {
  const raw = Array.isArray(value)
    ? value
        .map((entry) => extractReleaseNoteText(entry))
        .filter((entry) => entry.trim().length > 0)
        .join("\n\n")
    : extractReleaseNoteText(value);
  if (!raw) return undefined;
  const text = raw
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const userFacing = extractUserFacingSection(text);
  return userFacing.length > 0 ? userFacing : undefined;
}

function withDebugLogsQuery(url: string): string {
  if (!verboseLogsEnabled) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("debugLogs", "1");
    return parsed.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}debugLogs=1`;
  }
}

if (process.platform === "win32") {
  app.setAppUserModelId("com.droppilot.app");
}

function applyAutoStartSetting(enabled: boolean) {
  if (process.platform !== "win32") return;
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: enabled ? ["--start-in-tray"] : [],
    });
  } catch (err) {
    console.warn("autostart: apply failed", err);
  }
}

function createWindow(
  startHidden = false,
  initialBounds?: SettingsData["windowBounds"],
): BrowserWindow {
  const isMac = process.platform === "darwin";
  const useStoredBounds = !!initialBounds;
  const win = new BrowserWindow({
    width: useStoredBounds ? initialBounds.width : 1400,
    height: useStoredBounds ? initialBounds.height : 900,
    x: useStoredBounds ? initialBounds.x : undefined,
    y: useStoredBounds ? initialBounds.y : undefined,
    minWidth: 1100,
    minHeight: 760,
    title: "DropPilot",
    show: !startHidden,
    autoHideMenuBar: !isMac,
    // Windows: hide the OS title bar entirely; the renderer Titlebar draws
    // its own min/max/close buttons (with Lucide icons + Pro Console styling).
    // macOS: keep native chrome (traffic lights).
    titleBarStyle: isMac ? "default" : "hidden",
    frame: isMac,
    backgroundColor: "#040814",
    webPreferences: {
      // preload bundle name matches vite-plugin-electron output (preload.js)
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: devToolsEnabled,
      // Let Chromium throttle renderer work when minimized/hidden (e.g. tray mode).
      backgroundThrottling: true,
      spellcheck: false,
    },
  });

  if (isDev) {
    // Use Vite dev server during development (fallback to default port)
    win.loadURL(withDebugLogsQuery(devServerUrl));
    win.webContents.on("did-finish-load", () => {
      if (!verboseLogsEnabled) return;
      if (!win.isDestroyed() && !win.webContents.isDevToolsOpened()) {
        win.webContents.openDevTools({ mode: "right" });
      }
    });
  } else {
    const rendererUrl = format({
      pathname: join(__dirname, "../../dist/renderer/index.html"),
      protocol: "file:",
      slashes: true,
    });
    win.loadURL(withDebugLogsQuery(rendererUrl));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // First-launch default is maximized. Stored sessions restore their saved
  // isMaximized state instead (if previously maximized, re-maximize after the
  // explicit x/y/w/h has been applied above).
  if (useStoredBounds) {
    if (initialBounds.isMaximized) win.maximize();
  } else {
    win.maximize();
  }

  if (startHidden) {
    win.once("ready-to-show", () => {
      win.hide();
    });
  }

  // Push maximize-state changes to the renderer so the custom Titlebar can
  // swap its maximize/restore icon. Fires on the OS-level maximize/unmaximize
  // events (which include double-click on titlebar, snap-zones, etc.).
  const sendMaxState = () => {
    if (win.isDestroyed()) return;
    win.webContents.send("app/maximizedChange", { isMaximized: win.isMaximized() });
  };
  win.on("maximize", sendMaxState);
  win.on("unmaximize", sendMaxState);

  // Persist window bounds (debounced 500ms) on user-driven resize/move so the
  // next launch restores the same position. Also runs on maximize/unmaximize
  // so the isMaximized snapshot stays accurate.
  const scheduleSave = () => scheduleBoundsSave(win);
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("maximize", scheduleSave);
  win.on("unmaximize", scheduleSave);
  // Seed an initial snapshot in case the user closes before any resize event
  lastBoundsSnapshot = snapshotWindowBounds(win);

  // Close intercept: when closeToTray is on (default) and the app isn't
  // actually quitting, hide the window to the tray instead of destroying it.
  // The tray icon's Quit menu item is the explicit exit path.
  win.on("close", (event) => {
    if (isQuitting) {
      // Real quit — save final bounds synchronously-ish (fire-and-forget) and let close proceed.
      lastBoundsSnapshot = snapshotWindowBounds(win) ?? lastBoundsSnapshot;
      persistBoundsNow();
      return;
    }
    if (appBehavior.closeToTray) {
      event.preventDefault();
      win.hide();
    }
  });

  // Minimize-to-tray: when on, hide rather than minimize so the window
  // drops out of the taskbar entirely. The tray icon brings it back.
  win.on("minimize", (event: Electron.Event) => {
    if (appBehavior.minimizeToTray) {
      event.preventDefault();
      win.hide();
    }
  });

  return win;
}

function resolveTrayIcon() {
  // Package icons along with extraResources; fall back to repo icons in dev
  const prodIcon = join(process.resourcesPath, "icons", "icon.png");
  if (app.isPackaged) {
    return nativeImage.createFromPath(prodIcon);
  }
  const devCandidates = [
    join(process.cwd(), "icons", "icon.png"),
    join(app.getAppPath(), "icons", "icon.png"),
    join(app.getAppPath(), "..", "icons", "icon.png"),
    join(app.getAppPath(), "..", "..", "icons", "icon.png"),
  ];
  const devIcon = devCandidates.find((candidate) => existsSync(candidate)) ?? devCandidates[0];
  return nativeImage.createFromPath(devIcon);
}

function createTray(win: BrowserWindow) {
  if (tray) return tray;
  const icon = resolveTrayIcon();
  tray = new Tray(icon);
  const toggleDevTools = () => {
    const targets = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
    if (targets.length === 0) {
      console.warn("devtools: no windows");
      return;
    }
    for (const target of targets) {
      const wc = target.webContents;
      if (wc.isDevToolsOpened()) {
        wc.closeDevTools();
      } else {
        wc.openDevTools({ mode: "right" });
      }
    }
  };
  const contextMenuItems = [
    {
      label: "Oeffnen",
      click: () => {
        win.show();
        win.focus();
      },
    },
    {
      label: "Minimieren",
      click: () => win.hide(),
    },
    ...(devToolsEnabled
      ? [
          { type: "separator" as const },
          {
            label: "DevTools",
            click: toggleDevTools,
          },
        ]
      : []),
    { type: "separator" as const },
    {
      label: "Beenden",
      click: () => {
        app.quit();
      },
    },
  ];
  const contextMenu = Menu.buildFromTemplate(contextMenuItems);
  tray.setToolTip("DropPilot");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
  return tray;
}

function setupAutoUpdater() {
  if (process.platform !== "win32") return;
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;

  const broadcast = (payload: Record<string, unknown>) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("app/updateStatus", payload);
      }
    }
  };
  const notify = (title: string, body?: string) => {
    if (!Notification.isSupported()) return;
    new Notification({ title, body: body ?? "" }).show();
  };

  autoUpdater.on("update-available", (info) => {
    console.log("update: available");
    broadcast({
      status: "available",
      version: info?.version,
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
    });
    const version = info?.version ? String(info.version) : null;
    if (version && version !== lastUpdateNotice) {
      notify("Update available", `DropPilot ${version} is ready to download.`);
      lastUpdateNotice = version;
    }
  });
  autoUpdater.on("update-not-available", () => {
    console.log("update: none");
    broadcast({ status: "none" });
  });
  autoUpdater.on("error", (err) => {
    console.warn("update: error", err);
    broadcast({ status: "error", message: err instanceof Error ? err.message : String(err) });
  });
  autoUpdater.on("download-progress", (progress) => {
    broadcast({
      status: "downloading",
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    broadcast({
      status: "downloaded",
      version: info?.version,
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
    });
    notify("Update ready", "Restart DropPilot to install the update.");
  });

  const check = () => {
    void autoUpdater.checkForUpdates();
  };
  void loadSettings()
    .then((settings) => {
      autoUpdater.allowPrerelease = allowsPrereleaseBuilds(settings.updateChannel);
    })
    .catch(() => {
      autoUpdater.allowPrerelease = false;
    })
    .finally(() => {
      check();
      updateTimer = setInterval(check, UPDATE_INTERVAL_MS);
    });
}

app.whenReady().then(async () => {
  const startHidden = process.argv.includes("--start-in-tray");
  // Read settings before creating the window so we can restore bounds + seed
  // behavior flags before any close/minimize event can fire.
  let initialSettings: SettingsData | undefined;
  try {
    initialSettings = await loadSettings();
    appBehavior = {
      closeToTray: initialSettings.closeToTray,
      minimizeToTray: initialSettings.minimizeToTray,
    };
  } catch (err) {
    console.warn("settings: initial load failed", err);
  }
  const win = createWindow(startHidden, initialSettings?.windowBounds);
  if (!isDev && debugLogsOptIn) {
    console.log("[DropPilot] Verbose logging enabled (prod opt-in).");
  }
  const effectiveTrackerMode = channelTracker.mode;
  if (effectiveTrackerMode !== trackerMode) {
    console.log(
      `[DropPilot] Channel tracker mode: ${effectiveTrackerMode} (requested: ${trackerMode})`,
    );
  } else {
    console.log(`[DropPilot] Channel tracker mode: ${effectiveTrackerMode}`);
  }
  createTray(win);
  setupAutoUpdater();
  userPubSub.start();
  if (initialSettings) {
    applyAutoStartSetting(initialSettings.autoStart);
  }

  // Forward noisy Twitch logs only in development or explicit prod opt-in.
  if (verboseLogsEnabled) {
    const forwardLog = (scope: string, ...args: unknown[]) => {
      console.log(`[${scope}]`, ...args);
      if (!win.isDestroyed()) {
        win.webContents.send("main-log", { scope, args });
      }
    };
    (twitchService as any).debug = (...args: unknown[]) => forwardLog("TwitchService", ...args);
  } else {
    (twitchService as any).debug = () => {};
  }

  // Wrap saveSettings so the tray-behavior flags stay live with user toggles
  // without forcing every close/minimize handler to read settings from disk.
  const saveSettingsWithBehaviorSync: typeof saveSettings = async (data) => {
    const next = await saveSettings(data);
    appBehavior = {
      closeToTray: next.closeToTray,
      minimizeToTray: next.minimizeToTray,
    };
    return next;
  };

  registerIpcHandlers({
    auth,
    twitch: twitchService,
    channelTracker,
    userPubSub,
    loadSession,
    clearSession,
    loadSettings,
    saveSettings: saveSettingsWithBehaviorSync,
    loadStats,
    saveStats,
    bumpStats,
    resetStats,
    applyAutoStartSetting,
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow();
      createTray(newWin);
    }
  });
});

app.on("window-all-closed", () => {
  // When closeToTray is on, the window-hide doesn't fire window-all-closed
  // (the BrowserWindow is preserved). This handler still fires when the user
  // explicitly closes all windows via the tray "Quit" or system shutdown.
  // On macOS the convention is to keep the app alive even after the last
  // window closes; we keep that.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (typeof channelTracker.dispose === "function") {
    channelTracker.dispose();
  }
  userPubSub.dispose();
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
});
