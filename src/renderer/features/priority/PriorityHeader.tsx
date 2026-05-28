import * as React from "react";
import { Stat } from "@renderer/shared/components/ui/stat";
import { useI18n } from "@renderer/shared/i18n";

export type PriorityHeaderProps = {
  totalCount: number;
  livePriorityCount: number;
  activeTargetGame: string;
  watchingGame: string;
  topGame: string;
  obeyPriority: boolean;
};

export function PriorityHeader({
  totalCount,
  livePriorityCount,
  activeTargetGame,
  watchingGame,
  topGame,
  obeyPriority,
}: PriorityHeaderProps) {
  const { t } = useI18n();
  const currentTargetValue = activeTargetGame || "—";
  const currentTargetSub = watchingGame
    ? t("priorities.header.watchingNow", { game: watchingGame })
    : obeyPriority
      ? t("priorities.header.modeStrict")
      : t("priorities.header.modeFlexible");
  const queueHealthValue = totalCount > 0 ? `${livePriorityCount}/${totalCount}` : "—";
  const topGameValue = topGame || "—";
  const rankedCountLabel = t(
    totalCount === 1 ? "priorities.header.rankedCount.one" : "priorities.header.rankedCount.other",
    { count: totalCount },
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[color:var(--dp-text)] leading-tight">
            {t("priorities.title")}
          </h2>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mt-1">
            {rankedCountLabel}
          </div>
        </div>
      </div>

      <div
        className="grid gap-0 rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-5"
        style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
      >
        <div className="pr-4">
          <Stat
            label={t("priorities.currentTarget")}
            value={currentTargetValue}
            sub={currentTargetSub}
            accent={!!activeTargetGame}
          />
        </div>
        <div className="px-4 border-l border-[color:var(--dp-border-soft)]">
          <Stat
            label={t("priorities.queueHealth")}
            value={queueHealthValue}
            sub={t("priorities.header.liveTotalSub")}
          />
        </div>
        <div className="pl-4 border-l border-[color:var(--dp-border-soft)]">
          <Stat
            label={t("priorities.topSlot")}
            value={topGameValue}
            sub={t("priorities.header.position", { rank: "01" })}
          />
        </div>
      </div>
    </div>
  );
}
