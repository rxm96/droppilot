import { useEffect } from "react";
import { useI18n } from "@renderer/shared/i18n";
import type { UpdateOverlayDevState } from "./updateOverlayDev";

type UpdateStatus = {
  state:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "installing"
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

type Props = {
  updateStatus?: UpdateStatus;
  onInstallUpdate?: () => void;
  devState?: UpdateOverlayDevState | null;
};

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
};

const formatSpeed = (bytesPerSecond?: number) => {
  if (!bytesPerSecond || bytesPerSecond <= 0) return null;
  const mbps = bytesPerSecond / (1024 * 1024);
  return `${mbps.toFixed(1)} MB/s`;
};

const formatEta = (transferred?: number, total?: number, bytesPerSecond?: number) => {
  if (!transferred || !total || !bytesPerSecond || bytesPerSecond <= 0) return null;
  const remaining = total - transferred;
  if (remaining <= 0) return null;
  const seconds = Math.ceil(remaining / bytesPerSecond);
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `~${m}m ${s}s`;
};

function parseReleaseNotes(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export function UpdateOverlay({ updateStatus, onInstallUpdate, devState = null }: Props) {
  const { t } = useI18n();
  const resolvedStatus: UpdateStatus = updateStatus ?? { state: "idle" };
  const explicitSplash = resolvedStatus.state === "installing" || devState === "installing";
  const isDownloading = resolvedStatus.state === "downloading";
  const isReady = resolvedStatus.state === "downloaded" && !explicitSplash;

  const handleInstallClick = () => {
    if (devState) return;
    if (typeof onInstallUpdate !== "function") return;
    onInstallUpdate();
  };

  const releaseNotes =
    typeof resolvedStatus.releaseNotes === "string" ? resolvedStatus.releaseNotes.trim() : "";
  const progressPct = Math.min(100, Math.max(0, Math.round(resolvedStatus.progress ?? 0)));
  const showProgress = isDownloading && Number.isFinite(progressPct);
  const effectiveVersion = resolvedStatus.version;
  const canInstall = isReady && (typeof onInstallUpdate === "function" || Boolean(devState));
  const subtitle = isDownloading
    ? t("settings.updateDownloading", {
        percent: progressPct,
        transferred: formatBytes(resolvedStatus.transferred),
        total: formatBytes(resolvedStatus.total),
      })
    : t("settings.updateDownloaded");
  const statusLine = subtitle;
  const releaseNotesTitle = effectiveVersion
    ? t("updateOverlay.whatsNewVersion", { version: effectiveVersion })
    : t("updateOverlay.whatsNew");
  const speed = formatSpeed(resolvedStatus.bytesPerSecond);
  const eta = formatEta(
    resolvedStatus.transferred,
    resolvedStatus.total,
    resolvedStatus.bytesPerSecond,
  );
  const noteLines = releaseNotes ? parseReleaseNotes(releaseNotes) : [];
  const showOverlay = isDownloading || isReady || explicitSplash;

  useEffect(() => {
    if (!showOverlay) return;
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
  }, [showOverlay]);

  if (!showOverlay) return null;

  if (explicitSplash) {
    return (
      <div className="update-splash-backdrop" role="status" aria-live="polite">
        <div className="update-splash-stage">
          <div className="update-splash-card">
            <h2 className="update-splash-title">{t("updateOverlay.installing")}</h2>
            <p className="update-splash-hint">{t("updateOverlay.restartingShortly")}</p>
            <div className="update-overlay-progress">
              <div className="progress-bar" aria-hidden="true">
                <span className="progress-bar-fill installing" style={{ width: "100%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cardClass = [
    "update-overlay-card",
    isDownloading ? "is-downloading" : "",
    isReady ? "is-ready" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const title = isDownloading ? t("titlebar.updateDownloading") : t("titlebar.updateReady");

  return (
    <div
      className="update-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-overlay-title"
    >
      <div className="update-overlay-stage">
        <div className={cardClass}>
          <div className="update-overlay-head">
            <p className="update-overlay-kicker">{t("updateOverlay.label")}</p>
            <h2 id="update-overlay-title" className="update-overlay-title">
              {title}
            </h2>
            <p className="update-overlay-status">{statusLine}</p>
          </div>
          <div className="update-overlay-body">
            {showProgress ? (
              <section className="update-overlay-progress-block" aria-label={title}>
                <div className="update-overlay-progress-meta">
                  <span className="update-overlay-progress-value">{progressPct}%</span>
                </div>
                <div className="update-overlay-progress">
                  <div className="progress-bar" aria-hidden="true">
                    <span className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                  {speed || eta ? (
                    <div className="update-overlay-stats">
                      {speed ? <span className="meta">{speed}</span> : null}
                      {eta ? <span className="meta">{eta}</span> : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
            {noteLines.length > 0 ? (
              <details className="update-overlay-notes">
                <summary className="update-overlay-notes-title">{releaseNotesTitle}</summary>
                <ul className="update-overlay-notes-list">
                  {noteLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          {isReady ? (
            <div className="update-overlay-footer">
              <button
                type="button"
                className="update-overlay-install"
                onClick={handleInstallClick}
                disabled={!canInstall}
              >
                {t("settings.updateInstall")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
