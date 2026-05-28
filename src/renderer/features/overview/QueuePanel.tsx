import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardAction,
} from "@renderer/shared/components/ui/card";
import { Table, TableHead, TableRow, TableCell } from "@renderer/shared/components/ui/table";
import { Pill } from "@renderer/shared/components/ui/pill";
import type { InventoryItem } from "@renderer/shared/types";
import { formatHourMinute, formatPercent, padRank } from "./formatters";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";

export type QueuePanelProps = {
  items: InventoryItem[];
  onManageClick?: () => void;
  maxRows?: number;
  /**
   * The currently-watched drop. When set, the row whose `id` matches uses
   * `earnedMinutes` (live-ticking, from useTargetDrops virtualEarned) instead
   * of the static inventory value, and renders a distinct "watching" pill +
   * accent border-l so the user can see live progress in the queue list.
   */
  activeDrop?: { id: string; earnedMinutes: number } | null;
};

export function QueuePanel({ items, onManageClick, maxRows = 8, activeDrop }: QueuePanelProps) {
  const { t } = useI18n();
  const queued = React.useMemo(() => {
    return items
      .filter((it) => it.status !== "claimed")
      .sort((a, b) => {
        const remA = Math.max(0, a.requiredMinutes - a.earnedMinutes);
        const remB = Math.max(0, b.requiredMinutes - b.earnedMinutes);
        return remA - remB;
      })
      .slice(0, maxRows);
  }, [items, maxRows]);

  return (
    <Card className="bg-[color:var(--dp-bg-elevated)] border-[color:var(--dp-border)] rounded-[var(--dp-radius-lg)]">
      <CardHeader className="flex flex-row items-center border-b border-[color:var(--dp-border-soft)] py-3.5">
        <CardTitle className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] font-normal">
          {t("queue.header")}
        </CardTitle>
        {onManageClick && <CardAction onClick={onManageClick}>{t("queue.manage")}</CardAction>}
      </CardHeader>
      <CardContent className="p-0">
        {queued.length === 0 ? (
          <div className="px-5 py-8 text-center font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {t("queue.empty")}
          </div>
        ) : (
          <Table columns="40px 2fr 1fr 1fr 110px">
            <TableHead>
              <span>#</span>
              <span>{t("queue.table.dropGame")}</span>
              <span>{t("queue.table.watched")}</span>
              <span>{t("queue.table.progress")}</span>
              <span>{t("queue.table.status")}</span>
            </TableHead>
            {queued.map((item, idx) => {
              const isActive = !!(activeDrop && activeDrop.id === item.id);
              // Use the live earnedMinutes from activeDrop (ticks every 1s
              // via useTargetDrops) only for the row the user is actively
              // watching. Other rows show their last-known inventory value.
              const earnedDisplay = isActive ? activeDrop.earnedMinutes : item.earnedMinutes;
              const watched = formatHourMinute(earnedDisplay);
              const progressPct =
                item.requiredMinutes > 0
                  ? Math.round((earnedDisplay / item.requiredMinutes) * 100)
                  : 0;
              const statusKey = isActive
                ? "watching"
                : item.status === "progress"
                  ? "live"
                  : "queued";
              const tone =
                statusKey === "watching" ? "ok" : statusKey === "live" ? "accent" : "dim";
              return (
                <TableRow
                  key={item.id}
                  className={cn(
                    isActive &&
                      "bg-[color:var(--dp-accent-soft)] border-l-2 border-l-[color:var(--dp-accent)]",
                  )}
                >
                  <TableCell mono dim>
                    {padRank(idx + 1)}
                  </TableCell>
                  <TableCell>
                    <div className="truncate">{item.title}</div>
                    <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mt-0.5">
                      {item.game}
                    </div>
                  </TableCell>
                  <TableCell mono dim>
                    {watched}
                  </TableCell>
                  <TableCell mono dim>
                    {formatPercent(progressPct)}
                  </TableCell>
                  <TableCell>
                    <Pill tone={tone} dot={statusKey === "live" || statusKey === "watching"}>
                      {statusKey === "watching"
                        ? t("queue.pill.watching")
                        : statusKey === "live"
                          ? t("queue.pill.live")
                          : t("queue.pill.queued")}
                    </Pill>
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
