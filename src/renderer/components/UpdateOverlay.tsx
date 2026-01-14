import { useEffect } from "react";
import { useI18n } from "../i18n";

type UpdateStatus = {
  state: "idle" | "checking" | "available" | "downloading" | "downloaded" | "none" | "error" | "unsupported";
  message?: string;
  version?: string;
  progress?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
};

type Props = {
  updateStatus?: UpdateStatus;
  onInstallUpdate?: () => void;
};

export function UpdateOverlay({ updateStatus, onInstallUpdate }: Props) {
  const { t } = useI18n();
  if (!updateStatus) return null;
  const forcePreview = true;
  const needsPreview =
    forcePreview && updateStatus.state !== "downloading" && updateStatus.state !== "downloaded";
  const effectiveState = needsPreview ? "downloaded" : updateStatus.state;
  const isDownloading = effectiveState === "downloading";
  const isReady = effectiveState === "downloaded";
  if (!isDownloading && !isReady) return null;

  const progressPct = Math.min(100, Math.max(0, Math.round(updateStatus.progress ?? 0)));
  const showProgress = isDownloading && Number.isFinite(progressPct);
  const canInstall =
    updateStatus.state === "downloaded" && typeof onInstallUpdate === "function";
  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };
  const subtitle = isDownloading
    ? t("settings.updateDownloading", {
        percent: progressPct,
        transferred: formatBytes(updateStatus.transferred),
        total: formatBytes(updateStatus.total),
      })
    : t("settings.updateDownloaded");

  useEffect(() => {
    if (!isDownloading && !isReady) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
    };
  }, [isDownloading, isReady]);

  return (
    <div className="update-overlay" role="status" aria-live="polite">
      <div className="update-overlay-card">
        <div className="update-overlay-icon">
          <span className="material-symbols-rounded" aria-hidden="true">
            system_update_alt
          </span>
        </div>
        <h2 className="update-overlay-title">
          {isDownloading ? t("titlebar.updateDownloading") : t("titlebar.updateReady")}
        </h2>
        <p className="meta">{subtitle}</p>
        {showProgress ? (
          <div className="progress-bar" aria-hidden="true">
            <span style={{ width: `${progressPct}%` }} />
          </div>
        ) : null}
        {isReady ? (
          <button type="button" onClick={onInstallUpdate} disabled={!canInstall}>
            {t("settings.updateInstall")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
