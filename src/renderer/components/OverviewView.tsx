import type { InventoryState, ProfileState, StatsState } from "../types";
import { obfuscateName } from "../utils";
import { useI18n } from "../i18n";

type OverviewProps = {
  profile: ProfileState;
  isLinked: boolean;
  inventory: InventoryState;
  stats: StatsState;
  resetStats: () => void;
  logout: () => void;
};

export function OverviewView({
  profile,
  isLinked,
  inventory,
  stats,
  resetStats,
  logout,
}: OverviewProps) {
  const { t, language } = useI18n();
  const totalDrops = inventory.status === "ready" ? inventory.items.length : 0;
  const totalActive =
    inventory.status === "ready"
      ? inventory.items.filter((i) => i.status !== "claimed" && i.excluded !== true).length
      : 0;
  const statsData = stats.status === "ready" ? stats.data : null;
  const formatNumber = (val: number) =>
    new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(
      Math.max(0, Math.round(val)),
    );
  const formatTime = (ts?: number) => (ts ? new Date(ts).toLocaleTimeString() : "n/a");

  return (
    <>
      <div className="panel-head">
        <div>
          <h2>{t("overview.title")}</h2>
          <p className="meta">{t("overview.subtitle")}</p>
        </div>
      </div>
      <div className="overview-grid">
        <div className="card wide">
          <div className="card-header-row">
            <div className="label">{t("overview.stats")}</div>
            <button type="button" className="ghost subtle-btn" onClick={resetStats}>
              {t("overview.reset")}
            </button>
          </div>
          {stats.status === "ready" && statsData ? (
            <div className="progress-summary">
              <div className="stat-pill">
                <span className="stat-label">{t("overview.totalMinutes")}</span>
                <span className="stat-value">{formatNumber(statsData.totalMinutes)}</span>
              </div>
              <div className="stat-pill">
                <span className="stat-label">{t("overview.claims")}</span>
                <span className="stat-value">{formatNumber(statsData.totalClaims)}</span>
              </div>
              <div className="stat-pill">
                <span className="stat-label">{t("overview.lastClaim")}</span>
                <span className="stat-value">{formatTime(statsData.lastClaimAt)}</span>
              </div>
              {statsData.lastGame ? (
                <div className="stat-pill accent">
                  <span className="stat-label">{t("overview.lastGame")}</span>
                  <span className="stat-value">
                    {statsData.lastGame}
                    {statsData.lastDropTitle ? ` • ${statsData.lastDropTitle}` : ""}
                  </span>
                </div>
              ) : null}
            </div>
          ) : stats.status === "loading" ? (
            <p className="meta">{t("overview.loading")}</p>
          ) : stats.status === "error" ? (
            <p className="error">{stats.message}</p>
          ) : (
            <p className="meta">{t("overview.empty")}</p>
          )}
        </div>
        <div className="card wide">
          <div className="card-header-row">
            <div>
              <div className="label">{t("overview.connection")}</div>
            </div>
            <button type="button" className="ghost subtle-btn" onClick={logout}>
              {t("overview.logout")}
            </button>
          </div>
          {profile.status === "ready" ? (
            <div className="profile-row compact">
              <div>
                <div className="meta">{obfuscateName(profile.displayName)}</div>
                <div className="meta muted">@{obfuscateName(profile.login)}</div>
              </div>
              <div className={`pill ${isLinked ? "ghost" : "danger"}`}>
                {isLinked ? t("overview.linked") : t("overview.notLinked")}
              </div>
            </div>
          ) : (
            <p className="meta">{t("overview.profileMissing")}</p>
          )}
          <div className="meta" style={{ marginTop: 8 }}>
            {t("overview.dropsTotal")}: {totalDrops} | {t("overview.dropsActive")}: {totalActive}
          </div>
        </div>
      </div>
    </>
  );
}
