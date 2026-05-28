# Design Overhaul — Phase 4: Priorities Migration + Cleanups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `PriorityView` (394 lines, card-grid + dnd-kit) to the design overhaul pattern — drag-row Table with Phase 1 primitives, sortable rank column, drag-handle column, state Pill — and resolve 3 small Phase 1/2 follow-ups that fit cleanly in this PR (TableCell class redundancy, AppNav `LucideIcon` typing, Logo border-ring `color-mix`).

**Architecture:** Continues the pattern from Phase 2/3. Extracts existing logic (the test-covered `getSelectableDropGames` helper + small drag/state derivations) into a new `priorityHelpers.ts` module so the existing 3 unit tests in `PriorityView.test.ts` continue to pass via re-export. Builds 4 new components: `PriorityHeader` (title + summary stat cards), `PriorityAddPanel` (add-from-drops Select + manual input + obey-priority toggle), `PriorityRow` (sortable row with drag-handle + rank + name + state pill + remove), `PriorityList` (DndContext wrapper). Rewrites `PriorityView.tsx` as a composition consuming the existing `useAppModel.priorityProps` unchanged.

**Scope note — Control deferred:** The original Phase 4 spec named "Priorities + Control" together. ControlView is 1288 lines with a 546-line state hook and tightly couples watch-engine logic, channel grids, drop info, tracker status, and auto-switch info — too large for a stacked PR alongside Priorities without compromising quality. Control gets its own dedicated Phase (planned next, after this ships). This phase ships only Priorities + tightly-scoped follow-ups.

**Tech Stack:** React 19, Tailwind 4 CSS-first tokens, Phase 1 primitives (Pill, Card, Input, Select, SectionLabel, Stat, Button), dnd-kit (existing, unchanged), `lucide-react` icons.

**Spec reference:** [`../specs/2026-05-27-design-overhaul-design.md`](../specs/2026-05-27-design-overhaul-design.md) §7.3 Priorities.

**Branch:** `feat/design-overhaul-phase-4-priorities-control` (stacked on `feat/design-overhaul-phase-3-inventory`)

**PR target:** `feat/design-overhaul-phase-3-inventory` — GitHub auto-retargets as underlying PRs merge.

### Locked design decisions

1. **Row unit:** game (one row per priority-list game). Each row has: drag-handle, rank (`01`-padded mono), game name, state pill ("watching" / "target" / "live" / "idle"), remove button.
2. **Drag handle column:** 6-dot grip (replaces current dot-grid), `--dp-text-dimmer` default, `--dp-text-dim` hover, only visible on row hover (per spec mockup).
3. **Active indicator:** when the row's game === `watchingGame`, prepend a `--dp-accent` pulsing dot to the game cell (spec mockup behavior).
4. **No Table-primitive use here:** dnd-kit's `useSortable` needs full control of the row `<li>` ref and transform — the Phase 1 Table primitive is grid-based but doesn't expose ref forwarding for individual rows. Phase 4 uses a custom row layout that visually matches a dense table (same paddings, mono cells, hover-row tone) without going through the `Table` component. Future refactor could lift `useSortable` integration into `Table` itself.
5. **Test compatibility:** `PriorityView.test.ts` imports `getSelectableDropGames` from `"./PriorityView"`. New `priorityHelpers.ts` keeps that signature and `PriorityView.tsx` re-exports it.
6. **3 Phase 1/2 cleanups bundled:** these are all "open items" from earlier final reviews — small, isolated, low risk. Bundling them here keeps the follow-up backlog short.

### Deviations from spec

1. **Spec §7.3 mentions "Drag-Handle Column (links, 6-Punkt-Grip, hover-only sichtbar)"** — implemented as a button with mono lowercase aria-label; hover-only opacity per spec.
2. **Spec §7.3 mentions "Right-aligned Mini-Stats: drops earned / pending"** — *omitted in Phase 4* because per-game-priority drop counts aren't currently surfaced by `useAppModel.priorityProps`. The state pill conveys live/idle/watching/target which covers the primary need. Mini-stats can be added in a future polish PR when the model exposes the counts.
3. **The existing 3 summary cards** (currentTarget / queueHealth / topSlot) are preserved and restyled with the new tokens — they provide useful at-a-glance context that the spec's minimal mockup doesn't include but doesn't preclude.

