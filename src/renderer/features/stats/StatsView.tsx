import type { StatsState } from "@renderer/shared/types";
import { useI18n } from "@renderer/shared/i18n";
import { StatsHeader } from "./StatsHeader";
import { KpiCards } from "./KpiCards";
import { WatchTimeTrend } from "./WatchTimeTrend";
import { TopGamesPanel } from "./TopGamesPanel";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { computeStreaks } from "./statsDerive";

export type StatsViewProps = {
  stats: StatsState;
  resetStats: () => void;
};

export function StatsView({ stats, resetStats }: StatsViewProps) {
  const { t } = useI18n();

  if (stats.status === "idle" || stats.status === "loading") {
    return (
      <div className="flex min-h-40 items-center justify-center font-mono text-[12px] text-[color:var(--dp-text-dimmer)]">
        {t("stats.loading")}
      </div>
    );
  }

  if (stats.status === "error") {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-1 text-center">
        <span className="font-mono text-[12px] text-[color:var(--dp-signal-err)]">
          {t("stats.error")}
        </span>
        <span className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {stats.message}
        </span>
      </div>
    );
  }

  const { data } = stats;
  const { current, longest } = computeStreaks(data.daily);
  const gamesCount = Object.keys(data.claimsByGame).length;

  return (
    <div className="flex flex-col gap-6">
      <StatsHeader lastReset={data.lastReset} onReset={resetStats} />

      <KpiCards
        totalMinutes={data.totalMinutes}
        totalClaims={data.totalClaims}
        gamesCount={gamesCount}
        currentStreak={current}
      />

      <div className="grid gap-6" style={{ gridTemplateColumns: "1.7fr 1fr" }}>
        <WatchTimeTrend daily={data.daily} />
        <TopGamesPanel claimsByGame={data.claimsByGame} />
      </div>

      <ActivityHeatmap daily={data.daily} longestStreak={longest} />
    </div>
  );
}
