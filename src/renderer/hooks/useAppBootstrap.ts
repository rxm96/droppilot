import { demoProfile } from "../demoData";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthState, ProfileState, View, WatchingState } from "../types";
import { errorInfoFromIpc } from "../utils/errors";
import { isVerboseLoggingEnabled, logDebug } from "../utils/logger";
import { setLogCollectionEnabled } from "../utils/logStore";

type FetchInventory = (opts?: { forceLoading?: boolean }) => Promise<void>;

export type AppUpdateStatus = {
  state: "idle" | "checking" | "available" | "downloading" | "downloaded" | "none" | "error" | "unsupported";
  message?: string;
  version?: string;
  progress?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
};

type Params = {
  authStatus: AuthState["status"];
  demoMode: boolean;
  debugEnabled: boolean;
  autoSelect: boolean;
  view: View;
  setView: (next: View) => void;
  setAutoSelectEnabled: (next: boolean) => void;
  watching: WatchingState;
  fetchInventory: FetchInventory;
  forwardAuthError: (message?: string) => void;
};

export function useAppBootstrap({
  authStatus,
  demoMode,
  debugEnabled,
  autoSelect,
  view,
  setView,
  setAutoSelectEnabled,
  watching,
  fetchInventory,
  forwardAuthError,
}: Params) {
  const [profile, setProfile] = useState<ProfileState>({ status: "idle" });
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>({ state: "idle" });
  const [appVersion, setAppVersion] = useState<string>("");
  const fetchInventoryRef = useRef(fetchInventory);

  useEffect(() => {
    fetchInventoryRef.current = fetchInventory;
  }, [fetchInventory]);

  const fetchProfile = useCallback(async () => {
    if (demoMode) {
      setProfile(demoProfile);
      return;
    }
    setProfile({ status: "loading" });
    const res = await window.electronAPI.twitch.profile();
    if ((res as any)?.error) {
      if ((res as any).error === "auth") {
        forwardAuthError((res as any).message);
        return;
      }
      const errInfo = errorInfoFromIpc(res as any, "Konnte Profil nicht laden");
      setProfile({
        status: "error",
        message: errInfo.message ?? "Konnte Profil nicht laden",
        code: errInfo.code,
      });
      return;
    }
    if (!res) {
      setProfile({ status: "error", message: "Leere Antwort" });
      return;
    }
    const data = res as any;
    setProfile({
      status: "ready",
      displayName: data.displayName,
      login: data.login,
      avatar: data.profileImageUrl,
    });
  }, [demoMode, forwardAuthError]);

  useEffect(() => {
    setAutoSelectEnabled(autoSelect);
  }, [autoSelect, setAutoSelectEnabled]);

  useEffect(() => {
    setLogCollectionEnabled(debugEnabled);
  }, [debugEnabled]);

  useEffect(() => {
    if (view === "debug" && !debugEnabled) {
      setView("overview");
    }
  }, [view, debugEnabled, setView]);

  // Show forwarded main-process logs (TwitchService etc.) in DevTools console.
  useEffect(() => {
    if (!isVerboseLoggingEnabled()) return;
    const unsubscribe = window.electronAPI.logs?.onMainLog?.((payload) => {
      logDebug(`[main:${payload.scope}]`, ...(payload.args ?? []));
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchVersion = async () => {
      const res = await window.electronAPI.app?.getVersion?.();
      if (!cancelled && res?.version) {
        const baseVersion = String(res.version);
        const buildSha = typeof __GIT_SHA__ !== "undefined" ? String(__GIT_SHA__) : "";
        const versionLabel =
          buildSha && !baseVersion.includes("+") ? `${baseVersion}+${buildSha}` : baseVersion;
        setAppVersion(versionLabel);
      }
    };
    void fetchVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.app?.onUpdateStatus?.((payload) => {
      const status = payload?.status;
      if (status === "available") {
        setUpdateStatus({ state: "available", version: payload.version as string | undefined });
      } else if (status === "none") {
        setUpdateStatus({ state: "none" });
      } else if (status === "downloading") {
        setUpdateStatus({
          state: "downloading",
          progress: Number(payload.percent ?? 0),
          transferred: Number(payload.transferred ?? 0),
          total: Number(payload.total ?? 0),
          bytesPerSecond: Number(payload.bytesPerSecond ?? 0),
        });
      } else if (status === "downloaded") {
        setUpdateStatus({ state: "downloaded" });
      } else if (status === "error") {
        setUpdateStatus({
          state: "error",
          message: payload.message ? String(payload.message) : "Update error",
        });
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (demoMode) {
      setProfile(demoProfile);
      void fetchInventoryRef.current({ forceLoading: true });
      return;
    }
    if (authStatus === "ok") {
      void fetchProfile();
      void fetchInventoryRef.current({ forceLoading: true });
    } else {
      setProfile({ status: "idle" });
    }
  }, [authStatus, demoMode, fetchProfile]);

  useEffect(() => {
    const onUnload = () => {
      if (watching) {
        void fetchInventoryRef.current({ forceLoading: true });
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [watching]);

  return {
    profile,
    appVersion,
    updateStatus,
    setUpdateStatus,
  };
}
