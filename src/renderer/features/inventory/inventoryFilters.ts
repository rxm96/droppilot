import type {
  CampaignSummary,
  FilterKey,
  InventoryItem,
} from "@renderer/shared/types";

// ============================================================================
// SHARED PRIMITIVES (legacy + new)
// ============================================================================

export const parseIsoMs = (value?: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

export type CampaignPhase = "expired" | "in-progress" | "upcoming" | "finished";

export const getCampaignPhase = (
  campaign: CampaignSummary,
  now: number = Date.now(),
): CampaignPhase => {
  const status = (campaign.status ?? "").toUpperCase();
  const endMs = parseIsoMs(campaign.endsAt);
  if (status === "EXPIRED" || (endMs !== null && endMs < now)) return "expired";
  if (campaign.isActive === true) return "in-progress";
  const startMs = parseIsoMs(campaign.startsAt);
  if (startMs !== null && now < startMs) return "upcoming";
  return "finished";
};

export const createPriorityGameSet = (priorityGames: string[]): Set<string> =>
  new Set(
    priorityGames
      .map((game) => (typeof game === "string" ? game.trim().toLowerCase() : ""))
      .filter(Boolean),
  );

export const isCampaignInPriorityGames = (
  campaign: CampaignSummary,
  priorityGameSet: Set<string>,
): boolean => {
  const game = typeof campaign.game === "string" ? campaign.game.trim().toLowerCase() : "";
  if (!game) return false;
  if (priorityGameSet.size === 0) return false;
  return priorityGameSet.has(game);
};

export const compareCampaignDropsByDuration = (
  a: { requiredMinutes: number; title: string; id: string },
  b: { requiredMinutes: number; title: string; id: string },
): number => {
  const aRequiredMinutes = Math.max(0, Number(a.requiredMinutes) || 0);
  const bRequiredMinutes = Math.max(0, Number(b.requiredMinutes) || 0);
  if (aRequiredMinutes !== bRequiredMinutes) return aRequiredMinutes - bRequiredMinutes;
  const titleDelta = a.title.localeCompare(b.title);
  if (titleDelta !== 0) return titleDelta;
  return a.id.localeCompare(b.id);
};

// ============================================================================
// LEGACY: campaign-level entry filtering (preserved for InventoryView.test.ts)
// ============================================================================

export type InventoryCampaignListEntry = {
  campaign: CampaignSummary;
  phase: CampaignPhase;
};

export type InventoryCampaignVisibilityOptions = {
  normalizedFilter: FilterKey;
  priorityGameSet: Set<string>;
  gameFilter: string;
  isCampaignUnlinked: (campaign: CampaignSummary) => boolean;
};

export const shouldDisplayCampaignEntry = (
  entry: InventoryCampaignListEntry,
  {
    normalizedFilter,
    priorityGameSet,
    gameFilter,
    isCampaignUnlinked,
  }: InventoryCampaignVisibilityOptions,
): boolean => {
  if (normalizedFilter === "priority-games") {
    if (!isCampaignInPriorityGames(entry.campaign, priorityGameSet)) return false;
    if (entry.phase === "expired") return false;
  } else if (normalizedFilter === "not-linked") {
    if (!isCampaignUnlinked(entry.campaign)) return false;
  } else {
    switch (normalizedFilter) {
      case "all":
        if (entry.phase === "expired") return false;
        break;
      case "in-progress":
      case "upcoming":
      case "finished":
      case "expired":
        if (entry.phase !== normalizedFilter) return false;
        break;
      default:
        return false;
    }
  }
  if (gameFilter !== "all" && entry.campaign.game !== gameFilter) return false;
  return true;
};

// ============================================================================
// NEW: drop-level entry filtering (used by the Phase 3 InventoryView)
// ============================================================================

export type CampaignLookup = {
  /** Resolve a campaign by its id, returning null when unknown. */
  byId: (campaignId: string | undefined) => CampaignSummary | null;
  /** True if the campaign is known to be account-unlinked. */
  isUnlinked: (campaign: CampaignSummary) => boolean;
};

export type InventoryDropVisibilityOptions = {
  normalizedFilter: FilterKey;
  priorityGameSet: Set<string>;
  gameFilter: string;
  campaignLookup: CampaignLookup;
  now?: number;
};

export const shouldDisplayDropEntry = (
  item: InventoryItem,
  opts: InventoryDropVisibilityOptions,
): boolean => {
  const { normalizedFilter, priorityGameSet, gameFilter, campaignLookup } = opts;
  const now = opts.now ?? Date.now();
  const game = typeof item.game === "string" ? item.game.trim() : "";
  const gameLower = game.toLowerCase();
  const campaign = campaignLookup.byId(item.campaignId);
  const campaignPhase: CampaignPhase | null = campaign
    ? getCampaignPhase(campaign, now)
    : null;
  const hasAccountNotLinkedHint = (item.blockingReasonHints ?? []).some(
    (reason) => reason === "account_not_linked",
  );

  // Game-filter (always AND)
  if (gameFilter !== "all" && item.game !== gameFilter) return false;

  switch (normalizedFilter) {
    case "all":
    case "excluded":
      // Default view hides drops from expired campaigns
      return campaignPhase !== "expired";
    case "priority-games":
      if (!gameLower || !priorityGameSet.has(gameLower)) return false;
      return campaignPhase !== "expired";
    case "in-progress":
      return item.status === "progress" || (item.earnedMinutes > 0 && item.status !== "claimed");
    case "upcoming":
      return campaignPhase === "upcoming";
    case "finished":
      return item.status === "claimed";
    case "not-linked":
      return (campaign && campaignLookup.isUnlinked(campaign)) || hasAccountNotLinkedHint;
    case "expired":
      return campaignPhase === "expired";
    default:
      return true;
  }
};

// ============================================================================
// NEW: drop-level sort
// ============================================================================

export type DropSortKey = "title" | "watched" | "progress" | "status";
export type SortDirection = "asc" | "desc";

const STATUS_ORDINAL: Record<InventoryItem["status"], number> = {
  progress: 0,
  locked: 1,
  claimed: 2,
};

export const compareDropsByKey = (
  a: InventoryItem,
  b: InventoryItem,
  key: DropSortKey,
  direction: SortDirection,
): number => {
  const sign = direction === "asc" ? 1 : -1;
  switch (key) {
    case "title": {
      const cmp = (a.title ?? "").toLowerCase().localeCompare((b.title ?? "").toLowerCase());
      if (cmp !== 0) return cmp * sign;
      return (a.game ?? "").localeCompare(b.game ?? "") * sign;
    }
    case "watched": {
      const cmp = (a.earnedMinutes ?? 0) - (b.earnedMinutes ?? 0);
      return cmp * sign;
    }
    case "progress": {
      const ratioA = a.requiredMinutes > 0 ? a.earnedMinutes / a.requiredMinutes : -1;
      const ratioB = b.requiredMinutes > 0 ? b.earnedMinutes / b.requiredMinutes : -1;
      const cmp = ratioA - ratioB;
      return cmp * sign;
    }
    case "status": {
      const cmp = STATUS_ORDINAL[a.status] - STATUS_ORDINAL[b.status];
      if (cmp !== 0) return cmp * sign;
      // Tie-breaker: progress desc within the same status
      const ratioA = a.requiredMinutes > 0 ? a.earnedMinutes / a.requiredMinutes : 0;
      const ratioB = b.requiredMinutes > 0 ? b.earnedMinutes / b.requiredMinutes : 0;
      return (ratioB - ratioA) * sign;
    }
    default:
      return 0;
  }
};
