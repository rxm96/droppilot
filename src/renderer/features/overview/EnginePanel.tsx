import * as React from "react";
import { formatRelative, formatUptime } from "./formatters";

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
  const sessionStartRef = React.useRef<number>(Date.now());
  const [now, setNow] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const rows: Array<{ key: string; value: string; tone?: "ok" }> = [
    { key: "watch_cycle", value: `${cycleSeconds}s` },
    { key: "last_refresh", value: formatRelative(lastWatchOk, now) },
    { key: "cadence", value: `${cadenceSeconds}s` },
    { key: "uptime", value: formatUptime(sessionStartRef.current, now) },
  ];

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4">
      <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] mb-3">
        engine
      </span>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex justify-between font-mono text-[11px]"
          >
            <span className="text-[color:var(--dp-text-dimmer)]">{row.key}</span>
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
