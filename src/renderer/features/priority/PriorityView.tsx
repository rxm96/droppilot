import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useI18n } from "@renderer/shared/i18n";
import { hasPriorityGameName } from "@renderer/shared/hooks/priority/priorityNameUtils";
import {
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";

type PriorityViewProps = {
  uniqueGames: string[];
  activeTargetGame: string;
  watchingGame: string;
  selectedGame: string;
  setSelectedGame: (val: string) => void;
  newGame: string;
  setNewGame: (val: string) => void;
  addGame: () => void;
  addGameFromSelect: () => void;
  priorityGames: string[];
  removeGame: (name: string) => void;
  movePriorityGame: (activeGame: string, overGame: string) => void;
  obeyPriority: boolean;
  setObeyPriority: (val: boolean) => void;
};

type PriorityCardProps = {
  rank: number;
  game: string;
  isTarget: boolean;
  isWatching: boolean;
  isLive: boolean;
  onRemove: (name: string) => void;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  setDragHandleRef?: (element: HTMLButtonElement | null) => void;
  isOverlay?: boolean;
};

const NO_GAME_SELECT_VALUE = "__dp_none__";
type PriorityTranslate = (key: string, vars?: Record<string, string | number>) => string;

export const getSelectableDropGames = (uniqueGames: string[], priorityGames: string[]): string[] =>
  uniqueGames.filter((game) => !hasPriorityGameName(priorityGames, game));

export const getPriorityActionLabels = (game: string, t: PriorityTranslate) => ({
  dragLabel: t("priorities.dragGame", { game }),
  removeLabel: t("priorities.removeGame", { game }),
});

export const getPriorityStateChip = (
  flags: { isTarget: boolean; isWatching: boolean; isLive: boolean },
  t: PriorityTranslate,
): { label: string; tone: "watching" | "target" | "live" } | null => {
  if (flags.isWatching) return { label: t("priorities.badge.watching"), tone: "watching" };
  if (flags.isTarget) return { label: t("priorities.badge.target"), tone: "target" };
  if (flags.isLive) return { label: t("priorities.state.live"), tone: "live" };
  return null;
};

export const canAddPriorityGame = (name: string, priorityGames: string[] = []): boolean => {
  const trimmed = name.trim();
  return trimmed.length > 0 && !hasPriorityGameName(priorityGames, trimmed);
};

export const getPriorityQueueState = (
  priorityGameCount: number,
  hasSelectableDropGames: boolean,
): "queue" | "empty-live" | "empty-manual" => {
  if (priorityGameCount > 0) return "queue";
  return hasSelectableDropGames ? "empty-live" : "empty-manual";
};

export const getPriorityEmptyPreviewRows = (
  queueState: "empty-live" | "empty-manual",
  t: PriorityTranslate,
) => [
  {
    title:
      queueState === "empty-live"
        ? t("priorities.emptyPreviewLeadLiveTitle")
        : t("priorities.emptyPreviewLeadManualTitle"),
    meta:
      queueState === "empty-live"
        ? t("priorities.emptyPreviewLeadLiveMeta")
        : t("priorities.emptyPreviewLeadManualMeta"),
    chip: t("priorities.emptyPreviewLeadChip"),
    isLeading: true,
  },
  {
    title: t("priorities.emptyPreviewNextTitle"),
    meta: t("priorities.emptyPreviewNextMeta"),
    chip: t("priorities.emptyPreviewNextChip"),
    isLeading: false,
  },
  {
    title: t("priorities.emptyPreviewLaterTitle"),
    meta: t("priorities.emptyPreviewLaterMeta"),
    chip: t("priorities.emptyPreviewLaterChip"),
    isLeading: false,
  },
];

function PriorityCard({
  rank,
  game,
  isTarget,
  isWatching,
  isLive,
  onRemove,
  dragHandleProps,
  setDragHandleRef,
  isOverlay = false,
}: PriorityCardProps) {
  const { t } = useI18n();
  const { dragLabel, removeLabel } = getPriorityActionLabels(game, t);
  const stateChip = getPriorityStateChip({ isTarget, isWatching, isLive }, t);
  return (
    <div className={["priority-list-card", isOverlay ? "is-drag-overlay" : ""].filter(Boolean).join(" ")}>
      <div className="priority-item-main">
        <div className="priority-order-tools">
          <div className="priority-rank" aria-label={t("priorities.rank", { rank })}>
            {rank}
          </div>
          {dragHandleProps ? (
            <button
              type="button"
              className="priority-drag-handle"
              aria-label={dragLabel}
              title={dragLabel}
              ref={setDragHandleRef}
              {...dragHandleProps}
            >
              <span className="priority-drag-grip" aria-hidden="true">
                {Array.from({ length: 6 }, (_, gripIdx) => (
                  <span key={gripIdx} />
                ))}
              </span>
            </button>
          ) : (
            <span className="priority-drag-handle is-static" aria-hidden="true">
              <span className="priority-drag-grip">
                {Array.from({ length: 6 }, (_, gripIdx) => (
                  <span key={gripIdx} />
                ))}
              </span>
            </span>
          )}
        </div>
        <div className="priority-game-copy">
          <span className="priority-game-name" dir="auto" title={game}>
            {game}
          </span>
        </div>
      </div>
      <div
        className={[
          "priority-actions",
          stateChip ? "has-status" : "is-remove-only",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {stateChip ? (
          <span className={`priority-state-chip is-${stateChip.tone}`}>{stateChip.label}</span>
        ) : null}
        <button
          type="button"
          className="priority-remove-button"
          onClick={() => onRemove(game)}
          aria-label={removeLabel}
          title={removeLabel}
        >
          <svg
            className="priority-remove-icon"
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M4 4L12 12" />
            <path d="M12 4L4 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

type SortablePriorityItemProps = {
  rank: number;
  game: string;
  isLeading: boolean;
  isTarget: boolean;
  isWatching: boolean;
  isLive: boolean;
  onRemove: (name: string) => void;
  isRecentlyMoved: boolean;
};

function SortablePriorityItem({
  rank,
  game,
  isLeading,
  isTarget,
  isWatching,
  isLive,
  onRemove,
  isRecentlyMoved,
}: SortablePriorityItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: game });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        "priority-list-item",
        isDragging ? "sortable-dragging" : "",
        isOver && !isDragging ? "is-drop-target" : "",
        isLeading ? "is-leading" : "",
        isTarget ? "is-target" : "",
        isWatching ? "is-watching" : "",
        isRecentlyMoved ? "is-just-moved" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <PriorityCard
        rank={rank}
        game={game}
        isTarget={isTarget}
        isWatching={isWatching}
        isLive={isLive}
        onRemove={onRemove}
        setDragHandleRef={setActivatorNodeRef}
        dragHandleProps={
          {
            ...attributes,
            ...listeners,
          } as ButtonHTMLAttributes<HTMLButtonElement>
        }
      />
    </li>
  );
}

export function PriorityView({
  uniqueGames,
  activeTargetGame,
  watchingGame,
  selectedGame,
  setSelectedGame,
  newGame,
  setNewGame,
  addGame,
  addGameFromSelect,
  priorityGames,
  removeGame,
  movePriorityGame,
  obeyPriority,
  setObeyPriority,
}: PriorityViewProps) {
  const { t } = useI18n();
  const queueKeyboardHintId = useId();
  const priorityRuleHintId = useId();
  const [activeDragGame, setActiveDragGame] = useState<string | null>(null);
  const [recentlyMovedGame, setRecentlyMovedGame] = useState<string | null>(null);
  const selectableDropGames = getSelectableDropGames(uniqueGames, priorityGames);
  const hasSelectableDropGames = selectableDropGames.length > 0;
  const hasSelectableSelectedGame = selectableDropGames.includes(selectedGame);
  const canAddManualGame = canAddPriorityGame(newGame, priorityGames);
  const liveGameSet = new Set(uniqueGames);
  const queueState = getPriorityQueueState(priorityGames.length, hasSelectableDropGames);
  const emptyStateModeClass = queueState === "empty-live" ? "is-live" : "is-manual";
  const emptyStateTitleKey =
    queueState === "empty-live" ? "priorities.emptyTitleLive" : "priorities.emptyTitleManual";
  const emptyPreviewRows =
    queueState === "queue" ? [] : getPriorityEmptyPreviewRows(queueState, t);
  const activeDragIndex = activeDragGame ? priorityGames.indexOf(activeDragGame) : -1;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!selectedGame || hasSelectableSelectedGame) return;
    setSelectedGame("");
  }, [hasSelectableSelectedGame, selectedGame, setSelectedGame]);

  useEffect(() => {
    if (!recentlyMovedGame) return;
    const timer = window.setTimeout(() => {
      setRecentlyMovedGame(null);
    }, 950);
    return () => window.clearTimeout(timer);
  }, [recentlyMovedGame]);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const activeGame = String(active.id);
    setActiveDragGame(activeGame || null);
  };

  const handleDragCancel = () => {
    setActiveDragGame(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragGame(null);
    if (!over) return;
    const activeGame = String(active.id);
    const overGame = String(over.id);
    if (!activeGame || !overGame || activeGame === overGame) return;
    movePriorityGame(activeGame, overGame);
    setRecentlyMovedGame(activeGame);
  };

  return (
    <div className={["priority-view", !hasSelectableDropGames ? "is-manual-only" : ""].filter(Boolean).join(" ")}>
      <div className="priority-head">
        <div className="priority-head-main">
          <h2>{t("priorities.title")}</h2>
        </div>
      </div>
      <div className="priority-split">
        <section className="priority-panel priority-panel-controls">
          {hasSelectableDropGames && (
            <div className="settings-row">
              <Select
                value={hasSelectableSelectedGame ? selectedGame : NO_GAME_SELECT_VALUE}
                onValueChange={(value) =>
                  setSelectedGame(value === NO_GAME_SELECT_VALUE ? "" : value)
                }
              >
                <SelectTrigger aria-label={t("priorities.liveSelectLabel")}>
                  <SelectValue placeholder={t("priorities.liveSelectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_GAME_SELECT_VALUE}>
                      {t("priorities.liveSelectPlaceholder")}
                    </SelectItem>
                    {selectableDropGames.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={addGameFromSelect}
                disabled={!hasSelectableSelectedGame}
                className="priority-add-button"
              >
                {t("priorities.addGameAction")}
              </button>
            </div>
          )}
          <div
            className={[
              "settings-row",
              "priority-manual-row",
              !hasSelectableDropGames ? "is-primary-entry" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <input
              type="text"
              className="input"
              placeholder={t("priorities.manualPlaceholder")}
              value={newGame}
              maxLength={120}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={(e) => setNewGame(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canAddManualGame) {
                  e.preventDefault();
                  addGame();
                }
              }}
              aria-label={t("priorities.manualPlaceholder")}
            />
            <button
              type="button"
              onClick={addGame}
              className="priority-add-button"
              disabled={!canAddManualGame}
            >
              {t("priorities.addGameAction")}
            </button>
          </div>
          <div className="priority-rule-row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={obeyPriority}
                aria-describedby={priorityRuleHintId}
                onChange={(e) => {
                  setObeyPriority(e.target.checked);
                }}
              />
              <span className="toggle-label">
                <span className="toggle-title">{t("priorities.orderTitle")}</span>
                <span id={priorityRuleHintId} className="toggle-hint">
                  {obeyPriority
                    ? t("priorities.ruleStrictHint")
                    : t("priorities.ruleFlexibleHint")}
                </span>
              </span>
            </label>
          </div>
        </section>
        <section className="priority-panel priority-panel-list" aria-label={t("settings.priorityGames")}>
          <p id={queueKeyboardHintId} className="sr-only">
            {t("priorities.queueKeyboardHint")}
          </p>
          {queueState === "queue" ? null : (
            <div className={["priority-empty-state", emptyStateModeClass].join(" ")}>
              <div className="priority-empty-copy-block">
                <span className="priority-empty-kicker">{t("priorities.emptyKicker")}</span>
                <p className="priority-empty-title">{t(emptyStateTitleKey)}</p>
                <p className="priority-empty-copy">
                  {t(
                    queueState === "empty-live"
                      ? "priorities.emptyHintLive"
                      : "priorities.emptyHintManual",
                  )}
                </p>
              </div>
              <div className="priority-empty-preview" aria-hidden="true">
                {emptyPreviewRows.map((row, index) => (
                  <div
                    key={`${queueState}-${index}`}
                    className={[
                      "priority-empty-preview-row",
                      row.isLeading ? "is-leading" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="priority-empty-preview-main">
                      <span className="priority-order-tools priority-empty-preview-order">
                        <span className="priority-rank priority-empty-preview-rank">
                          {index + 1}
                        </span>
                        <span className="priority-drag-handle priority-empty-preview-drag">
                          <span className="priority-drag-grip">
                            {Array.from({ length: 6 }, (_, gripIdx) => (
                              <span key={gripIdx} />
                            ))}
                          </span>
                        </span>
                      </span>
                      <span className="priority-empty-preview-body">
                        <span className="priority-empty-preview-title">{row.title}</span>
                        <span className="priority-empty-preview-meta">{row.meta}</span>
                      </span>
                    </div>
                    <span
                      className={[
                        "priority-state-chip",
                        "priority-empty-preview-chip",
                        row.isLeading ? "is-preview-leading" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {row.chip}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {priorityGames.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={priorityGames} strategy={verticalListSortingStrategy}>
                <ul
                  className={["priority-list", activeDragGame ? "is-sorting" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-describedby={queueKeyboardHintId}
                >
                  {priorityGames.map((game, index) => (
                    <SortablePriorityItem
                      key={game}
                      rank={index + 1}
                      game={game}
                      isLeading={index === 0}
                      isTarget={game === activeTargetGame}
                      isWatching={game === watchingGame}
                      isLive={liveGameSet.has(game)}
                      onRemove={removeGame}
                      isRecentlyMoved={recentlyMovedGame === game}
                    />
                  ))}
                </ul>
              </SortableContext>
              <DragOverlay>
                {activeDragGame && activeDragIndex >= 0 ? (
                  <PriorityCard
                    rank={activeDragIndex + 1}
                    game={activeDragGame}
                    isTarget={activeDragGame === activeTargetGame}
                    isWatching={activeDragGame === watchingGame}
                    isLive={liveGameSet.has(activeDragGame)}
                    onRemove={() => {}}
                    isOverlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </section>
      </div>
    </div>
  );
}
