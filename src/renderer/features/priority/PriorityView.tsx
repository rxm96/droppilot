import * as React from "react";
import type { FarmPlan } from "@renderer/shared/domain/farmPlan";
import type { InventoryItem } from "@renderer/shared/types";
import { useI18n } from "@renderer/shared/i18n";
import { FallbackRuleFieldset } from "./FallbackRuleFieldset";
import { GamesOrderPanel } from "./GamesOrderPanel";
import { OtherGamesPanel } from "./OtherGamesPanel";
import { buildGamesView, fallbackRuleFor, obeyPriorityFor, type FallbackRule } from "./gamesModel";

type PriorityViewProps = {
  priorityGames: string[];
  items: InventoryItem[];
  farmPlan: FarmPlan;
  /** Game of the watched stream; "" while paused or idle. */
  farmingGame: string;
  liveChannels: { game: string; count: number } | null;
  newGame: string;
  setNewGame: (val: string) => void;
  addGame: () => void;
  addGameByName: (name: string) => void;
  removeGame: (name: string) => void;
  movePriorityGame: (activeGame: string, overGame: string) => void;
  obeyPriority: boolean;
  setObeyPriority: (val: boolean) => void;
};

/** The games view (view key "priorities"): your order, other games, fallback rule. */
export function PriorityView({
  priorityGames,
  items,
  farmPlan,
  farmingGame,
  liveChannels,
  newGame,
  setNewGame,
  addGame,
  addGameByName,
  removeGame,
  movePriorityGame,
  obeyPriority,
  setObeyPriority,
}: PriorityViewProps) {
  const { t } = useI18n();
  // Minute resolution is enough for "ends in"; keeps the memo stable.
  const nowMinute = Math.floor(Date.now() / 60_000);
  const view = React.useMemo(
    () =>
      buildGamesView({
        priorityGames,
        items,
        plan: farmPlan,
        farmingGame,
        liveChannels,
        now: nowMinute * 60_000,
      }),
    [farmPlan, farmingGame, items, liveChannels, nowMinute, priorityGames],
  );
  const rule = fallbackRuleFor(obeyPriority);
  const handleRuleChange = React.useCallback(
    (next: FallbackRule) => setObeyPriority(obeyPriorityFor(next)),
    [setObeyPriority],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5">
      <div>
        <h1 className="m-0 text-[22px] font-semibold text-[color:var(--dp-text)]">
          {t("games.title")}
        </h1>
        <p className="mt-1.5 mb-0 max-w-[70ch] text-[14px] text-[color:var(--dp-text-dim)]">
          {t("games.intro")}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <GamesOrderPanel
            rows={view.rows}
            priorityGames={priorityGames}
            movePriorityGame={movePriorityGame}
            removeGame={removeGame}
            newGame={newGame}
            setNewGame={setNewGame}
            addGame={addGame}
          />
          <FallbackRuleFieldset rule={rule} onChange={handleRuleChange} />
        </div>
        <OtherGamesPanel others={view.others} rule={rule} onAdd={addGameByName} />
      </div>
    </div>
  );
}
