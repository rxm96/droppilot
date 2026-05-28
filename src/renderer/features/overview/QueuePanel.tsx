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

export type QueuePanelProps = {
  items: InventoryItem[];
  onManageClick?: () => void;
  maxRows?: number;
};

export function QueuePanel({ items, onManageClick, maxRows = 8 }: QueuePanelProps) {
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
          <Table columns="40px 2fr 1fr 1fr 100px">
            <TableHead>
              <span>#</span>
              <span>{t("queue.table.dropGame")}</span>
              <span>{t("queue.table.watched")}</span>
              <span>{t("queue.table.progress")}</span>
              <span>{t("queue.table.status")}</span>
            </TableHead>
            {queued.map((item, idx) => {
              const watched = formatHourMinute(item.earnedMinutes);
              const progressPct =
                item.requiredMinutes > 0
                  ? Math.round((item.earnedMinutes / item.requiredMinutes) * 100)
                  : 0;
              const status = item.status === "progress" ? "live" : "queued";
              const tone = status === "live" ? "accent" : "dim";
              return (
                <TableRow key={item.id}>
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
                    <Pill tone={tone} dot={status === "live"}>
                      {status === "live" ? t("queue.pill.live") : t("queue.pill.queued")}
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
