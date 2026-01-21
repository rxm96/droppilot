import { contextBridge, ipcRenderer, shell } from "electron";

type SettingsPayload = {
  priorityGames?: string[];
  excludeGames?: string[];
  obeyPriority?: boolean;
  language?: "de" | "en";
  autoStart?: boolean;
  autoClaim?: boolean;
  autoSelect?: boolean;
  autoSwitch?: boolean;
  refreshMinMs?: number;
  refreshMaxMs?: number;
  demoMode?: boolean;
  alertsEnabled?: boolean;
  alertsNotifyWhileFocused?: boolean;
  alertsDropClaimed?: boolean;
  alertsDropEndingSoon?: boolean;
  alertsDropEndingMinutes?: number;
  alertsWatchError?: boolean;
  alertsAutoSwitch?: boolean;
  alertsNewDrops?: boolean;
};

const api = {
  openExternal: (url: string) => shell.openExternal(url),
  auth: {
    login: () => ipcRenderer.invoke("auth/login"),
    loginCredentials: (payload: { username: string; password: string; token?: string }) =>
      ipcRenderer.invoke("auth/loginCredentials", payload),
    session: () => ipcRenderer.invoke("auth/session"),
    logout: () => ipcRenderer.invoke("auth/logout"),
  },
  twitch: {
    profile: () => ipcRenderer.invoke("twitch/profile"),
    inventory: () => ipcRenderer.invoke("twitch/inventory"),
    priorityPlan: (payload: { priorityGames?: string[] }) =>
      ipcRenderer.invoke("twitch/priorityPlan", payload),
    channels: (payload: { game: string }) => ipcRenderer.invoke("twitch/channels", payload),
    watch: (payload: { channelId: string; login: string; streamId?: string }) =>
      ipcRenderer.invoke("twitch/watch", payload),
    claimDrop: (payload: { dropInstanceId?: string; dropId?: string; campaignId?: string }) =>
      ipcRenderer.invoke("twitch/claimDrop", payload),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings/get"),
    save: (payload: SettingsPayload) => ipcRenderer.invoke("settings/save", payload),
    export: () => ipcRenderer.invoke("settings/export"),
    import: (payload: SettingsPayload) => ipcRenderer.invoke("settings/import", payload),
  },
  stats: {
    get: () => ipcRenderer.invoke("stats/get"),
    save: (payload: { totalMinutes?: number; totalClaims?: number; lastReset?: number }) =>
      ipcRenderer.invoke("stats/save", payload),
    bump: (payload: {
      minutes?: number;
      claims?: number;
      lastDropTitle?: string;
      lastGame?: string;
    }) => ipcRenderer.invoke("stats/bump", payload),
    reset: () => ipcRenderer.invoke("stats/reset"),
  },
  app: {
    windowControl: (action: "minimize" | "maximize" | "restore" | "close" | "hide-to-tray") =>
      ipcRenderer.invoke("app/windowControl", { action }),
    checkUpdates: () => ipcRenderer.invoke("app/checkUpdates"),
    downloadUpdate: () => ipcRenderer.invoke("app/downloadUpdate"),
    installUpdate: () => ipcRenderer.invoke("app/installUpdate"),
    onUpdateStatus: (handler: (payload: { status: string; [key: string]: unknown }) => void) => {
      const listener = (_event: unknown, payload: { status: string; [key: string]: unknown }) =>
        handler(payload);
      ipcRenderer.on("app/updateStatus", listener);
      return () => ipcRenderer.removeListener("app/updateStatus", listener);
    },
    getVersion: () => ipcRenderer.invoke("app/getVersion"),
    notify: (payload: { title: string; body?: string }) =>
      ipcRenderer.invoke("app/notify", payload),
  },
  logs: {
    onMainLog: (handler: (payload: { scope: string; args: unknown[] }) => void) => {
      const listener = (_event: unknown, payload: { scope: string; args: unknown[] }) =>
        handler(payload);
      ipcRenderer.on("main-log", listener);
      return () => ipcRenderer.removeListener("main-log", listener);
    },
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

export type ElectronAPI = typeof api;

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
