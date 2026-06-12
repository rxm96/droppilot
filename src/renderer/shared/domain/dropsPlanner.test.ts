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
});
