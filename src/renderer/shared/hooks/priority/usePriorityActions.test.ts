import { describe, expect, it } from "vitest";
import { reorderPriorityGamesByValue } from "./usePriorityActions";

describe("reorderPriorityGamesByValue", () => {
  it("moves an item upward when dropped over an earlier item", () => {
    expect(reorderPriorityGamesByValue(["Rust", "WoW", "CS2"], "CS2", "Rust")).toEqual([
      "CS2",
      "Rust",
      "WoW",
    ]);
  });

  it("moves an item downward when dropped over a later item", () => {
    expect(reorderPriorityGamesByValue(["Rust", "WoW", "CS2"], "Rust", "CS2")).toEqual([
      "WoW",
      "CS2",
      "Rust",
    ]);
  });

  it("ignores no-op drops onto the same item", () => {
    const games = ["Rust", "WoW", "CS2"];
    expect(reorderPriorityGamesByValue(games, "WoW", "WoW")).toBe(games);
  });

  it("returns the original list when one of the ids is missing", () => {
    const games = ["Rust", "WoW", "CS2"];
    expect(reorderPriorityGamesByValue(games, "Missing", "Rust")).toBe(games);
  });
});
