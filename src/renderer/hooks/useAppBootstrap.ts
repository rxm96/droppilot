import { demoProfile } from "../demoData";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthState, ProfileState, View, WatchingState } from "../types";
import { errorInfoFromIpc, errorInfoFromUnknown } from "../utils/errors";
import { isIpcAuthErrorResponse, isIpcErrorResponse, isTwitchProfile } from "../utils/ipc";
import { isVerboseLoggingEnabled, logDebug } from "../utils/logger";
import { setLogCollectionEnabled } from "../utils/logStore";
import { RENDERER_ERROR_CODES, TWITCH_ERROR_CODES } from "../../shared/errorCodes";

type FetchInventory = (opts?: { forceLoading?: boolean }) => Promise<void>;

export type AppUpdateStatus = {
  state:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "none"
    | "error"
    | "unsupported";
  message?: string;
  version?: string;
  releaseNotes?: string;
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
    try {
      const res: unknown = await window.electronAPI.twitch.profile();
      if (isIpcErrorResponse(res)) {
        if (isIpcAuthErrorResponse(res)) {
          forwardAuthError(res.message);
          return;
        }
        const errInfo = errorInfoFromIpc(res, {
          code: TWITCH_ERROR_CODES.PROFILE_FETCH_FAILED,
          message: "Unable to load profile",
        });
        setProfile({
          status: "error",
          message: errInfo.message ?? "Unable to load profile",
          code: errInfo.code,
        });
        return;
      }
      if (!isTwitchProfile(res)) {
        setProfile({
          status: "error",
          code: RENDERER_ERROR_CODES.PROFILE_INVALID_RESPONSE,
          message: "Profile response was invalid",
        });
        return;
      }
      setProfile({
        status: "ready",
        displayName: res.displayName,
        login: res.login,
        avatar: res.profileImageUrl,
      });
    } catch (err) {
      const errInfo = errorInfoFromUnknown(err, {
        code: TWITCH_ERROR_CODES.PROFILE_FETCH_FAILED,
        message: "Unable to load profile",
      });
      setProfile({
        status: "error",
        message: errInfo.message ?? "Unable to load profile",
        code: errInfo.code,
      });
    }
  }, [demoMode, forwardAuthError]);

  useEffect(() => {
    setAutoSelectEnabled(autoSelect);
  }, [authStatus, autoSelect, demoMode, setAutoSelectEnabled]);

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
      try {
        const res = await window.electronAPI.app?.getVersion?.();
        if (!cancelled && res?.version) {
          const baseVersion = String(res.version);
          const buildSha = typeof __GIT_SHA__ !== "undefined" ? String(__GIT_SHA__) : "";
          const versionLabel =
            buildSha && !baseVersion.includes("+") ? `${baseVersion}+${buildSha}` : baseVersion;
          setAppVersion(versionLabel);
        }
      } catch (err) {
        logDebug("app: getVersion failed", err);
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
      const payloadVersion = typeof payload?.version === "string" ? payload.version : undefined;
      const payloadReleaseNotes =
        typeof payload?.releaseNotes === "string" ? payload.releaseNotes : undefined;
      if (status === "available") {
        setUpdateStatus({
          state: "available",
          version: payloadVersion,
          releaseNotes: payloadReleaseNotes,
        });
      } else if (status === "none") {
        setUpdateStatus({ state: "none" });
      } else if (status === "downloading") {
        setUpdateStatus((prev) => ({
          state: "downloading",
          version: payloadVersion ?? prev.version,
          releaseNotes: payloadReleaseNotes ?? prev.releaseNotes,
          progress: Number(payload.percent ?? 0),
          transferred: Number(payload.transferred ?? 0),
          total: Number(payload.total ?? 0),
          bytesPerSecond: Number(payload.bytesPerSecond ?? 0),
        }));
      } else if (status === "downloaded") {
        setUpdateStatus((prev) => ({
          state: "downloaded",
          version: payloadVersion ?? prev.version,
          releaseNotes: payloadReleaseNotes ?? prev.releaseNotes,
        }));
      } else if (status === "error") {
        setUpdateStatus((prev) => ({
          state: "error",
          version: prev.version,
          releaseNotes: prev.releaseNotes,
          message: payload.message ? String(payload.message) : "error.update.unknown",
        }));
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
