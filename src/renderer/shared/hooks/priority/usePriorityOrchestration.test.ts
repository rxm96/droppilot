import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@renderer/shared/types";
import {
  buildLivePriorityPlan,
  computeBestActionableGame,
  computeFallbackOrder,
  computeNextActiveTargetGame,
  computePriorityOrder,
  isGameActionable,
  normalizePriorityGames,
  type WithCategory,
} from "./usePriorityOrchestration";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop 1",
  requiredMinutes: 60,
  earnedMinutes: 0,
  status: "locked",
  ...overrides,
});

describe("priority orchestration helpers", () => {
  it("normalizes priority games by trimming and de-duplicating", () => {
    const result = normalizePriorityGames(["  A ", "A", "", " B ", "B"]);
    expect(result).toEqual(["A", "B"]);
  });

  it("computes fallback order from actionable drops", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A" }), category: "in-progress" },
      { item: makeItem({ id: "b1", game: "B" }), category: "upcoming" },
      { item: makeItem({ id: "a2", game: "A" }), category: "upcoming" },
      { item: makeItem({ id: "c1", game: "C" }), category: "finished" },
    ];
    expect(computeFallbackOrder(withCategories)).toEqual(["A"]);
  });

  it("computes priority order with strict mode", () => {
    const result = computePriorityOrder({
      obeyPriority: true,
      effectivePriorityPlan: {
        order: ["X"],
        availableGames: [],
        missingPriority: [],
        totalActiveDrops: 0,
      },
      priorityGames: ["A"],
      fallbackOrder: ["B"],
      strictPriorityGames: ["A", "C"],
    });
    expect(result).toEqual(["A", "C"]);
  });

  it("computes priority order with plan, then list, then fallback", () => {
    const fromPlan = computePriorityOrder({
      obeyPriority: false,
      effectivePriorityPlan: {
        order: ["P"],
        availableGames: [],
        missingPriority: [],
        totalActiveDrops: 0,
      },
      priorityGames: ["A"],
      fallbackOrder: ["B"],
      strictPriorityGames: [],
    });
    expect(fromPlan).toEqual(["P"]);

    const fromList = computePriorityOrder({
      obeyPriority: false,
      effectivePriorityPlan: {
        order: [],
        availableGames: [],
        missingPriority: [],
        totalActiveDrops: 0,
      },
      priorityGames: ["A"],
      fallbackOrder: ["B"],
      strictPriorityGames: [],
    });
    expect(fromList).toEqual(["A"]);

    const fromFallback = computePriorityOrder({
      obeyPriority: false,
      effectivePriorityPlan: null,
      priorityGames: [],
      fallbackOrder: ["B"],
      strictPriorityGames: [],
    });
    expect(fromFallback).toEqual(["B"]);
  });

  it("picks first actionable game from priority order", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A" }), category: "in-progress" },
      { item: makeItem({ id: "b1", game: "B" }), category: "upcoming" },
    ];
    const result = computeBestActionableGame(["B", "A"], ["A"], withCategories, false);
    expect(result).toBe("A");
  });

  it("falls back to actionable drops when priority list has no matches", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A" }), category: "in-progress" },
      { item: makeItem({ id: "b1", game: "B" }), category: "upcoming" },
    ];
    const result = computeBestActionableGame(["C"], ["B", "A"], withCategories, false);
    expect(result).toBe("A");
  });

  it("keeps strict priority even if fallback has drops", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A" }), category: "in-progress" },
    ];
    const result = computeBestActionableGame(["C"], ["A"], withCategories, true);
    expect(result).toBe("");
  });

  it("computes next active target game based on priority and availability", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A" }), category: "in-progress" },
      { item: makeItem({ id: "b1", game: "B" }), category: "upcoming" },
    ];

    const whenEmpty = computeNextActiveTargetGame({
      inventoryStatus: "ready",
      activeTargetGame: "",
      bestActionableGame: "B",
      obeyPriority: false,
      withCategories,
    });
    expect(whenEmpty).toBe("B");

    const keepCurrent = computeNextActiveTargetGame({
      inventoryStatus: "ready",
      activeTargetGame: "A",
      bestActionableGame: "B",
      obeyPriority: false,
      withCategories,
    });
    expect(keepCurrent).toBe("A");

    const nonStrictPreemptOnPriorityEdit = computeNextActiveTargetGame({
      inventoryStatus: "ready",
      activeTargetGame: "A",
      bestActionableGame: "B",
      obeyPriority: false,
      withCategories,
      allowPriorityListPreemption: true,
    });
    expect(nonStrictPreemptOnPriorityEdit).toBe("B");

    const strictSwitch = computeNextActiveTargetGame({
      inventoryStatus: "ready",
      activeTargetGame: "A",
      bestActionableGame: "B",
      obeyPriority: true,
      withCategories,
    });
    expect(strictSwitch).toBe("B");
  });

  it("does not preempt an actively watched actionable target in strict mode", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A" }), category: "in-progress" },
      { item: makeItem({ id: "b1", game: "B" }), category: "in-progress" },
    ];
    const result = computeNextActiveTargetGame({
      inventoryStatus: "ready",
      activeTargetGame: "B",
      bestActionableGame: "A",
      obeyPriority: true,
      withCategories,
      watchingGame: "B",
    });
    expect(result).toBe("B");
  });

  it("preempts an actively watched target in strict mode when forced by priority reorder", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A" }), category: "in-progress" },
      { item: makeItem({ id: "b1", game: "B" }), category: "in-progress" },
    ];
    const result = computeNextActiveTargetGame({
      inventoryStatus: "ready",
      activeTargetGame: "B",
      bestActionableGame: "A",
      obeyPriority: true,
      withCategories,
      watchingGame: "B",
      allowStrictPreemptionWhileWatching: true,
    });
    expect(result).toBe("A");
  });

  it("does not change target when inventory is not ready", () => {
    const result = computeNextActiveTargetGame({
      inventoryStatus: "loading",
      activeTargetGame: "A",
      bestActionableGame: "B",
      obeyPriority: true,
      withCategories: [],
    });
    expect(result).toBe("A");
  });

  it("clears strict target when no strict actionable game exists even if current target has drops", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A", status: "progress" }), category: "in-progress" },
    ];
    const result = computeNextActiveTargetGame({
      inventoryStatus: "ready",
      activeTargetGame: "A",
      bestActionableGame: "",
      obeyPriority: true,
      withCategories,
    });
    expect(result).toBe("");
  });

  it("clears target when no actionable drops remain", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A", status: "claimed" }), category: "finished" },
    ];
    const result = computeNextActiveTargetGame({
      inventoryStatus: "ready",
      activeTargetGame: "A",
      bestActionableGame: "",
      obeyPriority: true,
      withCategories,
    });
    expect(result).toBe("");
  });

  it("does not treat upcoming drops as actionable", () => {
    const withCategories: WithCategory[] = [
      {
        item: makeItem({
          id: "a1",
          game: "A",
          status: "locked",
          startsAt: "2026-02-14T00:00:00Z",
        }),
        category: "upcoming",
      },
    ];
    expect(isGameActionable("A", withCategories)).toBe(false);
  });

  it("treats upcoming drops as actionable when allowed", () => {
    const withCategories: WithCategory[] = [
      {
        item: makeItem({
          id: "a1",
          game: "A",
          status: "locked",
        }),
        category: "upcoming",
      },
    ];
    expect(isGameActionable("A", withCategories, { allowUpcoming: true })).toBe(true);
  });

  it("does not treat zero-minute upcoming drops as actionable even when allowed", () => {
    const withCategories: WithCategory[] = [
      {
        item: makeItem({
          id: "a1",
          game: "A",
          status: "locked",
          requiredMinutes: 0,
        }),
        category: "upcoming",
      },
    ];
    expect(isGameActionable("A", withCategories, { allowUpcoming: true })).toBe(false);
  });

  it("does not treat hard-blocked upcoming drops as actionable", () => {
    const withCategories: WithCategory[] = [
      {
        item: makeItem({
          id: "a1",
          game: "A",
          status: "locked",
          requiredMinutes: 60,
          blockingReasonHints: ["preconditions_not_met"],
        }),
        category: "upcoming",
      },
    ];
    expect(isGameActionable("A", withCategories, { allowUpcoming: true })).toBe(false);
  });

  it("includes upcoming games in fallback when allowed", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A" }), category: "in-progress" },
      { item: makeItem({ id: "b1", game: "B", status: "locked" }), category: "upcoming" },
    ];
    expect(computeFallbackOrder(withCategories, { allowUpcoming: true })).toEqual(["A", "B"]);
  });
});

