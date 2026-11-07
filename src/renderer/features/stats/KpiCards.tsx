import type * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import { formatWatchTime } from "./statsDerive";

export type KpiCardsProps = {
  totalMinutes: number;
  totalClaims: number;
  gamesCount: number;
  currentStreak: number;
  bestStreak: number;
};

function Kpi({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="bg-[color:var(--dp-bg-elevated)] px-5 py-[18px]">
      <dt className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">{label}</dt>
      <dd
        className={cn(
          "m-0 mt-1.5 font-mono text-[26px] font-medium leading-tight tabular-nums",
          accent ? "text-[color:var(--dp-accent)]" : "text-[color:var(--dp-text)]",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** KPI strip: drops claimed · watched for you (accent) · games · streak with best. */
export function KpiCards({
  totalMinutes,
  totalClaims,
  gamesCount,
  currentStreak,
  bestStreak,
}: KpiCardsProps) {
  const { t } = useI18n();
  return (
    // gap-px over a border-colored background draws the dividers, also when the strip wraps.
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-px overflow-hidden rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-border)]">
      <Kpi label={t("stats.kpi.claims")}>{totalClaims}</Kpi>
      <Kpi label={t("stats.kpi.watchTime")} accent>
        {formatWatchTime(totalMinutes)}
      </Kpi>
      <Kpi label={t("stats.kpi.games")}>{gamesCount}</Kpi>
      <Kpi label={t("stats.kpi.streak")}>
        {currentStreak}
        <span className="text-[14px] font-normal text-[color:var(--dp-text-dimmer)]">
          {" "}
          {t("stats.kpi.streakBest", { best: bestStreak })}
        </span>
      </Kpi>
    </dl>
  );
}
