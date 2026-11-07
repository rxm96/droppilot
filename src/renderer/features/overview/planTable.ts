// Pure view-model for the overview's "plan · today" table. Turns the
// buildFarmPlan output into display rows. No React imports.

import type { DropStatus } from "@renderer/shared/domain/dropStatus";
import type { FarmPlan, FarmPlanDropRow } from "@renderer/shared/domain/farmPlan";
import { sameGameName } from "@renderer/shared/domain/gameName";
import type { InventoryItem } from "@renderer/shared/types";
import { formatEndsIn, formatReadyAt } from "./formatters";

export type PlanClock = { clock: string; dayOffset: number };

export type PlanTableStatus = Extract<
  DropStatus,
  "watching" | "next" | "queued" | "needs-link" | "blocked"
>;

export type PlanDropNote = { kind: "ends-first" } | { kind: "ends-soon"; endsIn: string } | null;

/** A plan table row's note: a campaign-end note, or why a blocked row waits. */
export type PlanRowNote = PlanDropNote | { kind: "blocked"; reason: string };

export type PlanTableDropRow = {
  kind: "drop";
  key: string;
  ready: PlanClock | null;
  title: string;
  game: string;
  watched: number;
  required: number;
  status: PlanTableStatus;
  note: PlanRowNote;
};

export type PlanTableSwitchRow = {
  kind: "switch";
  key: string;
  game: string;
  /** The game is in the user's own list (else it is farmed meanwhile). */
  ranked: boolean;
  at: PlanClock;
};

export type PlanTableRow = PlanTableDropRow | PlanTableSwitchRow;
export type PlanTable = { rows: PlanTableRow[]; hiddenCount: number; doneAt: PlanClock | null };

const DAY_MS = 86_400_000;

const startOfDay = (ts: number): number => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Local clock time plus how many calendar days after `now` it falls. */
export function formatPlanClock(ts: number, now: number): PlanClock {
  const clock = formatReadyAt(ts, now)?.clock ?? "—";
  const dayOffset = Math.max(0, Math.round((startOfDay(ts) - startOfDay(now)) / DAY_MS));
  return { clock, dayOffset };
}

/**
 * A plan row's pill. Blocked rows that wait for an account link say so; the
 * drops view uses the same rule, so both screens show the same word.
 */
export function planRowStatus(
  row: FarmPlanDropRow,
  item: InventoryItem | undefined,
): PlanTableStatus {
  if (row.status !== "blocked") return row.status;
  return row.blockedReason === "account_not_linked" || item?.linked === false
    ? "needs-link"
    : "blocked";
}

/** Campaign-end note for a timed plan row: ends before the drop, or within a day. */
export function planDropNote(
  row: FarmPlanDropRow,
  item: InventoryItem | undefined,
  now: number,
): PlanDropNote {
  if (row.readyAt === null) return null;
  if (row.wontFinishInTime) return { kind: "ends-first" };
  const endsAt = item?.endsAt ? Date.parse(item.endsAt) : Number.NaN;
  const untilEnd = endsAt - now;
  return Number.isFinite(untilEnd) && untilEnd > 0 && untilEnd < DAY_MS
    ? { kind: "ends-soon", endsIn: formatEndsIn(item?.endsAt, now) ?? "" }
    : null;
}

export function buildPlanTable(
  plan: FarmPlan,
  input: {
    items: InventoryItem[];
    /** The user's ranked games (resolvePriorityGameNames). */
    gameOrder: string[];
    /** The watched drop with its live minutes; null while paused or idle. */
    activeDrop: { id: string; earnedMinutes: number } | null;
    now: number;
    /** Max drop rows to show; the rest is counted in hiddenCount. */
    limit: number;
  },
): PlanTable {
  const itemById = new Map(input.items.map((i) => [i.id, i]));
  const rows: PlanTableRow[] = [];
  let shownDrops = 0;
  let hiddenCount = 0;

  for (const row of plan.rows) {
    if (row.kind === "switch") {
      if (shownDrops >= input.limit) continue;
      rows.push({
        kind: "switch",
        key: `switch:${row.game}`,
        game: row.game,
        ranked: input.gameOrder.some((g) => sameGameName(g, row.game)),
        at: formatPlanClock(row.at, input.now),
      });
      continue;
    }
    if (shownDrops >= input.limit) {
      hiddenCount += 1;
      continue;
    }
    shownDrops += 1;
    const item = itemById.get(row.dropId);
    const live = input.activeDrop?.id === row.dropId ? input.activeDrop.earnedMinutes : null;
    const status = planRowStatus(row, item);
    rows.push({
      kind: "drop",
      key: row.dropId,
      ready: row.readyAt === null ? null : formatPlanClock(row.readyAt, input.now),
      title: row.title,
      game: row.game,
      watched: Math.max(0, Math.floor(live ?? row.earnedMinutes)),
      required: row.requiredMinutes,
      status,
      // Blocked rows show their reason as the note (raw hint; like the drops
      // view, an unknown reason reads "blocked for an unknown reason").
      note:
        status === "blocked"
          ? { kind: "blocked", reason: row.blockedReason ?? "" }
          : planDropNote(row, item, input.now),
    });
  }
  while (rows.length > 0 && rows[rows.length - 1].kind === "switch") rows.pop();

  return {
    rows,
    hiddenCount,
    doneAt: plan.doneAt === null ? null : formatPlanClock(plan.doneAt, input.now),
  };
}
