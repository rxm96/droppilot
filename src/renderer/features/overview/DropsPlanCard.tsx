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
const EMPTY_GAMES: string[] = [];
type TFn = ReturnType<typeof useI18n>["t"];

export type DropsPlanCardProps = {
  items: InventoryItem[];
  priorityGames?: string[];
  obeyPriority?: boolean;
};

export function DropsPlanCard({
  items,
  priorityGames = EMPTY_GAMES,
  obeyPriority = false,
}: DropsPlanCardProps) {
  const { t } = useI18n();
  // Owns its own 60s tick (paused while the window is hidden) so feasibility/
  // countdowns refresh without any useAppModel plumbing.
  const now = useVisibleTick(60_000);
  const plan = React.useMemo(
    () => buildDropsPlan(items, now, { priorityGames, obeyPriority }),
    [items, now, priorityGames, obeyPriority],
  );
  const feasibleCount = plan.filter((e) => e.status === "ok").length;
  // Boundary between priority games and the permissive fallback tail.
  const firstFallbackIdx = plan.findIndex((e) => !e.isPriority);

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
              <React.Fragment key={entry.gameKey}>
                {idx === firstFallbackIdx && firstFallbackIdx > 0 && (
                  <li
                    aria-hidden="true"
                    className="border-t-0 px-5 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)]"
                  >
                    — {t("plan.fallbackDivider")} —
                  </li>
                )}
                <PlanRow entry={entry} now={now} t={t} />
              </React.Fragment>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PlanRow({ entry, now, t }: { entry: PlanEntry; now: number; t: TFn }) {
  // Representative = the longest open drop (drops are sorted by remaining asc).
  const rep = entry.drops[entry.drops.length - 1];
  const pct =
    rep.requiredMinutes > 0
      ? Math.max(0, Math.min(100, Math.round((rep.earnedMinutes / rep.requiredMinutes) * 100)))
      : 0;
  const lost = entry.status === "lost";
  const urgent = !lost && entry.deadlineMs !== null && entry.deadlineMs - now < URGENT_MS;
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
        urgent && "border-l-2 border-l-[color:var(--dp-signal-err)]",
      )}
    >
      <span className="font-mono text-[11px] tabular-nums text-[color:var(--dp-text-dimmer)]">
        {entry.priorityRank !== null ? `#${entry.priorityRank}` : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn("truncate text-[13px] text-[color:var(--dp-text)]", lost && "line-through")}
        >
          {entry.gameLabel}
          <span className="text-[color:var(--dp-text-dimmer)]"> · {rep.title}</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={entry.gameLabel}
          className="mt-1 h-[5px] w-full overflow-hidden rounded-full bg-[color:var(--dp-border)]"
        >
          <div className="h-full bg-[color:var(--dp-signal-ok)]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {entry.status === "lost" ? (
          <Pill tone="err">
            <span aria-hidden="true">⚠</span> {t("plan.lost")}
          </Pill>
        ) : entry.status === "partial" ? (
          <Pill tone="warn">
            <span aria-hidden="true">⚠</span>{" "}
            {t("plan.atRisk", {
              count: entry.totalDropCount - entry.feasibleDropCount,
              total: entry.totalDropCount,
            })}
          </Pill>
        ) : (
          <Pill tone="ok">
            {/* watchMinutes is in minutes; *60 → seconds for formatRemaining */}
            <span aria-hidden="true">⏳</span>{" "}
            {t("plan.remaining", { time: formatRemaining(entry.watchMinutes * 60) })}
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
