# Design Overhaul — Phase 3: Inventory Dense-Table Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing campaign-card-grid Inventory layout (754 lines, paginated 8 campaigns/page, expand-to-see-drops interaction) with a drop-level dense Table view per brainstorm variant B + spec §7.2: each row is one drop, sortable columns (watched / progress / status), filter chips translated to drop-state semantics, click-row opens a detail drawer with campaign context (link required, blocking reasons, add-to-priority action). Campaign-level affordances (bulk link, expired-campaign filtering) are folded into the new header and drawer.

**Architecture:** Extract existing business logic helpers (`shouldDisplayCampaignEntry`, `createPriorityGameSet`, `isCampaignInPriorityGames`, `compareCampaignDropsByDuration`, `getCampaignPhase`) into a new `inventoryFilters.ts` module so the existing 5 unit tests in `InventoryView.test.ts` continue to pass unchanged. Add **new** drop-level filter/sort helpers in the same module. Build 5 new components: `InventoryHeader` (title + count + game filter + refresh + bulk-link banner), `InventoryFilterStrip` (Pill-based chips), `InventoryTable` (Dense Table primitive with sort headers + thumbnail column + status pill column), `InventoryDrawer` (slide-over panel for drop detail), and `useInventoryDrawer` (small state hook). Rewrite `InventoryView.tsx` as a composition of these, consuming the existing `useAppModel.inventoryProps` shape unchanged.

**Tech Stack:** React 19, Tailwind 4 CSS-first tokens, Phase 1 primitives (Pill, SectionLabel, Card, Input, Table), Phase 1 chrome (already in App.tsx), Phase 2 formatters (`formatHourMinute`, `formatPercent`, `formatRelative`), Lucide icons.

**Spec reference:** [`../specs/2026-05-27-design-overhaul-design.md`](../specs/2026-05-27-design-overhaul-design.md) §7.2 and brainstorm mockup [`../specs/2026-05-27-design-overhaul-mockups/06-inventory.html`](../specs/2026-05-27-design-overhaul-mockups/06-inventory.html) variant B.

**Branch:** `feat/design-overhaul-phase-3-inventory` (stacked on `feat/design-overhaul-phase-2-overview`)

**PR target:** `feat/design-overhaul-phase-2-overview` — GitHub will auto-retarget once Phase 2 merges, and again to `main` once Phase 1 merges.

### Locked design decisions (for Phase 3)

1. **Row unit:** drop, not campaign. Spec mockup shows drops; brainstorm variant B is drop-level. Campaign context surfaces via the detail drawer + the header bulk-link banner.
2. **Filter chips:** keep the existing 7-value `FilterKey` TypeScript union (`all`, `priority-games`, `in-progress`, `upcoming`, `finished`, `not-linked`, `expired`) so `useAppModel.filter` plumbing stays untouched. Each value's *semantic* shifts to drop-level — the new `shouldDisplayDropEntry` translates campaign-phase concepts into drop-state predicates (see Data Mapping section).
3. **Sort:** clickable column headers cycle through `none → asc → desc → none`. Default sort: status (live → queued → claimed) then progress descending.
4. **Pagination:** 25 drops per page (was 8 campaigns); reuse the existing prev/next + page indicator pattern. Virtualization is out of scope for Phase 3.
5. **Bulk link banner:** when ≥1 visible drop's campaign needs account-link, show a single-line banner above the table with a "link account" Button. Per-drop link prompts also surface in the drawer.
6. **Drawer behaviour:** slides in from the right (320px wide), backdrop click closes, ESC closes. No URL state (just local).
7. **Test compatibility:** existing exports from `InventoryView.tsx` (`shouldDisplayCampaignEntry`, `createPriorityGameSet`, `isCampaignInPriorityGames`, `compareCampaignDropsByDuration`) keep their signatures; they're re-exported from `InventoryView.tsx` for backward compat (the test file imports from `"./InventoryView"`). Internally they move to `inventoryFilters.ts`.

### Deviations from spec

1. **Detail drawer vs modal:** spec says "drawer (preserved table context) OR modal" — choosing drawer per the spec's preference and locked decision #6.
2. **Search input** in the header — spec mentions "search input before chips". Phase 3 ships **a single text input for drop title filter only** (no fuzzy multi-field). Wider search is a future addition.
3. **`viewers` column** (spec) — no data source, skipped (same as Phase 2 Hero stat-grid trade-off).

---

## File Structure

**New files:**
- `src/renderer/features/inventory/inventoryFilters.ts` — business logic helpers (existing + new drop-level)
- `src/renderer/features/inventory/inventoryFormatters.ts` — display helpers (drop title fallback, status tone, blocking reason text)
- `src/renderer/features/inventory/InventoryHeader.tsx` — title + count + search + game-filter Select + refresh + bulk-link banner
- `src/renderer/features/inventory/InventoryFilterStrip.tsx` — Pill-based filter chips
- `src/renderer/features/inventory/InventoryTable.tsx` — Dense Table with sortable headers
- `src/renderer/features/inventory/InventoryDrawer.tsx` — slide-over drop detail
- `src/renderer/features/inventory/useInventoryViewState.ts` — local UI state hook (sort, page, search, drawer selection)

**Modified files:**
- `src/renderer/features/inventory/InventoryView.tsx` — full rewrite as composition; re-exports legacy helpers for test back-compat

