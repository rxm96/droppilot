import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import { buildWatchChart, formatHoursShort, formatWatchTime } from "./statsDerive";

export type WatchTimeTrendProps = {
  daily: Record<string, { minutes: number; claims: number }>;
};

type Range = 7 | 30 | 90;
const RANGES: Range[] = [7, 30, 90];
const CHART_HEIGHT = 180;

/** Watch time per day as bars, with a 7d / 30d / 90d range, summary and y-axis ticks. */
export function WatchTimeTrend({ daily }: WatchTimeTrendProps) {
  const { t, language } = useI18n();
  const [range, setRange] = React.useState<Range>(30);
  const headingId = React.useId();
  // Local midnight: day resolution is enough and keeps the memo stable within a day.
  const today = new Date().setHours(0, 0, 0, 0);
  const chart = React.useMemo(() => buildWatchChart(daily, range, today), [daily, range, today]);

  const total = formatHoursShort(chart.totalMinutes);
  const fmtDate = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(language, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3.5 rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-[18px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id={headingId}
            className="m-0 font-mono text-[11px] font-normal text-[color:var(--dp-text-dimmer)]"
          >
            {t("stats.trend.title")}
          </h2>
          <div className="mt-1 font-mono text-[12px] tabular-nums text-[color:var(--dp-text-dim)]">
            {t("stats.trend.summary", {
              total,
              days: range,
              avg: formatHoursShort(chart.avgMinutes),
            })}
          </div>
        </div>
        <div
          role="group"
          aria-label={t("stats.trend.rangeAria")}
          className="flex gap-0.5 rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] p-[3px]"
        >
          {RANGES.map((r) => {
            const active = r === range;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={active}
                onClick={() => setRange(r)}
                className={cn(
                  "min-h-[28px] rounded-[var(--dp-radius-sm)] px-2.5 font-mono text-[11px] transition-colors",
                  active
                    ? "bg-[color:var(--dp-bg-elevated-2)] text-[color:var(--dp-text)]"
                    : "text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-text)]",
                )}
              >
                {t(`stats.range.${r}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-2">
        <div
          aria-hidden="true"
          className="flex flex-col justify-between text-right font-mono text-[10px] tabular-nums text-[color:var(--dp-text-dimmer)]"
          style={{ height: CHART_HEIGHT }}
        >
          {chart.ticks.map((tick, i) => (
            <span key={i} className="leading-none">
              {formatHoursShort(tick)}
            </span>
          ))}
        </div>
        <div
          role="img"
          aria-label={t("stats.trend.aria", { days: range, total })}
          className={cn(
            "flex items-end border-b border-[color:var(--dp-border)]",
            range > 30 ? "gap-px" : "gap-[3px]",
          )}
          style={{
            height: CHART_HEIGHT,
            // Grid lines at the top and halfway.
            background:
              "linear-gradient(var(--dp-border-soft), var(--dp-border-soft)) 0 0 / 100% 1px no-repeat, linear-gradient(var(--dp-border-soft), var(--dp-border-soft)) 0 50% / 100% 1px no-repeat",
          }}
        >
          {chart.bars.map((bar) => (
            <div
              key={bar.date}
              title={`${fmtDate(bar.date)} · ${formatWatchTime(bar.minutes)}`}
              className="min-w-0 flex-1 rounded-t-[2px]"
              style={{
                height: `${bar.pct}%`,
                background: bar.today
                  ? "var(--dp-accent)"
                  : "color-mix(in srgb, var(--dp-accent) 55%, transparent)",
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-between pl-[42px] font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
        <span>{t("stats.trend.daysAgo", { days: range - 1 })}</span>
        <span>{t("stats.trend.today")}</span>
      </div>
    </section>
  );
}
