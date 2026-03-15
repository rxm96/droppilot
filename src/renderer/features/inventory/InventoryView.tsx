import type {
  CampaignSummary,
  FilterKey,
  InventoryItem,
  InventoryState,
} from "@renderer/shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRange, categoryLabel, mapStatusLabel } from "@renderer/shared/utils";
import { useI18n } from "@renderer/shared/i18n";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";

const parseIsoMs = (value?: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const formatBlockingReason = (
  reason: string | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string => {
  if (!reason) return t("inventory.blockReason.unknown");
  if (reason.startsWith("missing_prerequisite_drops:")) {
    const ids = reason.slice("missing_prerequisite_drops:".length).trim();
    return t("inventory.blockReason.missingPrerequisites", {
      ids: ids || "?",
    });
  }
  switch (reason) {
    case "account_not_linked":
      return t("inventory.blockReason.accountNotLinked");
    case "campaign_not_started":
      return t("inventory.blockReason.campaignNotStarted");
    case "campaign_expired":
      return t("inventory.blockReason.campaignExpired");
    case "campaign_allow_disabled":
      return t("inventory.blockReason.campaignNotEligible");
    case "preconditions_not_met":
      return t("inventory.blockReason.preconditionsNotMet");
    case "missing_drop_instance_id":
      return t("inventory.blockReason.missingDropInstance");
    case "claim_window_closed":
      return t("inventory.blockReason.claimWindowClosed");
    default:
      return t("inventory.blockReason.unknown");
  }
};

const pickDisplayBlockingReason = (
  reasons: string[],
  suppressAccountNotLinked: boolean,
): string | undefined => {
  const cleaned = reasons
    .map((reason) => (typeof reason === "string" ? reason.trim() : ""))
    .filter(Boolean);
  if (cleaned.length === 0) return undefined;
  if (!suppressAccountNotLinked) return cleaned[0];
  return cleaned.find((reason) => reason !== "account_not_linked");
};

const CAMPAIGN_PAGE_SIZE = 8;
const CAMPAIGN_SKELETON = Array.from({ length: CAMPAIGN_PAGE_SIZE }, (_, idx) => ({
  key: `campaign-sk-${idx}`,
  expanded: idx === 0,
  drops: idx === 0 ? 4 : 0,
}));

type CampaignPhase = "expired" | "in-progress" | "upcoming" | "finished";

const getCampaignPhase = (campaign: CampaignSummary, now = Date.now()): CampaignPhase => {
  const status = (campaign.status ?? "").toUpperCase();
  const endMs = parseIsoMs(campaign.endsAt);
  if (status === "EXPIRED" || (endMs !== null && endMs < now)) return "expired";
  if (campaign.isActive === true) return "in-progress";
  const startMs = parseIsoMs(campaign.startsAt);
  if (startMs !== null && now < startMs) return "upcoming";
  return "finished";
};

type InventoryCampaignListEntry = {
  campaign: CampaignSummary;
  phase: CampaignPhase;
};

type InventoryCampaignView = {
  campaign: CampaignSummary;
  phase: CampaignPhase;
  campaignKey: string;
  name: string;
  game: string;
  imageUrl: string;
  accountLinkUrl: string;
  phaseLabel: string;
  isPriority: boolean;
  addPriorityLabel: string;
  allClaimed: boolean;
  needsLink: boolean;
  showLinkAction: boolean;
  showAddPriorityAction: boolean;
  showCampaignActions: boolean;
  statusChip: { className: string; label: string } | null;
  drops: Array<{
    id: string;
    title: string;
    requiredMinutes: number;
    earnedMinutes: number;
    status?: string;
    imageUrl?: string;
    blocked: boolean;
    blockingReasonHints: string[];
  }>;
  campaignProgressMinutes: number;
  campaignRequiredMinutes: number;
  campaignProgressPct: number;
  campaignOpenDropCount: number;
  campaignBlockedDropCount: number;
  progressLabel: string;
  rewardSummary: string;
  scheduleLabel: string;
};

type InventoryCampaignVisibilityOptions = {
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

type InventoryProps = {
  inventory: InventoryState;
  filter: FilterKey;
  onFilterChange: (key: FilterKey) => void;
  gameFilter: string;
  onGameFilterChange: (val: string) => void;
  uniqueGames: string[];
  refreshing: boolean;
  onRefresh: () => void;
  campaigns: CampaignSummary[];
  campaignsLoading: boolean;
  isLinked: boolean;
  allowUnlinkedGames: boolean;
  priorityGames: string[];
  onAddPriorityGame: (game: string) => void;
  onOpenAccountLink: (url?: string) => void;
};

export function InventoryView({
  inventory,
  filter,
  onFilterChange,
  gameFilter,
  onGameFilterChange,
  uniqueGames,
  refreshing,
  onRefresh,
  campaigns,
  campaignsLoading,
  isLinked,
  allowUnlinkedGames,
  priorityGames,
  onAddPriorityGame,
  onOpenAccountLink,
}: InventoryProps) {
  const { t } = useI18n();
  const isInventoryLoading = inventory.status === "loading";
  const showCampaignSkeleton = isInventoryLoading;
  const isInventoryError = inventory.status === "error";
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignsEntering, setCampaignsEntering] = useState(false);
  const prevShowCampaignSkeletonRef = useRef(showCampaignSkeleton);
  const refreshDisabled = refreshing || isInventoryLoading;
  const inventoryErrorText =
    inventory.status === "error"
      ? resolveErrorMessage(t, { code: inventory.code, message: inventory.message })
      : null;
  const [selectedCampaignKey, setSelectedCampaignKey] = useState<string | null>(null);
  const inventoryItems = useMemo<InventoryItem[]>(
    () =>
      inventory.status === "ready"
        ? inventory.items
        : inventory.status === "error" && inventory.items
          ? inventory.items
          : [],
    [inventory],
  );
  const { campaignLinkMap, campaignInventoryStats, inventoryByDropId } = useMemo(() => {
    const linkMap = new Map<
      string,
      { anyTrue: boolean; anyFalse: boolean; anyAccountNotLinkedHint: boolean }
    >();
    const inventoryStatsMap = new Map<string, { anyUnclaimed: boolean; anyClaimed: boolean }>();
    const dropIdMap = new Map<string, InventoryItem>();
    for (const item of inventoryItems) {
      if (item.id) {
        dropIdMap.set(item.id, item);
      }
      const campaignId = item.campaignId?.trim();
      if (!campaignId) continue;
      const linkEntry = linkMap.get(campaignId) ?? {
        anyTrue: false,
        anyFalse: false,
        anyAccountNotLinkedHint: false,
      };
      if (item.linked === true) linkEntry.anyTrue = true;
      if (item.linked === false) linkEntry.anyFalse = true;
      if ((item.blockingReasonHints ?? []).some((reason) => reason === "account_not_linked")) {
        linkEntry.anyAccountNotLinkedHint = true;
      }
      linkMap.set(campaignId, linkEntry);

      const inventoryEntry = inventoryStatsMap.get(campaignId) ?? {
        anyUnclaimed: false,
        anyClaimed: false,
      };
      const requiredMinutes = Math.max(0, Number(item.requiredMinutes) || 0);
      if (item.status === "claimed") {
        inventoryEntry.anyClaimed = true;
      } else if (requiredMinutes > 0) {
        inventoryEntry.anyUnclaimed = true;
      }
      inventoryStatsMap.set(campaignId, inventoryEntry);
    }
    return {
      campaignLinkMap: linkMap,
      campaignInventoryStats: inventoryStatsMap,
      inventoryByDropId: dropIdMap,
    };
  }, [inventoryItems]);
  const resolveAccountLinked = useCallback(
    (campaign: CampaignSummary): boolean | undefined => {
      const id = campaign.id?.trim();
      if (id) {
        const entry = campaignLinkMap.get(id);
        if (entry?.anyTrue) return true;
        if (entry?.anyFalse) return false;
      }
      if (campaign.isAccountConnected === true) return true;
      if (campaign.isAccountConnected === false) return false;
      return undefined;
    },
    [campaignLinkMap],
  );
  const resolveHasUnclaimedDrops = useCallback(
    (campaign: CampaignSummary): boolean | undefined => {
      const drops = Array.isArray(campaign.drops) ? campaign.drops : [];
      let anyKnown = false;
      let anyUnclaimed = false;
      for (const drop of drops) {
        const inv = inventoryByDropId.get(drop.id);
        if (!inv) continue;
        anyKnown = true;
        const requiredMinutes = Math.max(0, Number(inv.requiredMinutes) || 0);
        if (inv.status !== "claimed" && requiredMinutes > 0) {
          anyUnclaimed = true;
          break;
        }
      }
      if (anyKnown) return anyUnclaimed;
      const id = campaign.id?.trim();
      if (id) {
        const stats = campaignInventoryStats.get(id);
        if (stats) return stats.anyUnclaimed;
      }
      return campaign.hasUnclaimedDrops;
    },
    [campaignInventoryStats, inventoryByDropId],
  );
  const isCampaignUnlinked = useCallback(
    (campaign: CampaignSummary): boolean => resolveAccountLinked(campaign) === false,
    [resolveAccountLinked],
  );
  const hasAccountNotLinkedHint = useCallback(
    (campaign: CampaignSummary): boolean => {
      const id = campaign.id?.trim();
      if (!id) return false;
      return campaignLinkMap.get(id)?.anyAccountNotLinkedHint === true;
    },
    [campaignLinkMap],
  );
  const shouldShowLinkAction = useCallback(
    (campaign: CampaignSummary): boolean =>
      isCampaignUnlinked(campaign) || hasAccountNotLinkedHint(campaign),
    [hasAccountNotLinkedHint, isCampaignUnlinked],
  );
  const shouldShowLinkRequired = useCallback(
    (campaign: CampaignSummary): boolean => !allowUnlinkedGames && shouldShowLinkAction(campaign),
    [allowUnlinkedGames, shouldShowLinkAction],
  );
  const priorityGameSet = useMemo(() => createPriorityGameSet(priorityGames), [priorityGames]);
  const normalizedFilter: FilterKey = filter === "excluded" ? "all" : filter;
  const visibleCampaigns = useMemo(() => {
    const now = Date.now();
    const withPhase = campaigns.map((campaign) => {
      const derivedHasUnclaimedDrops = resolveHasUnclaimedDrops(campaign);
      const basePhase = getCampaignPhase(campaign, now);
      const phase =
        basePhase !== "expired" && derivedHasUnclaimedDrops === false ? "finished" : basePhase;
      return {
        campaign,
        phase,
        startMs: parseIsoMs(campaign.startsAt) ?? Number.POSITIVE_INFINITY,
        derivedHasUnclaimedDrops,
      };
    });
    return withPhase
      .filter((entry) =>
        shouldDisplayCampaignEntry(entry, {
          normalizedFilter,
          priorityGameSet,
          gameFilter,
          isCampaignUnlinked,
        }),
      )
      .sort((a, b) => {
        const order = (phase: string) =>
          phase === "in-progress" ? 0 : phase === "upcoming" ? 1 : 2;
        const delta = order(a.phase) - order(b.phase);
        if (delta !== 0) return delta;
        if (a.startMs !== b.startMs) return a.startMs - b.startMs;
        const aName = (a.campaign.name ?? "").toLowerCase();
        const bName = (b.campaign.name ?? "").toLowerCase();
        if (aName !== bName) return aName.localeCompare(bName);
        return (a.campaign.game ?? "").localeCompare(b.campaign.game ?? "");
      });
  }, [
    campaigns,
    gameFilter,
    isCampaignUnlinked,
    normalizedFilter,
    priorityGameSet,
    resolveHasUnclaimedDrops,
  ]);
  const { hasUnlinkedCampaigns, unlinkedCampaignCount } = useMemo(() => {
    let count = 0;
    for (const { campaign } of visibleCampaigns) {
      if (shouldShowLinkAction(campaign)) {
        count += 1;
      }
    }
    return {
      hasUnlinkedCampaigns: count > 0,
      unlinkedCampaignCount: count,
    };
  }, [shouldShowLinkAction, visibleCampaigns]);
  const isFiltered = normalizedFilter !== "all" || gameFilter !== "all";
  const campaignsEmptyText = isLinked
    ? isFiltered
      ? t("inventory.campaigns.emptyFilter")
      : t("inventory.campaigns.empty")
    : t("session.loginNeeded");

  useEffect(() => {
    setCampaignPage(1);
  }, [filter, gameFilter]);

  useEffect(() => {
    const wasSkeleton = prevShowCampaignSkeletonRef.current;
    prevShowCampaignSkeletonRef.current = showCampaignSkeleton;
    if (wasSkeleton && !showCampaignSkeleton) {
      setCampaignsEntering(true);
      const id = window.setTimeout(() => setCampaignsEntering(false), 280);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [showCampaignSkeleton]);

  const totalCampaignPages = Math.max(1, Math.ceil(visibleCampaigns.length / CAMPAIGN_PAGE_SIZE));
  const currentCampaignPage = Math.min(campaignPage, totalCampaignPages);
  const paginatedCampaigns = useMemo(
    () =>
      visibleCampaigns.slice(
        (currentCampaignPage - 1) * CAMPAIGN_PAGE_SIZE,
        currentCampaignPage * CAMPAIGN_PAGE_SIZE,
      ),
    [visibleCampaigns, currentCampaignPage],
  );
  const paginatedCampaignViews = useMemo<InventoryCampaignView[]>(
    () =>
      paginatedCampaigns.map(({ campaign, phase, derivedHasUnclaimedDrops }) => {
        const name = campaign.name ?? campaign.game ?? t("inventory.campaigns.unknown");
        const game = campaign.game ?? "";
        const imageUrl = typeof campaign.imageUrl === "string" ? campaign.imageUrl.trim() : "";
        const accountLinkUrl =
          typeof campaign.accountLinkUrl === "string" ? campaign.accountLinkUrl.trim() : "";
        const campaignKey = campaign.id ?? `${game}:${name}`;
        const phaseLabel = categoryLabel(phase, (key) => t(key));
        const campaignDrops = Array.isArray(campaign.drops) ? campaign.drops : [];
        const trimmedGame = game.trim();
        const isPriority = trimmedGame ? priorityGames.includes(trimmedGame) : false;
        const addPriorityLabel = isPriority
          ? t("inventory.campaigns.inPriority")
          : t("inventory.campaigns.addPriority");
        const allClaimed = derivedHasUnclaimedDrops === false;
        const showLinkAction = shouldShowLinkAction(campaign);
        const needsLink = shouldShowLinkRequired(campaign);
        const showAddPriorityAction = Boolean(trimmedGame) && !isPriority;
        const showCampaignActions = showLinkAction || showAddPriorityAction;
        const statusChip = allClaimed
          ? {
              className: "pill ghost small success-chip",
              label: t("inventory.campaigns.allClaimed"),
            }
          : needsLink
            ? {
                className: "pill ghost small danger-chip",
                label: t("inventory.campaigns.linkRequired"),
              }
            : null;
        const drops = campaignDrops
          .map((drop) => {
            const inventoryDrop = inventoryByDropId.get(drop.id);
            return {
              id: drop.id,
              title: drop.name ?? t("inventory.campaigns.dropFallback"),
              requiredMinutes: Math.max(
                0,
                Number(inventoryDrop?.requiredMinutes ?? drop.requiredMinutes) || 0,
              ),
              earnedMinutes: (() => {
                const raw = inventoryDrop?.earnedMinutes ?? drop.earnedMinutes ?? 0;
                return Math.max(0, Number(raw) || 0);
              })(),
              status: inventoryDrop?.status ?? drop.status,
              imageUrl: drop.imageUrl,
              blocked:
                inventoryDrop?.blocked === true ||
                (inventoryDrop?.blockingReasonHints?.length ?? 0) > 0,
              blockingReasonHints: Array.isArray(inventoryDrop?.blockingReasonHints)
                ? inventoryDrop.blockingReasonHints
                : [],
            };
          })
          .sort(compareCampaignDropsByDuration);
        const campaignProgressMinutes = drops.reduce(
          (total, item) => total + Math.max(0, Number(item.earnedMinutes) || 0),
          0,
        );
        const campaignRequiredMinutes = drops.reduce(
          (total, item) => total + Math.max(0, Number(item.requiredMinutes) || 0),
          0,
        );
        const campaignProgressPct =
          campaignRequiredMinutes > 0
            ? Math.min(100, Math.round((campaignProgressMinutes / campaignRequiredMinutes) * 100))
            : 0;
        const campaignOpenDropCount = drops.filter((item) => item.status !== "claimed").length;
        const campaignBlockedDropCount = drops.filter((item) => item.blocked).length;
        return {
          campaign,
          phase,
          campaignKey,
          name,
          game,
          imageUrl,
          accountLinkUrl,
          phaseLabel,
          isPriority,
          addPriorityLabel,
          allClaimed,
          needsLink,
          showLinkAction,
          showAddPriorityAction,
          showCampaignActions,
          statusChip,
          drops,
          campaignProgressMinutes,
          campaignRequiredMinutes,
          campaignProgressPct,
          campaignOpenDropCount,
          campaignBlockedDropCount,
          progressLabel:
            campaignRequiredMinutes > 0
              ? `${campaignProgressMinutes}/${campaignRequiredMinutes} ${t("inventory.minutes")}`
              : t("inventory.campaigns.noDrops"),
          rewardSummary: allClaimed
            ? t("inventory.campaigns.allClaimed")
            : t("overview.openRewards", { count: campaignOpenDropCount }),
          scheduleLabel: formatRange(campaign.startsAt, campaign.endsAt, t),
        };
      }),
    [
      inventoryByDropId,
      paginatedCampaigns,
      priorityGames,
      shouldShowLinkAction,
      shouldShowLinkRequired,
      t,
    ],
  );

  useEffect(() => {
    if (paginatedCampaignViews.length === 0) {
      setSelectedCampaignKey(null);
      return;
    }
    setSelectedCampaignKey((prev) => {
      if (prev === null) return null;
      if (prev && paginatedCampaignViews.some((item) => item.campaignKey === prev)) return prev;
      return null;
    });
  }, [paginatedCampaignViews]);

  const selectedCampaign = useMemo(
    () => paginatedCampaignViews.find((item) => item.campaignKey === selectedCampaignKey) ?? null,
    [paginatedCampaignViews, selectedCampaignKey],
  );

  return (
    <>
      <div className="inventory-panel-head">
        <h2>{t("inventory.title")}</h2>
        <div className="inventory-controls">
          <div className="filters-buttons inventory-filter-row">
            {[
              { key: "all", label: t("inventory.filter.all") },
              { key: "priority-games", label: t("inventory.filter.priorityGames") },
              { key: "in-progress", label: t("inventory.filter.active") },
              { key: "upcoming", label: t("inventory.filter.upcoming") },
              { key: "finished", label: t("inventory.filter.finished") },
              { key: "not-linked", label: t("inventory.filter.notLinked") },
              { key: "expired", label: t("inventory.filter.expired") },
            ].map((f) => (
              <button
                key={f.key}
                className={filter === f.key ? "pill active" : "pill ghost"}
                onClick={() => onFilterChange(f.key as FilterKey)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="filters-actions inventory-head-actions">
            <button
              type="button"
              className="ghost subtle-btn"
              onClick={onRefresh}
              disabled={refreshDisabled}
            >
              {refreshing ? (
                <span className="inline-loader">
                  <span className="spinner" />
                  {t("inventory.refreshing")}
                </span>
              ) : (
                t("inventory.refresh")
              )}
            </button>
            <Select value={gameFilter} onValueChange={(value) => onGameFilterChange(value)}>
              <SelectTrigger aria-label={t("inventory.allGames")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("inventory.allGames")}</SelectItem>
                  {uniqueGames.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <section className="inventory-section">
        <div className="inventory-section-head">
          <div className="inventory-section-title">
            <h3>{t("inventory.campaigns.title")}</h3>
            {!showCampaignSkeleton && (
              <span className="meta inventory-section-count">
                {t("inventory.campaigns.count", { count: visibleCampaigns.length })}
              </span>
            )}
          </div>
          <div className="inventory-section-head-right">
            {!showCampaignSkeleton && hasUnlinkedCampaigns && (
              <span className="meta inventory-link-meta">
                {t("inventory.campaigns.linkNeeds", { count: unlinkedCampaignCount })}
              </span>
            )}
            {!showCampaignSkeleton && hasUnlinkedCampaigns && (
              <button type="button" className="ghost subtle-btn" onClick={onOpenAccountLink}>
                {t("inventory.campaigns.linkAction")}
              </button>
            )}
          </div>
        </div>
        {showCampaignSkeleton && (
          <div className="inventory-loading-state" role="status" aria-live="polite">
            <div className="inventory-loading-band">
              <span className="inventory-loading-band-dot" aria-hidden="true" />
              <div className="inventory-loading-band-copy">
                <strong>{t("inventory.campaigns.loadingLabel")}</strong>
                <span>{t("inventory.campaigns.loadingHint")}</span>
              </div>
              <div className="inventory-loading-band-rail" aria-hidden="true">
                <span />
              </div>
            </div>
            <span className="sr-only">{t("inventory.loading")}</span>
            <ul className="campaign-list campaign-list-skeleton" aria-hidden="true">
              {CAMPAIGN_SKELETON.map((sk) => (
                <li key={sk.key} className="campaign-card skeleton-card">
                  <div className="campaign-card-select campaign-skeleton-row">
                    <div className="campaign-card-top">
                      <div className="campaign-card-main">
                        <div className="skeleton-line skeleton-thumb campaign-skeleton-thumb" />
                        <div className="campaign-card-body skeleton-body campaign-skeleton-body">
                          <div className="skeleton-line tiny" />
                          <div className="skeleton-line medium" />
                          <div className="skeleton-line short" />
                          <div className="skeleton-line medium campaign-skeleton-meta-line" />
                          <div className="skeleton-line bar campaign-skeleton-progress-line" />
                        </div>
                      </div>
                      <div className="campaign-card-meta campaign-skeleton-meta">
                        <div className="skeleton-chip small" />
                        <div className="skeleton-chip small" />
                        <div className="skeleton-chip wide" />
                      </div>
                    </div>
                  </div>
                  {sk.expanded ? (
                    <div className="campaign-inline-detail-shell is-open campaign-skeleton-detail-shell">
                      <div className="campaign-inline-detail">
                        <div className="campaign-action-rail-shell is-open">
                          <div className="campaign-action-rail-body">
                            <div className="campaign-detail-stage campaign-skeleton-action-rail">
                              <div className="campaign-detail-head">
                                <div className="campaign-card-actions">
                                  <div className="skeleton-chip wide" />
                                  <div className="skeleton-chip wide" />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <ul className="campaign-drop-list campaign-skeleton-drop-list">
                            {Array.from({ length: sk.drops }).map((_, dropIdx) => (
                              <li
                                key={`${sk.key}-drop-${dropIdx}`}
                                className="campaign-drop campaign-skeleton-drop"
                              >
                                <div className="campaign-drop-main">
                                  <div className="skeleton-line skeleton-thumb campaign-skeleton-drop-thumb" />
                                  <div className="campaign-drop-body skeleton-body">
                                    <div className="skeleton-line short" />
                                    <div className="skeleton-line tiny" />
                                  </div>
                                </div>
                                <div className="campaign-drop-progress-column campaign-skeleton-drop-progress">
                                  <div className="skeleton-line bar" />
                                  <div className="skeleton-line tiny" />
                                </div>
                                <div className="campaign-drop-meta">
                                  <div className="skeleton-chip wide" />
                                </div>
                              </li>
                            ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!showCampaignSkeleton &&
          !campaignsLoading &&
          !isInventoryError &&
          visibleCampaigns.length === 0 && <p className="meta">{campaignsEmptyText}</p>}
        {!showCampaignSkeleton && visibleCampaigns.length > 0 && (
          <ul className={`campaign-list campaign-ledger${campaignsEntering ? " is-entering" : ""}`}>
            {paginatedCampaignViews.map((view, index) => {
              const isSelected = selectedCampaign?.campaignKey === view.campaignKey;
              const isLeading = index === 0;
              const collapsedMetaParts = [
                `${view.campaignProgressPct}%`,
                t("overview.openRewards", { count: view.campaignOpenDropCount }),
              ];
              if (view.campaignBlockedDropCount > 0) {
                collapsedMetaParts.push(`${t("hero.opsBlocked")} ${view.campaignBlockedDropCount}`);
              }
              const collapsedMeta = collapsedMetaParts.join(" / ");
              return (
                <li
                  key={view.campaignKey}
                  className={`campaign-card ${view.phase}${isSelected ? " is-selected" : ""}${isLeading ? " is-leading" : ""}`}
                >
                  <button
                    type="button"
                    className="campaign-card-select"
                    aria-pressed={isSelected}
                    aria-expanded={isSelected}
                    onClick={() =>
                      setSelectedCampaignKey((current) =>
                        current === view.campaignKey ? null : view.campaignKey,
                      )
                    }
                  >
                    <div className="campaign-card-top">
                      <div className="campaign-card-main">
                        {view.imageUrl ? (
                          <img
                            className="campaign-card-thumb"
                            src={view.imageUrl}
                            alt=""
                            loading="lazy"
                          />
                        ) : null}
                        <div className="campaign-card-body">
                          <div className="campaign-card-heading">
                            {view.game ? <div className="meta">{view.game}</div> : null}
                            <div className="campaign-card-title">{view.name}</div>
                          </div>
                          <div className="meta">{view.scheduleLabel}</div>
                          {view.drops.length > 0 ? (
                            <>
                              <div className="meta campaign-card-collapsed-meta">
                                {collapsedMeta}
                              </div>
                              <div className="campaign-card-progress-bar" aria-hidden="true">
                                <span style={{ width: `${view.campaignProgressPct}%` }} />
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="campaign-card-meta">
                        <span className="pill ghost small">{view.phaseLabel}</span>
                        {view.statusChip ? (
                          <span className={view.statusChip.className}>{view.statusChip.label}</span>
                        ) : null}
                        {view.isPriority ? (
                          <span className="pill ghost small">{view.addPriorityLabel}</span>
                        ) : null}
                        <span className="meta campaign-card-toggle">
                          {isSelected
                            ? t("inventory.campaigns.closeDetails")
                            : t("inventory.campaigns.openDetails")}
                        </span>
                      </div>
                    </div>
                  </button>
                  <div
                    className={`campaign-inline-detail-shell${isSelected ? " is-open" : ""}`}
                    aria-hidden={!isSelected}
                  >
                    <div className="campaign-inline-detail">
                      {view.showCampaignActions ? (
                        <div className={`campaign-action-rail-shell${isSelected ? " is-open" : ""}`}>
                          <div className="campaign-action-rail-body">
                            <div className="campaign-detail-stage">
                              <div className="campaign-detail-head">
                                <div className="campaign-card-actions">
                                  {view.showLinkAction ? (
                                    <button
                                      type="button"
                                      className={`pill ghost small ${view.needsLink ? "danger-chip" : ""}`}
                                      onClick={() => onOpenAccountLink(view.accountLinkUrl || undefined)}
                                      title={view.accountLinkUrl || undefined}
                                    >
                                      {t("inventory.campaigns.linkRequiredAction")}
                                    </button>
                                  ) : null}
                                  {view.showAddPriorityAction ? (
                                    <button
                                      type="button"
                                      className="pill ghost small campaign-card-action"
                                      onClick={() => onAddPriorityGame(view.game.trim())}
                                    >
                                      {view.addPriorityLabel}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {view.drops.length === 0 ? (
                        <p className="meta">{t("inventory.campaigns.noDrops")}</p>
                      ) : (
                        <ul className="campaign-drop-list">
                          {view.drops.map((item, index) => {
                            const req = Math.max(0, Number(item.requiredMinutes) || 0);
                            let earned = Math.max(0, Number(item.earnedMinutes) || 0);
                            let status = item.status;
                            if (!status) {
                              if (req > 0 && earned >= req) {
                                status = "progress";
                              } else if (earned > 0) {
                                status = "progress";
                              } else {
                                status = "locked";
                              }
                            }
                            if (status === "claimed" && req > 0 && earned < req) {
                              earned = req;
                            }
                            if (req > 0) {
                              earned = Math.min(req, earned);
                            }
                            const displayBlockingReason = pickDisplayBlockingReason(
                              item.blockingReasonHints,
                              view.needsLink,
                            );
                            const blockingReasonLabel =
                              item.blocked && displayBlockingReason
                                ? formatBlockingReason(displayBlockingReason, t)
                                : null;
                            const displayBlocked = item.blocked && !!displayBlockingReason;
                            const dropProgressPct =
                              req > 0 ? Math.min(100, Math.round((earned / req) * 100)) : 0;
                            const statusLabel = status
                              ? status === "progress" && displayBlocked
                                ? t("inventory.status.progressBlocked")
                                : mapStatusLabel(status, (key) => t(key))
                              : null;
                            const dropImage =
                              typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
                            return (
                              <li
                                key={item.id}
                                className={`campaign-drop${status === "claimed" ? " is-claimed" : ""}${status === "progress" ? " is-progress" : ""}${displayBlocked ? " is-blocked" : ""}`}
                                style={
                                  {
                                    "--drop-index": String(Math.min(8, index)),
                                  } as React.CSSProperties
                                }
                              >
                                <div className="campaign-drop-main">
                                  {dropImage ? (
                                    <div className="campaign-drop-thumb-frame">
                                      <img
                                        className="campaign-drop-thumb"
                                        src={dropImage}
                                        alt=""
                                        loading="lazy"
                                      />
                                    </div>
                                  ) : null}
                                  <div className="campaign-drop-body">
                                    <div className="campaign-drop-title">{item.title}</div>
                                    {blockingReasonLabel ? (
                                      <div
                                        className="campaign-drop-reason"
                                        title={blockingReasonLabel}
                                      >
                                        {blockingReasonLabel}
                                      </div>
                                    ) : req > 0 ? null : (
                                      <div className="campaign-drop-subline meta">
                                        {t("inventory.campaigns.noDrops")}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="campaign-drop-progress-column">
                                  {req > 0 ? (
                                    <>
                                      <div
                                        className="campaign-drop-progress-bar"
                                        aria-hidden="true"
                                      >
                                        <span style={{ width: `${dropProgressPct}%` }} />
                                      </div>
                                      <span className="meta">
                                        {earned}/{req} {t("inventory.minutes")}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="meta">-</span>
                                  )}
                                </div>
                                <div className="campaign-drop-meta">
                                  {statusLabel ? (
                                    <span
                                      className={`pill ghost small campaign-drop-status-pill ${status === "progress" && displayBlocked ? "danger-chip" : ""}`}
                                      title={blockingReasonLabel ?? undefined}
                                    >
                                      {statusLabel}
                                    </span>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!showCampaignSkeleton && visibleCampaigns.length > paginatedCampaigns.length && (
          <div className="pagination">
            <button
              type="button"
              className="ghost"
              disabled={currentCampaignPage === 1}
              onClick={() => setCampaignPage(Math.max(1, currentCampaignPage - 1))}
            >
              {t("inventory.prev")}
            </button>
            <span className="meta">
              {t("inventory.page", { current: currentCampaignPage, total: totalCampaignPages })}
            </span>
            <button
              type="button"
              className="ghost"
              disabled={currentCampaignPage === totalCampaignPages}
              onClick={() => setCampaignPage(Math.min(totalCampaignPages, currentCampaignPage + 1))}
            >
              {t("inventory.next")}
            </button>
          </div>
        )}
      </section>

      {inventory.status === "error" && inventoryErrorText && (
        <p className="error">{`${t("inventory.error")}: ${inventoryErrorText}`}</p>
      )}
    </>
  );
}
