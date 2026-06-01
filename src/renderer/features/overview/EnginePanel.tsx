import * as React from "react";
import { formatRelative, formatUptime } from "./formatters";
import { useI18n } from "@renderer/shared/i18n";
import { TimeText } from "@renderer/shared/components/TimeText";

export type EnginePanelProps = {
  lastWatchOk?: number | null;
  /** Timestamp the engine started actively watching, or null when stopped. */
  watchingSince?: number | null;
  cycleSeconds?: number;
  cadenceSeconds?: number;
};

// Memoized: props are stable across the per-second watch tick. The two
// time-relative rows own their own ticking <TimeText> leaf, so the panel body
// no longer re-renders every second (and the tick pauses while hidden).
export const EnginePanel = React.memo(function EnginePanel({
  lastWatchOk,
  watchingSince,
  cycleSeconds = 30,
  cadenceSeconds = 30,
}: EnginePanelProps) {
  const { t } = useI18n();

  const rows: Array<{ id: string; label: string; value: React.ReactNode; tone?: "ok" }> = [
    { id: "watchCycle", label: t("engine.row.watchCycle"), value: `${cycleSeconds}s` },
    {
      id: "lastRefresh",
      label: t("engine.row.lastRefresh"),
      value: <TimeText render={(now) => formatRelative(lastWatchOk, now)} />,
    },
    { id: "cadence", label: t("engine.row.cadence"), value: `${cadenceSeconds}s` },
    {
      id: "uptime",
      label: t("engine.row.uptime"),
      value:
        typeof watchingSince === "number" ? (
          <TimeText render={(now) => formatUptime(watchingSince, now)} />
        ) : (
          "--"
        ),
    },
  ];

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4">
      <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] mb-3">
        {t("engine.header")}
      </span>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div key={row.id} className="flex justify-between font-mono text-[11px]">
            <span className="text-[color:var(--dp-text-dimmer)]">{row.label}</span>
            <span
              className={
                row.tone === "ok"
                  ? "text-[color:var(--dp-signal-ok)]"
                  : "text-[color:var(--dp-text)]"
              }
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
