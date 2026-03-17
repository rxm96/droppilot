import { useI18n } from "@renderer/shared/i18n";
import type { CSSProperties } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { useInterval } from "@renderer/shared/hooks/useInterval";

type WatchEngineDecision =
  | "no-target"
  | "suppressed"
  | "cooldown"
  | "watching-progress"
  | "watching-recover"
  | "watching-no-farmable"
  | "watching-no-watchable"
  | "idle-loading-channels"
  | "idle-no-channels"
  | "idle-ready"
  | "idle-no-watchable-drops";

type HeroSummaryTone = "quiet" | "base" | "signal" | "warn";

const RAIL_STAGES = [
  { key: "standby", labelKey: "hero.engineRailStage.standby" },
  { key: "scan", labelKey: "hero.engineRailStage.scan" },
  { key: "watch", labelKey: "hero.engineRailStage.watch" },
  { key: "recover", labelKey: "hero.engineRailStage.recover" },
  { key: "hold", labelKey: "hero.engineRailStage.hold" },
] as const;

type RailStageKey = (typeof RAIL_STAGES)[number]["key"];

const getHeroLocale = (language: string) => (language === "de" ? "de-DE" : "en-US");

const getCharacterCount = (text: string): number => Array.from(text.trim()).length;

export const shouldCompactCurrentDropTitle = (text: string): boolean => {
  const normalized = text.trim();
  if (!normalized) return false;
  if (getCharacterCount(normalized) >= 28) return true;
  return normalized.split(/\s+/).some((part) => getCharacterCount(part) >= 18);
};

const formatHeroRemaining = (
  seconds: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds < 60) return t("hero.time.seconds", { seconds: safeSeconds });
  if (safeSeconds < 3600) {
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return t("hero.time.minutesSeconds", {
      minutes,
      seconds: remainingSeconds.toString().padStart(2, "0"),
    });
  }
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return t("hero.time.hoursMinutes", {
    hours,
    minutes: minutes.toString().padStart(2, "0"),
  });
};

const fallbackDecision = (
  activeGame: string | undefined,
  hasUpdatePulse: boolean,
): WatchEngineDecision => {
  if (!activeGame) return "no-target";
  if (hasUpdatePulse) return "watching-progress";
  return "idle-ready";
};

const mapDecisionToRailStage = (decision: WatchEngineDecision): RailStageKey => {
  switch (decision) {
    case "no-target":
    case "idle-ready":
    case "idle-no-watchable-drops":
      return "standby";
    case "idle-loading-channels":
    case "idle-no-channels":
      return "scan";
    case "watching-progress":
      return "watch";
    case "watching-recover":
    case "watching-no-farmable":
    case "watching-no-watchable":
      return "recover";
    case "suppressed":
    case "cooldown":
      return "hold";
    default:
      return "standby";
  }
};

const getRailStatusKey = (decision: WatchEngineDecision, railStage: RailStageKey): string => {
  switch (decision) {
    case "no-target":
      return "hero.engineRailStatus.noTarget";
    case "idle-no-watchable-drops":
      return "hero.engineRailStatus.noDrops";
    default:
      return `hero.engineRailStatus.${railStage}`;
  }
};

type HeroProps = {
  demoMode?: boolean;
  nextWatchAt?: number;
  watchEngineDecision?: WatchEngineDecision;
  activeGame?: string;
  dropsTotal?: number;
  dropsClaimed?: number;
  dropsClaimable?: number;
  dropsBlocked?: number;
  activeDropTitle?: string;
  activeDropRemainingMinutes?: number;
  activeDropEta?: number | null;
  inventoryFetchedAt?: number | null;
  lastWatchOk?: number;
  targetProgress?: number;
  warmupActive?: boolean;
  warmupGame?: string;
};

