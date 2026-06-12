# Smart Drops Planner — Priority-Aware Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Smart Drops Planner mirror the watch engine's actual farming order (priority order; strict = priority games only; permissive = priority then fallback) and turn deadlines into a per-game feasibility/risk warning, instead of sorting everything by pure EDF.

**Architecture:** Extend the pure `buildDropsPlan` with an optional `{ priorityGames, obeyPriority }` options arg that drives game ordering; the per-drop feasibility walk then runs along that engine order. The card receives `priorityGames`/`obeyPriority` as props threaded from `useAppModel` → `OverviewView` (NOT by re-calling `useSettingsStore`, which is a per-call `useState` hook with no shared store). Adds a priority-rank cell and a fallback divider.

**Tech Stack:** TypeScript, React 19, Vitest (pure-function tests only), Tailwind v4 `--dp-*` tokens.

**Spec:** `docs/superpowers/specs/2026-06-13-smart-drops-planner-priority-aware-design.md` (addendum to `…-smart-drops-planner-design.md`).

---

## File structure

| File | Change |
| --- | --- |
| `src/renderer/shared/domain/dropsPlanner.ts` | **modify** — add `DropsPlanOptions`, priority partition/order, `isPriority`/`priorityRank` |
| `src/renderer/shared/domain/dropsPlanner.test.ts` | **modify** — append priority-aware tests (existing 11 must stay green) |
| `src/renderer/shared/i18n.tsx` | **modify** — add `plan.fallbackDivider` (EN + DE) |
| `src/renderer/features/overview/DropsPlanCard.tsx` | **modify** — optional `priorityGames`/`obeyPriority` props, priority rank cell, fallback divider |
| `src/renderer/features/overview/OverviewView.tsx` | **modify** — add the two fields to `OverviewProps`, pass to `DropsPlanCard` |
| `src/renderer/shared/hooks/app/useAppModel.ts` | **modify** — add `priorityGames`/`obeyPriority` to `overviewProps` |

**Task ordering note:** Task 3 makes the card props **optional** (default `[]`/`false`), so the existing `<DropsPlanCard items={items} />` in `OverviewView` still typechecks after Task 3. Task 4 then threads the real values. Each task ends typecheck-green.

---

## Task 1: Priority-aware planner (`dropsPlanner.ts`)

**Files:**
- Modify: `src/renderer/shared/domain/dropsPlanner.ts`
- Test: `src/renderer/shared/domain/dropsPlanner.test.ts`

- [ ] **Step 1: Append the failing tests**

Append this new `describe` block to the END of `src/renderer/shared/domain/dropsPlanner.test.ts` (it reuses the existing `makeItem`, `iso`, `NOW` helpers already defined at the top of the file). Do NOT modify the existing tests.

