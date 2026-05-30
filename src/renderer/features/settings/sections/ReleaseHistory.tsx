import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { Button } from "@renderer/shared/components/ui/button";
import { Pill } from "@renderer/shared/components/ui/pill";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { useReleaseHistory } from "@renderer/shared/hooks/app/useReleaseHistory";
import type { ReleaseEntry } from "../../../../shared/releaseHistory";

const INITIAL_VISIBLE = 30;

function ReleaseCard({
  release,
  isCurrent,
  dateText,
}: {
  release: ReleaseEntry;
  isCurrent: boolean;
  dateText: string;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-semibold text-[color:var(--dp-text)]">
          {release.tag}
        </span>
        {isCurrent && <Pill tone="accent">{t("settings.releaseHistory.current")}</Pill>}
        {release.prerelease && <Pill tone="warn">{t("settings.releaseHistory.prerelease")}</Pill>}
        {dateText && (
          <span className="ml-auto font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
            {dateText}
          </span>
        )}
      </div>
      {release.notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {release.notes.map((note, i) => (
            <li
              key={i}
              className="flex gap-2 text-[12px] leading-relaxed text-[color:var(--dp-text-dim)]"
            >
              <span className="text-[color:var(--dp-accent)]">·</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
      {release.fullChangelog && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={`changelog-${release.tag}`}
            className="font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-accent)]"
          >
            {t("settings.releaseHistory.fullChangelog")} {expanded ? "−" : "+"}
          </button>
          {expanded && (
            <pre
              id={`changelog-${release.tag}`}
              className="mt-2 whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-[color:var(--dp-text-dimmer)]"
            >
              {release.fullChangelog}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ReleaseHistory() {
  const { t, language } = useI18n();
  const { state, reload } = useReleaseHistory(true);
  const [showAll, setShowAll] = React.useState(false);
  const [currentVersion, setCurrentVersion] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const loadVersion = async () => {
      try {
        const res = await window.electronAPI.app?.getVersion?.();
        const v = (res as { version?: string } | undefined)?.version;
        if (!cancelled && typeof v === "string") setCurrentVersion(v);
      } catch {
        // version display is best-effort; leave currentVersion null
      }
    };
    void loadVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  const fmtDate = (ms: number) => (ms > 0 ? new Date(ms).toLocaleDateString(language) : "");

  return (
    <div className="mt-6">
      <SectionLabel>{t("settings.subsection.releaseHistory")}</SectionLabel>

      {state.status === "loading" || state.status === "idle" ? (
        <p className="mt-3 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("settings.releaseHistory.loading")}
        </p>
      ) : state.status === "error" ? (
        <div className="mt-3 flex items-center gap-3">
          <span className="font-mono text-[11px] text-[color:var(--dp-signal-err)]">
            {t("settings.releaseHistory.error")}
          </span>
          <Button
            variant="dp-secondary"
            size="dp-sm"
            onClick={() => {
              setShowAll(false);
              void reload();
            }}
          >
            {t("settings.releaseHistory.retry")}
          </Button>
        </div>
      ) : state.releases.length === 0 ? (
        <p className="mt-3 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("settings.releaseHistory.empty")}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {state.stale && (
            <p className="font-mono text-[10px] text-[color:var(--dp-signal-warn)]">
              {t("settings.releaseHistory.stale")}
            </p>
          )}
          {/* currentVersion is the raw app.getVersion() (no build-SHA suffix), so it matches ReleaseEntry.version */}
          {(showAll ? state.releases : state.releases.slice(0, INITIAL_VISIBLE)).map((r) => (
            <ReleaseCard
              key={r.tag}
              release={r}
              isCurrent={currentVersion === r.version}
              dateText={fmtDate(r.date)}
            />
          ))}
          {!showAll && state.releases.length > INITIAL_VISIBLE && (
            <Button
              variant="dp-ghost"
              size="dp-sm"
              className="self-start"
              onClick={() => setShowAll(true)}
            >
              {t("settings.releaseHistory.showOlder")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
