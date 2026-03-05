import { useI18n } from "@renderer/shared/i18n";
import { useEffect, useMemo, useState } from "react";
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

const RAIL_STAGES = [
  { key: "standby", labelKey: "hero.engineRailStage.standby" },
  { key: "scan", labelKey: "hero.engineRailStage.scan" },
  { key: "watch", labelKey: "hero.engineRailStage.watch" },
  { key: "recover", labelKey: "hero.engineRailStage.recover" },
  { key: "hold", labelKey: "hero.engineRailStage.hold" },
] as const;

type RailStageKey = (typeof RAIL_STAGES)[number]["key"];

const formatHeroRemaining = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds < 60) return `${safeSeconds}s`;
  if (safeSeconds < 3600) {
    const minutes = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
  }
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
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
  const { t } = useI18n();
  const [nowTick, setNowTick] = useState(() => Date.now());

  const dropProgress =
    typeof dropsTotal === "number" && typeof dropsClaimed === "number"
      ? `${dropsClaimed}/${dropsTotal}`
      : "--";

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
  const railStatusKey = `hero.engineRailStatus.${activeRailStage}`;
  const railStatusText = t(railStatusKey);
  const hasActiveEta = typeof activeDropEta === "number" && Number.isFinite(activeDropEta);
  const shouldTickRemaining = hasUpdatePulse && hasActiveEta;
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
  const activeDropTitleText = activeDropTitle?.trim()
    ? activeDropTitle
    : activeGame && dropsOpen === 0
      ? t("control.allDone")
      : activeGame
        ? t("hero.opsNoActiveDrop")
        : t("hero.noTarget");
  const activeDropRemainingText =
    activeDropRemainingSeconds !== null
      ? t("control.rest", {
          time: formatHeroRemaining(activeDropRemainingSeconds),
        })
      : "--";
  const activeDropEtaText = hasActiveEta ? new Date(activeDropEta).toLocaleTimeString() : null;
  const inventorySyncText = inventoryFetchedAt
    ? new Date(inventoryFetchedAt).toLocaleTimeString()
    : "--";
  const lastPingText = lastWatchOk ? new Date(lastWatchOk).toLocaleTimeString() : "--";
  const warmupLabel = warmupActive
    ? warmupGame
      ? t("hero.warmup", { game: warmupGame })
      : t("hero.warmupActive")
    : "";

  return (
    <header className="hero-shell motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      <div className="hero-head">
        <h1 className="hero-title">{t("hero.title")}</h1>
        <div className="hero-flags">
          {warmupLabel ? <span className="hero-badge warmup">{warmupLabel}</span> : null}
          {demoMode ? <span className="hero-badge demo">{t("hero.demoMode")}</span> : null}
        </div>
      </div>
      <div className="hero-grid">
        <section className="hero-card hero-card-campaign motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
          <div className="hero-card-head">
            <span className="hero-card-label">{t("hero.activeCampaign")}</span>
          </div>
          <div className="hero-campaign-name">{activeGame || t("hero.noTarget")}</div>
          <div className="hero-campaign-progress">
            <div className="hero-campaign-progress-head">
              <span className="hero-micro-label">{t("hero.targetProgress")}</span>
              <span className="hero-micro-value">{progressPct}</span>
            </div>
            <div className="hero-campaign-progress-track" aria-hidden="true">
              <span
                className={`hero-campaign-progress-fill${progressPctValue === null ? " is-empty" : ""}`}
                style={progressPctValue === null ? undefined : { width: `${progressPctValue}%` }}
              />
            </div>
          </div>
          <div className={`hero-engine-rail tone-${activeRailStage}`} aria-hidden="true">
            <div className="hero-engine-rail-head">
              <span className="hero-engine-rail-title">{t("hero.engineRailTitle")}</span>
              <span className="hero-engine-rail-status-wrap">
                <strong
                  key={`hero-rail-status-${activeRailStage}`}
                  className="hero-engine-rail-status hero-engine-rail-status-animated"
                >
                  {railStatusText}
                </strong>
              </span>
            </div>
            <div className="hero-engine-rail-segments">
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
            <div className="hero-engine-rail-labels">
              {RAIL_STAGES.map((stage, index) => {
                const isActive = activeRailIndex === index;
                return (
                  <span
                    key={`${stage.key}-label`}
                    className={`hero-engine-rail-label${isActive ? " is-active" : ""}`}
                  >
                    {t(stage.labelKey)}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="hero-campaign-foot">
            <div className="hero-foot-chip">
              <span className="hero-foot-k">{t("hero.inventorySync")}</span>
              <span className="hero-foot-v">{inventorySyncText}</span>
            </div>
            <div className="hero-foot-chip">
              <span className="hero-foot-k">{t("hero.lastPing")}</span>
              <span className="hero-foot-v">{lastPingText}</span>
            </div>
          </div>
        </section>
        <section className="hero-card hero-card-ops motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
          <div className="hero-card-head">
            <span className="hero-card-label">{t("hero.drops")}</span>
          </div>
          <div className="hero-ops-progress-value">{dropProgress}</div>
          <div className="hero-ops-kpis">
            <div className="hero-kpi">
              <span className="hero-kpi-label">{t("control.dropsOpen")}</span>
              <span className="hero-kpi-value">{dropsOpenLabel}</span>
            </div>
            <div className="hero-kpi">
              <span className="hero-kpi-label">{t("hero.opsClaimable")}</span>
              <span className="hero-kpi-value">{dropsClaimableLabel}</span>
            </div>
            <div className="hero-kpi">
              <span className="hero-kpi-label">{t("hero.opsBlocked")}</span>
              <span className="hero-kpi-value">{dropsBlockedLabel}</span>
            </div>
          </div>
          <div className="hero-current-drop">
            <div className="hero-current-drop-head">
              <span className="hero-stat-label">{t("control.currentDrop")}</span>
            </div>
            <span className="hero-current-drop-title" title={activeDropTitleText}>
              {activeDropTitleText}
            </span>
            <div className="hero-current-drop-meta">
              <span className="pill ghost small">{activeDropRemainingText}</span>
              {activeDropEtaText ? (
                <span className="pill ghost small">
                  {t("control.eta", { time: activeDropEtaText })}
                </span>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </header>
  );
}
