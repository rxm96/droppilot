# Design Overhaul — Phase 2: Chrome Swap + Overview Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap App.tsx top-level chrome (legacy `TitleBar` + `Hero` + `TopNav` inside `AppContent`) for the Phase 1 chrome (`Titlebar` + `AppNav` + `Statusbar`), and rebuild `OverviewView` from generic-shadcn layout to the Pro Console pattern (`HeroPanel` + `QueuePanel` + `ActivityPanel` + `EnginePanel` + `AttentionStrip`).

**Architecture:** App.tsx becomes the bridge: existing `useAppModel` state continues to drive everything, but new mapping logic (inline in App.tsx, no new hook for now) translates legacy prop shapes (`titleBarProps`, `navProps`, `heroProps`) into the new chrome prop shapes (`TitlebarProps`, `AppNavProps`, `StatusbarProps`). `OverviewView` keeps its existing prop interface so `useAppModel.overviewProps` stays as-is; the internals get gutted and rebuilt as a composition of five new panel components, all rendered with `--dp-*` tokens and Phase 1 primitives. Legacy components (`Hero.tsx`, `TitleBar.tsx`, `TopNav.tsx`) remain on disk as dead code; they're deleted in Phase 6's cleanup pass.

**Tech Stack:** React 19, Tailwind 4 CSS-first tokens, Phase 1 primitives (Button, Pill, SectionLabel, Stat, FeedItem, Table, Card+CardAction), Phase 1 chrome (Titlebar, AppNav, Statusbar), `lucide-react` icons.

**Spec reference:** [`../specs/2026-05-27-design-overhaul-design.md`](../specs/2026-05-27-design-overhaul-design.md) (§3 tokens, §5 primitives, §6 chrome, §7.1 Overview)

**Branch:** `feat/design-overhaul-phase-2-overview` (stacked on `feat/design-overhaul`)

