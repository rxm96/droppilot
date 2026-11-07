// Pure model for a drop's inline details strip in the drops view: the "why"
// sentence (as i18n keys + values), four facts (raw numbers and timestamps)
// and the actions that apply. No React, no i18n; DropDetails renders it.

import { sameGameName } from "@renderer/shared/domain/gameName";
import type { CampaignSummary } from "@renderer/shared/types";
import { formatEndsIn, formatReadyAt } from "@renderer/features/overview/formatters";
import type { PlanClock } from "@renderer/features/overview/planTable";
import type { DropsRow } from "./dropsModel";

export const TWITCH_INVENTORY_URL = "https://www.twitch.tv/drops/inventory";

export const campaignUrl = (campaignId: string): string =>
  `https://www.twitch.tv/drops/campaigns?dropID=${encodeURIComponent(campaignId)}`;

/** A value in a "why" sentence: plain, a date to format, or a blocking hint to translate. */
export type WhyVar =
  | string
  | number
  | { kind: "date"; at: number }
  | { kind: "reason"; hint: string };

export type WhyKey =
  | "drops.details.why.watching"
  | "drops.details.why.farming"
  | "drops.details.why.afterSwitch"
  | "drops.details.why.endsFirst"
  | "drops.details.why.shared"
  | "drops.details.why.later"
  | "drops.details.why.waitingClaim"
  | "drops.details.why.claim"
  | "drops.details.why.needsLink"
  | "drops.details.why.blocked"
  | "drops.details.why.notRanked"
  | "drops.details.why.notFarmed"
  | "drops.details.why.noWatch"
  | "drops.details.why.watchedSelf"
  | "drops.details.why.startsLater"
  | "drops.details.why.claimed"
  | "drops.details.why.expired";

/** One sentence; the strip joins them with a space. */
export type WhyPart = { key: WhyKey; vars?: Record<string, WhyVar> };

/** Why a drop has no ready time (the `ready` fact's sub-line). */
export type ReadyReason =
  | "watched"
  | "claim"
  | "link"
  | "blocked"
  | "not-farmed"
  | "claimed"
  | "expired";

export type DropFacts = {
  watched: { watched: number; required: number; percent: number | null };
  ready:
    | { kind: "at"; clock: PlanClock; minutesLeft: number | null }
    | { kind: "none"; reason: ReadyReason };
  campaign: { name: string; dropCount: number | null } | null;
  /** `endsIn` is null once the campaign is over. */
  ends: { at: number; endsIn: string | null } | null;
};

export type DropAction =
  | { kind: "link"; url?: string }
  | { kind: "add-game"; game: string }
  | { kind: "inventory"; url: string }
  | { kind: "campaign"; url: string };

export type DropDetails = { why: WhyPart[]; facts: DropFacts; actions: DropAction[] };

export type DropDetailsContext = {
  campaigns: CampaignSummary[];
  /** The user's ranked games (resolvePriorityGameNames). */
  rankedGames: string[];
  /** The game of the drop being watched right now; null while nothing is. */
  farmingGame: string | null;
  now: number;
};

const parseTs = (value: string | undefined): number | null => {
  const ts = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ts) ? ts : null;
};

/** "14:34", or "14:34 +1d" when it falls on a later day. */
const clockText = (clock: PlanClock): string =>
  clock.dayOffset > 0 ? `${clock.clock} +${clock.dayOffset}d` : clock.clock;

/** Minutes as one compact span: "40m", "2h", "1h 20m", "3d". */
export function formatMinutesLeft(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
  }
  return `${Math.floor(m / (24 * 60))}d`;
}

const accountNotLinked = (row: DropsRow): boolean =>
  row.item.linked === false || (row.item.blockingReasonHints ?? []).includes("account_not_linked");

