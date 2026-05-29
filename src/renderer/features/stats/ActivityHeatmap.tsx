import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useI18n } from "@renderer/shared/i18n";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { buildTrendSeries, formatWatchTime } from "./statsDerive";

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

type HoverState = {
  date: string;
  minutes: number;
  claims: number;
  x: number;
  y: number;
  flipBelow: boolean;
};

export function ActivityHeatmap({ daily, longestStreak }: ActivityHeatmapProps) {
  const { t, language } = useI18n();
  const series = useMemo(() => buildTrendSeries(daily, RANGE_DAYS), [daily]);
  const max = useMemo(() => Math.max(...series.map((s) => s.minutes), 1), [series]);
  const gridRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const handleEnter = (
    e: ReactMouseEvent<HTMLDivElement>,
    cell: { date: string; minutes: number },
  ) => {
    const grid = gridRef.current;
    if (!grid) return;
    const cellRect = e.currentTarget.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const top = cellRect.top - gridRect.top;
    setHover({
      date: cell.date,
      minutes: cell.minutes,
      claims: Math.max(0, Number(daily[cell.date]?.claims) || 0),
      x: cellRect.left - gridRect.left + cellRect.width / 2,
      y: top,
      flipBelow: top < 28,
    });
  };

  const formatDate = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(language, {
      day: "numeric",
      month: "short",
      weekday: "short",
    });
  };

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
        ref={gridRef}
        className="relative grid gap-[3px]"
        style={{
          gridTemplateRows: "repeat(7, 1fr)",
          gridAutoFlow: "column",
          gridAutoColumns: "minmax(0, 1fr)",
        }}
        onMouseLeave={() => setHover(null)}
      >
        {series.map((cell) => {
          const pct = intensityPct(cell.minutes, max);
          const isHovered = hover?.date === cell.date;
          return (
            <div
              key={cell.date}
              onMouseEnter={(e) => handleEnter(e, cell)}
              className="aspect-square rounded-[2px]"
              style={{
                minWidth: 0,
                position: "relative",
                background:
                  pct === 0
                    ? "var(--dp-bg-app)"
                    : `color-mix(in srgb, var(--dp-accent) ${pct}%, transparent)`,
                transform: isHovered ? "scale(1.45)" : "scale(1)",
                boxShadow: isHovered
                  ? "0 0 0 1.5px var(--dp-accent), 0 0 16px var(--dp-accent-glow)"
                  : undefined,
                zIndex: isHovered ? 10 : 0,
                transition: "transform 160ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 160ms ease",
                willChange: "transform",
              }}
            />
          );
        })}

        {hover && (
          <div
            className="pointer-events-none absolute z-20 flex -translate-x-1/2 items-baseline gap-1.5 whitespace-nowrap rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated-2)] px-2 py-1 font-mono text-[11px] text-[color:var(--dp-text)] shadow-[0_8px_24px_rgba(0,0,0,0.45),0_0_0_1px_var(--dp-accent-soft),0_0_20px_var(--dp-accent-glow)]"
            style={{
              left: hover.x,
              top: hover.flipBelow ? hover.y + 22 : hover.y - 10,
              transform: hover.flipBelow ? "translateX(-50%)" : "translate(-50%, -100%)",
            }}
          >
            <span className="text-[color:var(--dp-text-dim)]">{formatDate(hover.date)}</span>
            <span className="text-[color:var(--dp-text-dimmer)]">·</span>
            <span style={{ fontFeatureSettings: '"tnum"' }}>{formatWatchTime(hover.minutes)}</span>
            {hover.claims > 0 && (
              <>
                <span className="text-[color:var(--dp-text-dimmer)]">·</span>
                <span
                  className="text-[color:var(--dp-accent)]"
                  style={{ fontFeatureSettings: '"tnum"' }}
                >
                  {hover.claims}
                </span>
                <span className="text-[color:var(--dp-text-dimmer)]">{t("stats.unit.claims")}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
