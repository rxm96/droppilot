import { useI18n } from "@renderer/shared/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";

type PriorityViewProps = {
  uniqueGames: string[];
  selectedGame: string;
  setSelectedGame: (val: string) => void;
  newGame: string;
  setNewGame: (val: string) => void;
  addGame: () => void;
  addGameFromSelect: () => void;
  priorityGames: string[];
  previewPriorityGames: string[];
  removeGame: (name: string) => void;
  dragIndex: number | null;
  dragOverIndex: number | null;
  setDragIndex: (idx: number | null) => void;
  setDragOverIndex: (idx: number | null) => void;
  handleDropReorder: (idx: number) => void;
  obeyPriority: boolean;
  setObeyPriority: (val: boolean) => void;
};

const NO_GAME_SELECT_VALUE = "__dp_none__";

export function PriorityView({
  uniqueGames,
  selectedGame,
  setSelectedGame,
  newGame,
  setNewGame,
  addGame,
  addGameFromSelect,
  priorityGames,
  previewPriorityGames,
  removeGame,
  dragIndex,
  dragOverIndex,
  setDragIndex,
  setDragOverIndex,
  handleDropReorder,
  obeyPriority,
  setObeyPriority,
}: PriorityViewProps) {
  const { t } = useI18n();
  const countLabel = t("priorities.count", { count: priorityGames.length });

  return (
    <div className="priority-view">
      <div className="priority-head">
        <div>
          <h2>{t("priorities.title")}</h2>
          <p className="meta">{t("priorities.subtitle")}</p>
        </div>
        <span className="priority-count">{countLabel}</span>
      </div>
      <div className="priority-split">
        <section className="priority-panel">
          <div className="label">{t("settings.addFromDrops")}</div>
          <p className="meta">{t("settings.addFromDropsOption")}</p>
          {uniqueGames.length > 0 && (
            <div className="settings-row">
              <Select
                value={selectedGame || NO_GAME_SELECT_VALUE}
                onValueChange={(value) =>
                  setSelectedGame(value === NO_GAME_SELECT_VALUE ? "" : value)
                }
              >
                <SelectTrigger aria-label={t("settings.addFromDrops")}>
                  <SelectValue placeholder={t("settings.addFromDropsOption")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GAME_SELECT_VALUE}>
                    {t("settings.addFromDropsOption")}
                  </SelectItem>
                  {uniqueGames.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={addGameFromSelect} disabled={!selectedGame}>
                {t("settings.add")}
              </button>
            </div>
          )}
          <div className="settings-row">
            <input
              type="text"
              className="input"
              placeholder={t("settings.addGamePlaceholder")}
              value={newGame}
              onChange={(e) => setNewGame(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addGame();
                }
              }}
              aria-label={t("settings.addGamePlaceholder")}
            />
            <button type="button" onClick={addGame}>
              {t("settings.add")}
            </button>
          </div>
          <div className="toggle-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={obeyPriority}
                onChange={(e) => {
                  setObeyPriority(e.target.checked);
                }}
              />
              <span>{t("settings.obey")}</span>
            </label>
          </div>
        </section>
        <section className="priority-panel priority-panel-list">
          <div className="label">{t("settings.priorityGames")}</div>
          <p className="meta">{t("settings.drag")}</p>
          {priorityGames.length === 0 ? <p className="meta">{t("settings.noneEntries")}</p> : null}
          {previewPriorityGames.length > 0 && (
            <ul className="priority-list">
              {previewPriorityGames.map((g, idx) => (
                <li
                  key={g}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverIndex(idx);
                  }}
                  onDrop={() => handleDropReorder(idx)}
                  className={`${dragIndex === idx ? "dragging" : ""} ${dragOverIndex === idx ? "drop-target" : ""}`}
                >
                  <span>{g}</span>
                  <div className="priority-actions">
                    <span className="pill ghost">{t("settings.drag")}</span>
                    <button type="button" className="ghost" onClick={() => removeGame(g)}>
                      {t("settings.remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
