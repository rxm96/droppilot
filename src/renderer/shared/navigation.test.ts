import { describe, expect, it } from "vitest";
import { resolveView } from "./navigation";

describe("resolveView", () => {
  it("keeps the views that still exist", () => {
    for (const view of ["overview", "inventory", "priorities", "stats", "settings"]) {
      expect(resolveView(view, { debugEnabled: false })).toBe(view);
    }
  });
  it("sends the removed control view to overview", () => {
    expect(resolveView("control", { debugEnabled: true })).toBe("overview");
  });
  it("sends unknown or empty values to overview", () => {
    expect(resolveView("bogus", { debugEnabled: false })).toBe("overview");
    expect(resolveView("", { debugEnabled: false })).toBe("overview");
    expect(resolveView(undefined, { debugEnabled: false })).toBe("overview");
  });
  it("only allows debug while the debug view is enabled", () => {
    expect(resolveView("debug", { debugEnabled: true })).toBe("debug");
    expect(resolveView("debug", { debugEnabled: false })).toBe("overview");
  });
});
