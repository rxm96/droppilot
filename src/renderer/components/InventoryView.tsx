import type { FilterKey, InventoryItem, InventoryState } from "../types";
import { useEffect, useRef } from "react";
import { getCategory, mapStatusLabel, formatRange, categoryLabel } from "../utils";
import { useI18n } from "../i18n";
import { resolveErrorMessage } from "../utils/errors";

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
  isLinked: boolean;
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
  isLinked,
}: InventoryProps) {
  const { t } = useI18n();
  const firstRenderRef = useRef(true);
  const inventoryErrorText =
    inventory.status === "error"
      ? resolveErrorMessage(t, { code: inventory.code, message: inventory.message })
      : null;

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
            const category = getCategory(item, isLinked);
            const added = changes.added.has(item.id);
            const updated = changes.updated.has(item.id);
            const animate = !firstRenderRef.current && (added || updated);
            const req = Math.max(0, Number(item.requiredMinutes) || 0);
            const earned = Math.min(
              req || Number.POSITIVE_INFINITY,
              Math.max(0, Number(item.earnedMinutes) || 0),
            );
            const pct = req ? Math.min(100, Math.round((earned / req) * 100)) : 0;
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
                    <div>
                      <div className="meta">{item.game}</div>
                      <div className="inv-card-title">{item.title}</div>
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