function whyParts(
  row: DropsRow,
  ctx: {
    game: string;
    ranked: boolean;
    farmingGame: string | null;
    startsAt: number | null;
    now: number;
  },
): WhyPart[] {
  const { note } = row;
  const { game } = ctx;
  if (note?.kind === "waiting-claim") return [{ key: "drops.details.why.waitingClaim" }];
  switch (row.status) {
    case "watching":
      return note?.kind === "on-channel" && row.ready
        ? [
            {
              key: "drops.details.why.watching",
              vars: { channel: note.channel, clock: clockText(row.ready) },
            },
          ]
        : [{ key: "drops.details.why.farming" }];
    case "next":
    case "queued":
      if (note?.kind === "after-switch") {
        return [
          { key: "drops.details.why.afterSwitch", vars: { game, clock: clockText(note.at) } },
        ];
      }
      if (note?.kind === "ends-first") return [{ key: "drops.details.why.endsFirst" }];
      // Minutes only count for the game being watched; a drop of another game
      // waits until the plan gets there.
      if (row.ready && !(ctx.farmingGame && sameGameName(ctx.farmingGame, game))) {
        return [{ key: "drops.details.why.later", vars: { game, clock: clockText(row.ready) } }];
      }
      return [{ key: "drops.details.why.shared", vars: { game } }];
    case "claim":
      return [{ key: "drops.details.why.claim" }];
    case "needs-link":
      return [{ key: "drops.details.why.needsLink", vars: { game } }];
    case "blocked":
      return [
        {
          key: "drops.details.why.blocked",
          vars: { reason: { kind: "reason", hint: note?.kind === "blocked" ? note.reason : "" } },
        },
      ];
    case "not-farmed": {
      const parts: WhyPart[] = [];
      if (note?.kind === "no-watch") parts.push({ key: "drops.details.why.noWatch" });
      else {
        parts.push(
          ctx.ranked
            ? { key: "drops.details.why.notFarmed" }
            : { key: "drops.details.why.notRanked", vars: { game } },
        );
        if (row.watched > 0) parts.push({ key: "drops.details.why.watchedSelf" });
      }
      if (ctx.startsAt !== null && ctx.startsAt > ctx.now) {
        parts.push({
          key: "drops.details.why.startsLater",
          vars: { date: { kind: "date", at: ctx.startsAt } },
        });
      }
      return parts;
    }
    case "claimed":
      return [{ key: "drops.details.why.claimed" }];
    case "expired":
      return [{ key: "drops.details.why.expired" }];
  }
}

function readyFact(row: DropsRow, now: number): DropFacts["ready"] {
  if (row.ready) {
    const left = formatReadyAt(row.readyAt, now);
    return { kind: "at", clock: row.ready, minutesLeft: left ? left.minutesLeft : null };
  }
  switch (row.status) {
    case "claim":
      return { kind: "none", reason: "claim" };
    case "needs-link":
      return { kind: "none", reason: "link" };
    case "blocked":
      return { kind: "none", reason: "blocked" };
    case "claimed":
      return { kind: "none", reason: "claimed" };
    case "expired":
      return { kind: "none", reason: "expired" };
    case "not-farmed":
      return { kind: "none", reason: "not-farmed" };
    default:
      // Farming without a ready time: fully watched, waiting for the claim.
      return { kind: "none", reason: "watched" };
  }
}

/** Everything the details strip under a drop row shows. */
export function buildDropDetails(row: DropsRow, ctx: DropDetailsContext): DropDetails {
  const { item } = row;
  const campaignId = item.campaignId?.trim() || null;
  const campaign = campaignId ? (ctx.campaigns.find((c) => c.id === campaignId) ?? null) : null;
  const game = item.game?.trim() ?? "";
  const ranked = ctx.rankedGames.some((g) => sameGameName(g, game));
  const startsAt = parseTs(campaign?.startsAt) ?? parseTs(item.startsAt);
  const endsAt = parseTs(campaign?.endsAt) ?? parseTs(item.endsAt);
  const campaignName = campaign?.name?.trim() || item.campaignName?.trim() || "";
  const dropCount = campaign?.drops?.length ?? 0;

  const actions: DropAction[] = [];
  const quiet = row.status === "claim" || row.status === "claimed" || row.status === "expired";
  if (row.status === "needs-link" || (!quiet && accountNotLinked(row))) {
    const url = campaign?.accountLinkUrl?.trim();
    actions.push(url ? { kind: "link", url } : { kind: "link" });
  }
  if (!ranked && game && row.bucket !== "expired") actions.push({ kind: "add-game", game });
  if (row.status === "claimed") actions.push({ kind: "inventory", url: TWITCH_INVENTORY_URL });
  if (campaignId) actions.push({ kind: "campaign", url: campaignUrl(campaignId) });

  return {
    why: whyParts(row, { game, ranked, farmingGame: ctx.farmingGame, startsAt, now: ctx.now }),
    facts: {
      watched: {
        watched: row.watched,
        required: row.required,
        percent:
          row.required > 0 ? Math.min(100, Math.round((row.watched / row.required) * 100)) : null,
      },
      ready: readyFact(row, ctx.now),
      campaign: campaignName
        ? { name: campaignName, dropCount: dropCount > 0 ? dropCount : null }
        : null,
      ends:
        endsAt === null
          ? null
          : { at: endsAt, endsIn: formatEndsIn(new Date(endsAt).toISOString(), ctx.now) },
    },
    actions,
  };
}
