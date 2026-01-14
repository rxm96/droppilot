import React, { useEffect } from "react";
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
  const resolvedStatus: UpdateStatus = updateStatus ?? { state: "idle" };
  const statusState = resolvedStatus.state;
  const forcePreview = true;
  const needsPreview =
    forcePreview && statusState !== "downloading" && statusState !== "downloaded";
  const effectiveState = needsPreview ? "downloaded" : statusState;
  const isDownloading = effectiveState === "downloading";
  const isReady = effectiveState === "downloaded";

  const progressPct = Math.min(100, Math.max(0, Math.round(resolvedStatus.progress ?? 0)));
  const showProgress = isDownloading && Number.isFinite(progressPct);
  const canInstall =
    resolvedStatus.state === "downloaded" && typeof onInstallUpdate === "function";
  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };
  const subtitle = isDownloading
    ? t("settings.updateDownloading", {
        percent: progressPct,
        transferred: formatBytes(resolvedStatus.transferred),
        total: formatBytes(resolvedStatus.total),
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

  if (!isDownloading && !isReady) return null;

  return (
    <div className="update-overlay" role="status" aria-live="polite">
      <div className="update-overlay-card">
        <div className="update-overlay-orbit" aria-hidden="true">
          <span className="orbit-dot" />
          <span className="orbit-dot small" />
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
