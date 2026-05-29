import { useI18n } from "@renderer/shared/i18n";
import { Stat } from "@renderer/shared/components/ui/stat";
import { formatWatchTime } from "./statsDerive";

export type KpiCardsProps = {
  totalMinutes: number;
  totalClaims: number;
  gamesCount: number;
  currentStreak: number;
};

export function KpiCards({ totalMinutes, totalClaims, gamesCount, currentStreak }: KpiCardsProps) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-4 gap-3">
      <Stat
        className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4"
        label={t("stats.kpi.watchTime")}
        value={formatWatchTime(totalMinutes)}
        accent
      />
      <Stat
        className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4"
        label={t("stats.kpi.claims")}
        value={totalClaims}
      />
      <Stat
        className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4"
        label={t("stats.kpi.games")}
        value={gamesCount}
      />
      <Stat
        className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4"
        label={t("stats.kpi.streak")}
        value={
          <span className="flex items-baseline gap-1.5">
            {currentStreak}
            <span className="text-[11px] font-normal text-[color:var(--dp-text-dimmer)]">
              {t("stats.unit.days")}
            </span>
          </span>
        }
      />
    </div>
  );
}