**Untouched (intentionally):**
- `src/renderer/features/inventory/InventoryView.test.ts` — keeps testing the same exported helpers via `InventoryView.tsx`'s re-exports
- `src/renderer/shared/hooks/app/useAppModel.ts` — `inventoryProps` shape unchanged
- `src/renderer/shared/types.ts` — `FilterKey` union unchanged
- All other features (overview/control/priorities/settings/debug) — unchanged

---

## Data Mapping (filter semantics)

Given the existing `FilterKey` union, each value translates to a drop-level predicate via the new `shouldDisplayDropEntry(item, ctx)` helper. `ctx` includes the campaign lookup map and priority game set.

| FilterKey | Drop-level predicate |
| --- | --- |
| `"all"` | All drops EXCEPT those in expired campaigns (matches current "all hides expired" behaviour) |
| `"priority-games"` | Drops where the drop's `game` (lower-cased) is in the priority game set, AND not in an expired campaign |
| `"in-progress"` | `status === "progress"` OR (`earnedMinutes > 0` AND `status !== "claimed"`) |
| `"upcoming"` | Drops whose campaign phase is `"upcoming"` (campaign hasn't started yet) |
| `"finished"` | `status === "claimed"` |
| `"not-linked"` | Drops where the resolved campaign linked-state is `false` OR drop has `blockingReasonHints` containing `"account_not_linked"` |
| `"expired"` | Drops whose campaign phase is `"expired"` (the only way to surface expired drops) |
| `"excluded"` | Falls back to `"all"` (same as today) |

The `gameFilter` (drop-down) is applied as an additional AND filter: `gameFilter === "all"` accepts everything; otherwise `item.game === gameFilter`.

Sort columns:
- **drop · game** — alphabetical by `title.toLowerCase()` with game as tie-breaker
- **watched** — by `earnedMinutes` numeric
- **progress** — by `earnedMinutes / requiredMinutes` numeric (drops with `requiredMinutes === 0` sort last in asc)
- **status** — by ordinal: `progress (live) < locked (queued) < claimed`

Default sort = status asc + progress desc (so live drops are first, then most-progressed queued, then claimed).

---

## Task 1: Extract business logic to `inventoryFilters.ts`

Move the 5 existing helpers from `InventoryView.tsx` into a new module, then ADD drop-level helpers (without removing old ones).

**Files:**
- Create: `src/renderer/features/inventory/inventoryFilters.ts`

- [ ] **Step 1: Create the file with both legacy and new helpers**

```ts
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
```

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "inventoryFilters" | head -5`

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/inventory/inventoryFilters.ts
git commit -m "feat(inventory): extract filters/sort into inventoryFilters module

Pulls the existing campaign-level helpers (shouldDisplayCampaignEntry,
createPriorityGameSet, isCampaignInPriorityGames,
compareCampaignDropsByDuration, getCampaignPhase, parseIsoMs) into a
dedicated module so the new Phase 3 InventoryView can consume them.

Adds new drop-level helpers (shouldDisplayDropEntry, compareDropsByKey)
that translate the same FilterKey semantics to drop-state predicates,
which the new dense-table layout uses.

InventoryView.tsx will re-export the legacy helpers for backward
compatibility with InventoryView.test.ts in the next task."
```

---

## Task 2: Add `inventoryFormatters.ts`

Small display helpers used by multiple Phase 3 components.

**Files:**
- Create: `src/renderer/features/inventory/inventoryFormatters.ts`

- [ ] **Step 1: Create the file**

```ts
import type { InventoryItem } from "@renderer/shared/types";

export type StatusPillTone = "accent" | "ok" | "warn" | "err" | "dim";

/** Tone for the status pill in the Inventory table. */
export const dropStatusTone = (item: InventoryItem): StatusPillTone => {
  if (item.status === "claimed") return "ok";
  if (item.status === "progress") {
    if (item.blocked) return "err";
    return "accent";
  }
  // locked
  if (item.blocked) return "warn";
  return "dim";
};

/** Short label for the status pill. */
export const dropStatusLabel = (item: InventoryItem): string => {
  if (item.status === "claimed") return "claimed";
  if (item.status === "progress") return item.blocked ? "blocked" : "live";
  return item.blocked ? "blocked" : "queued";
};

/** Human-readable blocking reason from a known hint code. */
export const formatBlockingReason = (reason: string | undefined): string => {
  if (!reason) return "unknown reason";
  if (reason.startsWith("missing_prerequisite_drops:")) {
    const ids = reason.slice("missing_prerequisite_drops:".length).trim();
    return `Missing prerequisite drops${ids ? ` (${ids})` : ""}`;
  }
  switch (reason) {
    case "account_not_linked":
      return "Account not linked to game";
    case "campaign_not_started":
      return "Campaign hasn't started";
    case "campaign_expired":
      return "Campaign expired";
    case "campaign_allow_disabled":
      return "Campaign not eligible";
    case "preconditions_not_met":
      return "Preconditions not met";
    case "missing_drop_instance_id":
      return "Missing drop instance";
    case "claim_window_closed":
      return "Claim window closed";
    default:
      return "unknown reason";
  }
};

/** Pick the most informative blocking reason hint to display. */
export const pickDisplayBlockingReason = (
  hints: string[] | undefined,
  suppressAccountNotLinked: boolean,
): string | undefined => {
  if (!hints || hints.length === 0) return undefined;
  const cleaned = hints
    .map((reason) => (typeof reason === "string" ? reason.trim() : ""))
    .filter(Boolean);
  if (cleaned.length === 0) return undefined;
  if (!suppressAccountNotLinked) return cleaned[0];
  return cleaned.find((reason) => reason !== "account_not_linked");
};

/** "Twitch Drop" fallback for empty drop titles. */
export const dropTitleFallback = (item: InventoryItem): string => {
  const t = item.title?.trim();
  if (t) return t;
  return item.campaignName?.trim() || item.game || "Twitch drop";
};
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "inventoryFormatters" | head -5
# expected: empty

git add src/renderer/features/inventory/inventoryFormatters.ts
git commit -m "feat(inventory): add inventoryFormatters helpers

Drop-display helpers reused across the Phase 3 InventoryTable +
InventoryDrawer: status pill tone+label, blocking-reason text from
the hint codes, and a title fallback chain. Pure functions, no React."
```

---

## Task 3: Create `useInventoryViewState.ts` (local UI state hook)

Local state for the Phase 3 view: search text, sort, pagination, drawer-selected drop id. Lives outside `useAppModel` since these are pure UI concerns.

**Files:**
- Create: `src/renderer/features/inventory/useInventoryViewState.ts`

- [ ] **Step 1: Create the file**

```ts
import * as React from "react";
import type { DropSortKey, SortDirection } from "./inventoryFilters";

export type SortState = { key: DropSortKey; direction: SortDirection } | null;

export type InventoryViewState = {
  search: string;
  setSearch: (next: string) => void;
  sort: SortState;
  toggleSort: (key: DropSortKey) => void;
  page: number;
  setPage: (next: number) => void;
  resetPage: () => void;
  selectedDropId: string | null;
  selectDrop: (id: string | null) => void;
};

export const DEFAULT_SORT: SortState = { key: "status", direction: "asc" };

export function useInventoryViewState(): InventoryViewState {
  const [search, setSearchRaw] = React.useState<string>("");
  const [sort, setSort] = React.useState<SortState>(DEFAULT_SORT);
  const [page, setPage] = React.useState<number>(1);
  const [selectedDropId, setSelectedDropId] = React.useState<string | null>(null);

  const setSearch = React.useCallback((next: string) => {
    setSearchRaw(next);
    setPage(1);
  }, []);

  const toggleSort = React.useCallback((key: DropSortKey) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return DEFAULT_SORT;
    });
  }, []);

  const resetPage = React.useCallback(() => setPage(1), []);

  const selectDrop = React.useCallback((id: string | null) => {
    setSelectedDropId(id);
  }, []);

  return {
    search,
    setSearch,
    sort,
    toggleSort,
    page,
    setPage,
    resetPage,
    selectedDropId,
    selectDrop,
  };
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "useInventoryViewState" | head -5
# expected: empty

git add src/renderer/features/inventory/useInventoryViewState.ts
git commit -m "feat(inventory): add useInventoryViewState UI-state hook

Owns the local Inventory UI state that doesn't belong in useAppModel:
search text, sort (column + direction, cycles asc → desc → default),
pagination page index, and the drawer-selected drop id. Decoupling
it keeps the new components small and easy to test."
```

---

## Task 4: Create `InventoryFilterStrip.tsx`

Pill-based filter chips replacing the legacy `.filters-buttons` row.

**Files:**
- Create: `src/renderer/features/inventory/InventoryFilterStrip.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import type { FilterKey } from "@renderer/shared/types";
import { cn } from "@renderer/shared/lib/utils";

export type FilterChipKey = Exclude<FilterKey, "excluded">;

export type InventoryFilterStripProps = {
  filter: FilterKey;
  onFilterChange: (key: FilterKey) => void;
  counts?: Partial<Record<FilterChipKey, number>>;
};

const CHIP_DEFS: Array<{ key: FilterChipKey; label: string }> = [
  { key: "all", label: "all" },
  { key: "priority-games", label: "priority" },
  { key: "in-progress", label: "live" },
  { key: "upcoming", label: "upcoming" },
  { key: "finished", label: "claimed" },
  { key: "not-linked", label: "not linked" },
  { key: "expired", label: "expired" },
];

export function InventoryFilterStrip({
  filter,
  onFilterChange,
  counts,
}: InventoryFilterStripProps) {
  const active: FilterChipKey = filter === "excluded" ? "all" : (filter as FilterChipKey);
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Inventory filter">
      {CHIP_DEFS.map((def) => {
        const isActive = def.key === active;
        const count = counts?.[def.key];
        return (
          <button
            key={def.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onFilterChange(def.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--dp-radius-sm)] border px-2.5 py-1",
              "font-mono text-[11px] tracking-[0.02em] transition-colors",
              isActive
                ? "border-[color:var(--dp-accent-soft)] bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]"
                : "border-[color:var(--dp-border)] bg-transparent text-[color:var(--dp-text-dim)] hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text)]",
            )}
          >
            <span>{def.label}</span>
            {typeof count === "number" && (
              <span
                className={cn(
                  "font-mono text-[10px]",
                  isActive ? "text-[color:var(--dp-accent)] opacity-90" : "text-[color:var(--dp-text-dimmer)]",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "InventoryFilterStrip" | head -5
# expected: empty

git add src/renderer/features/inventory/InventoryFilterStrip.tsx
git commit -m "feat(inventory): add InventoryFilterStrip pill chips

Replaces the legacy .filters-buttons row with a mono-styled pill
chip group keyed by FilterKey. Optional per-chip count badges shown
on the right of each label. ARIA tablist semantics."
```

---

## Task 5: Create `InventoryHeader.tsx`

Title + count + search input + game-filter Select + refresh + optional bulk-link banner.

**Files:**
- Create: `src/renderer/features/inventory/InventoryHeader.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { Input } from "@renderer/shared/components/ui/input";
import { Button } from "@renderer/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";
import { Search, RotateCw, ExternalLink } from "@renderer/shared/lib/icons";

export type InventoryHeaderProps = {
  totalDrops: number;
  filteredDrops: number;
  search: string;
  onSearchChange: (next: string) => void;
  gameFilter: string;
  onGameFilterChange: (next: string) => void;
  uniqueGames: string[];
  refreshing: boolean;
  refreshDisabled: boolean;
  onRefresh: () => void;
  unlinkedCount: number;
  onOpenAccountLink: () => void;
};

export function InventoryHeader({
  totalDrops,
  filteredDrops,
  search,
  onSearchChange,
  gameFilter,
  onGameFilterChange,
  uniqueGames,
  refreshing,
  refreshDisabled,
  onRefresh,
  unlinkedCount,
  onOpenAccountLink,
}: InventoryHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[color:var(--dp-text)] leading-tight">
            Inventory
          </h2>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mt-1">
            {filteredDrops} of {totalDrops} drops
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={13}
              strokeWidth={1.7}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--dp-text-dimmer)] pointer-events-none"
            />
            <Input
              tone="dp"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="search drops…"
              className="pl-7 w-[200px]"
            />
          </div>
          <Select value={gameFilter} onValueChange={onGameFilterChange}>
            <SelectTrigger tone="dp" className="min-w-[160px]" aria-label="Filter by game">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All games</SelectItem>
                {uniqueGames.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="dp-secondary"
            size="dp-md"
            onClick={onRefresh}
            disabled={refreshDisabled}
            title="Refresh inventory"
          >
            <RotateCw
              size={11}
              strokeWidth={1.8}
              className={refreshing ? "animate-spin" : undefined}
            />
            {refreshing ? "refreshing" : "refresh"}
          </Button>
        </div>
      </div>

      {unlinkedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--dp-radius-md)] border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.06)] px-4 py-2">
          <div className="font-mono text-[11px] text-[color:var(--dp-signal-warn)]">
            {unlinkedCount} drop{unlinkedCount === 1 ? "" : "s"} need account-link
          </div>
          <Button variant="dp-outline" size="dp-sm" onClick={onOpenAccountLink}>
            <ExternalLink size={11} strokeWidth={1.8} /> link account
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "InventoryHeader" | head -5
# expected: empty

git add src/renderer/features/inventory/InventoryHeader.tsx
git commit -m "feat(inventory): add InventoryHeader with search/select/refresh

Title + 'N of M drops' counter + search input (drop-title filter) +
game Select + refresh Button. Optional bulk account-link banner
appears when one or more visible drops need linking. Replaces the
legacy .inventory-panel-head + .inventory-controls layout."
```

---

## Task 6: Create `InventoryTable.tsx`

The main dense table — sortable column headers, thumbnail column, status pill, click row → drawer.

**Files:**
- Create: `src/renderer/features/inventory/InventoryTable.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import type { InventoryItem } from "@renderer/shared/types";
import { Table, TableHead, TableRow, TableCell } from "@renderer/shared/components/ui/table";
import { Pill } from "@renderer/shared/components/ui/pill";
import { ChevronUp, ChevronDown } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import type { DropSortKey, SortDirection } from "./inventoryFilters";
import {
  dropStatusLabel,
  dropStatusTone,
  dropTitleFallback,
} from "./inventoryFormatters";
import { formatHourMinute, formatPercent } from "@renderer/features/overview/formatters";

export type InventoryTableProps = {
  items: InventoryItem[];
  sort: { key: DropSortKey; direction: SortDirection } | null;
  onToggleSort: (key: DropSortKey) => void;
  selectedDropId: string | null;
  onSelectDrop: (id: string) => void;
  emptyMessage: string;
};

type ColumnDef = {
  key: DropSortKey | null;
  label: string;
  sortable: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: null, label: "", sortable: false }, // thumbnail
  { key: "title", label: "drop · game", sortable: true },
  { key: "watched", label: "watched", sortable: true },
  { key: "progress", label: "progress", sortable: true },
  { key: "status", label: "status", sortable: true },
];

const COLUMNS_TEMPLATE = "36px 2fr 1fr 1.4fr 100px";

export function InventoryTable({
  items,
  sort,
  onToggleSort,
  selectedDropId,
  onSelectDrop,
  emptyMessage,
}: InventoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-12 text-center">
        <p className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] overflow-hidden">
      <Table columns={COLUMNS_TEMPLATE}>
        <TableHead>
          {COLUMNS.map((col, idx) => (
            <SortHeader
              key={idx}
              col={col}
              sort={sort}
              onToggleSort={onToggleSort}
            />
          ))}
        </TableHead>
        {items.map((item) => {
          const isSelected = item.id === selectedDropId;
          const progressPct =
            item.requiredMinutes > 0
              ? Math.round((item.earnedMinutes / item.requiredMinutes) * 100)
              : 0;
          const thumbUrl = item.imageUrl?.trim() || item.campaignImageUrl?.trim() || "";
          return (
            <TableRow
              key={item.id}
              interactive
              onClick={() => onSelectDrop(item.id)}
              className={isSelected ? "bg-[color:var(--dp-bg-elevated-2)]" : undefined}
            >
              <TableCell>
                <DropThumb url={thumbUrl} game={item.game} />
              </TableCell>
              <TableCell>
                <div className="truncate text-[color:var(--dp-text)]">{dropTitleFallback(item)}</div>
                <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mt-0.5 truncate">
                  {item.game || "—"}
                </div>
              </TableCell>
              <TableCell mono dim={item.earnedMinutes === 0}>
                {item.earnedMinutes > 0 ? formatHourMinute(item.earnedMinutes) : "—"}
              </TableCell>
              <TableCell>
                <ProgressCell pct={progressPct} status={item.status} />
              </TableCell>
              <TableCell>
                <Pill tone={dropStatusTone(item)} dot={item.status === "progress"}>
                  {dropStatusLabel(item)}
                </Pill>
              </TableCell>
            </TableRow>
          );
        })}
      </Table>
    </div>
  );
}

function SortHeader({
  col,
  sort,
  onToggleSort,
}: {
  col: ColumnDef;
  sort: InventoryTableProps["sort"];
  onToggleSort: InventoryTableProps["onToggleSort"];
}) {
  if (!col.sortable || !col.key) {
    return <span>{col.label}</span>;
  }
  const isActive = sort?.key === col.key;
  const dir = isActive ? sort.direction : null;
  return (
    <button
      type="button"
      onClick={() => onToggleSort(col.key!)}
      className={cn(
        "inline-flex items-center gap-1 -ml-1 px-1 py-0.5 rounded-[var(--dp-radius-xs)] transition-colors",
        "font-mono text-[9px] uppercase tracking-[0.12em]",
        isActive
          ? "text-[color:var(--dp-accent)]"
          : "text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-text-dim)]",
      )}
    >
      {col.label}
      {dir === "asc" && <ChevronUp size={10} strokeWidth={2} />}
      {dir === "desc" && <ChevronDown size={10} strokeWidth={2} />}
    </button>
  );
}

function DropThumb({ url, game }: { url: string; game: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="block w-9 h-9 rounded-[var(--dp-radius-md)] object-cover border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated-2)]"
      />
    );
  }
  // Placeholder: first 2 letters of game name in a violet-tinted square
  const initials = (game || "?").trim().slice(0, 2).toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center w-9 h-9 rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-accent-soft)] font-mono text-[10px] text-[color:var(--dp-accent)]"
    >
      {initials}
    </div>
  );
}

function ProgressCell({ pct, status }: { pct: number; status: InventoryItem["status"] }) {
  const safePct = Math.max(0, Math.min(100, pct));
  const fillColor =
    status === "claimed"
      ? "var(--dp-signal-ok)"
      : status === "progress"
        ? "var(--dp-accent)"
        : "var(--dp-text-dimmer)";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-[3px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
        <div
          className="h-full"
          style={{
            width: `${safePct}%`,
            background: fillColor,
          }}
        />
      </div>
      <span className="font-mono text-[11px] text-[color:var(--dp-text-dim)] flex-shrink-0 tabular-nums w-[34px] text-right">
        {formatPercent(safePct)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "InventoryTable" | head -5
# expected: empty

git add src/renderer/features/inventory/InventoryTable.tsx
git commit -m "feat(inventory): add InventoryTable dense-table view

Uses Phase 1 Table primitive with grid columns 36px 2fr 1fr 1.4fr
100px. Each row: thumbnail (img or game-initials fallback) / drop
title + game sub / watched hours / inline progress bar + percent /
status Pill. Sortable headers via mono-uppercase ChevronUp/Down
buttons (asc → desc → none cycle). Click row → onSelectDrop. Empty
state when items is empty."
```

---

## Task 7: Create `InventoryDrawer.tsx`

Slide-over panel for drop detail.

**Files:**
- Create: `src/renderer/features/inventory/InventoryDrawer.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import type { CampaignSummary, InventoryItem } from "@renderer/shared/types";
import { Pill } from "@renderer/shared/components/ui/pill";
import { Button } from "@renderer/shared/components/ui/button";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { X, ExternalLink, Trophy } from "@renderer/shared/lib/icons";
import {
  dropStatusLabel,
  dropStatusTone,
  dropTitleFallback,
  formatBlockingReason,
  pickDisplayBlockingReason,
} from "./inventoryFormatters";
import { formatHourMinute, formatPercent, formatRelative } from "@renderer/features/overview/formatters";

export type InventoryDrawerProps = {
  drop: InventoryItem | null;
  campaign: CampaignSummary | null;
  isPriorityGame: boolean;
  onClose: () => void;
  onOpenAccountLink: (url?: string) => void;
  onAddPriorityGame: (game: string) => void;
};

export function InventoryDrawer({
  drop,
  campaign,
  isPriorityGame,
  onClose,
  onOpenAccountLink,
  onAddPriorityGame,
}: InventoryDrawerProps) {
  // ESC to close
  React.useEffect(() => {
    if (!drop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drop, onClose]);

  if (!drop) return null;

  const progressPct =
    drop.requiredMinutes > 0
      ? Math.round((drop.earnedMinutes / drop.requiredMinutes) * 100)
      : 0;
  const thumbUrl = drop.imageUrl?.trim() || drop.campaignImageUrl?.trim() || "";
  const accountUnlinked = drop.linked === false;
  const blockingReason = pickDisplayBlockingReason(drop.blockingReasonHints, accountUnlinked);
  const blockingLabel = drop.blocked && blockingReason ? formatBlockingReason(blockingReason) : null;
  const showAddPriority = Boolean(drop.game?.trim()) && !isPriorityGame;
  const showLinkAction = accountUnlinked || (drop.blockingReasonHints ?? []).includes("account_not_linked");

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] cursor-default"
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Drop details"
        className="fixed right-0 top-0 bottom-0 z-50 w-[400px] max-w-full bg-[color:var(--dp-bg-elevated)] border-l border-[color:var(--dp-border)] shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--dp-border-soft)]">
          <SectionLabel inline>drop details</SectionLabel>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] hover:bg-[color:var(--dp-bg-elevated-2)] hover:text-[color:var(--dp-text)] transition-colors"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex gap-3 items-start mb-4">
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt=""
                loading="lazy"
                className="block w-16 h-16 rounded-[var(--dp-radius-md)] object-cover border border-[color:var(--dp-border)] flex-shrink-0"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex items-center justify-center w-16 h-16 rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-accent-soft)] flex-shrink-0"
              >
                <Trophy size={20} strokeWidth={1.5} className="text-[color:var(--dp-accent)]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium text-[color:var(--dp-text)] mb-0.5">
                {dropTitleFallback(drop)}
              </div>
              <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mb-2">
                {drop.game || "—"}
              </div>
              <Pill tone={dropStatusTone(drop)} dot={drop.status === "progress"}>
                {dropStatusLabel(drop)}
              </Pill>
            </div>
          </div>

          {/* Progress */}
          <div className="mb-5">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mb-1.5">
              progress
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-[4px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, progressPct))}%`,
                    background:
                      drop.status === "claimed"
                        ? "var(--dp-signal-ok)"
                        : "var(--dp-accent)",
                  }}
                />
              </div>
              <span className="font-mono text-[11px] text-[color:var(--dp-text)] tabular-nums">
                {formatPercent(progressPct)}
              </span>
            </div>
            <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
              {formatHourMinute(drop.earnedMinutes)} watched · {drop.requiredMinutes > 0 ? formatHourMinute(drop.requiredMinutes) : "—"} required
            </div>
          </div>

          {blockingLabel && (
            <div className="mb-5 rounded-[var(--dp-radius-md)] border border-[rgba(248,113,113,0.20)] bg-[rgba(248,113,113,0.08)] px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--dp-signal-err)] mb-1">
                blocked
              </div>
              <div className="text-[12px] text-[color:var(--dp-text)]">{blockingLabel}</div>
            </div>
          )}

          {/* Campaign */}
          {campaign && (
            <div className="mb-5">
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mb-1.5">
                campaign
              </div>
              <div className="text-[13px] text-[color:var(--dp-text)] mb-0.5">{campaign.name}</div>
              {campaign.startsAt && (
                <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                  starts {formatRelative(Date.parse(campaign.startsAt))}
                </div>
              )}
              {campaign.endsAt && (
                <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                  ends {formatRelative(Date.parse(campaign.endsAt))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 mt-6">
            {showLinkAction && (
              <Button
                variant="dp-primary"
                size="dp-md"
                onClick={() => onOpenAccountLink(campaign?.accountLinkUrl)}
                title={campaign?.accountLinkUrl}
              >
                <ExternalLink size={11} strokeWidth={1.8} /> link account
              </Button>
            )}
            {showAddPriority && drop.game && (
              <Button
                variant="dp-outline"
                size="dp-md"
                onClick={() => onAddPriorityGame(drop.game.trim())}
              >
                add {drop.game} to priorities
              </Button>
            )}
            {!showLinkAction && !showAddPriority && (
              <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] text-center py-2">
                no actions available
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "InventoryDrawer" | head -5
# expected: empty

git add src/renderer/features/inventory/InventoryDrawer.tsx
git commit -m "feat(inventory): add InventoryDrawer slide-over for drop detail

Right-side 400px drawer with: thumbnail + title + game + status pill,
progress bar, blocking-reason banner when applicable, campaign block
(name + start/end), action buttons (link account, add to priorities).
Backdrop click + ESC close. ARIA dialog semantics."
```

---

## Task 8: Rewrite `InventoryView.tsx`

Final composition. Re-exports legacy helpers so `InventoryView.test.ts` keeps passing.

**Files:**
- Modify: `src/renderer/features/inventory/InventoryView.tsx` (full rewrite)

- [ ] **Step 1: Replace the file contents**

```tsx
import * as React from "react";
import type {
  CampaignSummary,
  FilterKey,
  InventoryItem,
  InventoryState,
} from "@renderer/shared/types";
import { Button } from "@renderer/shared/components/ui/button";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";
import { useI18n } from "@renderer/shared/i18n";
import {
  createPriorityGameSet,
  getCampaignPhase,
  shouldDisplayDropEntry,
  compareDropsByKey,
  type CampaignLookup,
} from "./inventoryFilters";
import { useInventoryViewState } from "./useInventoryViewState";
import { InventoryHeader } from "./InventoryHeader";
import { InventoryFilterStrip } from "./InventoryFilterStrip";
import { InventoryTable } from "./InventoryTable";
import { InventoryDrawer } from "./InventoryDrawer";

// Re-export legacy helpers for InventoryView.test.ts (back-compat)
export {
  shouldDisplayCampaignEntry,
  createPriorityGameSet,
  isCampaignInPriorityGames,
  compareCampaignDropsByDuration,
} from "./inventoryFilters";

const PAGE_SIZE = 25;

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
  isLinked,
  allowUnlinkedGames,
  priorityGames,
  onAddPriorityGame,
  onOpenAccountLink,
}: InventoryProps) {
  const { t } = useI18n();
  const state = useInventoryViewState();

  const allItems: InventoryItem[] = React.useMemo(() => {
    if (inventory.status === "ready") return inventory.items;
    if (inventory.status === "error" && inventory.items) return inventory.items;
    return [];
  }, [inventory]);

  const campaignsById = React.useMemo(() => {
    const map = new Map<string, CampaignSummary>();
    for (const c of campaigns) {
      if (c.id) map.set(c.id, c);
    }
    return map;
  }, [campaigns]);

  const campaignLinkMap = React.useMemo(() => {
    const map = new Map<string, { anyTrue: boolean; anyFalse: boolean }>();
    for (const item of allItems) {
      const id = item.campaignId?.trim();
      if (!id) continue;
      const entry = map.get(id) ?? { anyTrue: false, anyFalse: false };
      if (item.linked === true) entry.anyTrue = true;
      if (item.linked === false) entry.anyFalse = true;
      map.set(id, entry);
    }
    return map;
  }, [allItems]);

  const campaignLookup: CampaignLookup = React.useMemo(
    () => ({
      byId: (id) => (id ? campaignsById.get(id) ?? null : null),
      isUnlinked: (campaign) => {
        const id = campaign.id?.trim();
        if (id) {
          const entry = campaignLinkMap.get(id);
          if (entry?.anyTrue) return false;
          if (entry?.anyFalse) return true;
        }
        return campaign.isAccountConnected === false;
      },
    }),
    [campaignsById, campaignLinkMap],
  );

  const priorityGameSet = React.useMemo(
    () => createPriorityGameSet(priorityGames),
    [priorityGames],
  );

  // Apply filters + search
  const filteredItems = React.useMemo(() => {
    const normalizedFilter: FilterKey = filter === "excluded" ? "all" : filter;
    const searchLower = state.search.trim().toLowerCase();
    return allItems.filter((item) => {
      if (
        !shouldDisplayDropEntry(item, {
          normalizedFilter,
          priorityGameSet,
          gameFilter,
          campaignLookup,
        })
      ) {
        return false;
      }
      if (searchLower) {
        const title = (item.title ?? "").toLowerCase();
        const game = (item.game ?? "").toLowerCase();
        if (!title.includes(searchLower) && !game.includes(searchLower)) return false;
      }
      return true;
    });
  }, [allItems, filter, gameFilter, priorityGameSet, campaignLookup, state.search]);

  // Apply sort
  const sortedItems = React.useMemo(() => {
    if (!state.sort) return filteredItems;
    const { key, direction } = state.sort;
    return [...filteredItems].sort((a, b) => compareDropsByKey(a, b, key, direction));
  }, [filteredItems, state.sort]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const currentPage = Math.min(state.page, totalPages);
  const paginatedItems = React.useMemo(
    () => sortedItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sortedItems, currentPage],
  );

  // Reset page when filters change
  React.useEffect(() => {
    state.resetPage();
  }, [filter, gameFilter, state.resetPage]);

  // Unlinked count for header banner
  const unlinkedCount = React.useMemo(() => {
    return filteredItems.filter((item) => {
      const campaign = campaignLookup.byId(item.campaignId);
      if (!campaign) return false;
      if (!campaignLookup.isUnlinked(campaign)) return false;
      return !allowUnlinkedGames;
    }).length;
  }, [filteredItems, campaignLookup, allowUnlinkedGames]);

  // Selected drop + its campaign (for drawer)
  const selectedDrop = React.useMemo(
    () => (state.selectedDropId ? allItems.find((i) => i.id === state.selectedDropId) ?? null : null),
    [allItems, state.selectedDropId],
  );
  const selectedCampaign = selectedDrop
    ? campaignLookup.byId(selectedDrop.campaignId)
    : null;
  const selectedIsPriority = selectedDrop
    ? priorityGameSet.has((selectedDrop.game ?? "").trim().toLowerCase())
    : false;

  // Error / empty states
  const inventoryErrorText =
    inventory.status === "error"
      ? resolveErrorMessage(t, { code: inventory.code, message: inventory.message })
      : null;

  const isLoading = inventory.status === "loading";
  const emptyMessage = !isLinked
    ? "Sign in to see your inventory."
    : isLoading
      ? "Loading drops…"
      : sortedItems.length === 0 && allItems.length > 0
        ? "No drops match the current filter."
        : "No drops in inventory yet.";

  return (
    <div className="flex flex-col gap-5">
      <InventoryHeader
        totalDrops={allItems.length}
        filteredDrops={sortedItems.length}
        search={state.search}
        onSearchChange={state.setSearch}
        gameFilter={gameFilter}
        onGameFilterChange={onGameFilterChange}
        uniqueGames={uniqueGames}
        refreshing={refreshing}
        refreshDisabled={refreshing || isLoading}
        onRefresh={onRefresh}
        unlinkedCount={unlinkedCount}
        onOpenAccountLink={() => onOpenAccountLink()}
      />

      <InventoryFilterStrip filter={filter} onFilterChange={onFilterChange} />

      <InventoryTable
        items={paginatedItems}
        sort={state.sort}
        onToggleSort={state.toggleSort}
        selectedDropId={state.selectedDropId}
        onSelectDrop={state.selectDrop}
        emptyMessage={emptyMessage}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between font-mono text-[11px] text-[color:var(--dp-text-dim)]">
          <Button
            variant="dp-ghost"
            size="dp-sm"
            onClick={() => state.setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            prev
          </Button>
          <span>
            page {currentPage} / {totalPages}
          </span>
          <Button
            variant="dp-ghost"
            size="dp-sm"
            onClick={() => state.setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            next
          </Button>
        </div>
      )}

      {inventoryErrorText && (
        <div className="rounded-[var(--dp-radius-md)] border border-[rgba(248,113,113,0.30)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-[12px] text-[color:var(--dp-signal-err)]">
          {inventoryErrorText}
        </div>
      )}

      <InventoryDrawer
        drop={selectedDrop}
        campaign={selectedCampaign}
        isPriorityGame={selectedIsPriority}
        onClose={() => state.selectDrop(null)}
        onOpenAccountLink={onOpenAccountLink}
        onAddPriorityGame={onAddPriorityGame}
      />
    </div>
  );
}
```

Note: the destructure drops `campaignsLoading` from the props since the new view derives loading purely from `inventory.status`. The prop stays in the type for back-compat with `useAppModel.inventoryProps`.

- [ ] **Step 2: Verify the existing test suite still passes**

Run: `npm test 2>&1 | tail -10`

Expected: 214/214 pass. The `InventoryView.test.ts` imports `shouldDisplayCampaignEntry`, `createPriorityGameSet`, `isCampaignInPriorityGames`, `compareCampaignDropsByDuration` from `"./InventoryView"` — these are now re-exported from `inventoryFilters.ts` via the top-of-file `export { ... }` block, so the test imports resolve to the same functions.

- [ ] **Step 3: tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "InventoryView" | head -10
# expected: empty (or only pre-existing errors, none new)

git add src/renderer/features/inventory/InventoryView.tsx
git commit -m "feat(inventory): rewrite InventoryView as dense-table composition

Replaces the 754-line campaign-card-grid layout with the Phase 3
drop-level dense Table. Composition: InventoryHeader (search,
game-select, refresh, bulk-link banner) + InventoryFilterStrip
(pill chips) + InventoryTable (sortable columns, click row →
drawer) + pagination (25 drops/page) + InventoryDrawer (drop
detail + campaign + actions).

Re-exports legacy filter helpers (shouldDisplayCampaignEntry, etc.)
from inventoryFilters.ts so InventoryView.test.ts continues to pass
without changes.

Drops the legacy expand-to-see-drops campaign card pattern. Campaign
context now surfaces in the per-drop drawer instead. Bulk
account-link banner replaces the per-campaign link buttons."
```

---

## Task 9: Verify end-to-end

- [ ] **Step 1: Lint**

Run: `npm run lint`

Expected: exit 0. Phase 1+2 pre-existing warnings (3-4 in legacy files) acceptable. New warnings introduced by Phase 3 must be fixed.

- [ ] **Step 2: TypeScript**

Run: `npx tsc --noEmit -p tsconfig.json`

Expected: pre-existing errors only. New errors in Phase 3 files must be fixed.

- [ ] **Step 3: Tests**

Run: `npm test 2>&1 | tail -10`

Expected: all 214 tests pass.

- [ ] **Step 4: Format**

Run: `npm run format`

Commit if anything reformatted:
```bash
git diff --quiet || (git add -A && git commit -m "chore: prettier format design-overhaul phase 3 files")
```

- [ ] **Step 5: Build**

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 6: Branch summary**

Run: `git log --oneline feat/design-overhaul-phase-2-overview..HEAD`

Expected: 8 commits (plus possibly a format commit = 9). The commits in order:
- feat(inventory): extract filters/sort into inventoryFilters module
- feat(inventory): add inventoryFormatters helpers
- feat(inventory): add useInventoryViewState UI-state hook
- feat(inventory): add InventoryFilterStrip pill chips
- feat(inventory): add InventoryHeader with search/select/refresh
- feat(inventory): add InventoryTable dense-table view
- feat(inventory): add InventoryDrawer slide-over for drop detail
- feat(inventory): rewrite InventoryView as dense-table composition
- (chore: prettier format if needed)

Phase 3 is complete when all 6 verification steps pass. Phase 4 (Priorities + Control views migration) is the next plan.

---

## Out of Scope

- Per-stream viewer counts in the table (no data source)
- Row virtualization (pagination at 25/page is adequate for typical inventories)
- Drawer URL-state / deep-linking (local state only this phase)
- Inventory action wiring: "claim now" inside the drawer is not added in Phase 3 (claim flow lives in the existing claim engine; surfacing it here is a Phase 4-or-later concern)
- Campaign-level "expand all drops" interaction — superseded by drop-level rows; obsolete
- i18n for new strings ("inventory", "live", "queued", "all", "of N drops", etc.) — kept English-only this phase; Phase 6 surveys for i18n
- Deleting legacy InventoryView CSS classes (`.campaign-card`, `.campaign-drop-*`, `.inventory-controls`, etc.) — deferred to Phase 6 cleanup

## Open items for follow-up

- **i18n coverage** — the new Inventory strings are English-only. Phase 6 should wrap them with `t()`.
- **Drawer trap-focus** — the drawer doesn't trap keyboard focus inside itself when open. Acceptable for now; add `react-focus-lock` or equivalent in a polish pass.
- **Filter chip counts** — `InventoryFilterStrip` accepts a `counts` prop but `InventoryView` doesn't populate it. Compute and pass through if it would improve UX.
- **Backdrop click on touch devices** — confirm `<button>`-based backdrop is touch-friendly.
- **Sort persistence** — sort resets on view unmount. Acceptable; persist in localStorage in a future polish pass.
- **Header search** searches title+game; future: campaign name, blocking reasons, drop instance id.