```ts
describe("buildDropsPlan — priority-aware", () => {
  it("strict mode shows only priority games, in priority order", () => {
    const plan = buildDropsPlan(
      [
        makeItem({ id: "a", game: "Apex", endsAt: iso(60) }),
        makeItem({ id: "b", game: "Brawl", endsAt: iso(30) }),
        makeItem({ id: "c", game: "Cult", endsAt: iso(10) }),
      ],
      NOW,
      { priorityGames: ["Brawl", "Apex"], obeyPriority: true },
    );
    expect(plan.map((e) => e.gameLabel)).toEqual(["Brawl", "Apex"]);
    // Non-priority "Cult" excluded even though its deadline is soonest.
    expect(plan.some((e) => e.gameLabel === "Cult")).toBe(false);
  });

  it("permissive mode lists priority games first, then fallback by EDF", () => {
    const plan = buildDropsPlan(
      [
        makeItem({ id: "p1", game: "P1", endsAt: iso(600) }),
        makeItem({ id: "f-late", game: "FLate", endsAt: iso(300) }),
        makeItem({ id: "f-soon", game: "FSoon", endsAt: iso(120) }),
      ],
      NOW,
      { priorityGames: ["P1"], obeyPriority: false },
    );
    expect(plan.map((e) => e.gameLabel)).toEqual(["P1", "FSoon", "FLate"]);
    expect(plan.map((e) => e.isPriority)).toEqual([true, false, false]);
  });

  it("assigns 1-based priorityRank matched case-insensitively", () => {
    const plan = buildDropsPlan([makeItem({ game: "Rust" })], NOW, {
      priorityGames: ["rust"],
      obeyPriority: false,
    });
    expect(plan[0].isPriority).toBe(true);
    expect(plan[0].priorityRank).toBe(1);
  });

  it("computes feasibility along priority order (deadline risk), not EDF", () => {
    const items = [
      makeItem({ id: "a", game: "A", requiredMinutes: 180, endsAt: iso(10000) }),
      makeItem({ id: "b", game: "B", requiredMinutes: 60, endsAt: iso(90) }),
    ];
    // Priority order [A, B]: A consumes 180min, so B completes at 240min > 90min → lost.
    const strict = buildDropsPlan(items, NOW, { priorityGames: ["A", "B"], obeyPriority: true });
    expect(strict.find((e) => e.gameLabel === "B")?.status).toBe("lost");
    // Pure EDF (no options) would farm B first → B feasible.
    const edf = buildDropsPlan(items, NOW);
    expect(edf.find((e) => e.gameLabel === "B")?.status).toBe("ok");
  });

  it("empty priority list + permissive equals the pure-EDF (no-options) result", () => {
    const items = [
      makeItem({ id: "x", game: "X", endsAt: iso(120) }),
      makeItem({ id: "y", game: "Y", endsAt: iso(60) }),
    ];
    expect(buildDropsPlan(items, NOW, { priorityGames: [], obeyPriority: false })).toEqual(
      buildDropsPlan(items, NOW),
    );
  });

  it("empty priority list + strict yields an empty plan", () => {
    const plan = buildDropsPlan([makeItem({ game: "X", endsAt: iso(60) })], NOW, {
      priorityGames: [],
      obeyPriority: true,
    });
    expect(plan).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/renderer/shared/domain/dropsPlanner.test.ts`
Expected: the 11 existing tests still PASS; the 6 new ones FAIL (e.g. `buildDropsPlan` ignores the 3rd arg, `isPriority`/`priorityRank` undefined).

- [ ] **Step 3: Rewrite `dropsPlanner.ts` with the options-driven ordering**

Overwrite `src/renderer/shared/domain/dropsPlanner.ts` with this exact content:

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
  deadlineMs: number | null;
  feasible: boolean;
};

export type PlanEntry = {
  gameKey: string;
  gameLabel: string;
  watchMinutes: number;
  deadlineMs: number | null; // earliest tier deadline — countdown; per-drop feasibility uses each drop's own deadlineMs
  status: "ok" | "partial" | "lost";
  feasibleDropCount: number;
  totalDropCount: number;
  isPriority: boolean; // game is on the priority list
  priorityRank: number | null; // 1-based priority position; null for fallback games
  drops: PlanDrop[];
};

export type DropsPlanOptions = {
  priorityGames: string[];
  obeyPriority: boolean;
};

const DEFAULT_OPTIONS: DropsPlanOptions = { priorityGames: [], obeyPriority: false };

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

type Shell = {
  gameKey: string;
  gameLabel: string;
  deadlineMs: number | null;
  drops: Omit<PlanDrop, "feasible">[];
};

