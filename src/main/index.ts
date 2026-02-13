import { app, BrowserWindow, shell, Tray, Menu, nativeImage, Notification } from "electron";
import { autoUpdater } from "electron-updater";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { format } from "node:url";
import { AuthController } from "./auth";
import { loadSession, clearSession } from "./core/storage";
import { TwitchService } from "./twitch/service";
import { createChannelTracker, normalizeTrackerMode } from "./twitch/tracker";
import { UserPubSub } from "./twitch/userPubSub";
import { registerIpcHandlers } from "./ipc";
import { loadSettings, saveSettings } from "./core/settings";
import { loadStats, saveStats, bumpStats, resetStats } from "./core/stats";

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
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

function createWindow(startHidden = false): BrowserWindow {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    title: "DropPilot",
    show: !startHidden,
    autoHideMenuBar: !isMac,
    titleBarStyle: isMac ? "default" : "hidden",
    frame: isMac,
    backgroundColor: "#040814",
    webPreferences: {
      // preload bundle name matches vite-plugin-electron output (preload.js)
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: verboseLogsEnabled,
      // Let Chromium throttle renderer work when minimized/hidden (e.g. tray mode).
      backgroundThrottling: true,
      spellcheck: false,
    },
  });

  if (isDev) {
    // Use Vite dev server during development (fallback to default port)
    win.loadURL(withDebugLogsQuery(devServerUrl));
    win.webContents.openDevTools();
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

  // default to maximized so the UI uses the available screen space
  win.maximize();

  if (startHidden) {
    win.once("ready-to-show", () => {
      win.hide();
    });
  }

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
  const contextMenu = Menu.buildFromTemplate([
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
    { type: "separator" },
    {
      label: "Beenden",
      click: () => {
        app.quit();
      },
    },
  ]);
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
  check();
  updateTimer = setInterval(check, UPDATE_INTERVAL_MS);
}

app.whenReady().then(() => {
  const startHidden = process.argv.includes("--start-in-tray");
  const win = createWindow(startHidden);
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
  void loadSettings()
    .then((settings) => {
      applyAutoStartSetting(settings.autoStart);
    })
    .catch((err) => {
      console.warn("autostart: settings load failed", err);
    });

  // Forward noisy Twitch logs only in development or explicit prod opt-in.
  if (verboseLogsEnabled) {
    const forwardLog = (scope: string, ...args: unknown[]) => {
      console.log(`[${scope}]`, ...args);
      if (!win.isDestroyed()) {
        win.webContents.send("main-log", { scope, args });
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (twitchService as any).debug = (...args: unknown[]) => forwardLog("TwitchService", ...args);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (twitchService as any).debug = () => {};
  }

  registerIpcHandlers({
    auth,
    twitch: twitchService,
    channelTracker,
    userPubSub,
    loadSession,
    clearSession,
    loadSettings,
    saveSettings,
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (typeof channelTracker.dispose === "function") {
    channelTracker.dispose();
  }
  userPubSub.dispose();
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
});
