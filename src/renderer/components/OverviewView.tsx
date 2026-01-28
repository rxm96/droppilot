import type { InventoryState, StatsState } from "../types";
import { useI18n } from "../i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

type OverviewProps = {
  inventory: InventoryState;
  stats: StatsState;
  resetStats: () => void;
};

export function OverviewView({
  inventory,
  stats,
  resetStats,
}: OverviewProps) {
  const { t, language } = useI18n();
  const items =
    inventory.status === "ready"
      ? inventory.items
      : inventory.status === "error"
        ? inventory.items ?? []
        : [];
  const totalDrops = items.length;
  const claimedDrops = items.filter((i) => i.status === "claimed").length;
  const inProgressDrops = items.filter((i) => i.status === "progress").length;
  const excludedDrops = items.filter((i) => i.excluded).length;
  const upcomingDrops = items.filter((i) => i.status === "locked" && !i.excluded).length;
  const statsData = stats.status === "ready" ? stats.data : null;
  const topGameEntries = statsData?.claimsByGame
    ? Object.entries(statsData.claimsByGame).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];
  const maxGameClaims = topGameEntries.length > 0 ? Math.max(...topGameEntries.map((e) => e[1])) : 0;
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
        <section className="overview-spotlight">
          <div className="overview-spotlight-main">
            <div className="overview-spotlight-head">
              <div className="label">{t("overview.stats")}</div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button type="button" className="ghost subtle-btn">
                    {t("overview.reset")}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("overview.resetConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("overview.resetConfirmDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("overview.resetCancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={resetStats}>
                      {t("overview.resetConfirmAction")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {stats.status === "ready" && statsData ? (
              <>
                <div className="overview-hero-kpis">
                  <div className="overview-kpi">
                    <span className="overview-kpi-value">
                      {formatNumber(statsData.totalMinutes)}
                    </span>
                    <span className="overview-kpi-label">{t("overview.totalMinutes")}</span>
                  </div>
                  <div className="overview-kpi">
                    <span className="overview-kpi-value">{formatNumber(statsData.totalClaims)}</span>
                    <span className="overview-kpi-label">{t("overview.claims")}</span>
                  </div>
                  <div className="overview-kpi">
                    <span className="overview-kpi-value">
                      {statsData.lastGame ? statsData.lastGame : "-"}
                    </span>
                    <span className="overview-kpi-label">{t("overview.lastGame")}</span>
                  </div>
                </div>
                <div className="overview-hero-meta">
                  <span className="meta">
                    {t("overview.lastClaim")}: {formatTime(statsData.lastClaimAt)}
                  </span>
                  {statsData.lastDropTitle ? (
                    <span className="meta muted">{statsData.lastDropTitle}</span>
                  ) : null}
                </div>
              </>
            ) : stats.status === "loading" ? (
              <p className="meta">{t("overview.loading")}</p>
            ) : stats.status === "error" ? (
              <p className="error">{stats.message}</p>
            ) : (
              <p className="meta">{t("overview.empty")}</p>
            )}
          </div>
        </section>

        <section className="overview-card">
          <div className="card-header-row">
            <div className="label">{t("inventory.title")}</div>
          </div>
          {inventory.status === "loading" ? (
            <p className="meta">{t("inventory.loading")}</p>
          ) : inventory.status === "error" ? (
            <p className="error">{t("inventory.error")}</p>
          ) : inventory.status === "idle" ? (
            <p className="meta">{t("inventory.idle")}</p>
          ) : (
            <div className="overview-breakdown">
              <div className="overview-breakdown-item claimed">
                <span className="overview-breakdown-dot" />
                <span>{t("inventory.status.claimed")}</span>
                <span className="overview-breakdown-value">{formatNumber(claimedDrops)}</span>
              </div>
              <div className="overview-breakdown-item progress">
                <span className="overview-breakdown-dot" />
                <span>{t("inventory.status.progress")}</span>
                <span className="overview-breakdown-value">{formatNumber(inProgressDrops)}</span>
              </div>
              <div className="overview-breakdown-item locked">
                <span className="overview-breakdown-dot" />
                <span>{t("inventory.status.locked")}</span>
                <span className="overview-breakdown-value">{formatNumber(upcomingDrops)}</span>
              </div>
              {excludedDrops > 0 ? (
                <div className="overview-breakdown-item excluded">
                  <span className="overview-breakdown-dot" />
                  <span>{t("inventory.category.excluded")}</span>
                  <span className="overview-breakdown-value">{formatNumber(excludedDrops)}</span>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="overview-card">
          <div className="card-header-row">
            <div className="label">{t("overview.topGames")}</div>
            <span className="meta">{t("overview.claims")}</span>
          </div>
          {stats.status === "loading" ? (
            <p className="meta">{t("overview.loading")}</p>
          ) : stats.status === "error" ? (
            <p className="error">{stats.message}</p>
          ) : topGameEntries.length === 0 ? (
            <p className="meta">{t("overview.noGameClaims")}</p>
          ) : (
            <div className="overview-game-list">
              {topGameEntries.map(([game, count]) => {
                const pct = maxGameClaims ? Math.round((count / maxGameClaims) * 100) : 0;
                return (
                  <div key={game} className="overview-game-row">
                    <div className="overview-game-head">
                      <span className="overview-game-name">{game}</span>
                      <span className="overview-game-count">{formatNumber(count)}</span>
                    </div>
                    <div className="overview-game-bar">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