export function buildDropsPlan(
  items: InventoryItem[],
  now: number,
  options: DropsPlanOptions = DEFAULT_OPTIONS,
): PlanEntry[] {
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
    const deadlines = drops.map((d) => d.deadlineMs).filter((v): v is number => v !== null);
    const deadlineMs = deadlines.length ? Math.min(...deadlines) : null;
    shells.push({ gameKey: key, gameLabel: label, deadlineMs, drops });
  }

  // 4. Order by the engine's actual farming order, not pure deadline.
  //    priorityRankByKey: normalized priority game → 1-based rank (lowest index wins).
  const priorityRankByKey = new Map<string, number>();
  options.priorityGames.forEach((game, idx) => {
    const key = normalizeGameName(game);
    if (key && !priorityRankByKey.has(key)) priorityRankByKey.set(key, idx + 1);
  });

  // EDF comparator — used for the fallback tail and the no-priority case.
  const byEdf = (a: Shell, b: Shell) => {
    const da = a.deadlineMs ?? Number.POSITIVE_INFINITY;
    const db = b.deadlineMs ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const wa = Math.max(0, ...a.drops.map((d) => d.remainingMinutes));
    const wb = Math.max(0, ...b.drops.map((d) => d.remainingMinutes));
    if (wa !== wb) return wa - wb;
    return a.gameKey < b.gameKey ? -1 : a.gameKey > b.gameKey ? 1 : 0;
  };

  const priorityShells = shells
    .filter((s) => priorityRankByKey.has(s.gameKey))
    .sort((a, b) => priorityRankByKey.get(a.gameKey)! - priorityRankByKey.get(b.gameKey)!);
  const fallbackShells = shells.filter((s) => !priorityRankByKey.has(s.gameKey)).sort(byEdf);

  // Strict: only priority games. Permissive: priority games, then fallback (EDF).
  const orderedShells = options.obeyPriority
    ? priorityShells
    : [...priorityShells, ...fallbackShells];

  // 5. Feasibility walk along the engine order: a watch-minute cursor accumulates.
  const result: PlanEntry[] = [];
  let cursor = 0;
  for (const shell of orderedShells) {
    const cursorStart = cursor;
    const drops: PlanDrop[] = shell.drops.map((d) => {
      const completionMs = now + (cursorStart + d.remainingMinutes) * MINUTE_MS;
      const feasible = d.deadlineMs === null || completionMs <= d.deadlineMs;
      return { ...d, feasible };
    });
    const feasibleDrops = drops.filter((d) => d.feasible);
    // Minutes actually spent here: max remaining among feasible drops only
    // (a partial game's lost tiers are excluded; a fully-lost game → 0).
    const watchMinutes = feasibleDrops.length
      ? Math.max(...feasibleDrops.map((d) => d.remainingMinutes))
      : 0;
    const status: PlanEntry["status"] =
      feasibleDrops.length === drops.length ? "ok" : feasibleDrops.length > 0 ? "partial" : "lost";
    const priorityRank = priorityRankByKey.get(shell.gameKey) ?? null;
    cursor = cursorStart + watchMinutes;
    result.push({
      gameKey: shell.gameKey,
      gameLabel: shell.gameLabel,
      watchMinutes,
      deadlineMs: shell.deadlineMs,
      status,
      feasibleDropCount: feasibleDrops.length,
      totalDropCount: drops.length,
      isPriority: priorityRank !== null,
      priorityRank,
      drops,
    });
  }
  return result;
}
```

- [ ] **Step 4: Run the tests to verify all pass**

Run: `npx vitest run src/renderer/shared/domain/dropsPlanner.test.ts`
Expected: PASS — 17 tests (11 existing + 6 new). If any fail, debug the root cause; do not weaken tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0 on both tsconfigs.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/renderer/shared/domain/dropsPlanner.ts src/renderer/shared/domain/dropsPlanner.test.ts
git add src/renderer/shared/domain/dropsPlanner.ts src/renderer/shared/domain/dropsPlanner.test.ts
git commit -m "feat(planner): priority-aware engine-order plan + per-order feasibility"
```

---

## Task 2: i18n `plan.fallbackDivider`

**Files:**
- Modify: `src/renderer/shared/i18n.tsx`

- [ ] **Step 1: Add the key to the ENGLISH block**

Find the English `"plan.lost":` entry (search for `"plan.lost":` — the FIRST occurrence is the EN block) and add this line immediately after it:

```ts
    "plan.fallbackDivider": "then (fallback)",
```

- [ ] **Step 2: Add the key to the GERMAN block**

Find the German `"plan.lost":` entry (the SECOND occurrence of `"plan.lost":`) and add this line immediately after it:

```ts
    "plan.fallbackDivider": "danach (Fallback)",
```

