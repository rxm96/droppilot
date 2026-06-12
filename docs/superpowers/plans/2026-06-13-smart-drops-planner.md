# Smart Drops Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an advisory, deadline-ordered "Plan-Queue" card to the Overview that tells the user which games to watch and in what order, with a per-drop feasibility flag.

**Architecture:** A pure function `buildDropsPlan(items, now)` (in `shared/domain/`) computes an Earliest-Deadline-First plan grouped by game, with feasibility evaluated **per drop** (drops of a game progress in parallel against their own deadlines). A thin `DropsPlanCard` renders it, sourcing a 60s `now` tick from the existing `useVisibleTick`. No changes to the watch engine, IPC, or `useAppModel`.

**Tech Stack:** TypeScript, React 19, Vitest (pure-function tests only — no `@testing-library/react`), Tailwind v4 with `--dp-*` design tokens.

**Spec:** `docs/superpowers/specs/2026-06-13-smart-drops-planner-design.md`

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/renderer/shared/domain/dropsPlanner.ts` | **new** — `PlanDrop` / `PlanEntry` types, `isPlannableDrop`, `buildDropsPlan` (all pure) |
| `src/renderer/shared/domain/dropsPlanner.test.ts` | **new** — unit tests for the planner |
| `src/renderer/features/overview/DropsPlanCard.tsx` | **new** — the Plan-Queue card (thin React wrapper) |
| `src/renderer/features/overview/OverviewView.tsx` | **modify** — mount `<DropsPlanCard items={items} />` |
| `src/renderer/shared/i18n.tsx` | **modify** — add `plan.*` keys to the EN and DE blocks |

---

## Task 1: Pure planner (`dropsPlanner.ts`)

**Files:**
- Create: `src/renderer/shared/domain/dropsPlanner.ts`
- Test: `src/renderer/shared/domain/dropsPlanner.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/renderer/shared/domain/dropsPlanner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@renderer/shared/types";
import { buildDropsPlan } from "./dropsPlanner";

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const iso = (offsetMinutes: number) => new Date(NOW + offsetMinutes * MIN).toISOString();

const makeItem = (o: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "d1",
  game: "Rust",
  title: "Drop",
  requiredMinutes: 60,
  earnedMinutes: 0,
  status: "progress",
  ...o,
});

