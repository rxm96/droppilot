/**
 * buildFarmPlan — predicts when each drop will be ready, in the order the
 * watch engine will farm them. Feeds the overview's "plan · today" table.
 *
 * Time model: Twitch credits every time-based drop of the watched game at
 * once, so inside one game each drop is ready `required − earned` minutes
 * after that game starts (the active drop uses its live ETA instead). A drop
 * chained behind prerequisites starts when its last prerequisite is ready.
 * The next game starts when the previous game's last drop is ready.
 *
 * The output is an estimate that assumes continuous watching. It reuses the
 * engine's own eligibility rules (canEarnDrop, sameGameName) so it lists the
 * same drops the engine would actually watch for.
 */
import type { InventoryItem } from "@renderer/shared/types";
import { canEarnDrop } from "@renderer/shared/domain/inventory";
import { sameGameName } from "@renderer/shared/domain/gameName";

export type FarmPlanStatus = "watching" | "next" | "queued" | "blocked";
export type FarmPlanDropRow = {
  kind: "drop";
  dropId: string;
  game: string;
  title: string;
  campaignId?: string;
  earnedMinutes: number;
  requiredMinutes: number;
  /** Null when blocked. */
  readyAt: number | null;
  status: FarmPlanStatus;
  /** First entry of blockingReasonHints, or "blocked". Only on blocked rows. */
  blockedReason?: string;
  /** readyAt is after the campaign's endsAt. */
  wontFinishInTime: boolean;
};
export type FarmPlanSwitchRow = { kind: "switch"; game: string; at: number };
export type FarmPlanRow = FarmPlanDropRow | FarmPlanSwitchRow;
export type FarmPlan = { rows: FarmPlanRow[]; doneAt: number | null };
export type FarmPlanInput = {
  withCategories: Array<{ item: InventoryItem; category: string }>;
  /**
   * The user's own ranked games, resolved to inventory spelling
   * (resolvePriorityGameNames(priorityGames)). NOT computePriorityOrder: in
   * non-strict mode that also contains every unranked game, which would list
   * blocked rows for games the user never added. Only these games (and the
   * active target) get blocked rows.
   */
  gameOrder: string[];
  /** Output of computeFallbackOrder. */
  fallbackOrder: string[];
  obeyPriority: boolean;
  activeTargetGame: string;
  activeDrop: { id: string; eta: number | null } | null;
  allowUpcoming: boolean;
  now: number;
};

const MINUTE_MS = 60_000;
const PREREQ_PREFIX = "missing_prerequisite_drops:";

type Entry = { item: InventoryItem; category: string };

const hints = (item: InventoryItem): string[] =>
  (item.blockingReasonHints ?? []).filter((h): h is string => typeof h === "string");

const prerequisiteIds = (item: InventoryItem): string[] => {
  const hint = hints(item).find((h) => h.startsWith(PREREQ_PREFIX));
  return hint
    ? hint
        .slice(PREREQ_PREFIX.length)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
};

// Mirrors main (service.ts): every hint except these two sets `blocked`.
const SOFT_HINTS = new Set(["missing_drop_instance_id", "account_not_linked"]);

/** Fully earned or waiting to be claimed: a "needs you"/claim concern, not a plan row. */
const isFinished = (item: InventoryItem): boolean =>
  item.isClaimable === true ||
  (Number(item.requiredMinutes) || 0) <= 0 ||
  (Number(item.earnedMinutes) || 0) >= (Number(item.requiredMinutes) || 0);

const endsAtMs = (item: InventoryItem): number =>
  item.endsAt ? Date.parse(item.endsAt) : Number.NaN;

const remainingMs = (item: InventoryItem): number =>
  Math.max(0, (Number(item.requiredMinutes) || 0) - (Number(item.earnedMinutes) || 0)) * MINUTE_MS;

function gameSequence(input: FarmPlanInput): { games: string[]; ranked: string[] } {
  const ranked: string[] = [];
  const games: string[] = [];
  const add = (list: string[], game: string) => {
    if (game.trim() && !list.some((g) => sameGameName(g, game))) list.push(game);
  };
  add(ranked, input.activeTargetGame);
  input.gameOrder.forEach((g) => add(ranked, g));
  ranked.forEach((g) => add(games, g));
  if (!input.obeyPriority) input.fallbackOrder.forEach((g) => add(games, g));
  return { games, ranked };
}

