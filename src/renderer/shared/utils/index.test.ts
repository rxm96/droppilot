import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@renderer/shared/types";
import { getCategory } from "@renderer/shared/utils";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop 1",
  requiredMinutes: 60,
  earnedMinutes: 0,
  status: "locked",
  ...overrides,
});

describe("getCategory", () => {
  it("treats excluded locked drops as upcoming", () => {
    const item = makeItem({ excluded: true, status: "locked" });
    expect(getCategory(item, true, false, true)).toBe("upcoming");
  });

  it("treats excluded progress drops as in-progress", () => {
    const item = makeItem({ excluded: true, status: "progress", earnedMinutes: 10 });
    expect(getCategory(item, true, false, true)).toBe("in-progress");
  });

  it("still keeps unlinked drops in not-linked", () => {
    const item = makeItem({ excluded: true, linked: false });
    expect(getCategory(item, true, false, false)).toBe("not-linked");
  });
});
