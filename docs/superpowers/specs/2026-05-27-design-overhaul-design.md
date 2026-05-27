# Droppilot — Design Overhaul

**Status:** Approved (design phase)
**Date:** 2026-05-27
**Branch:** `feat/design-overhaul`
**Scope:** Visual refresh + targeted UX improvements across all 6 main views

---

## 1. Summary

Replace the current "generic shadcn defaults + Material Symbols" look with a distinctive **Pro Console** design language — info-dense, dark-first, mono-for-data, sans-for-prose, soft-violet accent. The existing tech stack (Electron + React 19 + Vite + Tailwind 4 + Radix + CVA) is preserved; we restyle primitives, swap iconography, introduce a small set of new layout primitives, and rework view layouts where they materially benefit. No new features, no IA reshuffling.

The reference for the visual language is Linear / Cron / Granola (engineering-polish, monospace data tables, restrained accent use, subtle hairlines).

---

## 2. Locked Decisions (from brainstorming)

| Decision | Value |
| --- | --- |
| Visual direction | Pro Console (info-dense, dark-first) |
| Flavor | Elevated Engineering (mono for data, sans for prose) |
| Theme strategy | Dark-first; Light remains functional but un-hero'd |
| Brand accent | Soft Violet `#a78bfa` |
| Typography | IBM Plex Sans + IBM Plex Mono (already in repo) |
| Iconography | Lucide (replace Material Symbols entirely) |
| Inventory layout | Dense table with thumbnail column |
| Window chrome | Custom dark titlebar; native Windows min/max/close buttons |
| Implementation order | Foundation → Overview → Inventory → Priorities+Control → Settings → Debug |
| Out of scope | Onboarding/Login redesign, new features, i18n strings |

---

## 3. Design Foundations

### 3.1 Color Tokens

**Dark (primary)**

```
--bg-app          #0a0b0d   App background
--bg-chrome       #08090b   Titlebar, statusbar
--bg-elevated     #101216   Cards, panels, hero
--bg-elevated-2   #14171c   Hover surface, nested
--border          #1c2026   Default border
--border-soft     #16191e   Internal dividers, table rows
--text            #e8eaed   Body
--text-dim        #9aa0a8   Secondary
--text-dimmer     #6b7280   Tertiary, mono labels
--accent          #a78bfa   Soft Violet (primary)
--accent-soft     rgba(167,139,250,0.12)   Hover bg, pill bg
--accent-glow     rgba(167,139,250,0.4)    Underlines, focus rings
--signal-ok       #4ade80
--signal-warn     #fbbf24
--signal-err      #f87171
--signal-info     #60a5fa
```

**Light (parallel map, reduced saturation)**

```
--bg-app          #fafaf9
--bg-chrome       #f4f3ef
--bg-elevated     #ffffff
--bg-elevated-2   #f7f6f3
--border          #e5e3de
--border-soft     #ededea
--text            #1a1c1f
--text-dim        #555a62
--text-dimmer     #8a8f96
--accent          #7c5fe6   Darker for contrast on light bg
--accent-soft     rgba(124,95,230,0.10)
--accent-glow     rgba(124,95,230,0.25)
--signal-ok       #16a34a
--signal-warn     #ca8a04
--signal-err      #dc2626
--signal-info     #2563eb
```

Existing CSS variables in `src/renderer/app.css` will be **mapped to the new tokens via aliases** during Phase 1 so unmigrated components keep rendering; aliases are deleted in their respective phase once the consuming component is migrated.

### 3.2 Typography

- **Display & prose:** IBM Plex Sans (already loaded)
- **Data, labels, metadata, code, status pills, eyebrows:** IBM Plex Mono (already loaded)
- **Numeric:** `font-feature-settings: 'tnum'` on every monospace numeric span to prevent layout shifts during live updates
- **Scale (px):** 9 / 10 / 11 / 12 / 13 (body) / 14 / 18 (view title) / 22 (stat) / 26 (hero)
- **Weights:** 400 (body), 500 (titles, stats, buttons), 600 (brand, primary CTA)
- **Letter-spacing for mono uppercase labels:** 0.12–0.14em
- **Letter-spacing for sans headings:** -0.01 to -0.02em (tighter for bigger sizes)

### 3.3 Spacing & Radius

- **Spacing:** Tailwind defaults (4 / 8 / 12 / 16 / 20 / 24 / 28 / 32)
- **Radius hierarchy** (replaces current single 0.75rem):
  - `xs` = 3px — chips, status pills, mini-badges
  - `sm` = 4–5px — buttons, inputs, selects
  - `md` = 6px — thumbnails, small images
  - `lg` = 8px — panels, cards, hero, tables
  - `xl` = 10px — app window outer chrome (Electron BrowserWindow corners)

