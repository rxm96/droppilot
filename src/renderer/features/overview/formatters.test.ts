import { describe, expect, it } from "vitest";
import {
  formatEndsIn,
  formatRefreshCadence,
  formatRelative,
  formatUptime,
  formatReadyAt,
  resolveHeroProgress,
} from "./formatters";

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

describe("formatRefreshCadence", () => {
  it("renders the channel-refresh window as a minutes range (the default 60–70 min)", () => {
    expect(formatRefreshCadence(3_600_000, 4_200_000, "min")).toBe("60–70 min");
  });

  it("collapses to a single value when min === max", () => {
    expect(formatRefreshCadence(3_600_000, 3_600_000, "min")).toBe("60 min");
  });

  it("rounds each bound to whole minutes", () => {
    expect(formatRefreshCadence(3_630_000, 4_230_000, "min")).toBe("61–71 min");
  });
});

describe("resolveHeroProgress", () => {
  it("returns null when nothing is being watched", () => {
    expect(resolveHeroProgress(null)).toBeNull();
    expect(resolveHeroProgress(undefined)).toBeNull();
    expect(resolveHeroProgress(Number.NaN)).toBeNull();
  });
  it("rounds and clamps the active drop's percent", () => {
    expect(resolveHeroProgress(33.4)).toBe(33);
    expect(resolveHeroProgress(-5)).toBe(0);
    expect(resolveHeroProgress(140)).toBe(100);
  });
});

describe("formatReadyAt", () => {
  const now = new Date(2026, 10, 6, 14, 14, 0).getTime();
  it("returns clock time and minutes left", () => {
    const eta = new Date(2026, 10, 6, 14, 34, 0).getTime();
    expect(formatReadyAt(eta, now)).toEqual({ clock: "14:34", minutesLeft: 20 });
  });
  it("zero-pads and rounds partial minutes up", () => {
    const eta = new Date(2026, 10, 7, 9, 5, 30).getTime();
    expect(formatReadyAt(eta, now)?.clock).toBe("09:05");
    expect(formatReadyAt(now + 61_000, now)?.minutesLeft).toBe(2);
  });
  it("returns null when there is no predictable ETA", () => {
    expect(formatReadyAt(null, now)).toBeNull();
    expect(formatReadyAt(Number.POSITIVE_INFINITY, now)).toBeNull();
  });
});

describe("formatEndsIn", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  it("uses the largest whole unit, rounded down", () => {
    expect(formatEndsIn("2026-11-08T13:00:00Z", now)).toBe("2d");
    expect(formatEndsIn("2026-11-07T06:30:00Z", now)).toBe("18h");
    expect(formatEndsIn("2026-11-06T12:40:00Z", now)).toBe("40m");
    expect(formatEndsIn("2026-11-06T12:00:30Z", now)).toBe("1m");
  });
  it("returns null for missing, invalid or past end dates", () => {
    expect(formatEndsIn(undefined, now)).toBeNull();
    expect(formatEndsIn("not a date", now)).toBeNull();
    expect(formatEndsIn("2026-11-05T00:00:00Z", now)).toBeNull();
  });
});
