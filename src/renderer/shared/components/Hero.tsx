import type { ErrorInfo, ProfileState } from "../../types";
import { useI18n } from "../../i18n";
import { useFormatters } from "../hooks/useFormatters";

type HeroProps = {
  isLinked: boolean;
  demoMode?: boolean;
  profile: ProfileState;
  nextWatchIn?: number;
  nextWatchProgress?: number;
  watchError?: ErrorInfo | null;
  activeGame?: string;
  dropsTotal?: number;
  dropsClaimed?: number;
  targetProgress?: number;
};

export function Hero({
  isLinked,
  demoMode,
  profile,
  nextWatchIn,
  nextWatchProgress,
  watchError,
  activeGame,
  dropsTotal,
  dropsClaimed,
  targetProgress,
}: HeroProps) {
  const { t, language } = useI18n();
  const { formatRemaining } = useFormatters(language);
  const dropProgress =
    typeof dropsTotal === "number" && typeof dropsClaimed === "number"
      ? `${dropsClaimed}/${dropsTotal}`
      : "--";

  const showLoginLine =
    profile.status === "ready" &&
    profile.login &&
    profile.displayName &&
    profile.displayName.toLowerCase() !== profile.login.toLowerCase();

  const displayName = profile.status === "ready" ? profile.displayName : "";
  const login = profile.status === "ready" ? profile.login : "";

  const progressPct = typeof targetProgress === "number" ? `${Math.round(targetProgress)}%` : "--";
  const nextWatchLabel = typeof nextWatchIn === "number" ? formatRemaining(nextWatchIn) : "--";
  const nextWatchPct =
    typeof nextWatchProgress === "number"
      ? Math.min(100, Math.max(0, Math.round(nextWatchProgress * 100)))
      : null;

  return (
    <header className="app-hero compact">
      <div className="hero-left">
        <div className="hero-head">
          <div>
            <h1>{t("hero.title")}</h1>
          </div>
          <div className="pill-row">
            <span className="pill">
              {isLinked ? t("hero.accountLinked") : t("hero.accountNotLinked")}
            </span>
            {demoMode ? <span className="pill ghost">{t("hero.demoMode")}</span> : null}
          </div>
        </div>
      </div>
      <div className="hero-kpis">
        <div className="card kpi-card">
          <div className="label">{t("hero.activeCampaign")}</div>
          <div className="kpi-value">{activeGame || t("hero.noTarget")}</div>
          <div className="kpi-meta">
            {t("hero.nextPing", { time: nextWatchLabel })}
            {watchError ? ` | ${t("hero.pingError")}` : ""}
          </div>
          {nextWatchPct !== null ? (
            <div className="progress-bar small hero-timer-bar" aria-hidden="true">
              <span style={{ width: `${nextWatchPct}%` }} />
            </div>
          ) : null}
        </div>
        <div className="card kpi-card">
          <div className="label">{t("hero.drops")}</div>
          <div className="kpi-value">{dropProgress}</div>
          <div className="kpi-meta">
            {t("hero.targetProgress")}: {progressPct}
          </div>
        </div>
        <div className="card kpi-card">
          <div className="label">{t("hero.account")}</div>
          {profile.status === "ready" ? (
            <div className="profile-row small">
              {profile.avatar && <img src={profile.avatar} alt="" />}
              <div>
                <div className="meta">{displayName}</div>
                {showLoginLine ? <div className="meta muted">@{login}</div> : null}
              </div>
            </div>
          ) : (
            <div className="meta">
              {profile.status === "loading" ? t("hero.profileLoading") : t("hero.profileIdle")}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
