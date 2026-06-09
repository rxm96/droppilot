import { describe, expect, it } from "vitest";
import {
  filterCategoriesForOrchestration,
  isGameInCooldown,
  nextCooldownExpiry,
  pruneExpiredCooldowns,
  removeCooldown,
  upsertCooldown,
} from "./gameCooldowns";

describe("gameCooldowns", () => {
  it("upserts a new cooldown", () => {
    expect(upsertCooldown({}, "Rust", 1_000)).toEqual({ Rust: 1_000 });
  });

  it("upsert is monotonic — a shorter cooldown never overwrites a longer one", () => {
    const map = { Rust: 5_000 };
    expect(upsertCooldown(map, "Rust", 1_000)).toBe(map);
    expect(upsertCooldown(map, "Rust", 9_000)).toEqual({ Rust: 9_000 });
  });

  it("upsert trims the game and ignores empty names", () => {
    const map = {};
    expect(upsertCooldown(map, "  ", 1_000)).toBe(map);
    expect(upsertCooldown(map, " Rust ", 1_000)).toEqual({ Rust: 1_000 });
  });

  it("removeCooldown returns the same map when the game is absent", () => {
    const map = { Rust: 1_000 };
    expect(removeCooldown(map, "Dota 2")).toBe(map);
    expect(removeCooldown(map, "Rust")).toEqual({});
  });

  it("prune drops expired and non-finite entries, keeps the rest", () => {
    const map = { A: 1_000, B: 5_000, C: Number.NaN };
    expect(pruneExpiredCooldowns(map, 2_000)).toEqual({ B: 5_000 });
  });

  it("prune returns the same map when nothing expired", () => {
    const map = { A: 5_000 };
    expect(pruneExpiredCooldowns(map, 1_000)).toBe(map);
  });

  it("nextCooldownExpiry returns the earliest expiry or null", () => {
    expect(nextCooldownExpiry({})).toBeNull();
    expect(nextCooldownExpiry({ A: 5_000, B: 3_000 })).toBe(3_000);
  });

  it("isGameInCooldown checks trimmed name against now", () => {
    const map = { Rust: 5_000 };
    expect(isGameInCooldown(map, " Rust ", 1_000)).toBe(true);
    expect(isGameInCooldown(map, "Rust", 5_000)).toBe(false);
    expect(isGameInCooldown(map, "Dota 2", 1_000)).toBe(false);
    expect(isGameInCooldown(map, "", 1_000)).toBe(false);
  });

  const cat = (game: string) => ({ item: { game } as never, category: "in-progress" });

  it("orchestration filter is an identity fast-path when nothing is blocked", () => {
    const cats = [cat("Rust")];
    expect(
      filterCategoriesForOrchestration(cats, { suppressedGame: "", cooldowns: {}, now: 0 }),
    ).toBe(cats);
  });

  it("orchestration filter drops suppressed and cooled-down games, keeps blank games", () => {
    const cats = [cat("Rust"), cat("Dota 2"), cat(""), cat("PoE")];
    const result = filterCategoriesForOrchestration(cats, {
      suppressedGame: "Rust",
      cooldowns: { "Dota 2": 5_000 },
      now: 1_000,
    });
    expect(result.map((c) => c.item.game)).toEqual(["", "PoE"]);
  });
});
