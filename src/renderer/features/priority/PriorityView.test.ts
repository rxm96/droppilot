import { describe, expect, it } from "vitest";
import { getSelectableDropGames } from "./PriorityView";

describe("getSelectableDropGames", () => {
  it("filters out games that are already in the priority list", () => {
    expect(getSelectableDropGames(["Rust", "WoW", "CS2"], ["WoW"])).toEqual(["Rust", "CS2"]);
  });

  it("keeps active-drop games that are not in the priority list", () => {
    expect(getSelectableDropGames(["Rust", "WoW"], ["Apex"])).toEqual(["Rust", "WoW"]);
  });

  it("returns an empty list when every active-drop game is already prioritized", () => {
    expect(getSelectableDropGames(["Rust", "WoW"], ["Rust", "WoW"])).toEqual([]);
  });
});