Set as CSS variables (`--radius-xs` … `--radius-xl`) and surfaced as Tailwind utilities (`rounded-xs` … `rounded-xl`).

### 3.4 Motion

- Hover / state transitions: `0.12s–0.15s ease`
- Live pulse (drop progress, engine-running dot): `pulse 2s ease-in-out infinite` (50% opacity)
- Progress bar fill transitions: `0.4s ease-out`
- **No entrance animations** for static data lists/tables — keeps the "engineering tool" feel and avoids AI-slop motion noise
- Drag-and-drop (Priorities): keep dnd-kit defaults

---

## 4. Iconography

- **Removed:** Google Material Symbols web font (`material-symbols-rounded` class, font CSS import)
- **Added:** `lucide-react` (~10kb, tree-shakeable, named imports per icon)
- Consistent stroke-width 1.7 (1.8 for small badges)
- Size rules:
  - Nav, buttons: 13px
  - Feed badges: 11px
  - Panel headers, hero subtitles: 12–14px
- **Brand mark:** custom 14×14 SVG — violet gradient square with arrow-cutout (acts as Droppilot logo in titlebar)
- All current Material Symbols usages mapped to Lucide equivalents in a migration table (built during Phase 1)

---

## 5. Component Primitives

### 5.1 Restyled (existing CVA wrappers, same API)

- **Button** — new variants:
  - `primary` — violet bg `#a78bfa`, near-black text `#0a0b0d`, font-weight 600
  - `secondary` — current default, restyled with new tokens
  - `outline` — border-only, mono label
  - `ghost` — mono label only, hover bg `--accent-soft`
  - `destructive` — `--signal-err` bg
  - Default padding `7px 12px` (was `8px 16px`); add `size: sm/md/lg` variant
- **Badge / Pill** — variant family: `accent` / `ok` / `warn` / `err` / `info` / `dim` — each with `bg = signal × 0.08-0.12 alpha`, `border = signal × 0.15-0.25 alpha`, `color = signal-full`, mono uppercase text
- **Card** (renamed conceptually to "Panel" in design language, but the file `card.tsx` and component export name stay to avoid churning every import site)
  - Add `CardHeader` slot with `panel-title` (mono uppercase) and optional right-aligned `panel-action`
  - `CardBody` (existing `CardContent`) default content area
  - Default border `--border`, bg `--bg-elevated`
- **Input / Select** — mono value text, sans label, focus ring `--accent-glow`
- **HoverCard / AlertDialog** — token-only update, no API changes

### 5.2 New primitives

- **`Table`** — semantic data table with grid-based rows, mono cells, hover-row, sort/filter ready
  - Sub-components: `Table.Head`, `Table.Row`, `Table.Cell`
  - Variants: `dense` (52px row, default) / `comfortable` (64px)
  - Used by: Inventory, Queue panel on Overview, Priorities, Control event-log
- **`Stat`** — `<Stat label="eta" value="02:14:38" sub="87%" accent />` for hero stat-grids
- **`FeedItem`** — `<FeedItem variant="ok" icon={Check} msg="..." meta="..." />` for activity feeds
- **`SectionLabel`** — mono uppercase label with trailing 1px rule (`<SectionLabel>currently watching</SectionLabel>`)
- **`Statusbar`** — bottom 26px statusbar with left/center/right slots
- **`Titlebar`** — top 36px custom titlebar with brand slot, status slot, action-icon slot, native window-controls slot
- **`TopNav`** + **`TopNavItem`** — 42px nav with violet-underline active state

### 5.3 Decommissioned

- Legacy CSS variables in `app.css` (`--pill-*`, `--drop-image-*`, `--spotlight-*`, `--chip-*`, drop-card-stroke variants, etc.) — distinct from the new `Pill` component primitive in §5.2. These vars become dead weight once their consumer components migrate. Removed phase-by-phase as consumers are touched; final cleanup in Phase 6.
- `material-symbols-rounded` class usage and the corresponding Google Fonts `<link>` import
- Existing `--type-*` typography variables — consolidated into the new size scale in §3.2 and exposed as Tailwind utilities

---

## 6. Layout Patterns

### 6.1 App Chrome

