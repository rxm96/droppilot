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
      [makeItem({ id: "a", game: "Marvel Rivals" }), makeItem({ id: "b", game: "marvel rivals " })],
      NOW,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].totalDropCount).toBe(2);
    expect(plan[0].gameLabel).toBe("Marvel Rivals");
  });

  it("treats parallel tiers as feasible against their own deadlines (regression)", () => {
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

  it("breaks deadline ties by longest-remaining then game key", () => {
    const plan = buildDropsPlan(
      [
        makeItem({ id: "big", game: "Zebra", requiredMinutes: 120, endsAt: iso(120) }),
        makeItem({ id: "small", game: "Apex", requiredMinutes: 30, endsAt: iso(120) }),
      ],
      NOW,
    );
    // Same deadline → shorter remaining (Apex, 30) sorts before longer (Zebra, 120).
    expect(plan.map((e) => e.gameLabel)).toEqual(["Apex", "Zebra"]);
  });

  it("orders each game's drops by remaining minutes ascending", () => {
    const plan = buildDropsPlan(
      [
        makeItem({ id: "long", game: "Rust", requiredMinutes: 120 }),
        makeItem({ id: "short", game: "Rust", requiredMinutes: 20 }),
      ],
      NOW,
    );
    expect(plan[0].drops.map((d) => d.remainingMinutes)).toEqual([20, 120]);
  });
});

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
    const strict = buildDropsPlan(items, NOW, { priorityGames: ["A", "B"], obeyPriority: true });
    expect(strict.find((e) => e.gameLabel === "B")?.status).toBe("lost");
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

  it("a priority game with no plannable drops is absent from the plan (not a lost entry)", () => {
    const plan = buildDropsPlan([makeItem({ game: "Rust", status: "claimed" })], NOW, {
      priorityGames: ["Rust"],
      obeyPriority: true,
    });
    expect(plan).toEqual([]);
  });

  it("permissive: a priority game's cursor debt makes a feasible-under-EDF fallback game lost", () => {
    const items = [
      makeItem({ id: "p", game: "Priority", requiredMinutes: 200, endsAt: iso(10000) }),
      makeItem({ id: "f", game: "Fallback", requiredMinutes: 60, endsAt: iso(240) }),
    ];
    // Under pure EDF, Fallback (deadline 240) is farmed first → ok.
    expect(buildDropsPlan(items, NOW).find((e) => e.gameLabel === "Fallback")?.status).toBe("ok");
    // Permissive with Priority first: cursor = 200 before Fallback → 200+60 = 260 > 240 → lost.
    const permissive = buildDropsPlan(items, NOW, {
      priorityGames: ["Priority"],
      obeyPriority: false,
    });
    expect(permissive.find((e) => e.gameLabel === "Fallback")?.status).toBe("lost");
  });
});
