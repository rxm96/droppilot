import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import type { ThemePreference } from "@renderer/shared/theme";

type Props = {
  title?: string;
  version?: string;
  theme: ThemePreference;
  setTheme: Dispatch<SetStateAction<ThemePreference>>;
  updateStatus?: {
    state:
      | "idle"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "none"
      | "error"
      | "unsupported";
    version?: string;
    progress?: number;
  };
  onDownloadUpdate?: () => void;
  onInstallUpdate?: () => void;
};

type WindowAction = "minimize" | "maximize" | "restore" | "close" | "hide-to-tray";

export function TitleBar({
  title = "DropPilot",
  version,
  theme,
  setTheme,
  updateStatus,
  onDownloadUpdate,
  onInstallUpdate,
}: Props) {
  const { t } = useI18n();
  const [windowState, setWindowState] = useState({ maximized: false, fullscreen: false });

  useEffect(() => {
    let mounted = true;
    const syncWindowState = async () => {
      try {
        const result = await window.electronAPI.app.getWindowState();
        if (!mounted || !result?.ok) return;
        setWindowState({
          maximized: Boolean(result.maximized),
          fullscreen: Boolean(result.fullscreen),
        });
      } catch {
        // Best-effort sync; keep current state if the host cannot provide it.
      }
    };

    void syncWindowState();
    const unsubscribe = window.electronAPI.app.onWindowState((payload) => {
      if (!mounted) return;
      setWindowState({
        maximized: Boolean(payload.maximized),
        fullscreen: Boolean(payload.fullscreen),
      });
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const handle = async (action: WindowAction) => {
    try {
      await window.electronAPI.app.windowControl(action);
    } catch {
      // Ignore host window-control failures; the native frame remains available.
    }
  };
  const updateState = updateStatus?.state;
  const showUpdate =
    updateState === "available" || updateState === "downloading" || updateState === "downloaded";
  const updateProgress =
    updateState === "downloading" && typeof updateStatus?.progress === "number"
      ? Math.round(updateStatus.progress)
      : null;
  const updateLabel =
    updateState === "available"
      ? t("titlebar.updateDownload")
      : updateState === "downloading"
        ? t("titlebar.updateDownloading")
        : t("titlebar.updateInstall");
  const updateTitle =
    updateState === "available"
      ? updateStatus?.version
        ? `${t("titlebar.updateAvailable")} (${updateStatus.version})`
        : t("titlebar.updateAvailable")
      : updateState === "downloading"
        ? updateProgress !== null
          ? `${t("titlebar.updateDownloading")} ${updateProgress}%`
          : t("titlebar.updateDownloading")
        : t("titlebar.updateReady");
  const canDownloadUpdate = updateState === "available" && typeof onDownloadUpdate === "function";
  const canInstallUpdate = updateState === "downloaded" && typeof onInstallUpdate === "function";
  const updateAction = canDownloadUpdate
    ? onDownloadUpdate
    : canInstallUpdate
      ? onInstallUpdate
      : undefined;
  const disableUpdateAction = updateState === "downloading" || !updateAction;
  const themeLabelKey = theme === "light" ? "theme.light" : "theme.dark";
  const themeLabel = t(themeLabelKey);
  const themeTitle = `${t("titlebar.themeSwitch")}: ${themeLabel}`;
  const themeIcon = theme === "dark" ? "dark_mode" : "light_mode";
  const isWindowExpanded = windowState.maximized || windowState.fullscreen;
  const expandAction: WindowAction = isWindowExpanded ? "restore" : "maximize";
  const expandLabel = isWindowExpanded ? t("titlebar.restore") : t("titlebar.maximize");
  const expandIcon = isWindowExpanded ? "filter_none" : "crop_square";
  const trayTitle = t("titlebar.tray");
  const trayLabel = t("titlebar.trayShort");
  const cycleTheme = () => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  };

  return (
    <div className="titlebar app-drag">
      <div className="titlebar-left">
        <span className="titlebar-title">{title}</span>
        {version ? <span className="titlebar-version">v{version}</span> : null}
      </div>
      <div className="titlebar-actions">
        {showUpdate ? (
          <button
            type="button"
            className={cn(
              "title-btn title-btn-pill titlebar-update",
              updateState === "downloading" && "cursor-wait opacity-70",
            )}
            onClick={updateAction}
            disabled={disableUpdateAction}
            aria-label={updateTitle}
            title={updateTitle}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              system_update_alt
            </span>
            <span className="titlebar-btn-text">
              {updateLabel}
              {updateProgress !== null ? ` ${updateProgress}%` : ""}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          className="title-btn title-btn-icon"
          onClick={cycleTheme}
          aria-label={themeTitle}
          title={themeTitle}
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            {themeIcon}
          </span>
        </button>
        <button
          type="button"
          className="title-btn title-btn-pill"
          onClick={() => void handle("hide-to-tray")}
          aria-label={trayTitle}
          title={trayTitle}
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            arrow_downward
          </span>
          <span className="titlebar-btn-text">{trayLabel}</span>
        </button>
        <div className="titlebar-controls">
          <button
            type="button"
            className="title-btn title-btn-icon"
            onClick={() => void handle("minimize")}
            aria-label={t("titlebar.minimize")}
            title={t("titlebar.minimize")}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              remove
            </span>
          </button>
          <button
            type="button"
            className="title-btn title-btn-icon"
            onClick={() => void handle(expandAction)}
            aria-label={expandLabel}
            title={expandLabel}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              {expandIcon}
            </span>
          </button>
          <button
            type="button"
            className="title-btn title-btn-icon title-btn-close"
            onClick={() => void handle("close")}
            aria-label={t("titlebar.close")}
            title={t("titlebar.close")}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
