import { describe, expect, it } from "vitest";
import { shouldCompactCurrentDropTitle } from "./Hero";

describe("shouldCompactCurrentDropTitle", () => {
  it("stays relaxed for ordinary drop names", () => {
    expect(shouldCompactCurrentDropTitle("Silkworm Chat Badge")).toBe(false);
  });

  it("switches to the compact layout for longer multi-word drop names", () => {
    expect(
      shouldCompactCurrentDropTitle("Champion Celebration Banner of Extremely Dedicated Viewers"),
    ).toBe(true);
  });

  it("switches to the compact layout for long unbroken tokens", () => {
    expect(shouldCompactCurrentDropTitle("SupercalifragilisticBadgeReward")).toBe(true);
  });

  it("counts emoji-aware characters without breaking the decision", () => {
    expect(shouldCompactCurrentDropTitle("Badge " + "🎉".repeat(12))).toBe(false);
    expect(shouldCompactCurrentDropTitle("Reward " + "🎉".repeat(24))).toBe(true);
  });
});