**PR target:** `feat/design-overhaul` (will auto-retarget to `main` after PR #20 merges)

### Locked design decisions (from brainstorming for Phase 2)

1. **Scope:** Chrome swap + Overview redesign in one PR (coherent unit).
2. **Feature trade-offs:** Keep `AttentionStrip` (claimable / watch-error / no-channels / tracker-status warnings — restyled as Pills). Drop the existing Overview's stats trend section (totalMinutes / totalClaims / lastGame), top-games breakdown, and campaign landscape — they were exploratory dashboards rather than operational, and the existing "Stats reset" action moves to Settings in Phase 5.
3. **Engine rail visualization** (the current Hero's standby/scan/watch/recover/hold rail) — drops from Overview entirely; Phase 4 (Control view) will reintroduce a similar visualization.
4. **Logged-out experience:** For this phase, when `auth.status !== "ok"`, AppNav shows a "Sign in" pill button in its `right` slot. A dedicated `LoginView` is out of scope (future refinement). Overview still renders; data panels show empty states.

### Deviations from spec (intentional, scoped to Phase 2)

1. **Spec §7.1 Overview hero stat-grid** lists `eta / viewers / next claim / session` — but the existing app does not collect per-stream viewer counts at the renderer layer, and "session" overlaps with stats data. Phase 2 ships a pragmatic 4-stat grid: `eta / channels found / claims ready / open drops`. The `viewers` and `session` fields can be added in a later phase when the data source is wired.
2. **Spec §7.1 Queue table** lists `rank / game·channel / drop / eta / viewers / status` — same viewer-count constraint. Phase 2 ships `rank / drop·game / watched / progress / status` (no per-row channel, no viewers).
3. **Spec §7.1 Activity feed** specifies "claim / switch / recovery" events. The existing app has no live event log — only the inventory's claimed items. Phase 2 derives feed items from inventory state (recently-claimed drops, top 5, with ISO timestamps where available). A proper event log is a future addition.
4. **AppContent restructure:** The legacy `AppContent` renders `<TopNav>` followed by the active view. Phase 2 strips `TopNav` from `AppContent` and renders `AppNav` at the App.tsx layer instead. `AppContent` becomes a slim view-router wrapper.

---

## File Structure

**New files:**
- `src/renderer/features/overview/HeroPanel.tsx` — top hero with live state + 4-stat grid + progress + quick actions
- `src/renderer/features/overview/QueuePanel.tsx` — dense table of upcoming non-claimed drops
- `src/renderer/features/overview/ActivityPanel.tsx` — feed of recently-claimed drops
- `src/renderer/features/overview/EnginePanel.tsx` — mono key/value pairs for engine status
- `src/renderer/features/overview/AttentionStrip.tsx` — pill row of warnings/alerts
- `src/renderer/features/overview/formatters.ts` — small shared formatting helpers extracted from the rewrite

**Modified files:**
- `src/renderer/app.css` — add `--dp-accent-hover` color token (light + dark)
- `src/renderer/shared/components/ui/button.tsx` — replace `#b89bff` hardcode with `var(--dp-accent-hover)` in `dp-primary` variant
- `src/renderer/features/overview/OverviewView.tsx` — full rewrite as a composition of the five new panels
- `src/renderer/features/overview/index.ts` — barrel may add the new sub-panel re-exports (optional)
- `src/renderer/App.tsx` — render `Titlebar` + `AppNav` + `AppContent` + `Statusbar`; remove `Hero` and old `TitleBar` rendering; add mapping logic for new chrome prop shapes
- `src/renderer/shared/components/AppContent.tsx` — remove `<TopNav>` rendering; component becomes a slim view-router

**Untouched (intentionally):**
- `src/renderer/shared/components/Hero.tsx`, `TitleBar.tsx`, `TopNav.tsx` — kept on disk; Phase 6 cleanup deletes them
- `src/renderer/shared/components/UpdateOverlay.tsx` — stays as-is, rendered by App.tsx unchanged
- `src/renderer/shared/hooks/app/useAppModel.ts` — no changes; new chrome consumes existing model output via App.tsx mapping
- `src/renderer/features/{inventory,priority,control,settings,debug}/*` — unchanged (touched in later phases)
- All Phase 1 primitives and chrome components — used as-is

---

## Data Mapping Reference (for implementer context)

This is the source of truth for which existing `useAppModel` field feeds which new chrome / panel slot. Implementers consult it instead of guessing.

### Titlebar
| Titlebar prop | Source |
| --- | --- |
| `title` | hardcoded `"droppilot"` |
| `version` | `titleBarProps.version` (the existing model already provides `appVersion`) |
| `theme` | `titleBarProps.theme` (typed as `"light" \| "dark" \| "system"` — coerce to `"light"`/`"dark"` for Titlebar; treat `"system"` as the resolved current value, easiest via reading `document.documentElement.classList.contains("dark")`) |
| `onThemeToggle` | `() => titleBarProps.setTheme(current => current === "dark" ? "light" : "dark")` (skip the system tristate for simplicity) |
| `onSettingsClick` | `() => navProps.setView("settings")` |
| `connectionState` | `trackerStatus.connectionState === "connected"` → `"connected"` / `"connecting"` → `"connecting"` / else → `"disconnected"` |
| `apiLatencyMs` | omitted for Phase 2 (no current source) |
| `onWindowAction` | `(action) => window.electronAPI.app.windowControl(action)` (same as the legacy `TitleBar.tsx` `handle()` function) |

### AppNav
| AppNav prop | Source |
| --- | --- |
| `view` | `navProps.view` |
| `onChange` | `navProps.setView` |
| `items` | derived from `t("nav.overview")` etc. — see Task 8 |
| `right` | session indicator: if `navProps.auth.status === "ok"` and `navProps.profile.status === "ready"`, show "shroud ● logged in" (using `profile.displayName`); else show a small `<Button variant="dp-primary" size="dp-sm">sign in</Button>` calling `navProps.startLogin` |

### Statusbar
| Statusbar slot | Source |
| --- | --- |
| `left[0]` | `{ tone: engineRunningTone, label: "engine: " + decisionLabel }` — derive `decisionLabel` from `watchEngineSnapshot.decision` (a simple lookup, similar to `mapOverviewWatchStateLabel` in the existing Overview but condensed) |
| `left[1]` | `{ label: "drops · " + claimedDrops + "/" + totalDrops }` (overview model has these) |
| `left[2]` | `{ label: "last sync · " + formatTime(lastWatchOk) }` |
| `right` | `[{ label: "v" + appVersion }, { label: "⌘K" }]` — `⌘K` is a placeholder for future command palette; render but no handler |

### Overview panels

**HeroPanel** consumes the existing `overviewProps` directly. Fields used:
- `activeGame`, `activeDropTitle`, `activeDropEta`, `activeDropRemainingMinutes`
- `targetProgress`
- `claimableDrops`, `channelsCount`, `totalDrops`, `claimedDrops`
- `lastWatchOk`, `watchDecision`, `watchSuppressionReason`

4-stat grid:
1. `eta` — `formatRemainingFromEta(activeDropEta, activeDropRemainingMinutes)` (e.g., `"02:14:38"` or `"--"`). Accent.
2. `channels` — `channelsCount` (no sub).
3. `claims ready` — `claimableDrops` (sub `"auto-claim on"` if applicable, signal-ok tone).
4. `open drops` — `Math.max(0, totalDrops - claimedDrops)`.

Quick actions row:
- `claim now` (primary) — disabled if `claimableDrops === 0`; on click, calls a no-op for Phase 2 (the actual claim action is part of inventory; surfacing it from Overview requires plumbing not in scope). Leave `onClick={undefined}` and a `title="Use Inventory view to claim"` tooltip for now.
- `pause` (secondary) — same no-op deferral.
- `switch target` (outline) — same no-op deferral.

Acceptable: panel renders correctly with live data, but the action buttons are visual-only this phase. A follow-up wires them in Phase 4 (Control).

**QueuePanel** consumes `overviewProps.inventory.items` filtered to `status !== "claimed"`, sorted by `requiredMinutes - earnedMinutes` ascending, top 8 items. Each row: `rank` (mono `01`-padded) / `drop title` over `game` (mono dim sub) / `watched` (mono `Xh YYm`) / `progress` (mono `NN%`) / `status` Pill (`live` if `status === "progress"`, `dim` if `"locked"`).

**ActivityPanel** consumes `overviewProps.inventory.items` filtered to `status === "claimed"`, slice top 5. Each FeedItem: tone `ok`, icon `<Check />`, msg `"Claimed " + <strong>{item.title}</strong>`, meta `item.game + " · " + formatRelativeTime(item.claimedAt ?? null)` (use `"recently"` if no timestamp). Empty state: a single dimmed line "No claims yet".

**EnginePanel** consumes a small subset:
- `watch_cycle` — fixed `"30s"` text for Phase 2 (existing model doesn't expose the actual cadence here; revisit in Settings phase)
- `last_refresh` — `formatRelative(lastWatchOk)` e.g. `"8s ago"`
- `cadence` — same `"30s"` (duplicate of cycle; revisit later)
- `uptime` — derive from `Date.now() - sessionStart`, where `sessionStart = useRef(Date.now()).current` in the panel. Display `"Xh YYm"`.

**AttentionStrip** consumes `overviewProps` and emits an array of pills:
- if `claimableDrops > 0`: `<Pill tone="warn" dot>{claimableDrops} claim ready</Pill>`
- if `watchError`: `<Pill tone="err" dot>watch error</Pill>` (title attribute with message)
- if `activeGame && channelsCount === 0`: `<Pill tone="warn">no channels</Pill>`
- if `trackerStatus?.connectionState && trackerStatus.connectionState !== "connected" && trackerStatus.connectionState !== "connecting"`: `<Pill tone="err" dot>tracker disconnected</Pill>`
- empty: render nothing (don't reserve space)

---

## Task 1: Add `--dp-accent-hover` token

Pre-Phase-2 cleanup from Phase 1's open items list. The Button `dp-primary` variant currently uses a hardcoded `#b89bff` hover color; introduce the proper token now so subsequent tasks have it available.

**Files:**
- Modify: `src/renderer/app.css`

- [ ] **Step 1: Add token to dark + light blocks**

Find the `:root { /* Dark surfaces — primary mode for the overhaul */ ... }` block (around line 261). Locate `--dp-accent-glow: rgba(167, 139, 250, 0.4);`. Insert immediately after it:

```css
  --dp-accent-hover: #b89bff;
```

Then find the `:root:not(.dark) { ... }` block. Locate `--dp-accent-glow: rgba(124, 95, 230, 0.25);`. Insert immediately after it:

```css
  --dp-accent-hover: #9170db;
```

(Light-mode hover is a slightly darker shade of the light accent `#7c5fe6`.)

- [ ] **Step 2: Bind to Tailwind via `@theme`**

In the existing `@theme { ... }` block (lines 7–63), find the `--color-dp-accent-glow: var(--dp-accent-glow);` line. Insert immediately after it:

```css
  --color-dp-accent-hover: var(--dp-accent-hover);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app.css
git commit -m "feat(tokens): add --dp-accent-hover for design-overhaul

Replaces the hardcoded #b89bff in Button dp-primary's hover state
with a proper token (dark: #b89bff lighter, light: #9170db darker).
Bound to @theme so Tailwind utilities like bg-dp-accent-hover work."
```

---

## Task 2: Update Button `dp-primary` to use `--dp-accent-hover`

**Files:**
- Modify: `src/renderer/shared/components/ui/button.tsx`

- [ ] **Step 1: Replace the hardcode**

Find the `dp-primary` variant string. Currently:
```ts
"dp-primary":
  "bg-[var(--dp-accent)] text-[#0a0b0d] font-semibold hover:bg-[#b89bff] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
```

Replace `hover:bg-[#b89bff]` with `hover:bg-[var(--dp-accent-hover)]`. The full new line:

```ts
"dp-primary":
  "bg-[var(--dp-accent)] text-[#0a0b0d] font-semibold hover:bg-[var(--dp-accent-hover)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
```

Leave all other variants byte-identical.

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "button.tsx" | head -5`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/components/ui/button.tsx
git commit -m "refactor(ui): Button dp-primary uses --dp-accent-hover token

Drops the #b89bff hardcode in favour of the new --dp-accent-hover
token. Resolves the Phase 1 quality-review note about token system
consistency."
```

---

## Task 3: Create `formatters.ts` helper module

A small set of formatting helpers reused across the new Overview panels. Single file, no React, no state.

**Files:**
- Create: `src/renderer/features/overview/formatters.ts`

- [ ] **Step 1: Create the file**

```ts
// Shared formatting helpers for the Phase 2 Overview panels.
// No React imports — pure functions.

export function formatRemainingFromEta(
  eta: number | null | undefined,
  fallbackMinutes: number | undefined,
): string {
  const hasEta = typeof eta === "number" && Number.isFinite(eta);
  if (hasEta) {
    const remaining = Math.max(0, Math.ceil((eta - Date.now()) / 1000));
    return formatHMS(remaining);
  }
  if (typeof fallbackMinutes === "number" && Number.isFinite(fallbackMinutes)) {
    return formatHMS(Math.max(0, Math.ceil(fallbackMinutes * 60)));
  }
  return "--";
}

export function formatHMS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatHourMinute(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${pad(m)}m`;
}

export function formatPercent(n: number): string {
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

export function formatRelative(timestamp: number | null | undefined, now: number = Date.now()): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "--";
  const diff = Math.max(0, now - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatUptime(sinceMs: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - sinceMs);
  const totalMinutes = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${pad(m)}m`;
}

export function padRank(n: number, width: number = 2): string {
  return String(Math.max(0, Math.floor(n))).padStart(width, "0");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
```

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "formatters.ts" | head -5`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/overview/formatters.ts
git commit -m "feat(overview): add formatters helper module

Pure-function timing/percent formatters reused across the new Phase 2
Overview panels (HeroPanel, QueuePanel, ActivityPanel, EnginePanel)."
```

---

## Task 4: Create `HeroPanel.tsx`

The big "currently watching" panel at the top of Overview.

**Files:**
- Create: `src/renderer/features/overview/HeroPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { Stat } from "@renderer/shared/components/ui/stat";
import { Button } from "@renderer/shared/components/ui/button";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Check, Pause, RotateCw } from "@renderer/shared/lib/icons";
import {
  formatRemainingFromEta,
  formatPercent,
} from "./formatters";

export type HeroPanelProps = {
  activeGame?: string;
  activeDropTitle?: string;
  activeDropEta?: number | null;
  activeDropRemainingMinutes?: number;
  targetProgress: number;
  claimableDrops: number;
  channelsCount: number;
  totalDrops: number;
  claimedDrops: number;
  isLive: boolean;
};

export function HeroPanel({
  activeGame,
  activeDropTitle,
  activeDropEta,
  activeDropRemainingMinutes,
  targetProgress,
  claimableDrops,
  channelsCount,
  totalDrops,
  claimedDrops,
  isLive,
}: HeroPanelProps) {
  const etaText = formatRemainingFromEta(activeDropEta, activeDropRemainingMinutes);
  const progressPct = Math.max(0, Math.min(100, Math.round(targetProgress)));
  const openDrops = Math.max(0, totalDrops - claimedDrops);
  const hasClaimable = claimableDrops > 0;
  const title = activeDropTitle?.trim() || activeGame || "No active target";
  const channel = activeGame || "—";

  return (
    <div>
      <SectionLabel>currently watching</SectionLabel>
      <div
        className="mt-3 relative overflow-hidden rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-6"
      >
        {/* Top-right radial glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 h-[220px] w-[320px]"
          style={{
            background:
              "radial-gradient(ellipse at top right, rgba(167,139,250,0.10), transparent 65%)",
          }}
        />

        {/* Eyebrow + meta */}
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--dp-accent)]">
            <span
              aria-hidden="true"
              className={`inline-block h-[6px] w-[6px] rounded-full bg-[color:var(--dp-accent)] ${isLive ? "animate-pulse" : "opacity-40"}`}
              style={{ boxShadow: "0 0 10px var(--dp-accent-glow)" }}
            />
            {isLive ? "LIVE · earning drop" : "IDLE"}
          </div>
        </div>

        {/* Title */}
        <h1 className="text-[26px] font-medium tracking-[-0.02em] leading-[1.1] mt-1.5 mb-0.5 text-[color:var(--dp-text)]">
          {title}
        </h1>
        <div className="font-mono text-[12px] text-[color:var(--dp-text-dim)] mb-[22px]">
          {channel}
        </div>

        {/* Stat grid */}
        <div
          className="grid gap-0 border-t border-[color:var(--dp-border-soft)] pt-[18px]"
          style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}
        >
          <div className="pr-4">
            <Stat
              label="eta"
              value={etaText}
              sub={`${progressPct}% complete`}
              accent
            />
            <div className="mt-2.5 h-[3px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
              <div
                className="h-full rounded-[2px]"
                style={{
                  width: `${progressPct}%`,
                  background:
                    "linear-gradient(90deg, var(--dp-accent), #c4b5fd)",
                  boxShadow: "0 0 12px var(--dp-accent-glow)",
                }}
              />
            </div>
          </div>
          <div className="px-[18px] border-l border-[color:var(--dp-border-soft)]">
            <Stat label="channels" value={String(channelsCount)} />
          </div>
          <div className="px-[18px] border-l border-[color:var(--dp-border-soft)]">
            <Stat
              label="claims ready"
              value={String(claimableDrops)}
              sub={hasClaimable ? "use inventory" : undefined}
              subTone={hasClaimable ? "ok" : "default"}
            />
          </div>
          <div className="px-[18px] border-l border-[color:var(--dp-border-soft)]">
            <Stat label="open drops" value={String(openDrops)} />
          </div>
        </div>

        {/* Quick actions row */}
        <div className="flex gap-2 mt-4">
          <Button variant="dp-primary" size="dp-md" disabled={!hasClaimable} title="Use Inventory view to claim">
            <Check size={11} strokeWidth={2.2} /> claim now
          </Button>
          <Button variant="dp-secondary" size="dp-md" disabled title="Phase 4 will wire this">
            <Pause size={11} strokeWidth={1.8} /> pause
          </Button>
          <Button variant="dp-outline" size="dp-md" disabled title="Phase 4 will wire this">
            <RotateCw size={11} strokeWidth={1.8} /> switch target
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "HeroPanel" | head -5`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/overview/HeroPanel.tsx
git commit -m "feat(overview): add HeroPanel for new Overview design

Sans title + mono channel sub + 4-stat grid + violet progress bar
+ quick-action row. Stats: eta (accent) / channels / claims ready /
open drops. Claim/pause/switch buttons are visual placeholders for
Phase 2 — Phase 4 (Control view) wires the actions."
```

---

## Task 5: Create `QueuePanel.tsx`

Dense table of upcoming non-claimed drops.

**Files:**
- Create: `src/renderer/features/overview/QueuePanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardAction,
} from "@renderer/shared/components/ui/card";
import { Table, TableHead, TableRow, TableCell } from "@renderer/shared/components/ui/table";
import { Pill } from "@renderer/shared/components/ui/pill";
import type { InventoryItem } from "@renderer/shared/types";
import { formatHourMinute, formatPercent, padRank } from "./formatters";

export type QueuePanelProps = {
  items: InventoryItem[];
  onManageClick?: () => void;
  maxRows?: number;
};

export function QueuePanel({ items, onManageClick, maxRows = 8 }: QueuePanelProps) {
  const queued = React.useMemo(() => {
    return items
      .filter((it) => it.status !== "claimed")
      .sort((a, b) => {
        const remA = Math.max(0, a.requiredMinutes - a.earnedMinutes);
        const remB = Math.max(0, b.requiredMinutes - b.earnedMinutes);
        return remA - remB;
      })
      .slice(0, maxRows);
  }, [items, maxRows]);

  return (
    <Card className="bg-[color:var(--dp-bg-elevated)] border-[color:var(--dp-border)] rounded-[var(--dp-radius-lg)]">
      <CardHeader className="flex flex-row items-center border-b border-[color:var(--dp-border-soft)] py-3.5">
        <CardTitle className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] font-normal">
          queue · next up
        </CardTitle>
        {onManageClick && <CardAction onClick={onManageClick}>manage →</CardAction>}
      </CardHeader>
      <CardContent className="p-0">
        {queued.length === 0 ? (
          <div className="px-5 py-8 text-center font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            no drops in queue
          </div>
        ) : (
          <Table columns="40px 2fr 1fr 1fr 100px">
            <TableHead>
              <span>#</span>
              <span>drop · game</span>
              <span>watched</span>
              <span>progress</span>
              <span>status</span>
            </TableHead>
            {queued.map((item, idx) => {
              const watched = formatHourMinute(item.earnedMinutes);
              const progressPct =
                item.requiredMinutes > 0
                  ? Math.round((item.earnedMinutes / item.requiredMinutes) * 100)
                  : 0;
              const status = item.status === "progress" ? "live" : "queued";
              const tone = status === "live" ? "accent" : "dim";
              return (
                <TableRow key={item.id}>
                  <TableCell mono dim>
                    {padRank(idx + 1)}
                  </TableCell>
                  <TableCell>
                    <div className="truncate">{item.title}</div>
                    <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mt-0.5">
                      {item.game}
                    </div>
                  </TableCell>
                  <TableCell mono dim>
                    {watched}
                  </TableCell>
                  <TableCell mono dim>
                    {formatPercent(progressPct)}
                  </TableCell>
                  <TableCell>
                    <Pill tone={tone} dot={status === "live"}>
                      {status}
                    </Pill>
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "QueuePanel" | head -5`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/overview/QueuePanel.tsx
git commit -m "feat(overview): add QueuePanel dense-table for upcoming drops

Sorts non-claimed drops by remaining minutes ascending, shows top 8
in a Table primitive: rank / drop·game / watched / progress / status
pill. Empty-state when nothing queued."
```

---

## Task 6: Create `ActivityPanel.tsx`

Side card of recently claimed drops as feed items.

**Files:**
- Create: `src/renderer/features/overview/ActivityPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { FeedItem } from "@renderer/shared/components/ui/feed-item";
import { Check } from "@renderer/shared/lib/icons";
import type { InventoryItem } from "@renderer/shared/types";
import { formatRelative } from "./formatters";

export type ActivityPanelProps = {
  items: InventoryItem[];
  maxItems?: number;
};

export function ActivityPanel({ items, maxItems = 5 }: ActivityPanelProps) {
  const claimed = React.useMemo(() => {
    return items
      .filter((it) => it.status === "claimed")
      .slice(0, maxItems);
  }, [items, maxItems]);

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4">
      <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] mb-3">
        recent activity
      </span>
      {claimed.length === 0 ? (
        <div className="py-2 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          no claims yet
        </div>
      ) : (
        claimed.map((item, idx) => {
          const claimedAt = (item as InventoryItem & { claimedAt?: number }).claimedAt ?? null;
          const meta = (
            <>
              <span style={{ color: "var(--dp-accent)" }}>{item.game}</span>
              {" · "}
              {claimedAt ? formatRelative(claimedAt) : "recently"}
            </>
          );
          return (
            <FeedItem
              key={item.id}
              tone="ok"
              icon={<Check />}
              msg={
                <>
                  Claimed <strong>{item.title}</strong>
                </>
              }
              meta={meta}
              last={idx === claimed.length - 1}
            />
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ActivityPanel" | head -5`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/overview/ActivityPanel.tsx
git commit -m "feat(overview): add ActivityPanel side card for claim feed

Renders top 5 recently-claimed drops as ok-toned FeedItem entries.
Uses optional InventoryItem.claimedAt for the meta line; falls back
to 'recently' when the inventory item lacks a claim timestamp."
```

---

## Task 7: Create `EnginePanel.tsx`

Side card of engine metrics: cycle / last refresh / cadence / uptime.

**Files:**
- Create: `src/renderer/features/overview/EnginePanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { formatRelative, formatUptime } from "./formatters";

export type EnginePanelProps = {
  lastWatchOk?: number | null;
  cycleSeconds?: number;
  cadenceSeconds?: number;
};

export function EnginePanel({
  lastWatchOk,
  cycleSeconds = 30,
  cadenceSeconds = 30,
}: EnginePanelProps) {
  const sessionStartRef = React.useRef<number>(Date.now());
  const [now, setNow] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const rows: Array<{ key: string; value: string; tone?: "ok" }> = [
    { key: "watch_cycle", value: `${cycleSeconds}s` },
    { key: "last_refresh", value: formatRelative(lastWatchOk, now) },
    { key: "cadence", value: `${cadenceSeconds}s` },
    { key: "uptime", value: formatUptime(sessionStartRef.current, now) },
  ];

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-4 py-4">
      <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] mb-3">
        engine
      </span>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex justify-between font-mono text-[11px]"
          >
            <span className="text-[color:var(--dp-text-dimmer)]">{row.key}</span>
            <span
              className={
                row.tone === "ok"
                  ? "text-[color:var(--dp-signal-ok)]"
                  : "text-[color:var(--dp-text)]"
              }
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "EnginePanel" | head -5`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/overview/EnginePanel.tsx
git commit -m "feat(overview): add EnginePanel mono key/value side card

watch_cycle / last_refresh / cadence / uptime. Uses a useRef-pinned
session start for uptime calculation, ticks every 1s while mounted.
cycle and cadence default to 30s placeholders — Phase 5 (Settings)
will surface the real configured values."
```

---

## Task 8: Create `AttentionStrip.tsx`

Pill row above the Hero for warnings / alerts. Replaces the legacy `overview-attention` section.

**Files:**
- Create: `src/renderer/features/overview/AttentionStrip.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { Pill } from "@renderer/shared/components/ui/pill";
import type { ChannelTrackerStatus, ErrorInfo } from "@renderer/shared/types";

export type AttentionStripProps = {
  claimableDrops: number;
  watchError: ErrorInfo | null | undefined;
  activeGame: string;
  channelsCount: number;
  trackerStatus: ChannelTrackerStatus | null | undefined;
};

export function AttentionStrip({
  claimableDrops,
  watchError,
  activeGame,
  channelsCount,
  trackerStatus,
}: AttentionStripProps) {
  const pills: React.ReactNode[] = [];

  if (claimableDrops > 0) {
    pills.push(
      <Pill key="claim-ready" tone="warn" dot>
        {claimableDrops} claim ready
      </Pill>,
    );
  }
  if (watchError) {
    pills.push(
      <Pill key="watch-err" tone="err" dot title={watchError.message}>
        watch error
      </Pill>,
    );
  }
  if (activeGame && channelsCount === 0) {
    pills.push(
      <Pill key="no-channels" tone="warn">
        no channels
      </Pill>,
    );
  }
  if (
    trackerStatus?.connectionState &&
    trackerStatus.connectionState !== "connected" &&
    trackerStatus.connectionState !== "connecting"
  ) {
    pills.push(
      <Pill key="tracker" tone="err" dot>
        tracker {trackerStatus.connectionState}
      </Pill>,
    );
  }

  if (pills.length === 0) return null;

  return <div className="flex flex-wrap gap-2 mb-4">{pills}</div>;
}
```

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "AttentionStrip" | head -5`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/overview/AttentionStrip.tsx
git commit -m "feat(overview): add AttentionStrip pill row for warnings

Compact pill row above the Hero, replacing the legacy attention
section. Surfaces: claim-ready count, watch errors (tooltip with
message), no-channels state, tracker disconnection. Renders nothing
when no warnings are active (doesn't reserve vertical space)."
```

---

## Task 9: Rewrite `OverviewView.tsx`

Compose the new panels in a 2-column layout (main + sidebar). Keep the existing exported `OverviewView` symbol and prop interface so `useAppModel.overviewProps` continues to feed it unchanged.

**Files:**
- Modify: `src/renderer/features/overview/OverviewView.tsx` (full rewrite)

- [ ] **Step 1: Replace the file contents**

```tsx
import type {
  ChannelTrackerStatus,
  ErrorInfo,
  InventoryState,
  StatsState,
} from "@renderer/shared/types";
import { HeroPanel } from "./HeroPanel";
import { QueuePanel } from "./QueuePanel";
import { ActivityPanel } from "./ActivityPanel";
import { EnginePanel } from "./EnginePanel";
import { AttentionStrip } from "./AttentionStrip";

type OverviewProps = {
  inventory: InventoryState;
  stats: StatsState;
  resetStats: () => void;
  activeGame: string;
  activeDropTitle?: string;
  activeDropRemainingMinutes?: number;
  activeDropEta?: number | null;
  targetProgress: number;
  totalDrops: number;
  claimedDrops: number;
  claimableDrops: number;
  blockedDrops: number;
  channelsCount: number;
  canWatchTarget: boolean;
  watchDecision:
    | "no-target"
    | "suppressed"
    | "cooldown"
    | "watching-progress"
    | "watching-recover"
    | "watching-no-farmable"
    | "watching-no-watchable"
    | "idle-loading-channels"
    | "idle-no-channels"
    | "idle-ready"
    | "idle-no-watchable-drops";
  watchSuppressionReason: "manual-stop" | "stall-stop" | null;
  lastWatchOk?: number | null;
  inventoryFetchedAt?: number | null;
  trackerStatus?: ChannelTrackerStatus | null;
  watchError?: ErrorInfo | null;
};

export function OverviewView({
  inventory,
  activeGame,
  activeDropTitle,
  activeDropRemainingMinutes,
  activeDropEta,
  targetProgress,
  totalDrops,
  claimedDrops,
  claimableDrops,
  channelsCount,
  watchDecision,
  lastWatchOk,
  trackerStatus,
  watchError,
}: OverviewProps) {
  const items =
    inventory.status === "ready"
      ? inventory.items
      : inventory.status === "error"
        ? (inventory.items ?? [])
        : [];

  const isLive =
    watchDecision === "watching-progress" ||
    watchDecision === "watching-recover";

  return (
    <div className="grid gap-7" style={{ gridTemplateColumns: "1fr 320px" }}>
      <div className="flex flex-col gap-6">
        <AttentionStrip
          claimableDrops={claimableDrops}
          watchError={watchError}
          activeGame={activeGame}
          channelsCount={channelsCount}
          trackerStatus={trackerStatus}
        />
        <HeroPanel
          activeGame={activeGame}
          activeDropTitle={activeDropTitle}
          activeDropEta={activeDropEta}
          activeDropRemainingMinutes={activeDropRemainingMinutes}
          targetProgress={targetProgress}
          claimableDrops={claimableDrops}
          channelsCount={channelsCount}
          totalDrops={totalDrops}
          claimedDrops={claimedDrops}
          isLive={isLive}
        />
        <QueuePanel items={items} />
      </div>
      <div className="flex flex-col gap-4">
        <ActivityPanel items={items} />
        <EnginePanel lastWatchOk={lastWatchOk} />
      </div>
    </div>
  );
}
```

Note: `stats`, `resetStats`, `inventoryFetchedAt`, `blockedDrops`, `canWatchTarget`, `watchSuppressionReason` are present in the prop type for backward compatibility with `useAppModel` but unused in this rewrite. TypeScript with no `noUnusedParameters` should not complain; if it does, prefix them with underscore in the destructure.

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "OverviewView" | head -10`
Expected: empty (or only pre-existing errors, none new).

- [ ] **Step 3: Run inventory + priority tests to catch regressions**

Run: `npm test 2>&1 | tail -20`
Expected: all tests pass. The Overview rewrite shouldn't affect inventory/priority tests since they don't import from Overview.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/features/overview/OverviewView.tsx
git commit -m "feat(overview): rewrite OverviewView as Pro Console composition

Replaces the legacy spotlight + KPI cards + attention list + trends
+ campaign landscape with the design-overhaul layout: AttentionStrip
+ HeroPanel + QueuePanel on the left (1fr), ActivityPanel +
EnginePanel on the right (320px). Prop interface unchanged so
useAppModel.overviewProps continues to feed it.

Drops the in-Overview stats/trends/top-games/campaigns sections —
they were exploratory dashboards; Phase 5 (Settings) carries the
'reset stats' action."
```

---

## Task 10: Modify `AppContent.tsx` to remove `<TopNav>` rendering

The legacy `AppContent` renders `<TopNav>` followed by the active view inside a `.panel.inventory-panel` shell. We move `AppNav` rendering to `App.tsx` (next task), so `AppContent` becomes a thinner view-router.

**Files:**
- Modify: `src/renderer/shared/components/AppContent.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import type { ComponentProps, ReactNode } from "react";
import { Profiler, useCallback } from "react";
import {
  ControlView,
  DebugView,
  InventoryView,
  OverviewView,
  PriorityView,
  SettingsView,
} from "@renderer/features";
import type { TopNav } from "./TopNav";
import { isPerfEnabled, recordRender } from "@renderer/shared/utils/perfStore";

type AppContentProps = {
  /** Retained for compatibility with the existing useAppModel shape. */
  navProps: ComponentProps<typeof TopNav>;
  overviewProps: ComponentProps<typeof OverviewView>;
  inventoryProps: ComponentProps<typeof InventoryView>;
  priorityProps: ComponentProps<typeof PriorityView>;
  settingsProps: ComponentProps<typeof SettingsView>;
  controlProps: ComponentProps<typeof ControlView>;
  debugSnapshot: Record<string, unknown>;
  debugEnabled: boolean;
};

export function AppContent({
  navProps,
  overviewProps,
  inventoryProps,
  priorityProps,
  settingsProps,
  controlProps,
  debugSnapshot,
  debugEnabled,
}: AppContentProps) {
  const view = navProps.view;
  const renderWithPerf = useCallback(
    (id: string, node: ReactNode) => {
      if (!debugEnabled || !isPerfEnabled()) return node;
      return (
        <Profiler id={id} onRender={(_, __, actualDuration) => recordRender(id, actualDuration)}>
          {node}
        </Profiler>
      );
    },
    [debugEnabled],
  );

  return (
    <main className="px-8 py-7 max-w-[1640px] mx-auto">
      {view === "overview" && renderWithPerf("OverviewView", <OverviewView {...overviewProps} />)}
      {view === "inventory" &&
        renderWithPerf("InventoryView", <InventoryView {...inventoryProps} />)}
      {view === "priorities" &&
        renderWithPerf("PriorityView", <PriorityView {...priorityProps} />)}
      {view === "settings" && renderWithPerf("SettingsView", <SettingsView {...settingsProps} />)}
      {view === "control" && renderWithPerf("ControlView", <ControlView {...controlProps} />)}
      {view === "debug" && renderWithPerf("DebugView", <DebugView snapshot={debugSnapshot} />)}
    </main>
  );
}
```

Key changes from the previous version:
- Removed `import { TopNav } from "./TopNav";` (changed to `import type { TopNav }`).
- Removed the `<TopNav {...navProps} />` JSX render.
- Replaced the `<section className="panel inventory-panel">` wrapper with a `<main className="px-8 py-7 max-w-[1640px] mx-auto">` (Tailwind utilities, no legacy panel classes — matches the new chrome aesthetic).
- `navProps` is still consumed for `view` and passed-through prop-type compatibility.

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "AppContent" | head -5`
Expected: empty.

- [ ] **Step 3: Verify tests pass**

Run: `npm test 2>&1 | tail -10`
Expected: 214/214 pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/shared/components/AppContent.tsx
git commit -m "refactor(layout): remove TopNav from AppContent

AppNav now lives at the App.tsx layer, rendered as part of the new
chrome stack (Phase 2). AppContent is reduced to a view-router with
a Tailwind-styled main wrapper (no more .panel.inventory-panel CSS
class). navProps prop kept for backward compatibility with the
existing useAppModel shape."
```

---

## Task 11: Rewrite `App.tsx` to use new chrome

Final wiring. Map `useAppModel` outputs into new chrome prop shapes, render `Titlebar` + `AppNav` + `AppContent` + `Statusbar`. Keep the `#dev-primitives` dev route from Phase 1.

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import * as React from "react";
import { AppContent, UpdateOverlay } from "@renderer/shared/components";
import { Titlebar } from "@renderer/shared/components/chrome/Titlebar";
import { AppNav, type AppNavItem } from "@renderer/shared/components/chrome/AppNav";
import { Statusbar } from "@renderer/shared/components/chrome/Statusbar";
import { Button } from "@renderer/shared/components/ui/button";
import { useAppModel } from "@renderer/shared/hooks";
import { I18nProvider, useI18n } from "@renderer/shared/i18n";
import { DevPrimitivesView } from "@renderer/features/dev-primitives";
import { formatRelative } from "@renderer/features/overview/formatters";

function App() {
  const model = useAppModel();

  // Dev-only primitives showcase. Phase 1 introduced this route.
  if (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.location.hash === "#dev-primitives"
  ) {
    return (
      <I18nProvider language={model.language}>
        <DevPrimitivesView />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={model.language}>
      <AppShell model={model} />
    </I18nProvider>
  );
}

type Model = ReturnType<typeof useAppModel>;

function AppShell({ model }: { model: Model }) {
  const { t } = useI18n();
  const {
    isMac,
    titleBarProps,
    navProps,
    overviewProps,
    inventoryProps,
    priorityProps,
    settingsProps,
    controlProps,
    debugSnapshot,
    debugEnabled,
    updateOverlayProps,
  } = model;

  // Resolve theme: titleBarProps.theme may be "system" — coerce to the rendered light/dark.
  const resolvedTheme: "light" | "dark" = React.useMemo(() => {
    if (titleBarProps.theme === "dark") return "dark";
    if (titleBarProps.theme === "light") return "light";
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "light";
  }, [titleBarProps.theme]);

  const toggleTheme = React.useCallback(() => {
    titleBarProps.setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, [titleBarProps.setTheme]);

  const openSettings = React.useCallback(() => navProps.setView("settings"), [navProps]);

  const onWindowAction = React.useCallback((action: "minimize" | "maximize" | "close") => {
    window.electronAPI.app.windowControl(action);
  }, []);

  // AppNav items
  const navItems: AppNavItem[] = React.useMemo(() => {
    const base: AppNavItem[] = [
      { key: "overview", label: t("nav.overview") },
      { key: "inventory", label: t("nav.inventory") },
      { key: "control", label: t("nav.control") },
      { key: "priorities", label: t("nav.priorities") },
      { key: "settings", label: t("nav.settings") },
    ];
    if (debugEnabled) {
      const settingsIdx = base.findIndex((item) => item.key === "settings");
      base.splice(settingsIdx, 0, { key: "debug", label: t("nav.debug") });
    }
    return base;
  }, [debugEnabled, t]);

  // AppNav right slot — session indicator or sign-in button
  const sessionRight = React.useMemo(() => {
    const linked = navProps.auth.status === "ok";
    const ready = navProps.profile.status === "ready" ? navProps.profile : null;
    if (linked && ready) {
      return (
        <>
          <span>{ready.displayName}</span>
          <span style={{ color: "var(--dp-accent)" }}>●</span>
          <span>{t("session.connected").toLowerCase()}</span>
        </>
      );
    }
    return (
      <Button
        variant="dp-primary"
        size="dp-sm"
        onClick={navProps.startLogin}
        disabled={navProps.auth.status === "pending"}
      >
        {navProps.auth.status === "pending" ? t("session.login") : t("session.loginBrowser")}
      </Button>
    );
  }, [navProps.auth, navProps.profile, navProps.startLogin, t]);

  // Statusbar
  const engineLabel = React.useMemo(() => {
    const d = overviewProps.watchDecision;
    if (d === "watching-progress" || d === "watching-recover") return "engine: running";
    if (d === "suppressed" || d === "cooldown") return "engine: paused";
    if (d.startsWith("idle")) return "engine: idle";
    return `engine: ${d}`;
  }, [overviewProps.watchDecision]);

  const engineTone =
    overviewProps.watchDecision === "watching-progress" ||
    overviewProps.watchDecision === "watching-recover"
      ? "ok"
      : overviewProps.watchDecision === "suppressed"
        ? "warn"
        : "dim";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--dp-bg-app)", color: "var(--dp-text)" }}
    >
      {!isMac && (
        <Titlebar
          title="droppilot"
          version={titleBarProps.version}
          theme={resolvedTheme}
          onThemeToggle={toggleTheme}
          onSettingsClick={openSettings}
          onWindowAction={onWindowAction}
        />
      )}
      <UpdateOverlay {...updateOverlayProps} />
      <AppNav
        view={navProps.view}
        onChange={navProps.setView}
        items={navItems}
        right={sessionRight}
      />
      <div className="flex-1">
        <AppContent
          navProps={navProps}
          overviewProps={overviewProps}
          inventoryProps={inventoryProps}
          priorityProps={priorityProps}
          settingsProps={settingsProps}
          controlProps={controlProps}
          debugSnapshot={debugSnapshot}
          debugEnabled={debugEnabled}
        />
      </div>
      <Statusbar
        left={[
          { tone: engineTone, label: engineLabel },
          {
            label: `drops · ${overviewProps.claimedDrops}/${overviewProps.totalDrops}`,
          },
          { label: `last sync · ${formatRelative(overviewProps.lastWatchOk)}` },
        ]}
        right={[
          { label: `v${titleBarProps.version ?? "—"}` },
          { label: <span style={{ color: "var(--dp-accent)" }}>⌘K</span> },
        ]}
      />
    </div>
  );
}

export default App;
```

Key changes:
- Removed `import { Hero, TitleBar } from "@renderer/shared/components"` — replaced by new chrome imports.
- Wrapped the rendered tree in an inner `AppShell` component so `useI18n` is callable (it's inside `I18nProvider`). The dev-route check stays before `AppShell` because it's allowed to render outside i18n.
- Resolves theme tristate to a `"light" | "dark"` for the Titlebar.
- Maps engine state from `watchDecision` to a `Statusbar` left item.
- Session indicator in `AppNav.right` reuses login/auth state from `navProps`.

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "App\.tsx" | head -10`
Expected: empty.

- [ ] **Step 3: Run tests**

Run: `npm test 2>&1 | tail -10`
Expected: 214/214 pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(app): swap to Phase 1 chrome (Titlebar + AppNav + Statusbar)

Renders the new chrome stack instead of legacy TitleBar + Hero +
TopNav. AppShell wraps useAppModel state into the new prop shapes:
theme tristate resolved to light/dark for Titlebar; nav items
derived from i18n; session indicator (or sign-in button) in AppNav
right slot; engine state + drops counter + last sync in the new
Statusbar.

Hero.tsx, TitleBar.tsx, TopNav.tsx remain on disk as dead code;
Phase 6 final cleanup deletes them."
```

---

## Task 12: Verify end-to-end

- [ ] **Step 1: Lint**

Run: `npm run lint`

Expected: exit 0. New warnings from this PR must be fixed; pre-existing warnings (3 from Phase 1 baseline) are acceptable.

- [ ] **Step 2: TypeScript**

Run: `npx tsc --noEmit -p tsconfig.json`

Expected: pre-existing errors only (~21 from Phase 1 baseline). Any new errors introduced by Phase 2 files must be fixed.

- [ ] **Step 3: Tests**

Run: `npm test 2>&1 | tail -10`

Expected: all 214 tests pass.

- [ ] **Step 4: Format**

Run: `npm run format`

If anything reformatted, commit:

```bash
git diff --quiet || (git add -A && git commit -m "chore: prettier format design-overhaul phase 2 files")
```

- [ ] **Step 5: Build**

Run: `npm run build`

Expected: exit 0. Output in `dist/`, `dist-electron/`.

- [ ] **Step 6: Branch summary**

Run: `git log --oneline feat/design-overhaul..HEAD`

Expected commits (in any order, with maybe a format commit at the end):
- feat(tokens): add --dp-accent-hover for design-overhaul
- refactor(ui): Button dp-primary uses --dp-accent-hover token
- feat(overview): add formatters helper module
- feat(overview): add HeroPanel for new Overview design
- feat(overview): add QueuePanel dense-table for upcoming drops
- feat(overview): add ActivityPanel side card for claim feed
- feat(overview): add EnginePanel mono key/value side card
- feat(overview): add AttentionStrip pill row for warnings
- feat(overview): rewrite OverviewView as Pro Console composition
- refactor(layout): remove TopNav from AppContent
- feat(app): swap to Phase 1 chrome (Titlebar + AppNav + Statusbar)
- chore: prettier format (if any)

Phase 2 is complete when all 6 verification steps pass. Phase 3 (Inventory dense-table migration) is the next plan.

---

## Out of Scope

- Implementing real `claim now` / `pause` / `switch target` actions in HeroPanel (Phase 4 — Control view)
- Per-stream viewer counts in the stat grid (no data source yet)
- A dedicated `LoginView` for logged-out experience (future refinement; logged-out users see Overview with empty states + sign-in button in AppNav)
- The `⌘K` command palette hint in Statusbar — pure placeholder
- Migrating Inventory / Priorities / Control / Settings / Debug views — they continue to render with legacy classes inside the new chrome
- Deleting `Hero.tsx`, `TitleBar.tsx`, `TopNav.tsx` — deferred to Phase 6 cleanup
- Removing `--background`, `--foreground`, `--primary`, etc. legacy CSS variables — Phase 6
