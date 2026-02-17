import type { CampaignSummary, FilterKey, InventoryItem, InventoryState } from "@renderer/shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCategory, mapStatusLabel, formatRange, categoryLabel } from "@renderer/shared/utils";
import { useI18n } from "@renderer/shared/i18n";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";

const parseIsoMs = (value?: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const getCampaignPhase = (
  campaign: CampaignSummary,
  now = Date.now(),
): ReturnType<typeof getCategory> => {
  const status = (campaign.status ?? "").toUpperCase();
  const endMs = parseIsoMs(campaign.endsAt);
  if (status === "EXPIRED" || (endMs !== null && endMs < now)) return "expired";
  if (campaign.isActive === true) return "in-progress";
  const startMs = parseIsoMs(campaign.startsAt);
  if (startMs !== null && now < startMs) return "upcoming";
  return "finished";
};

type InventoryProps = {
  inventory: InventoryState;
  filter: FilterKey;
  onFilterChange: (key: FilterKey) => void;
  gameFilter: string;
  onGameFilterChange: (val: string) => void;
  uniqueGames: string[];
  paginatedItems: InventoryItem[];
  filteredCount: number;
  currentPage: number;
  totalPages: number;
  setPage: (page: number) => void;
  changes: { added: Set<string>; updated: Set<string> };
  refreshing: boolean;
  campaigns: CampaignSummary[];
  campaignsLoading: boolean;
  isLinked: boolean;
  allowUnlinkedBadgeEmotes: boolean;
  allowUnlinkedGames: boolean;
  priorityGames: string[];
  onAddPriorityGame: (game: string) => void;
};

export function InventoryView({
  inventory,
  filter,
  onFilterChange,
  gameFilter,
  onGameFilterChange,
  uniqueGames,
  paginatedItems,
  filteredCount,
  currentPage,
  totalPages,
  setPage,
  changes,
  refreshing,
  campaigns,
  campaignsLoading,
  isLinked,
  allowUnlinkedBadgeEmotes,
  allowUnlinkedGames,
  priorityGames,
  onAddPriorityGame,
}: InventoryProps) {
  const { t } = useI18n();
  const firstRenderRef = useRef(true);
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
    const map = new Map<string, { anyTrue: boolean; anyFalse: boolean }>();
    for (const item of inventoryItems) {
      const campaignId = item.campaignId?.trim();
      if (!campaignId) continue;
      const entry = map.get(campaignId) ?? { anyTrue: false, anyFalse: false };
      if (item.linked === true) entry.anyTrue = true;
      if (item.linked === false) entry.anyFalse = true;
      map.set(campaignId, entry);
    }
    return map;
  }, [inventoryItems]);
  const campaignInventoryStats = useMemo(() => {
    const map = new Map<string, { anyUnclaimed: boolean; anyClaimed: boolean }>();
    for (const item of inventoryItems) {
      const campaignId = item.campaignId?.trim();
      if (!campaignId) continue;
      const entry = map.get(campaignId) ?? { anyUnclaimed: false, anyClaimed: false };
      if (item.status === "claimed") {
        entry.anyClaimed = true;
      } else {
        entry.anyUnclaimed = true;
      }
      map.set(campaignId, entry);
    }
    return map;
  }, [inventoryItems]);
  const campaignBadgeEmoteMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const item of inventoryItems) {
      const campaignId = item.campaignId?.trim();
      if (!campaignId) continue;
      if (!item.campaignHasBadgeOrEmote) continue;
      map.set(campaignId, true);
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
      if (inv.status !== "claimed") {
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
  const resolveCampaignHasBadgeOrEmote = (campaign: CampaignSummary): boolean => {
    const id = campaign.id?.trim();
    if (id && campaignBadgeEmoteMap.get(id)) return true;
    return false;
  };
  const shouldShowLinkRequired = (campaign: CampaignSummary): boolean => {
    if (resolveAccountLinked(campaign) !== false) return false;
    if (allowUnlinkedGames) return false;
    const allowUnlinked =
      allowUnlinkedBadgeEmotes && resolveCampaignHasBadgeOrEmote(campaign);
    return !allowUnlinked;
  };
  const visibleCampaigns = (() => {
    const now = Date.now();
    const withPhase = campaigns.map((campaign) => ({
      campaign,
      phase: getCampaignPhase(campaign, now),
      startMs: parseIsoMs(campaign.startsAt) ?? Number.POSITIVE_INFINITY,
    }));
    return withPhase
      .filter((entry) => {
        const isEligible = !shouldShowLinkRequired(entry.campaign);
        if (filter === "not-linked") {
          if (isEligible) return false;
        } else {
          if (!isEligible) return false;
          switch (filter) {
            case "all":
              if (entry.phase === "expired") return false;
              break;
            case "in-progress":
            case "upcoming":
            case "finished":
            case "expired":
              if (entry.phase !== filter) return false;
              break;
            case "excluded":
            default:
              return false;
          }
        }
        if (gameFilter !== "all" && entry.campaign.game !== gameFilter) return false;
        return true;
      })
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
  const hasUnlinkedCampaigns = visibleCampaigns.some(
    ({ campaign }) => shouldShowLinkRequired(campaign),
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
  const isFiltered = filter !== "all" || gameFilter !== "all";
  const campaignsEmptyText = isLinked
    ? isFiltered
      ? t("inventory.campaigns.emptyFilter")
      : t("inventory.campaigns.empty")
    : t("session.loginNeeded");

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
    }
  }, []);
  return (
    <>
      <div className="panel-head">
        <div>
          <h2>{t("inventory.title")}</h2>
          <p className="meta">{t("inventory.filterHint")}</p>
          {refreshing && <span className="pill ghost">{t("inventory.refreshing")}</span>}
        </div>
        <div className="filters filters-row">
          <div className="filters-buttons">
            {[
              { key: "all", label: t("inventory.filter.all") },
              { key: "in-progress", label: t("inventory.filter.active") },
              { key: "upcoming", label: t("inventory.filter.upcoming") },
              { key: "finished", label: t("inventory.filter.finished") },
              { key: "not-linked", label: t("inventory.filter.notLinked") },
              { key: "expired", label: t("inventory.filter.expired") },
              { key: "excluded", label: t("inventory.filter.excluded") },
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
          <select
            className="select"
            value={gameFilter}
            onChange={(e) => {
              onGameFilterChange(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">{t("inventory.allGames")}</option>
            {uniqueGames.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="inventory-section">
        <div className="inventory-section-head">
          <h3>{t("inventory.campaigns.title")}</h3>
          {!campaignsLoading && (
            <span className="pill ghost small">
              {t("inventory.campaigns.count", { count: visibleCampaigns.length })}
            </span>
          )}
        </div>
        {!campaignsLoading && hasUnlinkedCampaigns && (
          <p className="meta">{t("inventory.campaigns.linkHint")}</p>
        )}
        {campaignsLoading && <p className="meta">{t("inventory.campaigns.loading")}</p>}
        {!campaignsLoading && visibleCampaigns.length === 0 && (
          <p className="meta">{campaignsEmptyText}</p>
        )}
        {!campaignsLoading && visibleCampaigns.length > 0 && (
          <ul className="campaign-list">
            {visibleCampaigns.map(({ campaign, phase }) => {
              const name = campaign.name ?? campaign.game ?? t("inventory.campaigns.unknown");
              const game = campaign.game ?? "";
              const imageUrl = typeof campaign.imageUrl === "string" ? campaign.imageUrl.trim() : "";
              const campaignKey = campaign.id ?? `${game}:${name}`;
              const phaseLabel = categoryLabel(phase, (key) => t(key));
              const campaignDrops = Array.isArray(campaign.drops) ? campaign.drops : [];
              const trimmedGame = game.trim();
              const isPriority = trimmedGame ? priorityGames.includes(trimmedGame) : false;
              const addPriorityLabel = isPriority
                ? t("inventory.campaigns.inPriority")
                : t("inventory.campaigns.addPriority");
              const derivedHasUnclaimedDrops = resolveHasUnclaimedDrops(campaign);
              const needsLink = shouldShowLinkRequired(campaign);
              const drops = campaignDrops
                .map((drop) => {
                  const inventoryDrop = inventoryByDropId.get(drop.id);
                  return {
                    id: drop.id,
                    title: drop.name ?? t("inventory.campaigns.dropFallback"),
                    requiredMinutes: Math.max(
                      0,
                      Number(
                        inventoryDrop?.requiredMinutes ?? drop.requiredMinutes,
                      ) || 0,
                    ),
                    earnedMinutes: (() => {
                      const raw =
                        inventoryDrop?.earnedMinutes ?? drop.earnedMinutes ?? 0;
                      const value = Math.max(0, Number(raw) || 0);
                      return value;
                    })(),
                    status: inventoryDrop?.status ?? drop.status,
                    imageUrl: drop.imageUrl,
                  };
                })
                .sort((a, b) => a.title.localeCompare(b.title));
              const dropsLabel =
                derivedHasUnclaimedDrops === false
                  ? t("inventory.campaigns.allClaimed")
                  : derivedHasUnclaimedDrops === true
                    ? t("inventory.campaigns.dropsOpen")
                    : null;
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
                          {dropsLabel ? ` - ${dropsLabel}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="campaign-card-meta">
                      <span className="pill ghost small">{phaseLabel}</span>
                      {needsLink ? (
                        <span className="pill ghost small danger-chip">
                          {t("inventory.campaigns.linkRequired")}
                        </span>
                      ) : null}
                      {trimmedGame ? (
                        <button
                          type="button"
                          className="pill ghost small campaign-card-action"
                          disabled={isPriority}
                          onClick={() => onAddPriorityGame(trimmedGame)}
                        >
                          {addPriorityLabel}
                        </button>
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
                            const statusLabel = status
                              ? mapStatusLabel(status, (key) => t(key))
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
                                  </div>
                                </div>
                                <div className="campaign-drop-meta">
                                  {req > 0 ? (
                                    <span className="meta">
                                      {earned}/{req} {t("inventory.minutes")}
                                    </span>
                                  ) : null}
                                  {statusLabel ? (
                                    <span className="pill ghost small">{statusLabel}</span>
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
      </section>

      {inventory.status === "loading" && <p className="meta">{t("inventory.loading")}</p>}
      {inventory.status === "error" && inventoryErrorText && (
        <p className="error">{`${t("inventory.error")}: ${inventoryErrorText}`}</p>
      )}
      {inventory.status === "idle" && <p className="meta">{t("inventory.idle")}</p>}

      {inventory.status === "ready" && filteredCount === 0 && (
        <p className="meta">{t("inventory.empty")}</p>
      )}

      {inventory.status === "ready" && filteredCount > 0 && (
        <ul className="inventory-list">
          {paginatedItems.map((item, idx) => {
            const category = getCategory(
              item,
              isLinked,
              allowUnlinkedBadgeEmotes,
              allowUnlinkedGames,
            );
            const added = changes.added.has(item.id);
            const updated = changes.updated.has(item.id);
            const animate = !firstRenderRef.current && (added || updated);
            const req = Math.max(0, Number(item.requiredMinutes) || 0);
            const earned = Math.min(
              req || Number.POSITIVE_INFINITY,
              Math.max(0, Number(item.earnedMinutes) || 0),
            );
            const pct = req ? Math.min(100, Math.round((earned / req) * 100)) : 0;
            const imageUrl = typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
            return (
              <li
                key={item.id}
                className={`inv-card ${category} ${added ? "added" : ""} ${updated ? "changed" : ""} ${
                  animate ? "animate-item" : ""
                }`}
                style={animate ? { animationDelay: `${idx * 35}ms` } : undefined}
              >
                <div className="inv-card-main">
                  <div className="inv-card-header">
                    <div className="inv-card-heading">
                      {imageUrl ? (
                        <img className="inv-card-thumb" src={imageUrl} alt="" loading="lazy" />
                      ) : null}
                      <div className="inv-card-title-wrap">
                        <div className="meta">{item.game}</div>
                        <div className="inv-card-title">{item.title}</div>
                      </div>
                    </div>
                    <span className="pill ghost small">
                      {categoryLabel(category, (key) => t(key))}
                    </span>
                  </div>
                  <div className="meta">{formatRange(item.startsAt, item.endsAt, t)}</div>
                </div>
                <div className="inv-card-progress">
                  <div className="inv-progress-meta">
                    <span className="meta">
                      {earned}/{req} {t("inventory.minutes")}
                    </span>
                    <span className="pill ghost small">
                      {mapStatusLabel(item.status, (key) => t(key))}
                    </span>
                  </div>
                  <div className="progress-bar small">
                    <span
                      style={{
                        width: `${pct}%`,
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {inventory.status === "ready" && filteredCount > paginatedItems.length && (
        <div className="pagination">
          <button
            type="button"
            className="ghost"
            disabled={currentPage === 1}
            onClick={() => setPage(Math.max(1, currentPage - 1))}
          >
            {t("inventory.prev")}
          </button>
          <span className="meta">
            {t("inventory.page", { current: currentPage, total: totalPages })}
          </span>
          <button
            type="button"
            className="ghost"
            disabled={currentPage === totalPages}
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
          >
            {t("inventory.next")}
          </button>
        </div>
      )}
    </>
  );
}
