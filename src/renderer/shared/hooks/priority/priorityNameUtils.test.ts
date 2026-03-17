import { describe, expect, it } from "vitest";
import { hasPriorityGameName, normalizePriorityGameName } from "./priorityNameUtils";

describe("normalizePriorityGameName", () => {
  it("trims and lowercases names for stable duplicate checks", () => {
    expect(normalizePriorityGameName("  Apex Legends  ")).toBe("apex legends");
  });

  it("preserves non-latin text while normalizing case and whitespace", () => {
    expect(normalizePriorityGameName("  مرحبا 🎮  ")).toBe("مرحبا 🎮");
  });
});

describe("hasPriorityGameName", () => {
  it("matches duplicate names case-insensitively", () => {
    expect(hasPriorityGameName(["Apex Legends"], "apex legends")).toBe(true);
  });

  it("matches duplicate names after trimming surrounding whitespace", () => {
    expect(hasPriorityGameName(["World of Warcraft"], "  World of Warcraft  ")).toBe(true);
  });

  it("does not report empty names as duplicates", () => {
    expect(hasPriorityGameName(["Rust"], "   ")).toBe(false);
  });
});
