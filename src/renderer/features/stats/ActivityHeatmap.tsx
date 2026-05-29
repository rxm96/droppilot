import { useMemo } from "react";
import { useI18n } from "@renderer/shared/i18n";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { buildTrendSeries } from "./statsDerive";

export type ActivityHeatmapProps = {
  daily: Record<string, { minutes: number; claims: number }>;
  longestStreak: number;
};

// 18 weeks of daily cells, GitHub-style (rows = weekdays, columns = weeks).
const RANGE_DAYS = 126;

/**
 * Bucket minutes into 0-4 intensity levels and return the accent-mix percent
 * used for the cell background. 0 minutes → faint base (handled by caller).
 */
function intensityPct(minutes: number, max: number): number {
  if (minutes <= 0) return 0;
  const ratio = minutes / max;
  if (ratio <= 0.25) return 25;
  if (ratio <= 0.5) return 45;
  if (ratio <= 0.75) return 70;
  return 100;
}

export function ActivityHeatmap({ daily, longestStreak }: ActivityHeatmapProps) {
  const { t } = useI18n();
  const series = useMemo(() => buildTrendSeries(daily, RANGE_DAYS), [daily]);
  const max = useMemo(() => Math.max(...series.map((s) => s.minutes), 1), [series]);

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <SectionLabel inline>{t("stats.heatmap.title")}</SectionLabel>
        <div className="flex items-baseline gap-1.5 font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
          <span className="uppercase tracking-[0.12em]">{t("stats.heatmap.longest")}</span>
          <span
            className="text-[12px] text-[color:var(--dp-text)]"
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {longestStreak}
          </span>
          <span>{t("stats.unit.days")}</span>
        </div>
      </div>

      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateRows: "repeat(7, 1fr)",
          gridAutoFlow: "column",
          gridAutoColumns: "minmax(0, 1fr)",
        }}
      >
        {series.map((cell) => {
          const pct = intensityPct(cell.minutes, max);
          return (
            <div
              key={cell.date}
              title={`${cell.date} · ${cell.minutes}m`}
              className="aspect-square rounded-[2px]"
              style={{
                minWidth: 0,
                background:
                  pct === 0
                    ? "var(--dp-bg-app)"
                    : `color-mix(in srgb, var(--dp-accent) ${pct}%, transparent)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