---

## File Structure

**New files:**
- `src/renderer/features/priority/priorityHelpers.ts` — extracted `getSelectableDropGames` + new row-state helpers
- `src/renderer/features/priority/PriorityHeader.tsx` — title + count + 3 summary Stat cards
- `src/renderer/features/priority/PriorityAddPanel.tsx` — add-from-drops Select + manual Input + obey-priority toggle
- `src/renderer/features/priority/PriorityRow.tsx` — sortable row markup (drag-handle + rank + game + state pill + remove)
- `src/renderer/features/priority/PriorityList.tsx` — DndContext + SortableContext wrapper

**Modified files:**
- `src/renderer/features/priority/PriorityView.tsx` — full rewrite as composition; re-exports `getSelectableDropGames` for test compat
- `src/renderer/shared/components/ui/table.tsx` — small TableCell cleanup (Phase 1 follow-up)
- `src/renderer/shared/components/chrome/AppNav.tsx` — switch `ICON_MAP` to `LucideIcon` type (Phase 1 follow-up)
- `src/renderer/shared/components/Logo.tsx` — replace border-ring `rgba()` hardcode with `color-mix()` (Phase 1 follow-up)

**Untouched (intentionally):**
- `src/renderer/features/priority/PriorityView.test.ts` — keeps testing `getSelectableDropGames` via re-export
- `src/renderer/shared/hooks/app/useAppModel.ts` — `priorityProps` shape unchanged
- `src/renderer/features/control/*` — deferred to Phase 5
- `src/renderer/features/settings/*`, `src/renderer/features/debug/*` — Phase 5/6
- All Phase 1/2/3 primitives, chrome, formatters — unchanged

---

## Task 1: Extract `priorityHelpers.ts`

Single small helper module containing the test-covered `getSelectableDropGames` + tiny state-derivation helpers.

**Files:**
- Create: `src/renderer/features/priority/priorityHelpers.ts`

- [ ] **Step 1: Create the file**

```ts
/**
 * Helpers for the Priorities view. Pure functions, no React.
 */

export const getSelectableDropGames = (
  uniqueGames: string[],
  priorityGames: string[],
): string[] => uniqueGames.filter((game) => !priorityGames.includes(game));

export type PriorityRowState = "watching" | "target" | "live" | "idle";

export const derivePriorityRowState = (
  game: string,
  activeTargetGame: string,
  watchingGame: string,
  liveGameSet: Set<string>,
): PriorityRowState => {
  if (game === watchingGame) return "watching";
  if (game === activeTargetGame) return "target";
  if (liveGameSet.has(game)) return "live";
  return "idle";
};

/** Pad rank to fixed-width mono display (e.g. "01", "02", ..., "12"). */
export const padPriorityRank = (rank: number, width: number = 2): string =>
  String(Math.max(1, Math.floor(rank))).padStart(width, "0");
```

- [ ] **Step 2: Verify tsc clean**

`npx tsc --noEmit -p tsconfig.json 2>&1 | grep "priorityHelpers" | head -5` — empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/priority/priorityHelpers.ts
git commit -m "feat(priority): extract priorityHelpers module

Pulls getSelectableDropGames (test-covered) into a dedicated module
and adds two new helpers: derivePriorityRowState (watching/target/
live/idle ordinal) and padPriorityRank (mono 01-padded display).
PriorityView.tsx will re-export getSelectableDropGames for test
back-compat in the rewrite task."
```

---

## Task 2: Create `PriorityHeader.tsx`

Title + count + 3 summary Stat cards (currentTarget / queueHealth / topSlot).

**Files:**
- Create: `src/renderer/features/priority/PriorityHeader.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { Stat } from "@renderer/shared/components/ui/stat";