describe("fresh linked campaigns (default settings, no unlinked opt-in)", () => {
  // Active, account-connected campaign the user never watched: locked, 0 minutes, no blockers.
  const fresh = (id: string, game: string, overrides: Partial<InventoryItem> = {}) =>
    makeItem({ id, game, status: "locked", earnedMinutes: 0, linked: true, ...overrides });
  const started = (id: string, game: string) =>
    makeItem({ id, game, status: "progress", earnedMinutes: 20, linked: true });

  it("treats a linked fresh game as actionable, an unlinked one not", () => {
    const withCategories: WithCategory[] = [
      { item: fresh("a1", "A"), category: "upcoming" },
      { item: fresh("b1", "B", { linked: false }), category: "upcoming" },
    ];
    expect(isGameActionable("A", withCategories)).toBe(true);
    expect(isGameActionable("B", withCategories)).toBe(false);
  });

  it("keeps chained and not-started linked drops non-actionable", () => {
    const withCategories: WithCategory[] = [
      {
        item: fresh("a2", "A", {
          blocked: true,
          blockingReasonHints: ["missing_prerequisite_drops:a1"],
        }),
        category: "upcoming",
      },
      {
        item: fresh("b1", "B", { blocked: true, blockingReasonHints: ["campaign_not_started"] }),
        category: "upcoming",
      },
    ];
    expect(isGameActionable("A", withCategories)).toBe(false);
    expect(isGameActionable("B", withCategories)).toBe(false);
  });

  it("strict mode starts a listed fresh game but never an unlisted one", () => {
    const withCategories: WithCategory[] = [
      { item: fresh("u1", "Unlisted"), category: "upcoming" },
      { item: fresh("l1", "Listed"), category: "upcoming" },
    ];
    expect(computeBestActionableGame(["Listed"], ["Unlisted"], withCategories, true)).toBe(
      "Listed",
    );
    expect(computeBestActionableGame(["Other"], ["Unlisted"], withCategories, true)).toBe("");
  });

  it("strict mode does not preempt a watched game for a higher-ranked fresh one", () => {
    const withCategories: WithCategory[] = [
      { item: fresh("a1", "A"), category: "upcoming" },
      { item: started("b1", "B"), category: "in-progress" },
    ];
    const best = computeBestActionableGame(["A", "B"], [], withCategories, true);
    expect(best).toBe("A");
    expect(
      computeNextActiveTargetGame({
        inventoryStatus: "ready",
        activeTargetGame: "B",
        bestActionableGame: best,
        obeyPriority: true,
        withCategories,
        watchingGame: "B",
      }),
    ).toBe("B");
  });

  it("ranks unlisted games with progress ahead of fresh ones, keeping the user's ranking", () => {
    const items = [
      fresh("f1", "Fresh"),
      started("s1", "Started"),
      fresh("p1", "Ranked"),
      fresh("z1", "Fresh2"),
    ];
    expect(buildLivePriorityPlan(items, ["Ranked"]).order).toEqual([
      "Ranked",
      "Started",
      "Fresh",
      "Fresh2",
    ]);
    const withCategories: WithCategory[] = [
      { item: items[0], category: "upcoming" },
      { item: items[1], category: "in-progress" },
      { item: items[3], category: "upcoming" },
    ];
    const fallback = computeFallbackOrder(withCategories);
    expect(fallback).toEqual(["Started", "Fresh", "Fresh2"]);
    expect(computeBestActionableGame(["Fresh", "Started"], fallback, withCategories, false)).toBe(
      "Fresh",
    );
  });
});
