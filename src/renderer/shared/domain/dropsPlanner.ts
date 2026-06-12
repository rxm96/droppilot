import type { InventoryItem } from "@renderer/shared/types";
import { canEarnDrop } from "./inventory/inventoryRules";
import { InventoryDrop } from "./dropDomain";
import { normalizeGameName } from "./gameName";

const MINUTE_MS = 60_000;

export type PlanDrop = {
  id: string;
  title: string;
  requiredMinutes: number;
  earnedMinutes: number;
  remainingMinutes: number;
  deadlineMs: number | null;
  feasible: boolean;
};

export type PlanEntry = {
  gameKey: string;
  gameLabel: string;
  watchMinutes: number;
  deadlineMs: number | null; // earliest tier deadline — countdown; per-drop feasibility uses each drop's own deadlineMs
  status: "ok" | "partial" | "lost";
  feasibleDropCount: number;
  totalDropCount: number;
  isPriority: boolean; // game is on the priority list
  priorityRank: number | null; // 1-based priority position; null for fallback games
  drops: PlanDrop[];
};

export type DropsPlanOptions = {
  priorityGames: string[];
  obeyPriority: boolean;
};

const DEFAULT_OPTIONS: DropsPlanOptions = { priorityGames: [], obeyPriority: false };

/** ISO → ms with a finite guard (mirrors InventoryDrop.isExpired parsing). */
function parseFiniteMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** A drop is plannable if it can still be earned and is not excluded/expired/future. */
export function isPlannableDrop(item: InventoryItem, now: number): boolean {
  if (!canEarnDrop(item, { allowUpcoming: true })) return false;
  if (item.excluded === true) return false;
  if (new InventoryDrop(item).isExpired(now)) return false;
  const startsAtMs = parseFiniteMs(item.startsAt);
  if (startsAtMs !== null && startsAtMs > now) return false;
  return true;
}

type Shell = {
  gameKey: string;
  gameLabel: string;
  deadlineMs: number | null;
  drops: Omit<PlanDrop, "feasible">[];
};

export function buildDropsPlan(
  items: InventoryItem[],
  now: number,
  options: DropsPlanOptions = DEFAULT_OPTIONS,
): PlanEntry[] {
  // 1. Filter to plannable drops.
  const plannable = items.filter((it) => isPlannableDrop(it, now));

  // 2. Group by normalized game name (keep first-seen original casing for display).
  const groups = new Map<string, { label: string; items: InventoryItem[] }>();
  for (const it of plannable) {
    const key = normalizeGameName(it.game);
    const group = groups.get(key);
    if (group) group.items.push(it);
    else groups.set(key, { label: it.game, items: [it] });
  }

  // 3. Build per-game shells: drops (sorted by remaining asc) + earliest deadline.
  const shells: Shell[] = [];
  for (const [key, { label, items: groupItems }] of groups) {
    const drops = groupItems
      .map((it) => {
        const drop = new InventoryDrop(it);
        return {
          id: drop.id,
          title: drop.title,
          requiredMinutes: drop.requiredMinutes,
          earnedMinutes: drop.earnedMinutes,
          remainingMinutes: drop.remainingMinutes,
          deadlineMs: parseFiniteMs(it.endsAt),
        };
      })
      .sort((a, b) => a.remainingMinutes - b.remainingMinutes);
    const deadlines = drops.map((d) => d.deadlineMs).filter((v): v is number => v !== null);
    const deadlineMs = deadlines.length ? Math.min(...deadlines) : null;
    shells.push({ gameKey: key, gameLabel: label, deadlineMs, drops });
  }

  // 4. Order by the engine's actual farming order, not pure deadline.
  //    priorityRankByKey: normalized priority game → 1-based rank (lowest index wins).
  const priorityRankByKey = new Map<string, number>();
  options.priorityGames.forEach((game, idx) => {
    const key = normalizeGameName(game);
    if (key && !priorityRankByKey.has(key)) priorityRankByKey.set(key, idx + 1);
  });

  // EDF comparator — used for the fallback tail and the no-priority case.
  const byEdf = (a: Shell, b: Shell) => {
    const da = a.deadlineMs ?? Number.POSITIVE_INFINITY;
    const db = b.deadlineMs ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const wa = Math.max(0, ...a.drops.map((d) => d.remainingMinutes));
    const wb = Math.max(0, ...b.drops.map((d) => d.remainingMinutes));
    if (wa !== wb) return wa - wb;
    return a.gameKey < b.gameKey ? -1 : a.gameKey > b.gameKey ? 1 : 0;
  };

  const priorityShells = shells
    .filter((s) => priorityRankByKey.has(s.gameKey))
    .sort((a, b) => priorityRankByKey.get(a.gameKey)! - priorityRankByKey.get(b.gameKey)!);
  const fallbackShells = shells.filter((s) => !priorityRankByKey.has(s.gameKey)).sort(byEdf);

  // Strict: only priority games. Permissive: priority games, then fallback (EDF).
  const orderedShells = options.obeyPriority
    ? priorityShells
    : [...priorityShells, ...fallbackShells];

  // 5. Feasibility walk along the engine order: a watch-minute cursor accumulates.
  const result: PlanEntry[] = [];
  let cursor = 0;
  for (const shell of orderedShells) {
    const cursorStart = cursor;
    const drops: PlanDrop[] = shell.drops.map((d) => {
      const completionMs = now + (cursorStart + d.remainingMinutes) * MINUTE_MS;
      const feasible = d.deadlineMs === null || completionMs <= d.deadlineMs;
      return { ...d, feasible };
    });
    const feasibleDrops = drops.filter((d) => d.feasible);
    // Minutes actually spent here: max remaining among feasible drops only
    // (a partial game's lost tiers are excluded; a fully-lost game → 0).
    const watchMinutes = feasibleDrops.length
      ? Math.max(...feasibleDrops.map((d) => d.remainingMinutes))
      : 0;
    const status: PlanEntry["status"] =
      feasibleDrops.length === drops.length ? "ok" : feasibleDrops.length > 0 ? "partial" : "lost";
    const priorityRank = priorityRankByKey.get(shell.gameKey) ?? null;
    cursor = cursorStart + watchMinutes;
    result.push({
      gameKey: shell.gameKey,
      gameLabel: shell.gameLabel,
      watchMinutes,
      deadlineMs: shell.deadlineMs,
      status,
      feasibleDropCount: feasibleDrops.length,
      totalDropCount: drops.length,
      isPriority: priorityRank !== null,
      priorityRank,
      drops,
    });
  }
  return result;
}