function dropRow(item: InventoryItem, readyAt: number | null): FarmPlanDropRow {
  const endsAt = endsAtMs(item);
  return {
    kind: "drop",
    dropId: item.id,
    game: item.game,
    title: item.title,
    campaignId: item.campaignId,
    earnedMinutes: Number(item.earnedMinutes) || 0,
    requiredMinutes: Number(item.requiredMinutes) || 0,
    readyAt,
    status: readyAt === null ? "blocked" : "queued",
    wontFinishInTime: readyAt !== null && Number.isFinite(endsAt) && readyAt > endsAt,
  };
}

export function buildFarmPlan(input: FarmPlanInput): FarmPlan {
  const { games, ranked } = gameSequence(input);
  const rows: FarmPlanRow[] = [];
  let cursor = input.now;
  let hadTimedGame = false;
  let doneAt: number | null = null;

  for (const game of games) {
    const entries: Entry[] = input.withCategories.filter(
      ({ item }) =>
        sameGameName(item.game, game) &&
        item.status !== "claimed" &&
        !isFinished(item) &&
        !hints(item).includes("campaign_expired"),
    );
    const canEarn = ({ item, category }: Entry) =>
      canEarnDrop(item, { category, allowUpcoming: input.allowUpcoming });

    const readyAt = new Map<string, number>();
    const earnable = entries.filter(canEarn);
    // The inventory snapshot can be up to an hour old. The active drop's live
    // eta already includes the minutes watched since then; those minutes also
    // counted for every other drop of the same game.
    const activeEntry = earnable.find(({ item }) => item.id === input.activeDrop?.id);
    const liveEta = activeEntry ? (input.activeDrop?.eta ?? null) : null;
    const liveDeltaMs =
      activeEntry && liveEta !== null
        ? Math.max(0, cursor + remainingMs(activeEntry.item) - liveEta)
        : 0;
    for (const { item } of earnable) {
      readyAt.set(
        item.id,
        item.id === activeEntry?.item.id && liveEta !== null
          ? liveEta
          : cursor + Math.max(0, remainingMs(item) - liveDeltaMs),
      );
    }

    // Chained drops unlock during this session once their prerequisites are
    // ready; resolve them in passes so chains of any depth settle. Main sets
    // `blocked` because of the prerequisite hint, so recompute it without it.
    let pending = entries.filter((e) => {
      if (readyAt.has(e.item.id)) return false;
      if (prerequisiteIds(e.item).length === 0) return false;
      const rest = hints(e.item).filter((h) => !h.startsWith(PREREQ_PREFIX));
      const unchained = {
        ...e.item,
        blocked: rest.some((h) => !SOFT_HINTS.has(h)),
        blockingReasonHints: rest,
      };
      return canEarn({ item: unchained, category: e.category });
    });
    let progressed = true;
    while (pending.length > 0 && progressed) {
      progressed = false;
      pending = pending.filter(({ item }) => {
        const prereqTimes = prerequisiteIds(item).map((id) => readyAt.get(id));
        if (prereqTimes.some((t) => t === undefined)) return true;
        readyAt.set(item.id, Math.max(...(prereqTimes as number[])) + remainingMs(item));
        progressed = true;
        return false;
      });
    }

    const isRanked = ranked.some((g) => sameGameName(g, game));
    const blocked = isRanked ? entries.filter(({ item }) => !readyAt.has(item.id)) : [];
    if (readyAt.size === 0 && blocked.length === 0) continue;

    const itemById = new Map(entries.map(({ item }) => [item.id, item]));
    const timed = entries
      .filter(({ item }) => readyAt.has(item.id))
      .map(({ item }) => dropRow(item, readyAt.get(item.id) as number))
      .sort((a, b) => (a.readyAt as number) - (b.readyAt as number));

    if (timed.length > 0) {
      if (hadTimedGame) rows.push({ kind: "switch", game, at: cursor });
      hadTimedGame = true;
      // A drop whose campaign ends first stops counting at endsAt; the engine
      // moves on then, so the game ends there rather than at its readyAt.
      cursor = Math.max(
        ...timed.map((r) => {
          const end = endsAtMs(itemById.get(r.dropId) as InventoryItem);
          return r.wontFinishInTime ? end : (r.readyAt as number);
        }),
      );
      doneAt = cursor;
    }
    rows.push(...timed);
    for (const { item } of blocked) {
      rows.push({ ...dropRow(item, null), blockedReason: hints(item)[0] ?? "blocked" });
    }
  }

  let nextAssigned = false;
  for (const row of rows) {
    if (row.kind !== "drop" || row.status === "blocked") continue;
    if (input.activeDrop?.id === row.dropId) row.status = "watching";
    else if (!nextAssigned) {
      row.status = "next";
      nextAssigned = true;
    }
  }

  return { rows, doneAt };
}
