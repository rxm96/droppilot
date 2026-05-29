import * as React from "react";
import { formatRelative, formatUptime } from "./formatters";
import { useI18n } from "@renderer/shared/i18n";

export type EnginePanelProps = {
  lastWatchOk?: number | null;
  cycleSeconds?: number;
  cadenceSeconds?: number;
};

export function EnginePanel({
  lastWatchOk,
  cycleSeconds = 30,
  cadenceSeconds = 30,
}: EnginePanelProps) {
  const { t } = useI18n();
  const sessionStartRef = React.useRef<number>(Date.now());
  const [now, setNow] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const rows: Array<{ id: string; label: string; value: string; tone?: "ok" }> = [
    { id: "watchCycle", label: t("engine.row.watchCycle"), value: `${cycleSeconds}s` },
    {
      id: "lastRefresh",
      label: t("engine.row.lastRefresh"),
      value: formatRelative(lastWatchOk, now),
    },
    { id: "cadence", label: t("engine.row.cadence"), value: `${cadenceSeconds}s` },
    {
      id: "uptime",
      label: t("engine.row.uptime"),
      value: formatUptime(sessionStartRef.current, now),
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
}