```
┌──────────────────────────────────────────────────────────────┐
│ TITLEBAR  36px   logo+wordmark │ pills │ icons │ win-ctrls  │
├──────────────────────────────────────────────────────────────┤
│ TOPNAV    42px   overview · inventory · ...  │   session    │
├──────────────────────────────────────────────────────────────┤
│ MAIN      flex                                                │
│           padding 28-32px                                     │
│           optional 2-column (content + 320px sidebar)         │
├──────────────────────────────────────────────────────────────┤
│ STATUSBAR 26px   engine | cadence | drops │ cpu mem ⌘K       │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Titlebar

- Background `--bg-chrome`, border-bottom `--border`
- Left: 14×14 brand mark + "droppilot" mono wordmark + version
- Center/Right: status pills (`connected`, `api ok · NNms`)
- Right: theme-toggle + settings-shortcut icon buttons
- Far right: native Windows min/max/close (Electron `titleBarStyle: 'hidden'` + custom region)
- `-webkit-app-region: drag` on container; `no-drag` on interactive children

### 6.3 TopNav

- Background `--bg-app`, border-bottom `--border`
- Items: 13px Lucide icon + mono lowercase label (`overview`, `inventory`, …)
- Active state: 1px violet underline pseudo-element + `--accent-glow` box-shadow
- Right slot: session indicator (`shroud ● logged in`)

### 6.4 Statusbar

- Background `--bg-chrome`, border-top `--border`
- Mono 10px, left → right: engine state (with colored dot), cadence, drops-today
- Right: cpu%, mem mb, `⌘K` shortcut hint

---

## 7. Per-View Specifications

### 7.1 Overview

Reference mockup: [`05-overview-mockup.html`](./2026-05-27-design-overhaul-mockups/05-overview-mockup.html)

**Structure:**
- 2-column main: content (left, 1fr) + sidebar (right, 320px)
- **Hero "Currently Watching"** panel (left column):
  - Eyebrow: live-pulse dot + "LIVE · earning drop" + right-aligned `drop_id · campaign #N`
  - Title: sans 26px, drop name
  - Subtitle: user-icon + mono `channel · twitch.tv/channel`
  - 4-column stat grid: `eta` (accent) / `viewers` / `next claim` / `session` — each `Stat` primitive
  - Progress bar under eta with violet glow
  - Quick-actions row: `claim now` (primary) + `pause` + `switch target`
- **Queue · Next up** panel below: dense Table (rank / game·channel / drop / eta / viewers / status)
- **Activity Feed** sidecard (right): FeedItem list, max 8 items, `view all →` action
- **Engine** sidecard (right): mono key→value pairs (watch_cycle, last_refresh, cadence, uptime)

**Behavioral changes:**
- KPI cards collapsed into single hero with stat-grid
- Watch-state and target-game info merged into hero
- Activity feed promoted to sidecard (was nested deeper)

### 7.2 Inventory

Reference mockup: [`06-inventory.html`](./2026-05-27-design-overhaul-mockups/06-inventory.html) (variant B)

**Structure:**
- View header: title + `N campaigns · M drops · K claimed` sub + filter chips (`all/live/queued/claimed/expired`) + search input
- Dense Table:
  - Columns: 36×36 thumbnail / drop·game (stacked) / watched / progress (mono % + inline bar) / status pill
  - Hover row: bg `--bg-elevated-2`
  - Click row → opens detail drawer (slide-over right)
  - Sortable columns (click header)

**Behavioral changes:**
- Card grid → table; better scan density, sort + filter ready, less vertical space per row

### 7.3 Priorities

**Structure:**
- View header: title + sub + `reorder by dragging` mono hint + `reset to default` action
- Same Table primitive, with:
  - Drag-handle column (left, 6-dot grip icon, hover-only opacity)
  - Rank column (mono `02`-padded)
  - Thumbnail + game name
  - Active indicator: violet dot if game is current watch target
  - Right-aligned mini-stats: `drops earned / pending`

**dnd-kit:** keep existing SortableContext + useSortable hooks; only the rendered row markup changes from Card to TableRow.

### 7.4 Control

**Structure:**
- **Engine panel** (top):
  - Large status badge (`running` / `paused` / `stopped`)
  - Primary action button: `start` / `stop` (state-dependent, primary variant)
  - Secondary actions: `pause` / `restart`
- **Manual Override panel** (middle):
  - Game selector (search-as-you-type) + channel input
  - `apply override` button (primary)
  - Currently-overridden state shown as accent pill
- **Event log panel** (bottom):
  - Mono stream, timestamp · level (color-coded) · message
  - Tail-follow toggle (sticky bottom)
  - Filter by level: all / info / warn / err

### 7.5 Settings

**Structure:**
- Left sidebar (200px): section list — `general` / `engine` / `appearance` / `updates` / `account` / `advanced`
- Main pane: grouped settings under SectionLabel headings
- Per-setting row layout:
  ```
  ┌────────────────────────────────────┬──────────────┐
  │ Label (sans)                       │  Control     │
  │ Description (mono, dim)            │              │
  └────────────────────────────────────┴──────────────┘
  ```
