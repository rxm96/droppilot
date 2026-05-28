import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";
import { Plus } from "@renderer/shared/lib/icons";
import { useI18n } from "@renderer/shared/i18n";

const NO_GAME_SELECT_VALUE = "__dp_none__";

export type PriorityAddPanelProps = {
  selectableDropGames: string[];
  selectedGame: string;
  setSelectedGame: (val: string) => void;
  addGameFromSelect: () => void;
  newGame: string;
  setNewGame: (val: string) => void;
  addGame: () => void;
  obeyPriority: boolean;
  setObeyPriority: (val: boolean) => void;
};

export function PriorityAddPanel({
  selectableDropGames,
  selectedGame,
  setSelectedGame,
  addGameFromSelect,
  newGame,
  setNewGame,
  addGame,
  obeyPriority,
  setObeyPriority,
}: PriorityAddPanelProps) {
  const { t } = useI18n();
  const hasSelectableSelectedGame = selectableDropGames.includes(selectedGame);

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-5 flex flex-col gap-5">
      <div>
        <SectionLabel inline>{t("priorities.add.fromDropsTitle")}</SectionLabel>
        <p className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1">
          {t("priorities.add.fromDropsHint")}
        </p>
        {selectableDropGames.length > 0 ? (
          <div className="flex gap-2 mt-3">
            <Select
              value={hasSelectableSelectedGame ? selectedGame : NO_GAME_SELECT_VALUE}
              onValueChange={(value) =>
                setSelectedGame(value === NO_GAME_SELECT_VALUE ? "" : value)
              }
            >
              <SelectTrigger tone="dp" className="flex-1" aria-label="Add from drops">
                <SelectValue placeholder={t("priorities.add.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NO_GAME_SELECT_VALUE}>
                    {t("priorities.add.selectPlaceholder")}
                  </SelectItem>
                  {selectableDropGames.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="dp-primary"
              size="dp-md"
              onClick={addGameFromSelect}
              disabled={!hasSelectableSelectedGame}
            >
              <Plus size={11} strokeWidth={2} /> {t("priorities.add.addButton")}
            </Button>
          </div>
        ) : (
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-3 py-2">
            {t("priorities.addEmpty")}
          </div>
        )}
      </div>

      <div>
        <SectionLabel inline>{t("priorities.manualTitle")}</SectionLabel>
        <p className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1">
          {t("priorities.add.manualHint")}
        </p>
        <div className="flex gap-2 mt-3">
          <Input
            tone="dp"
            value={newGame}
            onChange={(e) => setNewGame(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGame();
              }
            }}
            placeholder={t("priorities.add.manualPlaceholder")}
            className="flex-1"
            aria-label="Add game manually"
          />
          <Button variant="dp-primary" size="dp-md" onClick={addGame} disabled={!newGame.trim()}>
            <Plus size={11} strokeWidth={2} /> {t("priorities.add.addButton")}
          </Button>
        </div>
      </div>

      <div className="rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border-soft)] bg-[color:var(--dp-bg-elevated-2)] p-4 flex items-start gap-3">
        <input
          id="dp-obey-priority"
          type="checkbox"
          checked={obeyPriority}
          onChange={(e) => setObeyPriority(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--dp-accent)]"
        />
        <label htmlFor="dp-obey-priority" className="flex-1 cursor-pointer">
          <div className="text-[12px] text-[color:var(--dp-text)] font-medium">
            {t("priorities.add.strictLabel")}
          </div>
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-0.5">
            {obeyPriority
              ? t("priorities.ruleStrictHint")
              : t("priorities.ruleFlexibleHint")}
          </div>
        </label>
      </div>
    </div>
  );
}