export function Hero({
  demoMode,
  nextWatchAt,
  watchEngineDecision,
  activeGame,
  dropsTotal,
  dropsClaimed,
  dropsClaimable,
  dropsBlocked,
  activeDropTitle,
  activeDropRemainingMinutes,
  activeDropEta,
  inventoryFetchedAt,
  lastWatchOk,
  targetProgress,
  warmupActive,
  warmupGame,
}: HeroProps) {
  const { t, language } = useI18n();
  const [nowTick, setNowTick] = useState(() => Date.now());
  const campaignHeadingId = useId();
  const opsHeadingId = useId();
  const progressLabelId = useId();
  const progressValueId = useId();
  const engineTitleId = useId();
  const engineStatusId = useId();
  const engineSummaryId = useId();

  const hasTarget = Boolean(activeGame?.trim());

  const progressPctValue =
    typeof targetProgress === "number" && Number.isFinite(targetProgress)
      ? Math.max(0, Math.min(100, Math.round(targetProgress)))
      : null;
  const progressPct = progressPctValue === null ? "--" : `${progressPctValue}%`;
  const dropsOpen =
    typeof dropsTotal === "number" && typeof dropsClaimed === "number"
      ? Math.max(0, dropsTotal - dropsClaimed)
      : null;
  const dropsOpenLabel = dropsOpen === null ? "--" : String(dropsOpen);
  const dropsClaimableLabel = typeof dropsClaimable === "number" ? String(dropsClaimable) : "--";
  const dropsBlockedLabel = typeof dropsBlocked === "number" ? String(dropsBlocked) : "--";
  const hasUpdatePulse = typeof nextWatchAt === "number";
  const resolvedDecision = watchEngineDecision ?? fallbackDecision(activeGame, hasUpdatePulse);
  const activeRailStage = useMemo(
    () => mapDecisionToRailStage(resolvedDecision),
    [resolvedDecision],
  );
  const activeRailIndex = RAIL_STAGES.findIndex((stage) => stage.key === activeRailStage);
  const activeRailStep = activeRailIndex >= 0 ? activeRailIndex + 1 : 1;
  const railStatusKey = getRailStatusKey(resolvedDecision, activeRailStage);
  const railStatusText = t(railStatusKey);
  const railLiveText = t("hero.engineRailLive", { status: railStatusText });
  const railStagesText = RAIL_STAGES.map((stage) => t(stage.labelKey)).join(", ");
  const railSummaryText = t("hero.engineRailSummary", {
    current: activeRailStep,
    total: RAIL_STAGES.length,
    status: railStatusText,
    stages: railStagesText,
  });
  const hasActiveEta = typeof activeDropEta === "number" && Number.isFinite(activeDropEta);
  const shouldTickRemaining = hasUpdatePulse && hasActiveEta;
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(getHeroLocale(language), {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [language],
  );
  useEffect(() => {
    if (shouldTickRemaining) setNowTick(Date.now());
  }, [shouldTickRemaining, activeDropEta]);
  useInterval(() => setNowTick(Date.now()), 1_000, shouldTickRemaining);
  const activeDropRemainingSeconds =
    shouldTickRemaining && hasActiveEta
      ? Math.max(0, Math.ceil((activeDropEta - nowTick) / 1000))
      : typeof activeDropRemainingMinutes === "number"
        ? Math.max(0, Math.ceil(activeDropRemainingMinutes * 60))
        : null;
  const hasLiveDropTitle = Boolean(activeDropTitle?.trim());
  const isAllDone = Boolean(hasTarget && dropsOpen === 0);
  const activeDropTitleText = hasLiveDropTitle
    ? activeDropTitle.trim()
    : !hasTarget
      ? t("hero.opsNoTargetSelected")
      : isAllDone
        ? t("control.allDone")
        : t("hero.opsWaitingTitle");
  const useCompactCurrentDropTitle =
    hasLiveDropTitle && shouldCompactCurrentDropTitle(activeDropTitleText);
  const currentDropClassName = [
    "hero-current-drop",
    hasTarget ? "" : "is-empty",
    isAllDone ? "is-complete" : "",
    useCompactCurrentDropTitle ? "is-compact-title" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const progressFillStyle =
    progressPctValue === null
      ? undefined
      : ({ "--hero-progress-scale": String(progressPctValue / 100) } as CSSProperties);
  const progressAriaText =
    progressPctValue === null
      ? t("hero.targetProgressUnknown")
      : t("hero.targetProgressValue", { value: progressPctValue });
  const activeDropRemainingText =
    activeDropRemainingSeconds !== null
      ? t("control.rest", {
          time: formatHeroRemaining(activeDropRemainingSeconds, t),
        })
      : null;
  const activeDropEtaText = hasActiveEta ? timeFormatter.format(new Date(activeDropEta)) : null;
  const activeDropEtaIso = hasActiveEta ? new Date(activeDropEta).toISOString() : null;
  const inventorySyncText = inventoryFetchedAt
    ? timeFormatter.format(new Date(inventoryFetchedAt))
    : "--";
  const inventoryFetchedAtIso = inventoryFetchedAt
    ? new Date(inventoryFetchedAt).toISOString()
    : null;
  const lastPingText = lastWatchOk ? timeFormatter.format(new Date(lastWatchOk)) : "--";
  const lastWatchOkIso = lastWatchOk ? new Date(lastWatchOk).toISOString() : null;
  const warmupLabel = warmupActive
    ? warmupGame
      ? t("hero.warmup", { game: warmupGame })
      : t("hero.warmupActive")
    : "";
  const hasFlags = Boolean(warmupLabel || demoMode);
  const campaignNoteText = hasTarget ? null : t("hero.activeCampaignHint");
  const currentDropNoteText = !hasTarget
    ? t("hero.noTargetHint")
    : isAllDone
      ? t("hero.opsDoneHint")
      : !hasLiveDropTitle
        ? t("hero.opsWaitingHint")
        : null;
  const opsSummaryRows: Array<{
    key: string;
    label: string;
    value: string;
    tone: HeroSummaryTone;
  }> = hasTarget
    ? [
        ...(typeof dropsBlocked === "number" && dropsBlocked > 0
          ? [
              {
                key: "blocked",
                label: t("hero.opsBlocked"),
                value: dropsBlockedLabel,
                tone: "warn" as const,
              },
            ]
          : []),
        ...(typeof dropsClaimable === "number" && dropsClaimable > 0
          ? [
              {
                key: "claimable",
                label: t("hero.opsClaimable"),
                value: dropsClaimableLabel,
                tone: "signal" as const,
              },
            ]
          : []),
        {
          key: "open",
          label: t("control.dropsOpen"),
          value: dropsOpenLabel,
          tone: typeof dropsOpen === "number" && dropsOpen > 0 ? "base" : "quiet",
        },
      ]
    : [];

  return (
    <header className="hero-shell motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      {hasFlags ? (
        <div className="hero-flags">
          {warmupLabel ? <span className="hero-badge warmup">{warmupLabel}</span> : null}
          {demoMode ? <span className="hero-badge demo">{t("hero.demoMode")}</span> : null}
        </div>
      ) : null}
      <div className="hero-grid">
        <section
          className="hero-card hero-card-campaign motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
          aria-labelledby={campaignHeadingId}
        >
          <div className="hero-card-head">
            <h2 id={campaignHeadingId} className="hero-card-label">
              {t("hero.activeCampaign")}
            </h2>
          </div>
          <p className="hero-campaign-name">{activeGame || t("hero.noTarget")}</p>
          {campaignNoteText ? <p className="hero-campaign-note">{campaignNoteText}</p> : null}
          <div className="hero-campaign-progress">
            <div className="hero-campaign-progress-head">
              <span id={progressLabelId} className="hero-micro-label">
                {t("hero.targetProgress")}
              </span>
              <span id={progressValueId} className="hero-micro-value">
                {progressPct}
              </span>
            </div>
            <div
              className="hero-campaign-progress-track"
              role="progressbar"
              aria-labelledby={progressLabelId}
              aria-describedby={progressValueId}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPctValue ?? undefined}
              aria-valuetext={progressAriaText}
            >
              <span
                className={`hero-campaign-progress-fill${progressPctValue === null ? " is-empty" : ""}`}
                style={progressFillStyle}
              />
            </div>
          </div>
          <div
            className={`hero-engine-rail tone-${activeRailStage}`}
            role="group"
            aria-labelledby={engineTitleId}
            aria-describedby={`${engineStatusId} ${engineSummaryId}`}
          >
            <div className="hero-engine-rail-head">
              <span id={engineTitleId} className="hero-engine-rail-title">
                {t("hero.engineRailTitle")}
              </span>
              <span
                id={engineStatusId}
                className="hero-engine-rail-status-wrap"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                aria-label={railLiveText}
              >
                <strong
                  key={`hero-rail-status-${activeRailStage}`}
                  className="hero-engine-rail-status hero-engine-rail-status-animated"
                >
                  {railStatusText}
                </strong>
              </span>
            </div>
            <p id={engineSummaryId} className="sr-only">
              {railSummaryText}
            </p>
            <div className="hero-engine-rail-segments" aria-hidden="true">
              {RAIL_STAGES.map((stage, index) => {
                const isComplete = activeRailIndex > index;
                const isActive = activeRailIndex === index;
                return (
                  <span
                    key={stage.key}
                    className={`hero-engine-rail-segment${isComplete ? " is-complete" : ""}${isActive ? " is-active" : ""}`}
                  />
                );
              })}
            </div>
          </div>
          <dl className="hero-campaign-meta">
            <div className="hero-meta-pair">
              <dt className="hero-meta-label">{t("hero.inventorySync")}</dt>
              <dd className="hero-meta-value">
                {inventoryFetchedAtIso ? (
                  <time dateTime={inventoryFetchedAtIso}>{inventorySyncText}</time>
                ) : (
                  inventorySyncText
                )}
              </dd>
            </div>
            <div className="hero-meta-pair">
              <dt className="hero-meta-label">{t("hero.lastPing")}</dt>
              <dd className="hero-meta-value">
                {lastWatchOkIso ? (
                  <time dateTime={lastWatchOkIso}>{lastPingText}</time>
                ) : (
                  lastPingText
                )}
              </dd>
            </div>
          </dl>
        </section>
        <section
          className="hero-card hero-card-ops motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
          aria-labelledby={opsHeadingId}
        >
          <div className="hero-card-head">
            <h2 id={opsHeadingId} className="hero-card-label">
              {t("hero.drops")}
            </h2>
          </div>
          <div className={currentDropClassName}>
            <p
              className="hero-current-drop-title"
              title={hasLiveDropTitle ? activeDropTitle?.trim() : activeDropTitleText}
              dir={hasLiveDropTitle ? "auto" : undefined}
            >
              {activeDropTitleText}
            </p>
            {currentDropNoteText ? (
              <p className="hero-current-drop-note">{currentDropNoteText}</p>
            ) : null}
            {activeDropRemainingText || activeDropEtaText ? (
              <div className="hero-current-drop-meta">
                {activeDropRemainingText ? (
                  <span className="hero-current-drop-meta-item">{activeDropRemainingText}</span>
                ) : null}
                {activeDropEtaText ? (
                  <time
                    className="hero-current-drop-meta-item hero-time-pill"
                    dateTime={activeDropEtaIso ?? ""}
                  >
                    {t("control.eta", { time: activeDropEtaText })}
                  </time>
                ) : null}
              </div>
            ) : null}
          </div>
          {opsSummaryRows.length ? (
            <dl className="hero-ops-summary">
              {opsSummaryRows.map((row) => (
                <div key={row.key} className={`hero-summary-item tone-${row.tone}`}>
                  <dt className="hero-summary-label">{row.label}</dt>
                  <dd className="hero-summary-value">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      </div>
    </header>
  );
}