- Controls: toggle (custom styled), select (mono value), input (mono), button-row for actions

**Behavioral changes:**
- Linear list → sidebar-grouped; faster navigation, scannable sections

### 7.6 Debug

Already recently redesigned in commit `15a2fc4` — structure stays.

- Token migration only: swap CSS variables to new names
- Material Symbols → Lucide replacements
- Code blocks keep dedicated dark scheme (`#0f1116` bg) — distinct from app `--bg-elevated` to remain visually code-like

---

## 8. Implementation Phases

### Phase 1 — Foundation
Largest phase; everything else builds on it.

- New CSS variables in `src/renderer/app.css` (dark + light parallel maps), exposed to Tailwind 4 via the `@theme` directive (Tailwind 4 is CSS-first; no `tailwind.config.ts` edits needed for tokens)
- Alias layer mapping old → new tokens so unmigrated components don't break
- Install `lucide-react`; remove Material Symbols `<link>` import from `index.html`
- New `Logo` SVG component
- Restyle primitives: Button, Badge, Card, Input, Select
- New primitives: Table, Stat, FeedItem, SectionLabel, Titlebar, TopNav, Statusbar, Pill
- A `/dev-primitives` route in renderer (only enabled in dev or when debug toggle is on) that renders every primitive in light + dark for QA

**Acceptance:** All primitives renderable in isolation on `/dev-primitives`; no regressions on existing views (they continue to render via the alias layer until their phase).

### Phase 2 — Overview
- Implement Hero, Stat grid, Queue panel, Activity sidecard, Engine sidecard
- Wire to existing data hooks (no domain changes)
- **Acceptance:** Pixel-parity with mockup (within reason), live data updates work, light mode functional

### Phase 3 — Inventory
- Table-based layout with thumbnail column
- Filter chips, search, sortable columns
- Detail drawer (slide-over) for row click
- **Acceptance:** All existing filters/states represented; sort works on watched/progress/status

### Phase 4 — Priorities + Control (parallel)
- **Priorities:** dnd-kit adapted to row pattern; reset-to-default action; active-indicator dot
- **Control:** Engine panel, Manual Override panel, Event log panel with tail-follow + level filter

### Phase 5 — Settings
- Sidebar navigation, section grouping
- Setting row primitive (`<SettingRow label desc control />`)
- Per-section: General, Engine, Appearance, Updates, Account, Advanced/Debug

### Phase 6 — Debug
- Token + iconography migration only
- Drop deprecated CSS variables that are no longer referenced anywhere
- Final pass to remove alias layer

---

## 9. Out of Scope

- Onboarding / login screen redesign (separate effort)
- New product features
- i18n string changes (no new copy beyond what's needed for UI labels)
- Splash / update overlay redesign (`UpdateOverlay.tsx`) — token-update only, no structural change
- Domain logic, IPC, watch engine internals — untouched

---

## 10. Open Questions

- **Brand mark final form:** SVG sketch in mockup is a placeholder; may need a designer pass before Phase 1 ships. Acceptable to launch with current sketch and refine in a follow-up.
- **Settings sidebar collapsibility:** for narrow window widths (<1100px), should sidebar collapse to a top-tab strip? Decide during Phase 5.
- **Inventory detail drawer vs modal:** drawer is preferred (preserves table context); confirm during Phase 3.

---

## 11. References

- Brainstorm mockups committed under [`./2026-05-27-design-overhaul-mockups/`](./2026-05-27-design-overhaul-mockups/):
  - [`01-direction.html`](./2026-05-27-design-overhaul-mockups/01-direction.html) — three top-level direction choices (A=Editorial / B=Workshop / **C=Pro Console** ✓)
  - [`02-console-flavor.html`](./2026-05-27-design-overhaul-mockups/02-console-flavor.html) — three Pro Console flavors (C1=Hard Terminal / **C2=Elevated Engineering** ✓ / C3=Warm Pro)
  - [`04-accent.html`](./2026-05-27-design-overhaul-mockups/04-accent.html) — four accent color options (Blue / Green / Copper / **Violet** ✓)
  - [`05-overview-mockup.html`](./2026-05-27-design-overhaul-mockups/05-overview-mockup.html) — full Overview screen mockup
  - [`06-inventory.html`](./2026-05-27-design-overhaul-mockups/06-inventory.html) — Inventory table-vs-cards comparison (**B=Dense Table** ✓)
- Visual references: Linear, Cron, Granola, Vercel Geist
- Iconography: https://lucide.dev
