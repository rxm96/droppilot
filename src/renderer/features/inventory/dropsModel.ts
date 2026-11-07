// Pure view-model for the drops view (UI polish phase 3): one bucket and one
// status per drop, drops grouped by game in farm order. No React imports.
//
// The farm plan (buildFarmPlan, the same one the overview's plan table shows)
// decides what is being farmed, so both screens agree on every drop.

import type { DropStatus } from "@renderer/shared/domain/dropStatus";
import type { FarmPlan, FarmPlanDropRow } from "@renderer/shared/domain/farmPlan";
import { sameGameName } from "@renderer/shared/domain/gameName";
import type { CampaignSummary, FilterKey, InventoryItem } from "@renderer/shared/types";
import { formatEndsIn } from "@renderer/features/overview/formatters";
import {
  formatPlanClock,
  planDropNote,
  planRowStatus,
  type PlanClock,
  type PlanDropNote,
} from "@renderer/features/overview/planTable";
import { dropTitleFallback } from "./inventoryFormatters";

export type DropBucket = Exclude<FilterKey, "all">;
export type DropClass = { bucket: DropBucket | "expired"; status: DropStatus };

export type DropNote =
  | Exclude<PlanDropNote, null>
  | { kind: "on-channel"; channel: string }
  | { kind: "after-switch"; at: PlanClock }
  | { kind: "link"; game: string }
  | { kind: "claim" }
  | { kind: "blocked"; reason: string }
  | { kind: "waiting-claim" }
  | { kind: "no-watch" }
  | null;

export type DropsRow = {
  id: string;
  item: InventoryItem;
  title: string;
  imageUrl?: string;
  bucket: DropBucket | "expired";
  status: DropStatus;
  note: DropNote;
  watched: number;
  required: number;
  ready: PlanClock | null;
  /** The ready time behind `ready` (epoch ms), for "in X"; null when `ready` is. */
  readyAt: number | null;
};

export type DropsGroup = {
  game: string;
  code: string;
  /** Campaign image, when the data has one. */
  imageUrl?: string;
  /** 1-based rank in the user's games; null when the game is not in the list. */
  rank: number | null;
  campaign: { kind: "one"; name: string } | { kind: "many"; count: number } | null;
  endsIn: string | null;
  /** Some drop of this game waits for an account link. */
  needsLink: boolean;
  linkUrl?: string;
  rows: DropsRow[];
};

export type DropsView = {
  groups: DropsGroup[];
  /** Expired campaigns, for the collapsed section. Empty unless the filter is "all". */
  expired: DropsGroup[];
  expiredCount: number;
  /** Per bucket, after search, without expired drops. */
  counts: Record<FilterKey, number>;
  /** All drops and games outside the expired section, before filter and search. */
  totalDrops: number;
  totalGames: number;
};

const num = (n: unknown): number => Number(n) || 0;

const hints = (item: InventoryItem): string[] =>
  (item.blockingReasonHints ?? []).filter((h): h is string => typeof h === "string");

const isCampaignExpired = (item: InventoryItem, now: number): boolean => {
  if (hints(item).includes("campaign_expired")) return true;
  if ((item.campaignStatus ?? "").toUpperCase() === "EXPIRED") return true;
  const endsAt = item.endsAt ? Date.parse(item.endsAt) : Number.NaN;
  return Number.isFinite(endsAt) && endsAt < now;
};

/**
 * The drop's bucket and pill, checked in this order:
 * claimed → claimable (needs you, also inside an ended campaign's claim
 * window) → expired campaign → farm-plan row (timed: farming; blocked by an
 * account link: needs you; blocked otherwise: not farmed) → fully watched but
 * not claimable yet (farming, queued) → everything else is not farmed.
 */
export function classifyDrop(
  item: InventoryItem,
  ctx: { planRow?: FarmPlanDropRow; now: number },
): DropClass {
  const expired = isCampaignExpired(item, ctx.now);
  if (item.status === "claimed") {
    return { bucket: expired ? "expired" : "claimed", status: "claimed" };
  }
  if (item.isClaimable === true) return { bucket: "needs-you", status: "claim" };
  if (expired) return { bucket: "expired", status: "expired" };
  if (ctx.planRow) {
    const status = planRowStatus(ctx.planRow, item);
    if (status === "needs-link") return { bucket: "needs-you", status };
    if (status === "blocked") return { bucket: "not-farmed", status };
    return { bucket: "farming", status };
  }
  const required = num(item.requiredMinutes);
  if (required > 0 && num(item.earnedMinutes) >= required) {
    return { bucket: "farming", status: "queued" };
  }
  return { bucket: "not-farmed", status: "not-farmed" };
}

