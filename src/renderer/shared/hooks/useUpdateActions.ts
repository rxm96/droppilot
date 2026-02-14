import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppUpdateStatus } from "./useAppBootstrap";

type Params = {
  setUpdateStatus: Dispatch<SetStateAction<AppUpdateStatus>>;
};

export function useUpdateActions({ setUpdateStatus }: Params) {
  const handleCheckUpdates = useCallback(async () => {
    if (!window.electronAPI?.app?.checkUpdates) {
      setUpdateStatus({ state: "error", message: "error.update.check_api_unavailable" });
      return;
    }
    setUpdateStatus((prev) => ({
      state: "checking",
      version: prev.version,
      releaseNotes: prev.releaseNotes,
    }));
    try {
      const res = await window.electronAPI.app.checkUpdates();
      if (!res) {
        setUpdateStatus({ state: "error", message: "error.update.no_response" });
        return;
      }
      if (!res.ok && res.status === "unsupported") {
        setUpdateStatus({ state: "unsupported" });
        return;
      }
      if (res.ok && res.status === "available") {
        setUpdateStatus({
          state: "available",
          version: typeof res.version === "string" ? res.version : undefined,
          releaseNotes:
            typeof (res as { releaseNotes?: unknown }).releaseNotes === "string"
              ? (res as { releaseNotes?: string }).releaseNotes
              : undefined,
        });
        return;
      }
      if (res.ok && res.status === "none") {
        setUpdateStatus({ state: "none" });
        return;
      }
      setUpdateStatus({ state: "error", message: res.message || "error.update.unknown" });
    } catch (err) {
      setUpdateStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [setUpdateStatus]);

  const handleDownloadUpdate = useCallback(async () => {
    if (!window.electronAPI?.app?.downloadUpdate) {
      setUpdateStatus({ state: "error", message: "error.update.download_api_unavailable" });
      return;
    }
    setUpdateStatus((prev) => ({
      state: "downloading",
      version: prev.version,
      releaseNotes: prev.releaseNotes,
      progress: 0,
    }));
    try {
      const res = await window.electronAPI.app.downloadUpdate();
      if (!res) {
        setUpdateStatus({ state: "error", message: "error.update.no_response" });
        return;
      }
      if (!res.ok && res.status === "unsupported") {
        setUpdateStatus({ state: "unsupported" });
        return;
      }
      if (!res.ok) {
        setUpdateStatus({ state: "error", message: res.message || "error.update.download_failed" });
      }
    } catch (err) {
      setUpdateStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [setUpdateStatus]);

  const handleInstallUpdate = useCallback(async () => {
    if (!window.electronAPI?.app?.installUpdate) {
      setUpdateStatus({ state: "error", message: "error.update.install_api_unavailable" });
      return;
    }
    try {
      const res = await window.electronAPI.app.installUpdate();
      if (res && !res.ok && res.status === "unsupported") {
        setUpdateStatus({ state: "unsupported" });
        return;
      }
      if (res && !res.ok) {
        setUpdateStatus({ state: "error", message: res.message || "error.update.install_failed" });
      }
    } catch (err) {
      setUpdateStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [setUpdateStatus]);

  return {
    handleCheckUpdates,
    handleDownloadUpdate,
    handleInstallUpdate,
  };
}
