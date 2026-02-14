import { describe, expect, it, vi } from "vitest";
import type { InventoryItem } from "@renderer/shared/types";
import {
  computeBestActionableGame,
  computeFallbackOrder,
  computeNextActiveTargetGame,
  computePriorityOrder,
  isGameActionable,
  normalizePriorityGames,
  type WithCategory,
} from "@renderer/shared/hooks/usePriorityOrchestration";

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
    expect(computeFallbackOrder(withCategories)).toEqual(["A", "B"]);
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
    expect(result).toBe("B");
  });

  it("falls back to actionable drops when priority list has no matches", () => {
    const withCategories: WithCategory[] = [
      { item: makeItem({ id: "a1", game: "A" }), category: "in-progress" },
      { item: makeItem({ id: "b1", game: "B" }), category: "upcoming" },
    ];
    const result = computeBestActionableGame(["C"], ["B", "A"], withCategories, false);
    expect(result).toBe("B");
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

    const strictSwitch = computeNextActiveTargetGame({
      inventoryStatus: "ready",
      activeTargetGame: "A",
      bestActionableGame: "B",
      obeyPriority: true,
      withCategories,
    });
    expect(strictSwitch).toBe("B");
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

  it("treats upcoming drops as actionable only after start time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-14T00:00:00Z"));
    const withCategories: WithCategory[] = [
      {
        item: makeItem({
          id: "a1",
          game: "A",
          status: "locked",
          startsAt: "2026-02-15T00:00:00Z",
        }),
        category: "upcoming",
      },
    ];
    expect(isGameActionable("A", withCategories)).toBe(false);
    vi.setSystemTime(new Date("2026-02-15T01:00:00Z"));
    expect(isGameActionable("A", withCategories)).toBe(true);
    vi.useRealTimers();
  });
});
