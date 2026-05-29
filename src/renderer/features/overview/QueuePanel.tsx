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
import { sameGameName } from "@renderer/shared/domain/gameName";
import { InventoryDrop } from "@renderer/shared/domain/dropDomain";

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
  /**
   * The current target game. When set, the queue filters to only this game's
   * drops so the list answers "what's next for what I'm farming" instead of
   * showing an arbitrary cross-game mix sorted by remaining time.
   */
  targetGame?: string;
};

export function QueuePanel({
  items,
  onManageClick,
  maxRows = 8,
  activeDrop,
  targetGame,
}: QueuePanelProps) {
  const { t } = useI18n();
  const hasTarget = !!targetGame && targetGame.length > 0;
  const queued = React.useMemo(() => {
    const now = Date.now();
    const filtered = items.filter((it) => {
      if (it.status === "claimed") return false;
      // Exclude drops whose campaign has already ended. The queue answers "what
      // can I still farm" — expired campaigns can't earn. They're also the cause
      // of the duplicate-looking list: an old + current campaign for the same
      // game often reuse generic drop names ("Drop 1..4"), so without this the
      // expired set shows alongside the active one.
      if (new InventoryDrop(it).isExpired(now)) return false;
      if (hasTarget && !sameGameName(it.game, targetGame)) return false;
      return true;
    });
    return filtered
      .sort((a, b) => {
        // Active drop pinned to the top — it's what the user is actually watching
        if (activeDrop) {
          if (a.id === activeDrop.id) return -1;
          if (b.id === activeDrop.id) return 1;
        }
        // Then in-progress (any earnedMinutes > 0) before truly fresh ones —
        // these are the next-most-likely things to finish.
        const aProgress = a.earnedMinutes > 0 ? 1 : 0;
        const bProgress = b.earnedMinutes > 0 ? 1 : 0;
        if (aProgress !== bProgress) return bProgress - aProgress;
        // Finally sort by remaining minutes ascending — quickest finish first.
        const remA = Math.max(0, a.requiredMinutes - a.earnedMinutes);
        const remB = Math.max(0, b.requiredMinutes - b.earnedMinutes);
        return remA - remB;
      })
      .slice(0, maxRows);
  }, [items, maxRows, activeDrop, targetGame, hasTarget]);

  // Count what's available outside the target so the user can see "X more in
  // other games" — explains why the queue looks short when targetGame filters
  // most things out.
  const otherGamesCount = React.useMemo(() => {
    if (!hasTarget) return 0;
    const now = Date.now();
    return items.filter(
      (it) =>
        it.status !== "claimed" &&
        !new InventoryDrop(it).isExpired(now) &&
        !sameGameName(it.game, targetGame),
    ).length;
  }, [items, hasTarget, targetGame]);

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
            {hasTarget
              ? t("queue.emptyForTarget", { game: targetGame! })
              : t("queue.emptyNoTarget")}
            {hasTarget && otherGamesCount > 0 && (
              <div className="mt-1 text-[color:var(--dp-text-dimmer)]">
                {t("queue.otherGamesHint", { count: otherGamesCount })}
              </div>
            )}
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
        {/* Footer hint when filtered AND we hid drops from other games.
            Helps the user understand they're seeing a focused slice, not
            an exhaustive list. */}
        {queued.length > 0 && hasTarget && otherGamesCount > 0 && (
          <div className="border-t border-[color:var(--dp-border-soft)] px-5 py-2 font-mono text-[10px] text-[color:var(--dp-text-dimmer)] text-center">
            {t("queue.otherGamesHint", { count: otherGamesCount })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
