import * as React from "react";
import { GameTile } from "@renderer/shared/components/GameTile";
import { Button } from "@renderer/shared/components/ui/button";
import { useI18n } from "@renderer/shared/i18n";
import { FarmingPill, GameMetaLine } from "./GameMetaLine";
import type { FallbackRule, OtherGame } from "./gamesModel";

export type OtherGamesPanelProps = {
  others: OtherGame[];
  rule: FallbackRule;
  onAdd: (game: string) => void;
};

/** Games with drops that are not in the user's list, each with "+ add". */
export function OtherGamesPanel({ others, rule, onAdd }: OtherGamesPanelProps) {
  const { t } = useI18n();
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]"
    >
      <div className="border-b border-[color:var(--dp-border)] px-[18px] py-3.5">
        <h2
          id={headingId}
          className="m-0 font-mono text-[11px] font-normal text-[color:var(--dp-text-dimmer)]"
        >
          {t(rule === "wait" ? "games.others.title.wait" : "games.others.title.farmOthers")}
        </h2>
      </div>
      {others.length === 0 ? (
        <p className="m-0 p-[18px] font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("games.others.empty")}
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {others.map((game) => (
            <li
              key={game.game}
              className="flex items-center gap-3 border-t border-[color:var(--dp-border)] px-[18px] py-3 first:border-t-0"
            >
              <GameTile url={game.imageUrl} code={game.code} size={30} faded={!game.farming} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-[color:var(--dp-text-dim)]">
                  <span className="truncate">{game.game}</span>
                  {game.farming && <FarmingPill />}
                </div>
                <GameMetaLine meta={game.meta} variant="count" />
              </div>
              <Button
                variant="dp-outline"
                size="dp-sm"
                onClick={() => onAdd(game.game)}
                aria-label={t("games.add.gameAria", { game: game.game })}
              >
                {t("games.add.button")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
