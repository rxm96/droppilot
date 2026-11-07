// Pure view-model helpers for the merged overview (UI polish phase 2).
// No React imports.

import type { CampaignSummary, ChannelEntry, InventoryItem } from "@renderer/shared/types";
import { sameGameName } from "@renderer/shared/domain/gameName";

/** The autopilot chip's three states. */
export type AutopilotState = "running" | "paused" | "off";

/**
 * Running = a channel is watched, or auto-select may pick one. Paused = the
 * user stopped it (or auto-select is switched off) and nothing is watched.
 * Off = watching is not possible at all (signed out).
 */
export function resolveAutopilotState(input: {
  allowWatching: boolean;
  watching: boolean;
  autoSelectEnabled: boolean;
}): AutopilotState {
  if (!input.allowWatching) return "off";
  if (input.watching || input.autoSelectEnabled) return "running";
  return "paused";
}

export type HeroState =
  | "earning"
  | "paused"
  | "off"
  | "watching-no-drop"
  | "idle-no-target"
  | "idle-nothing-to-farm"
  | "idle-no-channels"
  | "idle-channels-error"
  | "idle-starting";

/** What the hero card is about right now. */
export function resolveHeroState(input: {
  autopilot: AutopilotState;
  watching: boolean;
  hasActiveDrop: boolean;
  activeGame: string;
  channelsCount: number;
  channelsLoading: boolean;
  /** The last channel fetch failed (the list is empty because of the error). */
  channelsFailed: boolean;
  /** The target game has a drop watching can earn (useTargetDrops). */
  canWatchTarget: boolean;
}): HeroState {
  if (input.autopilot === "off") return "off";
  if (input.autopilot === "paused") return "paused";
  if (input.watching) return input.hasActiveDrop ? "earning" : "watching-no-drop";
  if (!input.activeGame.trim()) return "idle-no-target";
  // Channels are not fetched for a target with nothing watchable.
  if (!input.canWatchTarget) return "idle-nothing-to-farm";
  if (input.channelsFailed) return "idle-channels-error";
  if (!input.channelsLoading && input.channelsCount === 0) return "idle-no-channels";
  return "idle-starting";
}

export type NeedsYouItem =
  | { kind: "session-expired" }
  | { kind: "claim"; count: number }
  | { kind: "link"; game: string; dropTitle: string; moreCount: number; linkUrl?: string };

const isExpired = (item: InventoryItem, now: number): boolean => {
  if ((item.blockingReasonHints ?? []).includes("campaign_expired")) return true;
  const endsAt = item.endsAt ? Date.parse(item.endsAt) : Number.NaN;
  return Number.isFinite(endsAt) && endsAt < now;
};

const needsAccountLink = (item: InventoryItem): boolean =>
  item.linked === false || (item.blockingReasonHints ?? []).includes("account_not_linked");

/**
 * Things only the user can fix, in order: an expired session, drops waiting to
 * be claimed, and ranked games whose drops need an account link (one item per
 * game). Unranked games are left out: the user never asked for them. With
 * "allow unlinked campaigns" on, the link items are skipped, like the drops
 * view's link banner.
 */
export function buildNeedsYouItems(input: {
  authExpired: boolean;
  items: InventoryItem[];
  /** The user's ranked games (resolvePriorityGameNames). */
  rankedGames: string[];
  campaigns: CampaignSummary[];
  allowUnlinkedGames: boolean;
  now: number;
}): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  if (input.authExpired) out.push({ kind: "session-expired" });

  const claimable = input.items.filter((i) => i.status !== "claimed" && i.isClaimable === true);
  if (claimable.length > 0) out.push({ kind: "claim", count: claimable.length });

  if (input.allowUnlinkedGames) return out;
  for (const ranked of input.rankedGames) {
    const drops = input.items.filter(
      (i) =>
        sameGameName(i.game, ranked) &&
        i.status !== "claimed" &&
        !isExpired(i, input.now) &&
        needsAccountLink(i),
    );
    if (drops.length === 0) continue;
    const first = drops[0];
    const linkUrl = drops
      .map((d) => input.campaigns.find((c) => c.id === d.campaignId)?.accountLinkUrl)
      .find((url): url is string => typeof url === "string" && url.trim().length > 0);
    out.push({
      kind: "link",
      game: first.game,
      dropTitle: first.title,
      moreCount: drops.length - 1,
      ...(linkUrl ? { linkUrl } : {}),
    });
  }
  return out;
}

/** Two-letter avatar initials for a channel name ("AgentZero" → "AZ"). */
export function channelInitials(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * The channel "resume" goes back to: the last watched one, while it is still
 * live (matched by id, or by its lower-cased login). Null otherwise; resume
 * then lets auto-select pick.
 */
export function findResumeChannel(
  channels: ChannelEntry[],
  last: { id: string; login: string } | null,
): ChannelEntry | null {
  if (!last) return null;
  return (
    channels.find(
      (c) => c.id === last.id || (last.login !== "" && c.login.trim().toLowerCase() === last.login),
    ) ?? null
  );
}
