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
const devToolsEnabled = isDev;
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

// Lightweight splash mode: shows a small "Installing update" window, then exits.
// Spawned as a detached child process before quitAndInstall so it survives the app quit.
if (process.argv.includes("--update-splash")) {
  app.whenReady().then(() => {
    const splash = new BrowserWindow({
      width: 360,
      height: 240,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      transparent: true,
      skipTaskbar: true,
      backgroundColor: "#00000000",
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    splash.removeMenu();
    splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getUpdateSplashHtml())}`);
    splash.center();
    // Auto-close after 20s (installer should be done well before that)
    setTimeout(() => {
      if (!splash.isDestroyed()) splash.close();
      app.quit();
    }, 20_000);
  });
  // Skip all normal app initialization
}

function getUpdateSplashHtml(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:transparent;-webkit-app-region:no-drag}
body{display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,sans-serif}
.card{
  display:flex;flex-direction:column;align-items:center;gap:14px;
  padding:32px 36px;border-radius:20px;text-align:center;
  background:linear-gradient(160deg,rgba(12,18,34,0.97),rgba(8,12,24,0.99));
  box-shadow:0 24px 64px rgba(0,0,0,0.6),0 0 0 1px rgba(136,208,255,0.1);
  animation:cardIn .35s cubic-bezier(.16,1,.3,1) both;
}
.orb{
  width:56px;height:56px;border-radius:50%;position:relative;
  animation:breathe 1.4s ease-in-out infinite;
}
.orb::before{
  content:"";position:absolute;inset:0;border-radius:50%;
  background:conic-gradient(from 0deg,#88d0ff,#9c8bff,#b29aff,#88d0ff);
  animation:spin 2s linear infinite;
  box-shadow:0 0 36px rgba(136,208,255,0.45),0 0 64px rgba(156,139,255,0.2);
}
.orb::after{
  content:"";position:absolute;inset:4px;border-radius:50%;
  background:linear-gradient(160deg,rgba(12,18,34,0.98),rgba(8,12,24,1));
}
h2{font-size:17px;font-weight:600;color:#f4f3ef;letter-spacing:-0.3px}
p{font-size:12px;color:rgba(244,243,239,0.5)}
.bar{width:100%;height:6px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,0.06)}
.fill{
  height:100%;border-radius:999px;width:100%;
  background:linear-gradient(90deg,#88d0ff,#9c8bff,#88d0ff);background-size:200% 100%;
  animation:shimmer 1.5s ease-in-out infinite;
  box-shadow:0 0 12px rgba(136,208,255,0.4);
}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes breathe{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.06);opacity:1}}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes cardIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
</style></head><body>
<div class="card">
  <div class="orb"></div>
  <h2>Installing update</h2>
  <p>Restarting shortly\\u2026</p>
  <div class="bar"><div class="fill"></div></div>
</div>
</body></html>`;
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
      autoUpdater.allowPrerelease = settings.betaUpdates === true;
    })
    .catch(() => {
      autoUpdater.allowPrerelease = false;
    })
    .finally(() => {
      check();
      updateTimer = setInterval(check, UPDATE_INTERVAL_MS);
    });
}

const isSplashMode = process.argv.includes("--update-splash");

if (!isSplashMode)
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
      (twitchService as any).debug = (...args: unknown[]) => forwardLog("TwitchService", ...args);
    } else {
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

if (!isSplashMode) {
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
}