export type PriorityHeaderProps = {
  totalCount: number;
  livePriorityCount: number;
  activeTargetGame: string;
  watchingGame: string;
  topGame: string;
  obeyPriority: boolean;
};

export function PriorityHeader({
  totalCount,
  livePriorityCount,
  activeTargetGame,
  watchingGame,
  topGame,
  obeyPriority,
}: PriorityHeaderProps) {
  const currentTargetValue = activeTargetGame || "—";
  const currentTargetSub = watchingGame
    ? `watching ${watchingGame}`
    : obeyPriority
      ? "strict mode"
      : "flexible mode";
  const queueHealthValue = totalCount > 0 ? `${livePriorityCount}/${totalCount}` : "—";
  const topGameValue = topGame || "—";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[color:var(--dp-text)] leading-tight">
            Priorities
          </h2>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mt-1">
            {totalCount} game{totalCount === 1 ? "" : "s"} ranked
          </div>
        </div>
      </div>

      <div
        className="grid gap-0 rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-5"
        style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
      >
        <div className="pr-4">
          <Stat label="current target" value={currentTargetValue} sub={currentTargetSub} accent={!!activeTargetGame} />
        </div>
        <div className="px-4 border-l border-[color:var(--dp-border-soft)]">
          <Stat label="queue live" value={queueHealthValue} sub="live / total" />
        </div>
        <div className="pl-4 border-l border-[color:var(--dp-border-soft)]">
          <Stat label="top slot" value={topGameValue} sub="position 01" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "PriorityHeader" | head -5
# expected: empty

git add src/renderer/features/priority/PriorityHeader.tsx
git commit -m "feat(priority): add PriorityHeader with 3 summary stats

Title + 'N games ranked' counter + 3 Stat cards in a 3-column grid:
current target (accent when set, sub line shows watching game OR
strict/flexible mode), queue live (livePriorityCount/totalCount),
top slot (rank-01 game). Replaces the legacy .priority-summary-grid."
```

---

## Task 3: Create `PriorityAddPanel.tsx`

The left panel — add-from-drops Select + manual Input + obey-priority toggle.

**Files:**
- Create: `src/renderer/features/priority/PriorityAddPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";
import { Plus } from "@renderer/shared/lib/icons";

const NO_GAME_SELECT_VALUE = "__dp_none__";

export type PriorityAddPanelProps = {
  selectableDropGames: string[];
  selectedGame: string;
  setSelectedGame: (val: string) => void;
  addGameFromSelect: () => void;
  newGame: string;
  setNewGame: (val: string) => void;
  addGame: () => void;
  obeyPriority: boolean;
  setObeyPriority: (val: boolean) => void;
};

export function PriorityAddPanel({
  selectableDropGames,
  selectedGame,
  setSelectedGame,
  addGameFromSelect,
  newGame,
  setNewGame,
  addGame,
  obeyPriority,
  setObeyPriority,
}: PriorityAddPanelProps) {
  const hasSelectableSelectedGame = selectableDropGames.includes(selectedGame);

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-5 flex flex-col gap-5">
      {/* Add from your active drops */}
      <div>
        <SectionLabel inline>add from your drops</SectionLabel>
        <p className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1">
          pick a game that currently has live drops
        </p>
        {selectableDropGames.length > 0 ? (
          <div className="flex gap-2 mt-3">
            <Select
              value={hasSelectableSelectedGame ? selectedGame : NO_GAME_SELECT_VALUE}
              onValueChange={(value) =>
                setSelectedGame(value === NO_GAME_SELECT_VALUE ? "" : value)
              }
            >
              <SelectTrigger tone="dp" className="flex-1" aria-label="Add from drops">
                <SelectValue placeholder="select a game…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NO_GAME_SELECT_VALUE}>select a game…</SelectItem>
                  {selectableDropGames.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="dp-primary"
              size="dp-md"
              onClick={addGameFromSelect}
              disabled={!hasSelectableSelectedGame}
            >
              <Plus size={11} strokeWidth={2} /> add
            </Button>
          </div>
        ) : (
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-3 py-2">
            no extra games with live drops
          </div>
        )}
      </div>

      {/* Manual add */}
      <div>
        <SectionLabel inline>add manually</SectionLabel>
        <p className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1">
          type any game name, even ones with no live drops yet
        </p>
        <div className="flex gap-2 mt-3">
          <Input
            tone="dp"
            value={newGame}
            onChange={(e) => setNewGame(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addGame();
              }
            }}
            placeholder="game name…"
            className="flex-1"
            aria-label="Add game manually"
          />
          <Button
            variant="dp-primary"
            size="dp-md"
            onClick={addGame}
            disabled={!newGame.trim()}
          >
            <Plus size={11} strokeWidth={2} /> add
          </Button>
        </div>
      </div>

      {/* Obey-priority toggle */}
      <div className="rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border-soft)] bg-[color:var(--dp-bg-elevated-2)] p-4 flex items-start gap-3">
        <input
          id="dp-obey-priority"
          type="checkbox"
          checked={obeyPriority}
          onChange={(e) => setObeyPriority(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--dp-accent)]"
        />
        <label htmlFor="dp-obey-priority" className="flex-1 cursor-pointer">
          <div className="text-[12px] text-[color:var(--dp-text)] font-medium">
            strict priority order
          </div>
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-0.5">
            {obeyPriority
              ? "watch engine sticks to the highest-priority live game"
              : "watch engine may pick any live game when the top is blocked"}
          </div>
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "PriorityAddPanel" | head -5
# expected: empty

git add src/renderer/features/priority/PriorityAddPanel.tsx
git commit -m "feat(priority): add PriorityAddPanel composition

Replaces the legacy .priority-panel left side with a stacked layout
of three sections: 'add from your drops' (Select + Add button),
'add manually' (Input + Add button), and the strict-priority toggle
(checkbox + label + dynamic hint copy). Uses Phase 1 primitives
(Button, Input, Select, SectionLabel)."
```

---

## Task 4: Create `PriorityRow.tsx`

Sortable row markup. Uses `useSortable` from dnd-kit; layout matches a dense table row visually (grid template, mono cells, hover tone) without going through the Phase 1 Table primitive (dnd-kit needs ref control).

**Files:**
- Create: `src/renderer/features/priority/PriorityRow.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "@renderer/shared/lib/icons";
import { Pill } from "@renderer/shared/components/ui/pill";
import { cn } from "@renderer/shared/lib/utils";
import { padPriorityRank, type PriorityRowState } from "./priorityHelpers";

export type PriorityRowProps = {
  rank: number;
  game: string;
  state: PriorityRowState;
  onRemove: (game: string) => void;
};

const STATE_LABEL: Record<PriorityRowState, string> = {
  watching: "watching",
  target: "target",
  live: "live",
  idle: "idle",
};

const STATE_TONE: Record<PriorityRowState, "accent" | "ok" | "info" | "dim"> = {
  watching: "accent",
  target: "ok",
  live: "info",
  idle: "dim",
};

export function PriorityRow({ rank, game, state, onRemove }: PriorityRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: game });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridTemplateColumns: "32px 40px 1fr 100px 32px",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group grid items-center gap-3 px-4 h-[52px] border-b border-[color:var(--dp-border-soft)] last:border-b-0",
        "transition-colors hover:bg-[color:var(--dp-bg-elevated-2)]",
        isDragging && "bg-[color:var(--dp-bg-elevated-2)] shadow-[0_4px_16px_rgba(0,0,0,0.4)]",
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${game}`}
        title={`Drag ${game}`}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-[var(--dp-radius-xs)] cursor-grab active:cursor-grabbing",
          "text-[color:var(--dp-text-dimmer)] opacity-0 group-hover:opacity-100",
          "hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text-dim)]",
          isDragging && "opacity-100",
        )}
      >
        <GripVertical size={13} strokeWidth={1.7} />
      </button>

      {/* Rank */}
      <span className="font-mono text-[12px] text-[color:var(--dp-text-dimmer)] tabular-nums">
        {padPriorityRank(rank)}
      </span>

      {/* Game name + active dot */}
      <span className="flex items-center gap-2 min-w-0">
        {state === "watching" && (
          <span
            aria-hidden="true"
            className="inline-block h-[5px] w-[5px] rounded-full bg-[color:var(--dp-accent)] flex-shrink-0 animate-pulse"
            style={{ boxShadow: "0 0 6px var(--dp-accent-glow)" }}
          />
        )}
        <span className="truncate text-[13px] text-[color:var(--dp-text)]">{game}</span>
      </span>

      {/* State pill */}
      <span className="flex justify-start">
        <Pill tone={STATE_TONE[state]} dot={state === "watching" || state === "target"}>
          {STATE_LABEL[state]}
        </Pill>
      </span>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(game)}
        aria-label={`Remove ${game}`}
        title={`Remove ${game}`}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-[var(--dp-radius-xs)]",
          "text-[color:var(--dp-text-dimmer)] opacity-0 group-hover:opacity-100",
          "hover:bg-[rgba(248,113,113,0.10)] hover:text-[color:var(--dp-signal-err)]",
          "transition-colors",
        )}
      >
        <X size={13} strokeWidth={1.8} />
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "PriorityRow" | head -5
# expected: empty

git add src/renderer/features/priority/PriorityRow.tsx
git commit -m "feat(priority): add PriorityRow with dnd-kit + state pill

Sortable row: drag-handle (GripVertical, hover-only opacity) +
mono rank (01-padded, tabular-nums) + game name (with pulsing
violet dot when watching) + state Pill (watching=accent dot,
target=ok dot, live=info, idle=dim) + remove (X, hover-only
opacity, err tone on hover). Uses dnd-kit useSortable directly
because the Phase 1 Table primitive doesn't expose row ref
forwarding."
```

---

## Task 5: Create `PriorityList.tsx`

DndContext + SortableContext wrapper around the rows.

**Files:**
- Create: `src/renderer/features/priority/PriorityList.tsx`

- [ ] **Step 1: Create the file**

```tsx
import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PriorityRow } from "./PriorityRow";
import { derivePriorityRowState } from "./priorityHelpers";

export type PriorityListProps = {
  priorityGames: string[];
  activeTargetGame: string;
  watchingGame: string;
  liveGameSet: Set<string>;
  movePriorityGame: (active: string, over: string) => void;
  removeGame: (name: string) => void;
};

export function PriorityList({
  priorityGames,
  activeTargetGame,
  watchingGame,
  liveGameSet,
  movePriorityGame,
  removeGame,
}: PriorityListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over) return;
      const activeGame = String(active.id);
      const overGame = String(over.id);
      if (!activeGame || !overGame || activeGame === overGame) return;
      movePriorityGame(activeGame, overGame);
    },
    [movePriorityGame],
  );

  if (priorityGames.length === 0) {
    return (
      <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-12 text-center">
        <p className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          no games prioritized yet
        </p>
        <p className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1 opacity-70">
          add a game from the panel on the left
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] overflow-hidden">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={priorityGames} strategy={verticalListSortingStrategy}>
          <ul className="list-none p-0 m-0">
            {priorityGames.map((game, index) => (
              <PriorityRow
                key={game}
                rank={index + 1}
                game={game}
                state={derivePriorityRowState(game, activeTargetGame, watchingGame, liveGameSet)}
                onRemove={removeGame}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "PriorityList" | head -5
# expected: empty

git add src/renderer/features/priority/PriorityList.tsx
git commit -m "feat(priority): add PriorityList dnd-kit wrapper

DndContext + SortableContext + ul of PriorityRow. Empty state when
priorityGames is empty. PointerSensor needs 6px before drag starts
to allow clicks on the remove button without triggering drag."
```

---

## Task 6: Rewrite `PriorityView.tsx`

Compose the 4 new components. Preserve test back-compat via re-export.

**Files:**
- Modify: `src/renderer/features/priority/PriorityView.tsx` (full rewrite, 394 → ~80 lines)

- [ ] **Step 1: Replace the file contents**

```tsx
import * as React from "react";
import { PriorityHeader } from "./PriorityHeader";
import { PriorityAddPanel } from "./PriorityAddPanel";
import { PriorityList } from "./PriorityList";
import { getSelectableDropGames } from "./priorityHelpers";

// Re-export for PriorityView.test.ts (back-compat)
export { getSelectableDropGames } from "./priorityHelpers";

type PriorityViewProps = {
  uniqueGames: string[];
  activeTargetGame: string;
  watchingGame: string;
  selectedGame: string;
  setSelectedGame: (val: string) => void;
  newGame: string;
  setNewGame: (val: string) => void;
  addGame: () => void;
  addGameFromSelect: () => void;
  priorityGames: string[];
  removeGame: (name: string) => void;
  movePriorityGame: (activeGame: string, overGame: string) => void;
  obeyPriority: boolean;
  setObeyPriority: (val: boolean) => void;
};

export function PriorityView({
  uniqueGames,
  activeTargetGame,
  watchingGame,
  selectedGame,
  setSelectedGame,
  newGame,
  setNewGame,
  addGame,
  addGameFromSelect,
  priorityGames,
  removeGame,
  movePriorityGame,
  obeyPriority,
  setObeyPriority,
}: PriorityViewProps) {
  const selectableDropGames = React.useMemo(
    () => getSelectableDropGames(uniqueGames, priorityGames),
    [uniqueGames, priorityGames],
  );

  const liveGameSet = React.useMemo(() => new Set(uniqueGames), [uniqueGames]);

  const livePriorityCount = React.useMemo(
    () => priorityGames.filter((game) => liveGameSet.has(game)).length,
    [priorityGames, liveGameSet],
  );

  const topGame = priorityGames[0] ?? "";

  // Reset selected-game when it's no longer selectable
  const hasSelectableSelectedGame = selectableDropGames.includes(selectedGame);
  React.useEffect(() => {
    if (!selectedGame || hasSelectableSelectedGame) return;
    setSelectedGame("");
  }, [hasSelectableSelectedGame, selectedGame, setSelectedGame]);

  return (
    <div className="flex flex-col gap-5">
      <PriorityHeader
        totalCount={priorityGames.length}
        livePriorityCount={livePriorityCount}
        activeTargetGame={activeTargetGame}
        watchingGame={watchingGame}
        topGame={topGame}
        obeyPriority={obeyPriority}
      />

      <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(320px, 1fr) 1.4fr" }}>
        <PriorityAddPanel
          selectableDropGames={selectableDropGames}
          selectedGame={selectedGame}
          setSelectedGame={setSelectedGame}
          addGameFromSelect={addGameFromSelect}
          newGame={newGame}
          setNewGame={setNewGame}
          addGame={addGame}
          obeyPriority={obeyPriority}
          setObeyPriority={setObeyPriority}
        />

        <PriorityList
          priorityGames={priorityGames}
          activeTargetGame={activeTargetGame}
          watchingGame={watchingGame}
          liveGameSet={liveGameSet}
          movePriorityGame={movePriorityGame}
          removeGame={removeGame}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tests still pass**

`npm test 2>&1 | tail -10` — 214/214 pass. `PriorityView.test.ts` imports `getSelectableDropGames` from `"./PriorityView"`, which re-exports from `./priorityHelpers`.

- [ ] **Step 3: tsc clean + commit**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "PriorityView" | head -5
# expected: empty (or only pre-existing errors, none new)

git add src/renderer/features/priority/PriorityView.tsx
git commit -m "feat(priority): rewrite PriorityView as composition

Replaces the 394-line monolith with: PriorityHeader (3-stat
overview) + 2-column grid of PriorityAddPanel (left) + PriorityList
(right with dnd-kit). Re-exports getSelectableDropGames from
priorityHelpers.ts so PriorityView.test.ts keeps passing.

Drops the legacy .priority-list-card layout, .priority-summary-card
grid, and the inline drag-handle 6-dot grip in favor of the
GripVertical Lucide icon. State derivation moves into
derivePriorityRowState helper."
```

---

## Task 7: Phase 1 follow-up — TableCell class redundancy

Final-review note (Phase 1): the `TableCell` cn() branch list includes a redundant `mono && !dim` rule that produces the same color as the `!dim && !mono` rule. Simplify.

**Files:**
- Modify: `src/renderer/shared/components/ui/table.tsx`

- [ ] **Step 1: Locate the TableCell component**

Read `src/renderer/shared/components/ui/table.tsx`. Find the `TableCell` cn() block. Currently:

```tsx
    className={cn(
      "min-w-0 truncate",
      mono && "font-mono text-[12px]",
      dim && "text-[color:var(--dp-text-dim)]",
      !dim && !mono && "text-[color:var(--dp-text)]",
      mono && !dim && "text-[color:var(--dp-text)]",
      className,
    )}
```

Replace with the cleaner equivalent (one ternary on `dim`):

```tsx
    className={cn(
      "min-w-0 truncate",
      mono && "font-mono text-[12px]",
      dim ? "text-[color:var(--dp-text-dim)]" : "text-[color:var(--dp-text)]",
      className,
    )}
```

This collapses 3 conditional branches into 1 ternary that produces the same output:
- `mono=false, dim=false` → text-[--dp-text] ✓
- `mono=true, dim=false` → font-mono + text-[--dp-text] ✓
- `mono=false, dim=true` → text-[--dp-text-dim] ✓
- `mono=true, dim=true` → font-mono + text-[--dp-text-dim] ✓

- [ ] **Step 2: tsc + tests**

`npx tsc --noEmit -p tsconfig.json 2>&1 | grep "table.tsx" | head -5` — empty.
`npm test 2>&1 | tail -5` — 214/214.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/components/ui/table.tsx
git commit -m "refactor(ui): simplify TableCell color logic

Removes the redundant 'mono && !dim' branch flagged in Phase 1
final review. The new ternary on dim produces the same four-quadrant
output (mono x dim) with one fewer rule. No visual change."
```

---

## Task 8: Phase 1 follow-up — AppNav `LucideIcon` type

Phase 1 final review note: `ICON_MAP` in `AppNav` uses an inline structural type instead of Lucide's exported `LucideIcon` type. Switch.

**Files:**
- Modify: `src/renderer/shared/components/chrome/AppNav.tsx`

- [ ] **Step 1: Update the type**

Read `src/renderer/shared/components/chrome/AppNav.tsx`. Find the import block at the top — add `LucideIcon` to it (it's a separate type export from `lucide-react`, NOT from the central icon module):

```tsx
import type { LucideIcon } from "lucide-react";
```

Then find `ICON_MAP`:
```tsx
const ICON_MAP: Record<AppNavView, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
```

Replace its type annotation with:
```tsx
const ICON_MAP: Record<AppNavView, LucideIcon> = {
```

The rest of the object literal is unchanged.

- [ ] **Step 2: tsc clean**

`npx tsc --noEmit -p tsconfig.json 2>&1 | grep "AppNav" | head -5` — empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/components/chrome/AppNav.tsx
git commit -m "refactor(chrome): type AppNav ICON_MAP as LucideIcon

Phase 1 final review note: the inline structural type was strictly
narrower than Lucide's actual icon component type (which extends
SVGAttributes via ForwardRefExoticComponent). Importing LucideIcon
directly from lucide-react is more descriptive and survives Lucide
API additions without manual updates."
```

---

## Task 9: Phase 1 follow-up — Logo border-ring `color-mix`

Phase 1 final review note: `Logo.tsx` border ring uses a hardcoded `rgba(167,139,250,0.35)` that doesn't track the light-mode accent shift. Replace with `color-mix`.

**Files:**
- Modify: `src/renderer/shared/components/Logo.tsx`

- [ ] **Step 1: Update the stroke value**

Read `src/renderer/shared/components/Logo.tsx`. Find this line (around line 31):
```tsx
      <rect x="0.5" y="0.5" width="15" height="15" rx="3" stroke="rgba(167,139,250,0.35)" strokeWidth="1" />
```

Replace `stroke="rgba(167,139,250,0.35)"` with `stroke="color-mix(in srgb, var(--dp-accent) 35%, transparent)"`:

```tsx
      <rect
        x="0.5"
        y="0.5"
        width="15"
        height="15"
        rx="3"
        stroke="color-mix(in srgb, var(--dp-accent) 35%, transparent)"
        strokeWidth="1"
      />
```

Now the border ring tracks the active theme's accent.

- [ ] **Step 2: tsc clean**

`npx tsc --noEmit -p tsconfig.json 2>&1 | grep "Logo" | head -5` — empty.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/shared/components/Logo.tsx
git commit -m "refactor(brand): Logo border-ring tracks accent via color-mix

Phase 1 final review note: the border stroke was hardcoded rgba
matching the dark-mode --dp-accent. In light mode the gradient fill
shifts (dark #a78bfa → light #7c5fe6) but the border ring stayed
violet, creating a subtle mismatch. Using color-mix(in srgb,
var(--dp-accent) 35%, transparent) keeps the ring in sync with the
active accent."
```

---

## Task 10: Verify end-to-end

- [ ] **Step 1: Lint**

`npm run lint` — exit 0. New warnings introduced by Phase 4 must be fixed.

- [ ] **Step 2: TypeScript**

`npx tsc --noEmit -p tsconfig.json` — pre-existing errors only (~19 from Phase 3 baseline). Any new errors in Phase 4 files must be fixed.

- [ ] **Step 3: Tests**

`npm test 2>&1 | tail -10` — 214/214 pass. `PriorityView.test.ts` (3 tests for `getSelectableDropGames`) keeps passing via re-export.

- [ ] **Step 4: Format**

`npm run format` — commit if anything reformatted:
```bash
git diff --quiet || (git add -A && git commit -m "chore: prettier format design-overhaul phase 4 files")
```

- [ ] **Step 5: Build**

`npm run build` — exit 0.

- [ ] **Step 6: Branch summary**

`git log --oneline feat/design-overhaul-phase-3-inventory..HEAD`

Expected (in any order, with format commit at end):
- docs(plan): add design overhaul phase 4 priorities plan
- feat(priority): extract priorityHelpers module
- feat(priority): add PriorityHeader with 3 summary stats
- feat(priority): add PriorityAddPanel composition
- feat(priority): add PriorityRow with dnd-kit + state pill
- feat(priority): add PriorityList dnd-kit wrapper
- feat(priority): rewrite PriorityView as composition
- refactor(ui): simplify TableCell color logic
- refactor(chrome): type AppNav ICON_MAP as LucideIcon
- refactor(brand): Logo border-ring tracks accent via color-mix
- chore: prettier format (if any)

---

## Out of Scope

- Control view migration (deferred to Phase 5 — too large for stacked PR)
- HeroPanel quick action wiring (claim/pause/switch) — deferred to Phase 5 when Control's actions are accessible
- Per-game-priority drop counts on each PriorityRow (data not currently surfaced by useAppModel.priorityProps)
- Settings view (Phase 6)
- Debug view (Phase 7 or final cleanup)
- Deleting legacy `.priority-*` CSS classes — Phase 6 cleanup

## Open items for follow-up

- **i18n coverage** — Phase 4 strings (header copy, panel labels, state pill text, empty-state copy) are English-only. Phase 6 sweeps.
- **Drag-handle keyboard activation** — dnd-kit's `KeyboardSensor` is wired but UI hint for "Press Space to drag" isn't shown. Acceptable; document keyboard reordering in a future help/onboarding pass.
- **Mini-stats per row** — when `useAppModel.priorityProps` adds drops-earned/pending per game, surface them in a right-aligned cell.
