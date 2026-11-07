import { useI18n } from "@renderer/shared/i18n";
import type { GameMeta } from "./gamesModel";

/** The mono meta line: "2 drops left · ends in 2d · 41 live". */
export function GameMetaLine({ meta, variant }: { meta: GameMeta; variant: "left" | "count" }) {
  const { t } = useI18n();
  const base = variant === "left" ? "games.meta.dropsLeft" : "games.meta.drops";
  const parts = [
    meta.dropsLeft === 0
      ? t("games.meta.noDrops")
      : t(`${base}.${meta.dropsLeft === 1 ? "one" : "other"}`, { count: meta.dropsLeft }),
    meta.endsIn ? t("games.meta.endsIn", { time: meta.endsIn }) : null,
    meta.live !== null ? t("games.meta.live", { count: meta.live }) : null,
  ].filter(Boolean);
  return (
    <div className="truncate font-mono text-[11px] tabular-nums text-[color:var(--dp-text-dimmer)]">
      {parts.join(" · ")}
    </div>
  );
}

/** "● farming": the game of the stream being watched right now. */
export function FarmingPill() {
  const { t } = useI18n();
  return (
    <span className="inline-block whitespace-nowrap rounded-[var(--dp-radius-xs)] bg-[color:var(--dp-accent-soft)] px-2 py-[3px] font-mono text-[10px] font-normal text-[color:var(--dp-accent)]">
      {t("games.pill.farming")}
    </span>
  );
}