describe("buildDropsPlan", () => {
  it("returns [] for empty input", () => {
    expect(buildDropsPlan([], NOW)).toEqual([]);
  });

  it("groups differently-cased game names into one entry", () => {
    const plan = buildDropsPlan(
      [
        makeItem({ id: "a", game: "Marvel Rivals" }),
        makeItem({ id: "b", game: "marvel rivals " }),
      ],
      NOW,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].totalDropCount).toBe(2);
  });

  it("treats parallel tiers as feasible against their own deadlines (regression)", () => {
    // Short low tier (40min deadline) + long high tier (far deadline), same game.
    // The old min-deadline/max-remaining model wrongly flagged this 'lost'.
    const plan = buildDropsPlan(
      [
        makeItem({ id: "low", requiredMinutes: 30, endsAt: iso(40) }),
        makeItem({ id: "high", requiredMinutes: 120, endsAt: iso(60 * 24 * 9) }),
      ],
      NOW,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].status).toBe("ok");
    expect(plan[0].feasibleDropCount).toBe(2);
  });

  it("marks a game partial when one tier can't make its deadline", () => {
    const plan = buildDropsPlan(
      [
        makeItem({ id: "doomed", requiredMinutes: 30, endsAt: iso(10) }),
        makeItem({ id: "fine", requiredMinutes: 60, endsAt: iso(60 * 24 * 5) }),
      ],
      NOW,
    );
    expect(plan[0].status).toBe("partial");
    expect(plan[0].feasibleDropCount).toBe(1);
    expect(plan[0].totalDropCount).toBe(2);
  });

  it("orders games earliest-deadline-first", () => {
    const plan = buildDropsPlan(
      [
        makeItem({ id: "y", game: "Y", endsAt: iso(180) }),
        makeItem({ id: "x", game: "X", endsAt: iso(60) }),
      ],
      NOW,
    );
    expect(plan.map((e) => e.gameLabel)).toEqual(["X", "Y"]);
  });

  it("sorts games with no deadline last", () => {
    const plan = buildDropsPlan(
      [
        makeItem({ id: "none", game: "NoDeadline", endsAt: undefined }),
        makeItem({ id: "dated", game: "Dated", endsAt: iso(60) }),
      ],
      NOW,
    );
    expect(plan.map((e) => e.gameLabel)).toEqual(["Dated", "NoDeadline"]);
  });

  it("accumulates watch time across games and skips lost ones (skip-not-block)", () => {
    // A: 180min, ends 4h → feasible alone, consumes 3h.
    // B: 120min, ends 4.5h → after A's 3h, completes at 5h > 4.5h → lost, consumes 0.
    // C: 60min,  ends 6h  → after A only (cursor still 180), completes 4h ≤ 6h → feasible.
    const plan = buildDropsPlan(
      [
        makeItem({ id: "a", game: "A", requiredMinutes: 180, endsAt: iso(240) }),
        makeItem({ id: "b", game: "B", requiredMinutes: 120, endsAt: iso(270) }),
        makeItem({ id: "c", game: "C", requiredMinutes: 60, endsAt: iso(360) }),
      ],
      NOW,
    );
    const byGame = Object.fromEntries(plan.map((e) => [e.gameLabel, e.status]));
    expect(byGame).toEqual({ A: "ok", B: "lost", C: "ok" });
  });

  it("treats a malformed endsAt as no deadline (feasible, never NaN)", () => {
    const plan = buildDropsPlan([makeItem({ endsAt: "not-a-date" })], NOW);
    expect(plan[0].deadlineMs).toBeNull();
    expect(plan[0].status).toBe("ok");
  });

  it("filters out claimed / claimable / excluded / expired / future-start drops", () => {
    const plan = buildDropsPlan(
      [
        makeItem({ id: "claimed", status: "claimed" }),
        makeItem({ id: "claimable", isClaimable: true }),
        makeItem({ id: "excluded", excluded: true }),
        makeItem({ id: "expired", campaignStatus: "EXPIRED" }),
        makeItem({ id: "future", status: "locked", startsAt: iso(120) }),
      ],
      NOW,
    );
    expect(plan).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/shared/domain/dropsPlanner.test.ts`
Expected: FAIL — cannot resolve `./dropsPlanner` (module does not exist yet).

- [ ] **Step 3: Implement the planner**

Create `src/renderer/shared/domain/dropsPlanner.ts`:

```ts
import type { InventoryItem } from "@renderer/shared/types";
import { canEarnDrop } from "./inventory/inventoryRules";
import { InventoryDrop } from "./dropDomain";
import { normalizeGameName } from "./gameName";

const MINUTE_MS = 60_000;

export type PlanDrop = {
  id: string;
  title: string;
  requiredMinutes: number;
  earnedMinutes: number;
  remainingMinutes: number;
  deadlineMs: number | null; // finite-parsed endsAt; null = no/non-finite deadline
  feasible: boolean; // finishes before its OWN deadline in plan order
};

export type PlanEntry = {
  gameKey: string; // normalizeGameName(game) — grouping identity
  gameLabel: string; // original-cased name for display
  watchMinutes: number; // minutes actually spent here (max remaining among feasible drops)
  deadlineMs: number | null; // earliest drop deadline → EDF sort + countdown
  status: "ok" | "partial" | "lost";
  feasibleDropCount: number;
  totalDropCount: number;
  drops: PlanDrop[]; // sorted by remainingMinutes ascending
};

/** ISO → ms with a finite guard (mirrors InventoryDrop.isExpired parsing). */
function parseFiniteMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** A drop is plannable if it can still be earned and is not excluded/expired/future. */
export function isPlannableDrop(item: InventoryItem, now: number): boolean {
  if (!canEarnDrop(item, { allowUpcoming: true })) return false;
  if (item.excluded === true) return false;
  if (new InventoryDrop(item).isExpired(now)) return false;
  const startsAtMs = parseFiniteMs(item.startsAt);
  if (startsAtMs !== null && startsAtMs > now) return false;
  return true;
}

export function buildDropsPlan(items: InventoryItem[], now: number): PlanEntry[] {
  // 1. Filter to plannable drops.
  const plannable = items.filter((it) => isPlannableDrop(it, now));

  // 2. Group by normalized game name (keep first-seen original casing for display).
  const groups = new Map<string, { label: string; items: InventoryItem[] }>();
  for (const it of plannable) {
    const key = normalizeGameName(it.game);
    const group = groups.get(key);
    if (group) group.items.push(it);
    else groups.set(key, { label: it.game, items: [it] });
  }

  // 3. Build per-game shells: drops (sorted by remaining asc) + earliest deadline.
  type Shell = {
    gameKey: string;
    gameLabel: string;
    deadlineMs: number | null;
    drops: Omit<PlanDrop, "feasible">[];
  };
  const shells: Shell[] = [];
  for (const [key, { label, items: groupItems }] of groups) {
    const drops = groupItems
      .map((it) => {
        const drop = new InventoryDrop(it);
        return {
          id: drop.id,
          title: drop.title,
          requiredMinutes: drop.requiredMinutes,
          earnedMinutes: drop.earnedMinutes,
          remainingMinutes: drop.remainingMinutes,
          deadlineMs: parseFiniteMs(it.endsAt),
        };
      })
      .sort((a, b) => a.remainingMinutes - b.remainingMinutes);
    const deadlines = drops
      .map((d) => d.deadlineMs)
      .filter((v): v is number => v !== null);
    const deadlineMs = deadlines.length ? Math.min(...deadlines) : null;
    shells.push({ gameKey: key, gameLabel: label, deadlineMs, drops });
  }

  // 4. EDF sort: earliest deadline first (null = +Infinity, last). Tiebreak by the
  //    binding (longest) drop's remaining, then label, for determinism.
  shells.sort((a, b) => {
    const da = a.deadlineMs ?? Number.POSITIVE_INFINITY;
    const db = b.deadlineMs ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const wa = Math.max(0, ...a.drops.map((d) => d.remainingMinutes));
    const wb = Math.max(0, ...b.drops.map((d) => d.remainingMinutes));
    if (wa !== wb) return wa - wb;
    return a.gameLabel.localeCompare(b.gameLabel);
  });

  // 5. Feasibility walk: a cursor of watch-minutes accumulates across games.
  const result: PlanEntry[] = [];
  let cursor = 0;
  for (const shell of shells) {
    const cursorStart = cursor;
    const drops: PlanDrop[] = shell.drops.map((d) => {
      const completionMs = now + (cursorStart + d.remainingMinutes) * MINUTE_MS;
      const feasible = d.deadlineMs === null || completionMs <= d.deadlineMs;
      return { ...d, feasible };
    });
    const feasibleDrops = drops.filter((d) => d.feasible);
    const watchMinutes = feasibleDrops.length
      ? Math.max(...feasibleDrops.map((d) => d.remainingMinutes))
      : 0;
    const status: PlanEntry["status"] =
      feasibleDrops.length === drops.length
        ? "ok"
        : feasibleDrops.length > 0
          ? "partial"
          : "lost";
    cursor = cursorStart + watchMinutes;
    result.push({
      gameKey: shell.gameKey,
      gameLabel: shell.gameLabel,
      watchMinutes,
      deadlineMs: shell.deadlineMs,
      status,
      feasibleDropCount: feasibleDrops.length,
      totalDropCount: drops.length,
      drops,
    });
  }
  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/shared/domain/dropsPlanner.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/renderer/shared/domain/dropsPlanner.ts src/renderer/shared/domain/dropsPlanner.test.ts
git add src/renderer/shared/domain/dropsPlanner.ts src/renderer/shared/domain/dropsPlanner.test.ts
git commit -m "feat(planner): pure buildDropsPlan (EDF, per-drop feasibility)"
```

---

## Task 2: i18n keys

**Files:**
- Modify: `src/renderer/shared/i18n.tsx` (both the `en` and `de` dictionary blocks)

- [ ] **Step 1: Add the keys to the EN block**

Find the English `queue.header` key (search for `"queue.header":`) and add these seven keys immediately after it, in the same block:

```ts
    "plan.title": "Plan",
    "plan.empty": "No open drops scheduled",
    "plan.remaining": "{time} left",
    "plan.endsIn": "ends in {time}",
    "plan.feasibleCount": "{count} of {total} reachable",
    "plan.atRisk": "{count} of {total} drops won't make it",
    "plan.lost": "won't make it",
```

- [ ] **Step 2: Add the keys to the DE block**

Find the German `queue.header` key (the second occurrence of `"queue.header":` in the file) and add these seven keys immediately after it, in the same block:

```ts
    "plan.title": "Plan",
    "plan.empty": "Keine offenen Drops eingeplant",
    "plan.remaining": "noch {time}",
    "plan.endsIn": "endet in {time}",
    "plan.feasibleCount": "{count} von {total} schaffbar",
    "plan.atRisk": "{count} von {total} Drops nicht schaffbar",
    "plan.lost": "nicht schaffbar",
```

- [ ] **Step 3: Typecheck + confirm DE parity**

Run: `npm run typecheck`
Expected: exit 0. Note: the `t()` key type derives from the **EN** block, so typecheck guarantees EN has every key the components use — but a **missing DE key falls back to EN silently and is NOT a type error**. Manually confirm all seven `plan.*` keys are present in the DE block before moving on.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write src/renderer/shared/i18n.tsx
git add src/renderer/shared/i18n.tsx
git commit -m "feat(planner): add plan.* i18n keys (EN + DE)"
```

---

## Task 3: `DropsPlanCard` component

**Files:**
- Create: `src/renderer/features/overview/DropsPlanCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/features/overview/DropsPlanCard.tsx`:

```tsx
import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@renderer/shared/components/ui/card";
import { Pill } from "@renderer/shared/components/ui/pill";
import type { InventoryItem } from "@renderer/shared/types";
import { useI18n } from "@renderer/shared/i18n";
import { useVisibleTick } from "@renderer/shared/hooks/useVisibleTick";
import { cn } from "@renderer/shared/lib/utils";
import { buildDropsPlan, type PlanEntry } from "@renderer/shared/domain/dropsPlanner";
import { formatRemaining } from "@renderer/shared/utils";

const URGENT_MS = 2 * 60 * 60 * 1000;
type TFn = ReturnType<typeof useI18n>["t"];

export type DropsPlanCardProps = {
  items: InventoryItem[];
};

export function DropsPlanCard({ items }: DropsPlanCardProps) {
  const { t } = useI18n();
  // Owns its own 60s tick (paused while the window is hidden) so feasibility/
  // countdowns refresh without any useAppModel plumbing.
  const now = useVisibleTick(60_000);
  const plan = React.useMemo(() => buildDropsPlan(items, now), [items, now]);
  const feasibleCount = plan.filter((e) => e.status === "ok").length;

  return (
    <Card className="bg-[color:var(--dp-bg-elevated)] border-[color:var(--dp-border)] rounded-[var(--dp-radius-lg)]">
      <CardHeader className="flex flex-row items-center justify-between border-b border-[color:var(--dp-border-soft)] py-3.5">
        <CardTitle className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dim)] font-normal">
          {t("plan.title")}
        </CardTitle>
        {plan.length > 0 && (
          <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
            {t("plan.feasibleCount", { count: feasibleCount, total: plan.length })}
          </span>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {plan.length === 0 ? (
          <div className="px-5 py-8 text-center font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {t("plan.empty")}
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--dp-border-soft)]">
            {plan.map((entry, idx) => (
              <PlanRow key={entry.gameKey} entry={entry} rank={idx + 1} now={now} t={t} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PlanRow({
  entry,
  rank,
  now,
  t,
}: {
  entry: PlanEntry;
  rank: number;
  now: number;
  t: TFn;
}) {
  // Representative = the longest open drop (drops are sorted by remaining asc).
  const rep = entry.drops[entry.drops.length - 1];
  const pct =
    rep.requiredMinutes > 0 ? Math.round((rep.earnedMinutes / rep.requiredMinutes) * 100) : 0;
  const urgent = entry.deadlineMs !== null && entry.deadlineMs - now < URGENT_MS;
  const lost = entry.status === "lost";
  const countdown =
    entry.deadlineMs !== null
      ? t("plan.endsIn", {
          time: formatRemaining(Math.max(0, Math.round((entry.deadlineMs - now) / 1000))),
        })
      : null;

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-5 py-3",
        lost && "opacity-50",
        urgent && !lost && "border-l-2 border-l-[color:var(--dp-signal-err)]",
      )}
    >
      <span className="font-mono text-[11px] tabular-nums text-[color:var(--dp-text-dimmer)]">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[13px] text-[color:var(--dp-text)]",
            lost && "line-through",
          )}
        >
          {entry.gameLabel}
          <span className="text-[color:var(--dp-text-dimmer)]"> · {rep.title}</span>
        </div>
        <div className="mt-1 h-[5px] w-full overflow-hidden rounded-full bg-[color:var(--dp-border)]">
          <div
            className="h-full bg-[color:var(--dp-signal-ok)]"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {entry.status === "lost" ? (
          <Pill tone="err">⚠ {t("plan.lost")}</Pill>
        ) : entry.status === "partial" ? (
          <Pill tone="warn">
            ⚠{" "}
            {t("plan.atRisk", {
              count: entry.totalDropCount - entry.feasibleDropCount,
              total: entry.totalDropCount,
            })}
          </Pill>
        ) : (
          <Pill tone="ok">
            ⏳ {t("plan.remaining", { time: formatRemaining(entry.watchMinutes * 60) })}
          </Pill>
        )}
        {countdown && (
          <span
            className={cn(
              "font-mono text-[10px]",
              urgent
                ? "text-[color:var(--dp-signal-err)]"
                : "text-[color:var(--dp-text-dimmer)]",
            )}
          >
            {countdown}
          </span>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. (Verifies the `t(...)` numeric params, `Pill` tones, and import paths resolve.)

- [ ] **Step 3: Format and commit**

```bash
npx prettier --write src/renderer/features/overview/DropsPlanCard.tsx
git add src/renderer/features/overview/DropsPlanCard.tsx
git commit -m "feat(planner): DropsPlanCard renders the EDF plan-queue"
```

---

## Task 4: Mount in Overview + full verification

**Files:**
- Modify: `src/renderer/features/overview/OverviewView.tsx`

- [ ] **Step 1: Import the card**

In `src/renderer/features/overview/OverviewView.tsx`, add this import alongside the other panel imports near the top of the file:

```tsx
import { DropsPlanCard } from "./DropsPlanCard";
```

- [ ] **Step 2: Mount the card under the queue**

In `OverviewView.tsx`, the left column already renders `<QueuePanel items={items} ... />` (around line 108). Add the planner card directly after it, in the same `<div className="flex flex-col gap-6">` column:

```tsx
        <QueuePanel items={items} activeDrop={activeDrop ?? null} targetGame={activeGame} />
        <DropsPlanCard items={items} />
```

(`items` is the already-unwrapped `InventoryItem[]` derived from `inventory: InventoryState` at the top of the component — the same value passed to `QueuePanel`. No new plumbing.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0 on both tsconfigs.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — the existing suite plus the 9 new `dropsPlanner` tests.

- [ ] **Step 5: Format-check and build**

Run: `npm run format:check`
Expected: exit 0 (no files need reformatting). If it fails, run `npm run format` and re-commit.

Run: `npm run build`
Expected: builds renderer + main/preload with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/features/overview/OverviewView.tsx
git commit -m "feat(planner): mount DropsPlanCard in the Overview"
```

---

## Self-review notes (already reconciled with the spec)

- **Spec coverage:** filter (excluded/expired/future/canEarnDrop) → Task 1 Step 3 `isPlannableDrop`; normalized grouping → Task 1; per-drop feasibility + partial/lost → Task 1 + tests; EDF + skip-not-block → Task 1 tests; card layout/urgency/empty-state → Task 3; `useVisibleTick` countdown → Task 3; EN+DE i18n → Task 2; Overview mount → Task 4.
- **Type consistency:** `PlanEntry` / `PlanDrop` field names (`gameKey`, `gameLabel`, `watchMinutes`, `deadlineMs`, `status`, `feasibleDropCount`, `totalDropCount`, `drops`) are identical across the planner, the card, and the tests.
- **No watch-engine / IPC / `useAppModel` changes** — confirmed by the Files-touched table.
