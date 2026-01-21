import { BrowserWindow, ipcMain, Notification, app } from "electron";
import { autoUpdater } from "electron-updater";
import type { AuthController, AuthResult } from "../auth";
import type { TwitchService } from "../twitch/service";
import type { SessionData } from "../core/storage";
import { exportSettings, importSettings, type SettingsData } from "../core/settings";
import type { StatsData } from "../core/stats";
import type { PriorityPlan } from "../twitch/channels";
import { TwitchServiceError } from "../twitch/errors";

export function registerIpcHandlers(deps: {
  auth: AuthController;
  twitch: TwitchService;
  loadSession: () => Promise<SessionData | null>;
  clearSession: () => Promise<void>;
  loadSettings: () => Promise<SettingsData>;
  saveSettings: (data: Partial<SettingsData>) => Promise<SettingsData>;
  loadStats: () => Promise<StatsData>;
  saveStats: (data: Partial<StatsData>) => Promise<StatsData>;
  bumpStats: (delta: {
    minutes?: number;
    claims?: number;
    lastDropTitle?: string;
    lastGame?: string;
  }) => Promise<StatsData>;
  resetStats: () => Promise<StatsData>;
  applyAutoStartSetting?: (enabled: boolean) => void;
}) {
  const {
    auth,
    twitch,
    loadSession,
    clearSession,
    loadSettings,
    saveSettings,
    loadStats,
    saveStats,
    bumpStats,
    resetStats,
    applyAutoStartSetting,
  } = deps;

  ipcMain.handle("auth/login", async (): Promise<AuthResult> => {
    return auth.login();
  });

  ipcMain.handle("auth/loginCredentials", async (_e, payload): Promise<AuthResult> => {
    return auth.loginWithCredentials(payload);
  });

  ipcMain.handle("auth/session", async () => {
    return loadSession();
  });

  ipcMain.handle("auth/logout", async () => {
    await clearSession();
    return true;
  });

  ipcMain.handle("twitch/profile", async () => {
    try {
      return await twitch.getProfile();
    } catch (err) {
      if (twitch.isAuthError(err)) {
        return { error: "auth", message: (err as Error).message, status: (err as any).status };
      }
      if (err instanceof TwitchServiceError) {
        return { error: "twitch", code: err.code, message: err.message };
      }
      return { error: "unknown", message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("twitch/inventory", async () => {
    try {
      return await twitch.getInventory();
    } catch (err) {
      if (twitch.isAuthError(err)) {
        return { error: "auth", message: (err as Error).message, status: (err as any).status };
      }
      if (err instanceof TwitchServiceError) {
        return { error: "twitch", code: err.code, message: err.message };
      }
      return { error: "unknown", message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("twitch/priorityPlan", async (_e, payload: { priorityGames?: string[] }) => {
    const list = payload?.priorityGames ?? [];
    try {
      const plan: PriorityPlan = await twitch.getPriorityPlan(list);
      return plan;
    } catch (err) {
      if (twitch.isAuthError(err)) {
        return { error: "auth", message: (err as Error).message, status: (err as any).status };
      }
      if (err instanceof TwitchServiceError) {
        return { error: "twitch", code: err.code, message: err.message };
      }
      return { error: "unknown", message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("twitch/channels", async (_e, payload: { game: string }) => {
    try {
      return await twitch.getChannelsForGame(payload.game);
    } catch (err) {
      if (twitch.isAuthError(err)) {
        return { error: "auth", message: (err as Error).message, status: (err as any).status };
      }
      if (err instanceof TwitchServiceError) {
        return { error: "twitch", code: err.code, message: err.message };
      }
      return { error: "unknown", message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(
    "twitch/watch",
    async (_e, payload: { channelId: string; login: string; streamId?: string }) => {
      try {
        return await twitch.sendWatchPing(payload);
      } catch (err) {
        if (twitch.isAuthError(err)) {
          return { error: "auth", message: (err as Error).message, status: (err as any).status };
        }
        if (err instanceof TwitchServiceError) {
          return { error: "twitch", code: err.code, message: err.message };
        }
        return { error: "unknown", message: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle(
    "twitch/claimDrop",
    async (_e, payload: { dropInstanceId?: string; dropId?: string; campaignId?: string }) => {
      try {
        return await twitch.claimDrop(payload);
      } catch (err) {
        if (twitch.isAuthError(err)) {
          return { error: "auth", message: (err as Error).message, status: (err as any).status };
        }
        if (err instanceof TwitchServiceError) {
          return { error: "twitch", code: err.code, message: err.message };
        }
        return { error: "unknown", message: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle("settings/get", async () => {
    return loadSettings();
  });

  ipcMain.handle("settings/save", async (_e, payload: Partial<SettingsData>) => {
    const saved = await saveSettings(payload);
    applyAutoStartSetting?.(saved.autoStart);
    return saved;
  });

  ipcMain.handle("settings/export", async () => {
    return exportSettings();
  });

  ipcMain.handle("settings/import", async (_e, payload: Partial<SettingsData>) => {
    const saved = await importSettings(payload);
    applyAutoStartSetting?.(saved.autoStart);
    return saved;
  });

  ipcMain.handle("stats/get", async () => {
    return loadStats();
  });

  ipcMain.handle("stats/save", async (_e, payload: Partial<StatsData>) => {
    return saveStats(payload);
  });

  ipcMain.handle(
    "stats/bump",
    async (
      _e,
      payload: { minutes?: number; claims?: number; lastDropTitle?: string; lastGame?: string },
    ) => {
      return bumpStats(payload);
    },
  );

  ipcMain.handle("stats/reset", async () => {
    return resetStats();
  });

  ipcMain.handle(
    "app/windowControl",
    async (
      event,
      payload: { action: "minimize" | "maximize" | "restore" | "close" | "hide-to-tray" },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { ok: false, message: "No window" };
      try {
        switch (payload.action) {
          case "minimize":
            win.minimize();
            break;
          case "maximize":
            win.maximize();
            break;
          case "restore":
            if (win.isMaximized()) {
              win.unmaximize();
            } else {
              win.restore();
            }
            break;
          case "close":
            win.close();
            break;
          case "hide-to-tray":
            win.hide();
            break;
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle("app/checkUpdates", async () => {
    if (process.platform !== "win32" || !app.isPackaged) {
      return { ok: false, status: "unsupported" };
    }
    try {
      autoUpdater.autoDownload = false;
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version;
      if (version && version !== app.getVersion()) {
        return { ok: true, status: "available", version };
      }
      return { ok: true, status: "none" };
    } catch (err) {
      return {
        ok: false,
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("app/downloadUpdate", async () => {
    if (process.platform !== "win32" || !app.isPackaged) {
      return { ok: false, status: "unsupported" };
    }
    try {
      autoUpdater.autoDownload = false;
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("app/installUpdate", async () => {
    if (process.platform !== "win32" || !app.isPackaged) {
      return { ok: false, status: "unsupported" };
    }
    try {
      autoUpdater.quitAndInstall(true, true);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("app/getVersion", async () => {
    return { version: app.getVersion() };
  });

  ipcMain.handle("app/notify", async (_event, payload: { title?: string; body?: string }) => {
    if (!payload?.title) return { ok: false, message: "Missing title" };
    if (!Notification.isSupported()) return { ok: false, message: "Notifications not supported" };
    try {
      const notif = new Notification({
        title: payload.title,
        body: payload.body ?? "",
      });
      notif.show();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });
}
