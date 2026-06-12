import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@renderer/shared/components/ui/card";
import { Pill } from "@renderer/shared/components/ui/pill";
import type { InventoryItem } from "@renderer/shared/types";
import { useI18n } from "@renderer/shared/i18n";
import { useVisibleTick } from "@renderer/shared/hooks/useVisibleTick";
import { cn } from "@renderer/shared/lib/utils";
import { buildDropsPlan, type PlanEntry } from "@renderer/shared/domain/dropsPlanner";
import { formatRemaining } from "@renderer/shared/utils";

const URGENT_MS = 2 * 60 * 60 * 1000;
type TFn = ReturnType<typeof useI18n>["t"];

export type DropsPlanCardProps = {
  items: InventoryItem[];
};

export function DropsPlanCard({ items }: DropsPlanCardProps) {
  const { t } = useI18n();
  // Owns its own 60s tick (paused while the window is hidden) so feasibility/
  // countdowns refresh without any useAppModel plumbing.
  const now = useVisibleTick(60_000);
  const plan = React.useMemo(() => buildDropsPlan(items, now), [items, now]);
  const feasibleCount = plan.filter((e) => e.status === "ok").length;

  return (
    <Card className="bg-[color:var(--dp-bg-elevated)] border-[color:var(--dp-border)] rounded-[var(--dp-radius-lg)]">
      <CardHeader className="flex flex-row items-center justify-between border-b border-[color:var(--dp-border-soft)] py-3.5">
        <CardTitle className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] font-normal">
          {t("plan.title")}
        </CardTitle>
        {plan.length > 0 && (
          <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
            {t("plan.feasibleCount", { count: feasibleCount, total: plan.length })}
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {plan.length === 0 ? (
          <div className="px-5 py-8 text-center font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {t("plan.empty")}
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--dp-border-soft)]">
            {plan.map((entry, idx) => (
              <PlanRow key={entry.gameKey} entry={entry} rank={idx + 1} now={now} t={t} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PlanRow({ entry, rank, now, t }: { entry: PlanEntry; rank: number; now: number; t: TFn }) {
  // Representative = the longest open drop (drops are sorted by remaining asc).
  const rep = entry.drops[entry.drops.length - 1];
  const pct =
    rep.requiredMinutes > 0 ? Math.round((rep.earnedMinutes / rep.requiredMinutes) * 100) : 0;
  const urgent = entry.deadlineMs !== null && entry.deadlineMs - now < URGENT_MS;
  const lost = entry.status === "lost";
  const countdown =
    entry.deadlineMs !== null
      ? t("plan.endsIn", {
          time: formatRemaining(Math.max(0, Math.round((entry.deadlineMs - now) / 1000))),
        })
      : null;

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-5 py-3",
        lost && "opacity-50",
        urgent && !lost && "border-l-2 border-l-[color:var(--dp-signal-err)]",
      )}
    >
      <span className="font-mono text-[11px] tabular-nums text-[color:var(--dp-text-dimmer)]">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn("truncate text-[13px] text-[color:var(--dp-text)]", lost && "line-through")}
        >
          {entry.gameLabel}
          <span className="text-[color:var(--dp-text-dimmer)]"> · {rep.title}</span>
        </div>
        <div className="mt-1 h-[5px] w-full overflow-hidden rounded-full bg-[color:var(--dp-border)]">
          <div
            className="h-full bg-[color:var(--dp-signal-ok)]"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {entry.status === "lost" ? (
          <Pill tone="err">⚠ {t("plan.lost")}</Pill>
        ) : entry.status === "partial" ? (
          <Pill tone="warn">
            ⚠{" "}
            {t("plan.atRisk", {
              count: entry.totalDropCount - entry.feasibleDropCount,
              total: entry.totalDropCount,
            })}
          </Pill>
        ) : (
          <Pill tone="ok">
            ⏳ {t("plan.remaining", { time: formatRemaining(entry.watchMinutes * 60) })}
          </Pill>
        )}
        {countdown && (
          <span
            className={cn(
              "font-mono text-[10px]",
              urgent ? "text-[color:var(--dp-signal-err)]" : "text-[color:var(--dp-text-dimmer)]",
            )}
          >
            {countdown}
          </span>
        )}
      </div>
    </li>
  );
}