/**
 * Game order for the groups: the order the farm plan reaches them, then the
 * user's other ranked games (rank order), then every other game by name.
 */
export function orderGames(games: string[], plan: FarmPlan, rankedGames: string[]): string[] {
  const out: string[] = [];
  const take = (name: string) => {
    const match = games.find((g) => sameGameName(g, name));
    if (match !== undefined && !out.some((g) => sameGameName(g, match))) out.push(match);
  };
  for (const row of plan.rows) if (row.kind === "drop") take(row.game);
  rankedGames.forEach(take);
  [...games].sort((a, b) => a.localeCompare(b)).forEach(take);
  return out;
}

/** Short tile code for a game: "Valorant" → "VAL", "Counter-Strike 2" → "CS2". */
export function gameCode(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return name.trim().slice(0, 2).toUpperCase() || "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => (/^\d+$/.test(w) ? w : w[0]))
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/** "1st" / "2nd" in English, "1." in German. */
export function formatRank(n: number, language: string): string {
  if (language === "de") return `${n}.`;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// Row order inside a game for rows without a ready time.
const STATUS_ORDER: Record<DropStatus, number> = {
  watching: 0,
  next: 0,
  queued: 3,
  claim: 1,
  "needs-link": 2,
  blocked: 4,
  "not-farmed": 5,
  claimed: 6,
  expired: 7,
};

const compareByDuration = (a: DropsRow, b: DropsRow): number =>
  a.required - b.required || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

function rowNote(
  item: InventoryItem,
  cls: DropClass,
  ctx: {
    planRow?: FarmPlanDropRow;
    switchAt?: PlanClock;
    watchingChannel: string | null;
    now: number;
  },
): DropNote {
  const { planRow } = ctx;
  if (cls.status === "claim") return { kind: "claim" };
  if (cls.status === "needs-link") return { kind: "link", game: item.game };
  if (cls.status === "blocked") return { kind: "blocked", reason: planRow?.blockedReason ?? "" };
  if (cls.status === "watching" && ctx.watchingChannel) {
    return { kind: "on-channel", channel: ctx.watchingChannel };
  }
  if (planRow && cls.bucket === "farming") {
    const note = planDropNote(planRow, item, ctx.now);
    if (note) return note;
    if (ctx.switchAt && cls.status !== "watching")
      return { kind: "after-switch", at: ctx.switchAt };
    return null;
  }
  if (cls.bucket === "farming") return { kind: "waiting-claim" };
  if (cls.status === "not-farmed" && num(item.requiredMinutes) <= 0) return { kind: "no-watch" };
  return null;
}

function matchesSearch(item: InventoryItem, query: string): boolean {
  if (!query) return true;
  return [item.title, item.game, item.campaignName].some((field) =>
    (field ?? "").toLowerCase().includes(query),
  );
}

export function buildDropsView(input: {
  items: InventoryItem[];
  campaigns: CampaignSummary[];
  plan: FarmPlan;
  /** The user's ranked games (resolvePriorityGameNames). */
  rankedGames: string[];
  /** The watched drop with its live minutes; null while paused or idle. */
  activeDrop: { id: string; earnedMinutes: number } | null;
  watchingChannel: string | null;
  filter: FilterKey;
  search: string;
  now: number;
}): DropsView {
  const { plan, now } = input;
  const query = input.search.trim().toLowerCase();
  const planRowById = new Map<string, FarmPlanDropRow>();
  const planIndex = new Map<string, number>();
  const switchAtByGame: Array<{ game: string; at: number }> = [];
  plan.rows.forEach((row, index) => {
    if (row.kind === "switch") switchAtByGame.push({ game: row.game, at: row.at });
    else {
      planRowById.set(row.dropId, row);
      planIndex.set(row.dropId, index);
    }
  });
  const campaignById = new Map(input.campaigns.map((c) => [c.id, c]));

  const rows: DropsRow[] = input.items.map((item) => {
    const planRow = planRowById.get(item.id);
    const cls = classifyDrop(item, { planRow, now });
    const switchRow = switchAtByGame.find((s) => sameGameName(s.game, item.game));
    const live = input.activeDrop?.id === item.id ? input.activeDrop.earnedMinutes : null;
    const imageUrl = item.imageUrl?.trim();
    const readyAt = cls.bucket === "farming" ? (planRow?.readyAt ?? null) : null;
    return {
      id: item.id,
      item,
      title: dropTitleFallback(item),
      ...(imageUrl ? { imageUrl } : {}),
      bucket: cls.bucket,
      status: cls.status,
      note: rowNote(item, cls, {
        planRow,
        switchAt: switchRow ? formatPlanClock(switchRow.at, now) : undefined,
        watchingChannel: input.watchingChannel,
        now,
      }),
      watched: Math.max(0, Math.floor(live ?? num(item.earnedMinutes))),
      required: num(item.requiredMinutes),
      ready: readyAt === null ? null : formatPlanClock(readyAt, now),
      readyAt,
    };
  });

  const compareRows = (a: DropsRow, b: DropsRow): number => {
    const ia = a.ready ? (planIndex.get(a.id) ?? Infinity) : Infinity;
    const ib = b.ready ? (planIndex.get(b.id) ?? Infinity) : Infinity;
    if (ia !== ib) return ia < ib ? -1 : 1;
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || compareByDuration(a, b);
  };

  const games = orderGames(
    Array.from(new Set(input.items.map((i) => i.game))),
    plan,
    input.rankedGames,
  );

  const buildGroups = (all: DropsRow[], visible: (row: DropsRow) => boolean): DropsGroup[] =>
    games.flatMap((game) => {
      const gameRows = all.filter((r) => sameGameName(r.item.game, game));
      const shown = gameRows.filter(visible).sort(compareRows);
      if (shown.length === 0) return [];
      const campaignNames = Array.from(
        new Set(gameRows.map((r) => r.item.campaignName?.trim()).filter(Boolean)),
      ) as string[];
      const ends = gameRows
        .map((r) => (r.item.endsAt ? Date.parse(r.item.endsAt) : Number.NaN))
        .filter((t) => Number.isFinite(t) && t > now);
      const endsIn = ends.length > 0 ? formatEndsIn(iso(Math.min(...ends)), now) : null;
      const imageUrl =
        gameRows.map((r) => r.item.campaignImageUrl?.trim()).find(Boolean) ??
        gameRows
          .map((r) => campaignById.get(r.item.campaignId ?? "")?.imageUrl?.trim())
          .find(Boolean);
      const linkRows = gameRows.filter((r) => r.status === "needs-link");
      const linkUrl = linkRows
        .map((r) => campaignById.get(r.item.campaignId ?? "")?.accountLinkUrl?.trim())
        .find(Boolean);
      const rankIndex = input.rankedGames.findIndex((g) => sameGameName(g, game));
      return [
        {
          game,
          code: gameCode(game),
          ...(imageUrl ? { imageUrl } : {}),
          rank: rankIndex >= 0 ? rankIndex + 1 : null,
          campaign:
            campaignNames.length === 0
              ? null
              : campaignNames.length === 1
                ? { kind: "one" as const, name: campaignNames[0] }
                : { kind: "many" as const, count: campaignNames.length },
          endsIn,
          needsLink: linkRows.length > 0,
          ...(linkUrl ? { linkUrl } : {}),
          rows: shown,
        },
      ];
    });

  const current = rows.filter((r) => r.bucket !== "expired");
  const expired = rows.filter((r) => r.bucket === "expired");
  const searched = current.filter((r) => matchesSearch(r.item, query));
  const counts: Record<FilterKey, number> = {
    all: searched.length,
    farming: 0,
    "needs-you": 0,
    claimed: 0,
    "not-farmed": 0,
  };
  for (const r of searched) counts[r.bucket as DropBucket] += 1;

  const expiredGroups =
    input.filter === "all"
      ? buildGroups(expired, (r) => matchesSearch(r.item, query)).map((g) => ({
          ...g,
          endsIn: null,
        }))
      : [];

  return {
    groups: buildGroups(
      current,
      (r) => matchesSearch(r.item, query) && (input.filter === "all" || r.bucket === input.filter),
    ),
    expired: expiredGroups,
    expiredCount: expiredGroups.reduce((n, g) => n + g.rows.length, 0),
    counts,
    totalDrops: current.length,
    totalGames: games.filter((g) => current.some((r) => sameGameName(r.item.game, g))).length,
  };
}

function iso(ts: number): string {
  return new Date(ts).toISOString();
}
