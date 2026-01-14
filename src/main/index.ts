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

if (process.platform === "win32") {
  app.setAppUserModelId("com.droppilot.app");
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    title: "DropPilot",
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
      })
    );
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // default to maximized so the UI uses the available screen space
  win.maximize();

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

  autoUpdater.autoDownload = true;

  autoUpdater.on("update-available", () => {
    console.log("update: available");
  });
  autoUpdater.on("update-not-available", () => {
    console.log("update: none");
  });
  autoUpdater.on("error", (err) => {
    console.warn("update: error", err);
  });
  autoUpdater.on("update-downloaded", () => {
    const notif = new Notification({
      title: "DropPilot Update",
      body: "Update downloaded. Click to restart and install.",
    });
    notif.on("click", () => {
      autoUpdater.quitAndInstall();
    });
    notif.show();
  });

  const check = () => {
    void autoUpdater.checkForUpdates();
  };
  check();
  updateTimer = setInterval(check, 4 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  const win = createWindow();
  createTray(win);
  setupAutoUpdater();

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