- [ ] **Step 3: Typecheck + confirm DE parity**

Run: `npm run typecheck`
Expected: exit 0. Note: the `t()` key type derives from the EN block, so a missing DE key is NOT a type error — manually confirm `"plan.fallbackDivider"` appears exactly twice in the file (once EN, once DE).

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write src/renderer/shared/i18n.tsx
git add src/renderer/shared/i18n.tsx
git commit -m "feat(planner): add plan.fallbackDivider i18n key (EN + DE)"
```

---

## Task 3: Card — priority rank + fallback divider

**Files:**
- Modify: `src/renderer/features/overview/DropsPlanCard.tsx`

The props `priorityGames`/`obeyPriority` are **optional** here so the existing `<DropsPlanCard items={items} />` in `OverviewView` keeps typechecking until Task 4 threads the real values.

- [ ] **Step 1: Overwrite `DropsPlanCard.tsx`**

Overwrite `src/renderer/features/overview/DropsPlanCard.tsx` with this exact content:

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
  priorityGames?: string[];
  obeyPriority?: boolean;
};

export function DropsPlanCard({ items, priorityGames = [], obeyPriority = false }: DropsPlanCardProps) {
  const { t } = useI18n();
  // Owns its own 60s tick (paused while the window is hidden) so feasibility/
  // countdowns refresh without any useAppModel plumbing.
  const now = useVisibleTick(60_000);
  const plan = React.useMemo(
    () => buildDropsPlan(items, now, { priorityGames, obeyPriority }),
    [items, now, priorityGames, obeyPriority],
  );
  const feasibleCount = plan.filter((e) => e.status === "ok").length;
  // Boundary between priority games and the permissive fallback tail.
  const firstFallbackIdx = plan.findIndex((e) => !e.isPriority);

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
              <React.Fragment key={entry.gameKey}>
                {idx === firstFallbackIdx && firstFallbackIdx > 0 && (
                  <li className="px-5 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)]">
                    — {t("plan.fallbackDivider")} —
                  </li>
                )}
                <PlanRow entry={entry} now={now} t={t} />
              </React.Fragment>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PlanRow({ entry, now, t }: { entry: PlanEntry; now: number; t: TFn }) {
  // Representative = the longest open drop (drops are sorted by remaining asc).
  const rep = entry.drops[entry.drops.length - 1];
  const pct =
    rep.requiredMinutes > 0
      ? Math.max(0, Math.min(100, Math.round((rep.earnedMinutes / rep.requiredMinutes) * 100)))
      : 0;
  const lost = entry.status === "lost";
  const urgent = !lost && entry.deadlineMs !== null && entry.deadlineMs - now < URGENT_MS;
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
        urgent && "border-l-2 border-l-[color:var(--dp-signal-err)]",
      )}
    >
      <span className="font-mono text-[11px] tabular-nums text-[color:var(--dp-text-dimmer)]">
        {entry.priorityRank !== null ? `#${entry.priorityRank}` : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13px] text-[color:var(--dp-text)]", lost && "line-through")}>
          {entry.gameLabel}
          <span className="text-[color:var(--dp-text-dimmer)]"> · {rep.title}</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={entry.gameLabel}
          className="mt-1 h-[5px] w-full overflow-hidden rounded-full bg-[color:var(--dp-border)]"
        >
          <div className="h-full bg-[color:var(--dp-signal-ok)]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {entry.status === "lost" ? (
          <Pill tone="err">
            <span aria-hidden="true">⚠</span> {t("plan.lost")}
          </Pill>
        ) : entry.status === "partial" ? (
          <Pill tone="warn">
            <span aria-hidden="true">⚠</span>{" "}
            {t("plan.atRisk", {
              count: entry.totalDropCount - entry.feasibleDropCount,
              total: entry.totalDropCount,
            })}
          </Pill>
        ) : (
          <Pill tone="ok">
            {/* watchMinutes is in minutes; *60 → seconds for formatRemaining */}
            <span aria-hidden="true">⏳</span>{" "}
            {t("plan.remaining", { time: formatRemaining(entry.watchMinutes * 60) })}
          </Pill>
        )}
        {countdown && (
          <span
            className={cn(
              "font-mono text-[10px]",
              urgent ? "text-[color:var(--dp-signal-err)]" : "text-[color:var(--dp-text-dimmer)]",
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
Expected: exit 0. (The optional props mean `OverviewView`'s existing `<DropsPlanCard items={items} />` still compiles.)

- [ ] **Step 3: Format and commit**

```bash
npx prettier --write src/renderer/features/overview/DropsPlanCard.tsx
git add src/renderer/features/overview/DropsPlanCard.tsx
git commit -m "feat(planner): priority rank cell + fallback divider in DropsPlanCard"
```

---

## Task 4: Thread priority props + full verification

**Files:**
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts`
- Modify: `src/renderer/features/overview/OverviewView.tsx`

- [ ] **Step 1: Expose the two fields on `overviewProps` (`useAppModel.ts`)**

In `src/renderer/shared/hooks/app/useAppModel.ts`, find the `const overviewProps = { … }` object literal (it starts with `inventory,` and ends with `watchError: watchStats.lastError,`). Add these two lines inside that object (anywhere in it, e.g. right after `inventory,`):

```ts
    priorityGames,
    obeyPriority,
```

`priorityGames` and `obeyPriority` are already in scope in `useAppModel` (destructured from its existing `useSettingsStore()` call). If typecheck reports they are NOT in scope, add them to that existing settings destructuring rather than calling the hook again.

- [ ] **Step 2: Add the props to `OverviewProps` and pass them down (`OverviewView.tsx`)**

In `src/renderer/features/overview/OverviewView.tsx`:

(a) Add two fields to the `OverviewProps` type (next to the other primitives, e.g. after `activeGame: string;`):

```ts
  priorityGames: string[];
  obeyPriority: boolean;
```

(b) Add `priorityGames` and `obeyPriority` to the destructured props in the component's parameter list (the `{ … }: OverviewProps` destructuring).

(c) Change the planner mount from:

```tsx
        <DropsPlanCard items={items} />
```

to:

```tsx
        <DropsPlanCard items={items} priorityGames={priorityGames} obeyPriority={obeyPriority} />
```

- [ ] **Step 3: Typecheck (both configs)**

Run: `npm run typecheck`
Expected: exit 0. (Confirms `overviewProps` now satisfies the extended `OverviewProps`, and the card receives the props.)

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests including the 17 `dropsPlanner` tests. Report the total count.

- [ ] **Step 5: Format-check and build**

Run: `npm run format:check`
Expected: clean. If not, run `npm run format` and re-commit.

Run: `npm run build`
Expected: renderer + main/preload build with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shared/hooks/app/useAppModel.ts src/renderer/features/overview/OverviewView.tsx
git commit -m "feat(planner): thread priorityGames/obeyPriority to DropsPlanCard"
```

---

## Self-review notes (reconciled with the spec)

- **Spec coverage:** ordering model (strict / permissive / empty-priority) → Task 1 `buildDropsPlan` + tests; `isPriority`/`priorityRank` → Task 1; engine-order feasibility risk → Task 1 "feasibility along priority order" test; priority rank cell + fallback divider → Task 3; `plan.fallbackDivider` EN+DE → Task 2; prop threading (NOT re-reading `useSettingsStore`) → Task 4.
- **Type consistency:** `DropsPlanOptions { priorityGames; obeyPriority }` and `PlanEntry.isPriority`/`priorityRank` are identical across planner, tests, and card. Card props `priorityGames?`/`obeyPriority?` are optional; `OverviewProps` declares them required and `useAppModel` always supplies them.
- **Backward-compat:** `buildDropsPlan(items, now)` with no options → `DEFAULT_OPTIONS` (empty priority, permissive) → pure EDF, so the existing 11 tests pass unchanged (verified by the "empty priority + permissive equals no-options" test).
- **No watch-engine / IPC / orchestration / AppContent changes.**
