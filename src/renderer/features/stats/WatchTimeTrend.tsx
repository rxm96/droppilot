import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Button } from "@renderer/shared/components/ui/button";
import { cn } from "@renderer/shared/lib/utils";
import { buildTrendSeries } from "./statsDerive";

export type WatchTimeTrendProps = {
  daily: Record<string, { minutes: number; claims: number }>;
};

type Range = 7 | 30 | 90;
const RANGES: Range[] = [7, 30, 90];

// Fixed viewBox; preserveAspectRatio="none" stretches it to the container.
const W = 600;
const H = 140;

export function WatchTimeTrend({ daily }: WatchTimeTrendProps) {
  const { t, language } = useI18n();
  const [range, setRange] = React.useState<Range>(30);

  const series = React.useMemo(() => buildTrendSeries(daily, range), [daily, range]);

  const max = Math.max(...series.map((s) => s.minutes), 1);
  const lastIndex = Math.max(series.length - 1, 1);

  const points = series.map((s, i) => {
    const x = (i / lastIndex) * W;
    const y = H - (s.minutes / max) * H;
    return { x, y };
  });

  const linePath = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const areaPath =
    points.length > 0
      ? `M ${points[0].x.toFixed(2)} ${H} ` +
        points.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") +
        ` L ${points[points.length - 1].x.toFixed(2)} ${H} Z`
      : "";

  const gradientId = React.useId();

  const fmtAxis = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(language);
  };

  const startDate = series.length > 0 ? fmtAxis(series[0].date) : "";
  const endDate = series.length > 0 ? fmtAxis(series[series.length - 1].date) : "";

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <SectionLabel inline>{t("stats.trend.title")}</SectionLabel>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => {
            const active = r === range;
            return (
              <Button
                key={r}
                type="button"
                variant="dp-ghost"
                size="dp-sm"
                aria-pressed={active}
                onClick={() => setRange(r)}
                className={cn(
                  active && "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]",
                )}
              >
                {t(`stats.range.${r}`)}
              </Button>
            );
          })}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label={t("stats.trend.title")}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--dp-accent)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--dp-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
        <polyline
          points={linePath}
          fill="none"
          stroke="var(--dp-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
        <span>{startDate}</span>
        <span>{endDate}</span>
      </div>
    </div>
  );
}
