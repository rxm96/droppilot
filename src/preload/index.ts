import type { Language } from "../renderer/shared/i18n";
import { contextBridge, ipcRenderer, shell } from "electron";

type SettingsPayload = {
  priorityGames?: string[];
  excludeGames?: string[];
  obeyPriority?: boolean;
  language?: Language;
  autoStart?: boolean;
  autoClaim?: boolean;
  autoSelect?: boolean;
  autoSwitch?: boolean;
  warmupEnabled?: boolean;
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

type ChannelsDiffPayload = {
  game: string;
  at: number;
  source: "ws" | "fetch";
  reason: "snapshot" | "stream-up" | "stream-down" | "viewers";
  added: Array<{
    id: string;
    login: string;
    displayName: string;
    streamId?: string;
    title: string;
    viewers: number;
    language?: string;
    thumbnail?: string;
    game: string;
  }>;
  removedIds: string[];
  updated: Array<{
    id: string;
    login: string;
    displayName: string;
    streamId?: string;
    title: string;
    viewers: number;
    language?: string;
    thumbnail?: string;
    game: string;
  }>;
};

type UserPubSubEventPayload = {
  kind: "drop-progress" | "drop-claim" | "notification";
  at: number;
  topic: string;
  messageType: string;
  dropId?: string;
  dropInstanceId?: string;
  currentProgressMin?: number;
  requiredProgressMin?: number;
  notificationType?: string;
};

type DebugUserPubSubEmitPayload = {
  kind: "drop-progress" | "drop-claim" | "notification";
  messageType?: string;
  dropId?: string;
  dropInstanceId?: string;
  currentProgressMin?: number;
  requiredProgressMin?: number;
  notificationType?: string;
};

const api = {
  openExternal: (url: string) => shell.openExternal(url),
  auth: {
    login: () => ipcRenderer.invoke("auth/login"),
    session: () => ipcRenderer.invoke("auth/session"),
    logout: () => ipcRenderer.invoke("auth/logout"),
  },
  twitch: {
    profile: () => ipcRenderer.invoke("twitch/profile"),
    inventory: () => ipcRenderer.invoke("twitch/inventory"),
    campaigns: () => ipcRenderer.invoke("twitch/campaigns"),
    priorityPlan: (payload: { priorityGames?: string[] }) =>
      ipcRenderer.invoke("twitch/priorityPlan", payload),
    channels: (payload: { game: string }) => ipcRenderer.invoke("twitch/channels", payload),
    trackerStatus: () => ipcRenderer.invoke("twitch/trackerStatus"),
    userPubSubStatus: () => ipcRenderer.invoke("twitch/userPubSubStatus"),
    debugEmitUserPubSubEvent: (payload: DebugUserPubSubEmitPayload) =>
      ipcRenderer.invoke("twitch/debugEmitUserPubSubEvent", payload),
    watch: (payload: { channelId: string; login: string; streamId?: string }) =>
      ipcRenderer.invoke("twitch/watch", payload),
    claimDrop: (payload: { dropInstanceId?: string; dropId?: string; campaignId?: string }) =>
      ipcRenderer.invoke("twitch/claimDrop", payload),
    onChannelsDiff: (handler: (payload: ChannelsDiffPayload) => void) => {
      const listener = (_event: unknown, payload: ChannelsDiffPayload) => handler(payload);
      ipcRenderer.on("twitch/channelsDiff", listener);
      return () => ipcRenderer.removeListener("twitch/channelsDiff", listener);
    },
    onUserPubSubEvent: (handler: (payload: UserPubSubEventPayload) => void) => {
      const listener = (_event: unknown, payload: UserPubSubEventPayload) => handler(payload);
      ipcRenderer.on("twitch/userPubSubEvent", listener);
      return () => ipcRenderer.removeListener("twitch/userPubSubEvent", listener);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke("settings/get"),
    save: (payload: SettingsPayload) => ipcRenderer.invoke("settings/save", payload),
    export: () => ipcRenderer.invoke("settings/export"),
    import: (payload: SettingsPayload) => ipcRenderer.invoke("settings/import", payload),
  },
  stats: {
    get: () => ipcRenderer.invoke("stats/get"),
    save: (payload: {
      totalMinutes?: number;
      totalClaims?: number;
      lastReset?: number;
      claimsByGame?: Record<string, number>;
    }) => ipcRenderer.invoke("stats/save", payload),
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
