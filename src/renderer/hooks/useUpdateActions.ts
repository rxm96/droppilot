import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AppUpdateStatus } from "./useAppBootstrap";

type Params = {
  setUpdateStatus: Dispatch<SetStateAction<AppUpdateStatus>>;
};

export function useUpdateActions({ setUpdateStatus }: Params) {
  const handleCheckUpdates = useCallback(async () => {
    if (!window.electronAPI?.app?.checkUpdates) {
      setUpdateStatus({ state: "error", message: "Update API unavailable" });
      return;
    }
    setUpdateStatus({ state: "checking" });
    try {
      const res = await window.electronAPI.app.checkUpdates();
      if (!res) {
        setUpdateStatus({ state: "error", message: "No response" });
        return;
      }
      if (!res.ok && res.status === "unsupported") {
        setUpdateStatus({ state: "unsupported" });
        return;
      }
      if (res.ok && res.status === "available") {
        setUpdateStatus({ state: "available", version: res.version });
        return;
      }
      if (res.ok && res.status === "none") {
        setUpdateStatus({ state: "none" });
        return;
      }
      setUpdateStatus({ state: "error", message: res.message || "Unknown error" });
    } catch (err) {
      setUpdateStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [setUpdateStatus]);

  const handleDownloadUpdate = useCallback(async () => {
    if (!window.electronAPI?.app?.downloadUpdate) {
      setUpdateStatus({ state: "error", message: "Download API unavailable" });
      return;
    }
    setUpdateStatus({ state: "downloading", progress: 0 });
    try {
      const res = await window.electronAPI.app.downloadUpdate();
      if (!res) {
        setUpdateStatus({ state: "error", message: "No response" });
        return;
      }
      if (!res.ok && res.status === "unsupported") {
        setUpdateStatus({ state: "unsupported" });
        return;
      }
      if (!res.ok) {
        setUpdateStatus({ state: "error", message: res.message || "Download failed" });
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
      setUpdateStatus({ state: "error", message: "Install API unavailable" });
      return;
    }
    try {
      const res = await window.electronAPI.app.installUpdate();
      if (res && !res.ok && res.status === "unsupported") {
        setUpdateStatus({ state: "unsupported" });
        return;
      }
      if (res && !res.ok) {
        setUpdateStatus({ state: "error", message: res.message || "Install failed" });
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
