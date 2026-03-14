import type {
  CampaignSummary,
  FilterKey,
  InventoryItem,
  InventoryState,
} from "@renderer/shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const inventoryItems = useMemo<InventoryItem[]>(
    () =>
      inventory.status === "ready"
        ? inventory.items
        : inventory.status === "error" && inventory.items
          ? inventory.items
          : [],
    [inventory],
  );
  const campaignLinkMap = useMemo(() => {
    const map = new Map<
      string,
      { anyTrue: boolean; anyFalse: boolean; anyAccountNotLinkedHint: boolean }
    >();
    for (const item of inventoryItems) {
      const campaignId = item.campaignId?.trim();
      if (!campaignId) continue;
      const entry = map.get(campaignId) ?? {
        anyTrue: false,
        anyFalse: false,
        anyAccountNotLinkedHint: false,
      };
      if (item.linked === true) entry.anyTrue = true;
      if (item.linked === false) entry.anyFalse = true;
      if ((item.blockingReasonHints ?? []).some((reason) => reason === "account_not_linked")) {
        entry.anyAccountNotLinkedHint = true;
      }
      map.set(campaignId, entry);
    }
    return map;
  }, [inventoryItems]);
  const campaignInventoryStats = useMemo(() => {
    const map = new Map<string, { anyUnclaimed: boolean; anyClaimed: boolean }>();
    for (const item of inventoryItems) {
      const campaignId = item.campaignId?.trim();
      if (!campaignId) continue;
      const entry = map.get(campaignId) ?? {
        anyUnclaimed: false,
        anyClaimed: false,
      };
      const requiredMinutes = Math.max(0, Number(item.requiredMinutes) || 0);
      if (item.status === "claimed") {
        entry.anyClaimed = true;
      } else if (requiredMinutes > 0) {
        entry.anyUnclaimed = true;
      }
      map.set(campaignId, entry);
    }
    return map;
  }, [inventoryItems]);
  const inventoryByDropId = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of inventoryItems) {
      if (item.id) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [inventoryItems]);
  const resolveAccountLinked = (campaign: CampaignSummary): boolean | undefined => {
    const id = campaign.id?.trim();
    if (id) {
      const entry = campaignLinkMap.get(id);
      if (entry?.anyTrue) return true;
      if (entry?.anyFalse) return false;
    }
    if (campaign.isAccountConnected === true) return true;
    if (campaign.isAccountConnected === false) return false;
    return undefined;
  };
  const resolveHasUnclaimedDrops = (campaign: CampaignSummary): boolean | undefined => {
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
  };
  const isCampaignUnlinked = (campaign: CampaignSummary): boolean =>
    resolveAccountLinked(campaign) === false;
  const hasAccountNotLinkedHint = (campaign: CampaignSummary): boolean => {
    const id = campaign.id?.trim();
    if (!id) return false;
    return campaignLinkMap.get(id)?.anyAccountNotLinkedHint === true;
  };
  const shouldShowLinkAction = (campaign: CampaignSummary): boolean =>
    isCampaignUnlinked(campaign) || hasAccountNotLinkedHint(campaign);
  const shouldShowLinkRequired = (campaign: CampaignSummary): boolean =>
    !allowUnlinkedGames && shouldShowLinkAction(campaign);
  const priorityGameSet = useMemo(() => createPriorityGameSet(priorityGames), [priorityGames]);
  const normalizedFilter: FilterKey = filter === "excluded" ? "all" : filter;
  const visibleCampaigns = (() => {
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
  })();
  const hasUnlinkedCampaigns = visibleCampaigns.some(({ campaign }) =>
    shouldShowLinkAction(campaign),
  );
  const unlinkedCampaignCount = visibleCampaigns.reduce(
    (total, { campaign }) => (shouldShowLinkAction(campaign) ? total + 1 : total),
    0,
  );
  const toggleCampaign = (key: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
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
          <>
            <span className="sr-only" role="status">
              {t("inventory.loading")}
            </span>
            <ul className="campaign-list campaign-list-skeleton" aria-hidden="true">
              {CAMPAIGN_SKELETON.map((sk) => (
                <li key={sk.key} className="campaign-card skeleton-card">
                  <div className="campaign-card-top">
                    <div className="campaign-card-main">
                      <div className="skeleton-line skeleton-thumb" />
                      <div className="campaign-card-body skeleton-body">
                        <div className="skeleton-line tiny" />
                        <div className="skeleton-line medium" />
                        <div className="skeleton-line short" />
                      </div>
                    </div>
                    <div className="campaign-card-meta">
                      <div className="skeleton-chip small" />
                      <div className="skeleton-chip wide" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {!showCampaignSkeleton &&
          !campaignsLoading &&
          !isInventoryError &&
          visibleCampaigns.length === 0 && <p className="meta">{campaignsEmptyText}</p>}
        {!showCampaignSkeleton && visibleCampaigns.length > 0 && (
          <ul className={`campaign-list${campaignsEntering ? " is-entering" : ""}`}>
            {paginatedCampaigns.map(({ campaign, phase, derivedHasUnclaimedDrops }) => {
              const name = campaign.name ?? campaign.game ?? t("inventory.campaigns.unknown");
              const game = campaign.game ?? "";
              const imageUrl =
                typeof campaign.imageUrl === "string" ? campaign.imageUrl.trim() : "";
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
              const showCampaignActions = showLinkAction || showAddPriorityAction || isPriority;
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
                      const value = Math.max(0, Number(raw) || 0);
                      return value;
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
              const isExpanded = expandedCampaigns.has(campaignKey);
              const expandLabel = isExpanded
                ? t("inventory.campaigns.hideDrops")
                : t("inventory.campaigns.showDrops", { count: drops.length });
              return (
                <li key={campaignKey} className={`campaign-card ${phase}`}>
                  <div className="campaign-card-top">
                    <div className="campaign-card-main">
                      {imageUrl ? (
                        <img className="campaign-card-thumb" src={imageUrl} alt="" loading="lazy" />
                      ) : null}
                      <div className="campaign-card-body">
                        <div className="campaign-card-heading">
                          {game ? <div className="meta">{game}</div> : null}
                          <div className="campaign-card-title">{name}</div>
                        </div>
                        <div className="meta">
                          {formatRange(campaign.startsAt, campaign.endsAt, t)}
                        </div>
                      </div>
                    </div>
                    <div className="campaign-card-meta">
                      <span className="pill ghost small">{phaseLabel}</span>
                      {statusChip ? (
                        <span className={statusChip.className}>{statusChip.label}</span>
                      ) : null}
                      <button
                        type="button"
                        className="pill ghost small campaign-card-toggle"
                        aria-expanded={isExpanded}
                        onClick={() => toggleCampaign(campaignKey)}
                      >
                        {expandLabel}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="campaign-card-drops">
                      {showCampaignActions ? (
                        <div className="campaign-card-actions">
                          {showLinkAction ? (
                            <button
                              type="button"
                              className={`pill ghost small ${needsLink ? "danger-chip" : ""}`}
                              onClick={() => onOpenAccountLink(accountLinkUrl || undefined)}
                              title={accountLinkUrl || undefined}
                            >
                              {t("inventory.campaigns.linkRequiredAction")}
                            </button>
                          ) : null}
                          {isPriority ? (
                            <span className="pill ghost small">{addPriorityLabel}</span>
                          ) : null}
                          {showAddPriorityAction ? (
                            <button
                              type="button"
                              className="pill ghost small campaign-card-action"
                              onClick={() => onAddPriorityGame(trimmedGame)}
                            >
                              {addPriorityLabel}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {drops.length === 0 ? (
                        <p className="meta">{t("inventory.campaigns.noDrops")}</p>
                      ) : (
                        <ul className="campaign-drop-list">
                          {drops.map((item) => {
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
                              needsLink,
                            );
                            const blockingReasonLabel =
                              item.blocked && displayBlockingReason
                                ? formatBlockingReason(displayBlockingReason, t)
                                : null;
                            const displayBlocked = item.blocked && !!displayBlockingReason;
                            const statusLabel = status
                              ? status === "progress" && displayBlocked
                                ? t("inventory.status.progressBlocked")
                                : mapStatusLabel(status, (key) => t(key))
                              : null;
                            const dropImage =
                              typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
                            return (
                              <li key={item.id} className="campaign-drop">
                                <div className="campaign-drop-main">
                                  {dropImage ? (
                                    <img
                                      className="campaign-drop-thumb"
                                      src={dropImage}
                                      alt=""
                                      loading="lazy"
                                    />
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
                                    ) : null}
                                  </div>
                                </div>
                                <div className="campaign-drop-meta">
                                  {req > 0 ? (
                                    <span className="meta">
                                      {earned}/{req} {t("inventory.minutes")}
                                    </span>
                                  ) : null}
                                  {statusLabel ? (
                                    <span
                                      className={`pill ghost small ${status === "progress" && displayBlocked ? "danger-chip" : ""}`}
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
                  )}
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
