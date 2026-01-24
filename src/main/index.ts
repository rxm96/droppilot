import { app, BrowserWindow, shell, Tray, Menu, nativeImage, Notification } from "electron";
import { autoUpdater } from "electron-updater";
import { join } from "node:path";
import { format } from "node:url";
import { AuthController } from "./auth";
import { loadSession, clearSession } from "./core/storage";
import { TwitchService } from "./twitch/service";
import { registerIpcHandlers } from "./ipc";
import { loadSettings, saveSettings } from "./core/settings";
import { loadStats, saveStats, bumpStats, resetStats } from "./core/stats";

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const auth = new AuthController();
const twitchService = new TwitchService(loadSession);
let tray: Tray | null = null;
let updateTimer: NodeJS.Timeout | null = null;
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
let lastUpdateNotice: string | null = null;

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
      devTools: true,
      backgroundThrottling: false,
    },
  });

  if (isDev) {
    // Use Vite dev server during development (fallback to default port)
    win.loadURL(devServerUrl);
    win.webContents.openDevTools();
  } else {
    win.loadURL(
      format({
        pathname: join(__dirname, "../../dist/renderer/index.html"),
        protocol: "file:",
        slashes: true,
      }),
    );
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
  const devIcon = join(app.getAppPath(), "../icons/icon.png");
  const prodIcon = join(process.resourcesPath, "icons", "icon.png");
  return nativeImage.createFromPath(app.isPackaged ? prodIcon : devIcon);
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
    broadcast({ status: "available", version: info?.version });
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
  autoUpdater.on("update-downloaded", () => {
    broadcast({ status: "downloaded" });
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
  createTray(win);
  setupAutoUpdater();
  void loadSettings()
    .then((settings) => {
      applyAutoStartSetting(settings.autoStart);
    })
    .catch((err) => {
      console.warn("autostart: settings load failed", err);
    });

  // Forward TwitchService debug logs into renderer console (DevTools) and main console.
  const forwardLog = (scope: string, ...args: unknown[]) => {
    console.log(`[${scope}]`, ...args);
    if (!win.isDestroyed()) {
      win.webContents.send("main-log", { scope, args });
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (twitchService as any).debug = (...args: unknown[]) => forwardLog("TwitchService", ...args);

  registerIpcHandlers({
    auth,
    twitch: twitchService,
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
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
});
