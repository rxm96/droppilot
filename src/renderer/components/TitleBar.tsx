import type { Dispatch, SetStateAction } from "react";
import { useI18n } from "../i18n";
import { cn } from "../lib/utils";
import type { ThemePreference } from "../theme";

type Props = {
  title?: string;
  version?: string;
  theme: ThemePreference;
  setTheme: Dispatch<SetStateAction<ThemePreference>>;
  resolvedTheme: "light" | "dark";
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
  resolvedTheme,
  updateStatus,
  onDownloadUpdate,
  onInstallUpdate,
}: Props) {
  const { t } = useI18n();
  const handle = (action: WindowAction) => {
    window.electronAPI.app.windowControl(action);
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
      ? t("titlebar.updateAvailable")
      : updateState === "downloading"
        ? t("titlebar.updateDownloading")
        : t("titlebar.updateReady");
  const updateTitle =
    updateState === "available" && updateStatus?.version
      ? `${t("titlebar.updateAvailable")} (${updateStatus.version})`
      : updateLabel;
  const canDownloadUpdate = updateState === "available" && typeof onDownloadUpdate === "function";
  const canInstallUpdate = updateState === "downloaded" && typeof onInstallUpdate === "function";
  const updateAction = canDownloadUpdate ? onDownloadUpdate : canInstallUpdate ? onInstallUpdate : undefined;
  const disableUpdateAction = updateState === "downloading" || !updateAction;
  const themeLabelKey = theme === "light" ? "theme.light" : "theme.dark";
  const themeLabel = t(themeLabelKey);
  const themeTitle = `${t("theme.toggle")}: ${themeLabel}`;
  const themeIcon = resolvedTheme === "dark" ? "dark_mode" : "light_mode";
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
          onClick={() => handle("hide-to-tray")}
          aria-label={t("titlebar.tray")}
          title={t("titlebar.tray")}
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            arrow_downward
          </span>
          <span className="titlebar-btn-text">{t("titlebar.tray")}</span>
        </button>
        <div className="titlebar-controls">
          <button
            type="button"
            className="title-btn title-btn-icon"
            onClick={() => handle("minimize")}
            aria-label={t("titlebar.minimize")}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              remove
            </span>
          </button>
          <button
            type="button"
            className="title-btn title-btn-icon"
            onClick={() => handle("maximize")}
            aria-label={t("titlebar.maximize")}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              crop_square
            </span>
          </button>
          <button
            type="button"
            className="title-btn title-btn-icon title-btn-close"
            onClick={() => handle("close")}
            aria-label={t("titlebar.close")}
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
