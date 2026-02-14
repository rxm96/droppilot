import { BrowserWindow, ipcMain, Notification, app } from "electron";
import { autoUpdater } from "electron-updater";
import type { AuthController, AuthResult } from "../auth";
import type { TwitchService } from "../twitch/service";
import type { SessionData } from "../core/storage";
import { exportSettings, importSettings, loadSettings, type SettingsData } from "../core/settings";
import type { StatsData } from "../core/stats";
import type { PriorityPlan } from "../twitch/channels";
import { TwitchServiceError } from "../twitch/errors";
import type { ChannelTracker, ChannelTrackerDiffEvent } from "../twitch/tracker";
import type { UserPubSub, UserPubSubEvent } from "../twitch/userPubSub";

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

export function registerIpcHandlers(deps: {
  auth: AuthController;
  twitch: TwitchService;
  channelTracker: ChannelTracker;
  userPubSub?: UserPubSub;
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
  } = deps;

  const broadcastChannelsDiff = (payload: ChannelTrackerDiffEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("twitch/channelsDiff", payload);
      }
    }
  };
  const unsubscribeChannelsDiff = channelTracker.onDiff(broadcastChannelsDiff);
  const broadcastUserPubSubEvent = (payload: UserPubSubEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("twitch/userPubSubEvent", payload);
      }
    }
  };
  const unsubscribeUserPubSub =
    userPubSub?.onEvent((payload) => {
      broadcastUserPubSubEvent(payload);
    }) ?? null;
  app.once("before-quit", () => {
    unsubscribeChannelsDiff();
    if (unsubscribeUserPubSub) unsubscribeUserPubSub();
  });

  ipcMain.handle("auth/login", async (): Promise<AuthResult> => {
    const result = await auth.login();
    userPubSub?.notifySessionChanged();
    return result;
  });

  ipcMain.handle("auth/session", async () => {
    return loadSession();
  });

  ipcMain.handle("auth/logout", async () => {
    await clearSession();
    userPubSub?.notifySessionChanged();
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

  ipcMain.handle("twitch/campaigns", async () => {
    try {
      return await twitch.getCampaigns();
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
      return await channelTracker.getChannelsForGame(payload.game);
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

  ipcMain.handle("twitch/trackerStatus", async () => {
    return channelTracker.getStatus();
  });

  ipcMain.handle("twitch/userPubSubStatus", async () => {
    return userPubSub?.getStatus() ?? null;
  });

  ipcMain.handle(
    "twitch/debugEmitUserPubSubEvent",
    async (
      _e,
      payload: {
        kind: "drop-progress" | "drop-claim" | "notification";
        messageType?: string;
        dropId?: string;
        dropInstanceId?: string;
        currentProgressMin?: number;
        requiredProgressMin?: number;
        notificationType?: string;
      },
    ) => {
      if (!userPubSub) {
        return { ok: false, message: "UserPubSub unavailable" };
      }
      if (app.isPackaged && process.env.DROPPILOT_DEBUG_PUBSUB !== "1") {
        return { ok: false, message: "Debug PubSub emit disabled" };
      }
      const kind = payload?.kind;
      if (kind !== "drop-progress" && kind !== "drop-claim" && kind !== "notification") {
        return { ok: false, message: "Invalid debug event kind" };
      }
      const event = userPubSub.emitDebugEvent({
        kind,
        messageType: payload.messageType,
        dropId: payload.dropId,
        dropInstanceId: payload.dropInstanceId,
        currentProgressMin: payload.currentProgressMin,
        requiredProgressMin: payload.requiredProgressMin,
        notificationType: payload.notificationType,
      });
      return { ok: true, event };
    },
  );

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
    if (process.platform === "win32" && app.isPackaged) {
      autoUpdater.allowPrerelease = saved.betaUpdates === true;
    }
    return saved;
  });

  ipcMain.handle("settings/export", async () => {
    return exportSettings();
  });

  ipcMain.handle("settings/import", async (_e, payload: Partial<SettingsData>) => {
    const saved = await importSettings(payload);
    applyAutoStartSetting?.(saved.autoStart);
    if (process.platform === "win32" && app.isPackaged) {
      autoUpdater.allowPrerelease = saved.betaUpdates === true;
    }
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
      const settings = await loadSettings();
      autoUpdater.allowPrerelease = settings.betaUpdates === true;
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version;
      const releaseNotes = normalizeReleaseNotes(result?.updateInfo?.releaseNotes);
      if (version && version !== app.getVersion()) {
        return { ok: true, status: "available", version, releaseNotes };
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
