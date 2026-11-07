import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { buildCalendar, formatWatchTime, type CalendarCell } from "./statsDerive";

export type ActivityHeatmapProps = {
  daily: Record<string, { minutes: number; claims: number }>;
};

const WEEKS = 26;

const LEVEL_BG: Record<CalendarCell["level"], string> = {
  0: "var(--dp-border)",
  1: "color-mix(in srgb, var(--dp-accent) 30%, transparent)",
  2: "color-mix(in srgb, var(--dp-accent) 60%, transparent)",
  3: "var(--dp-accent)",
};
const LEVELS: CalendarCell["level"][] = [0, 1, 2, 3];

/** Calendar heatmap: 7 rows (Monday first) × the last 26 weeks, with a legend. */
export function ActivityHeatmap({ daily }: ActivityHeatmapProps) {
  const { t, language } = useI18n();
  const headingId = React.useId();
  // Local midnight: re-buckets once a day, stable in between.
  const today = new Date().setHours(0, 0, 0, 0);
  const { weeks } = React.useMemo(() => buildCalendar(daily, WEEKS, today), [daily, today]);

  const cellTitle = (cell: CalendarCell) => {
    const [y, m, d] = cell.date.split("-").map(Number);
    const date = new Date(y, m - 1, d).toLocaleDateString(language, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const claims = cell.claims > 0 ? ` · ${cell.claims} ${t("stats.unit.claims")}` : "";
    return `${date} · ${formatWatchTime(cell.minutes)}${claims}`;
  };

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-[18px] lg:col-span-2"
    >
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <h2
          id={headingId}
          className="m-0 font-mono text-[11px] font-normal text-[color:var(--dp-text-dimmer)]"
        >
          {t("stats.heatmap.title", { weeks: WEEKS })}
        </h2>
        <span
          aria-hidden="true"
          className="flex items-center gap-1 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]"
        >
          {t("stats.heatmap.less")}
          {LEVELS.map((level) => (
            <span
              key={level}
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ background: LEVEL_BG[level] }}
            />
          ))}
          {t("stats.heatmap.more")}
        </span>
      </div>
      <div
        role="img"
        aria-label={t("stats.heatmap.aria", { weeks: WEEKS })}
        className="grid gap-[3px] overflow-x-auto pb-1"
        style={{
          gridTemplateRows: "repeat(7, 12px)",
          gridAutoFlow: "column",
          gridAutoColumns: "12px",
        }}
      >
        {weeks.flatMap((week, w) =>
          week.map((cell, d) =>
            cell ? (
              <span
                key={cell.date}
                title={cellTitle(cell)}
                className="rounded-[2px]"
                style={{ background: LEVEL_BG[cell.level] }}
              />
            ) : (
              <span key={`future-${w}-${d}`} aria-hidden="true" />
            ),
          ),
        )}
      </div>
    </section>
  );
}
