import { describe, expect, it } from "vitest";
import { formatRelative, formatUptime } from "./formatters";

describe("formatRelative", () => {
  const now = 1_000_000_000_000;

  it("returns '--' for null/undefined/non-finite", () => {
    expect(formatRelative(null, now)).toBe("--");
    expect(formatRelative(undefined, now)).toBe("--");
    expect(formatRelative(NaN, now)).toBe("--");
  });

  it("returns '--' for the idle/never-set sentinel (0 and negatives)", () => {
    // Regression: previously rendered "~20604d ago" (now - 0 since the epoch).
    expect(formatRelative(0, now)).toBe("--");
    expect(formatRelative(-5, now)).toBe("--");
  });

  it("formats recent timestamps as seconds/minutes/hours/days ago", () => {
    expect(formatRelative(now - 5_000, now)).toBe("5s ago");
    expect(formatRelative(now - 90_000, now)).toBe("1m ago");
    expect(formatRelative(now - 3 * 3_600_000 - 4 * 60_000, now)).toBe("3h 4m ago");
    expect(formatRelative(now - 2 * 86_400_000, now)).toBe("2d ago");
  });

  it("clamps future timestamps to 0s ago", () => {
    expect(formatRelative(now + 10_000, now)).toBe("0s ago");
  });
});

describe("formatUptime", () => {
  const now = 1_000_000_000_000;

  it("formats elapsed time as Hh MMm", () => {
    expect(formatUptime(now - (2 * 3_600_000 + 5 * 60_000), now)).toBe("2h 05m");
    expect(formatUptime(now, now)).toBe("0h 00m");
  });
});
