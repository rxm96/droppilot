import { useEffect, useState } from "react";
import { useInterval } from "@renderer/shared/hooks/useInterval";
import { useI18n } from "@renderer/shared/i18n";

type UpdateStatus = {
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

type Props = {
  updateStatus?: UpdateStatus;
  onInstallUpdate?: () => void;
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

export function UpdateOverlay({ updateStatus, onInstallUpdate }: Props) {
  const { t } = useI18n();
  const resolvedStatus: UpdateStatus = updateStatus ?? { state: "idle" };
  const statusState = resolvedStatus.state;
  const [installing, setInstalling] = useState(false);

  const forcePreview = true;
  const previewVersion = "2.5.0";
  const previewReleaseNotes = [
    "- Improved update flow stability and error handling",
    "- Added release notes in the update overlay",
    "- Hardened drag-and-drop reorder edge cases",
    "- Reduced unnecessary priority-plan IPC refreshes",
  ].join("\n");

  // --- Simulation: fake download 0→100% then transition to ready ---
  const SIMULATE_TOTAL = 48 * 1024 * 1024; // 48 MB
  const SIMULATE_SPEED = 8.2 * 1024 * 1024; // 8.2 MB/s
  const SIMULATE_DURATION_MS = 5_000;
  const SIMULATE_INSTALL_MS = 3_000;
  const [simProgress, setSimProgress] = useState(forcePreview ? 0 : -1);
  const simulating = forcePreview && simProgress >= 0 && simProgress < 100;
  const simDone = forcePreview && simProgress >= 100;

  useInterval(
    () => {
      setSimProgress((prev) => {
        const step = 100 / (SIMULATE_DURATION_MS / 250);
        const jitter = 0.7 + Math.random() * 0.6;
        return Math.min(100, prev + step * jitter);
      });
    },
    250,
    simulating,
  );

  const needsPreview =
    forcePreview && statusState !== "downloading" && statusState !== "downloaded";
  const effectiveState = needsPreview ? (simDone ? "downloaded" : "downloading") : statusState;

  const isDownloading = effectiveState === "downloading";
  const isReady = effectiveState === "downloaded" && !installing;
  const isInstalling = installing;

  const handleInstallClick = () => {
    setInstalling(true);
    if (forcePreview) {
      // Simulation: fake installing then reset
      setTimeout(() => {
        setInstalling(false);
        setSimProgress(0);
      }, SIMULATE_INSTALL_MS);
      return;
    }
    onInstallUpdate?.();
  };
  const releaseNotes = (() => {
    const provided =
      typeof resolvedStatus.releaseNotes === "string" ? resolvedStatus.releaseNotes.trim() : "";
    if (provided) return provided;
    return needsPreview ? previewReleaseNotes : "";
  })();

  const progressPct = simulating
    ? Math.min(100, Math.max(0, Math.round(simProgress)))
    : Math.min(100, Math.max(0, Math.round(resolvedStatus.progress ?? 0)));
  const simTransferred = (simProgress / 100) * SIMULATE_TOTAL;
  const showProgress = isDownloading && Number.isFinite(progressPct);
  const effectiveVersion = resolvedStatus.version ?? (needsPreview ? previewVersion : undefined);
  const canInstall = isReady && typeof onInstallUpdate === "function";
  const subtitle = isDownloading
    ? t("settings.updateDownloading", {
        percent: progressPct,
        transferred: simulating
          ? formatBytes(simTransferred)
          : formatBytes(resolvedStatus.transferred),
        total: simulating ? formatBytes(SIMULATE_TOTAL) : formatBytes(resolvedStatus.total),
      })
    : t("settings.updateDownloaded");
  const releaseNotesTitle = effectiveVersion
    ? t("updateOverlay.whatsNewVersion", { version: effectiveVersion })
    : t("updateOverlay.whatsNew");

  const speed = simulating
    ? formatSpeed(SIMULATE_SPEED)
    : formatSpeed(resolvedStatus.bytesPerSecond);
  const eta = simulating
    ? formatEta(simTransferred, SIMULATE_TOTAL, SIMULATE_SPEED)
    : formatEta(resolvedStatus.transferred, resolvedStatus.total, resolvedStatus.bytesPerSecond);
  const noteLines = releaseNotes ? parseReleaseNotes(releaseNotes) : [];

  const showOverlay = isDownloading || isReady || isInstalling;

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

  const orbClass = isInstalling ? "installing" : isDownloading ? "downloading" : "ready";

  const cardClass = [
    "update-overlay-card",
    isReady ? "is-ready" : "",
    isInstalling ? "is-installing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const title = isInstalling
    ? t("updateOverlay.installing")
    : isDownloading
      ? t("titlebar.updateDownloading")
      : t("titlebar.updateReady");

  const displaySubtitle = isInstalling ? t("updateOverlay.installingHint") : subtitle;

  return (
    <div className="update-overlay" role="status" aria-live="polite">
      <div className={cardClass}>
        <div className={`update-overlay-orb ${orbClass}`} aria-hidden="true" />
        <h2 className="update-overlay-title">{title}</h2>
        <p className="meta">{displaySubtitle}</p>
        {noteLines.length > 0 && !isInstalling ? (
          <section className="update-overlay-notes" aria-label={releaseNotesTitle}>
            <h3 className="update-overlay-notes-title">{releaseNotesTitle}</h3>
            <ul className="update-overlay-notes-list">
              {noteLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {showProgress ? (
          <div className="update-overlay-progress">
            <div className="progress-bar" aria-hidden="true">
              <span className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            {speed || eta ? (
              <div className="update-overlay-stats">
                <span className="meta">{speed ?? ""}</span>
                <span className="meta">{eta ?? ""}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        {isInstalling ? (
          <div className="update-overlay-progress">
            <div className="progress-bar" aria-hidden="true">
              <span className="progress-bar-fill installing" style={{ width: "100%" }} />
            </div>
          </div>
        ) : null}
        {isReady ? (
          <button
            type="button"
            className="update-overlay-install"
            onClick={handleInstallClick}
            disabled={!canInstall}
          >
            {t("settings.updateInstall")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
