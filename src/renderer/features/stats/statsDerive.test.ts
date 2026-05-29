import { describe, expect, it } from "vitest";
import {
  buildTrendSeries,
  computeStreaks,
  formatWatchTime,
  topGames,
} from "./statsDerive";

// Fixed reference point: 2024-03-15T12:00:00.000Z
// Using a noon UTC timestamp so that local-date arithmetic is unambiguous
// across timezones (the tests derive keys via the same localDateKey logic
// used inside statsDerive, so they remain consistent regardless of the
// machine's local timezone).
const NOW = 1710504000000; // 2024-03-15T12:00:00.000Z
const DAY = 86_400_000;

/** Reproduce the same localDateKey logic from statsDerive so expected keys
 *  are always in sync with the implementation. */
function key(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Helper: build a DailyMap with active entries for each of the given day
 *  offsets relative to NOW. Negative offset = days in the past. */
function activeDays(offsets: number[]): Record<string, { minutes: number; claims: number }> {
  const map: Record<string, { minutes: number; claims: number }> = {};
  for (const offset of offsets) {
    const k = key(NOW + offset * DAY);
    map[k] = { minutes: 60, claims: 1 };
  }
  return map;
}

// ---------------------------------------------------------------------------
// computeStreaks
// ---------------------------------------------------------------------------

describe("computeStreaks", () => {
  it("returns {0,0} for an empty map", () => {
    expect(computeStreaks({}, NOW)).toEqual({ current: 0, longest: 0 });
  });

  it("counts 3 consecutive active days ending today as current=3", () => {
    // offsets 0 (today), -1, -2
    const daily = activeDays([0, -1, -2]);
    const result = computeStreaks(daily, NOW);
    expect(result.current).toBe(3);
    expect(result.longest).toBeGreaterThanOrEqual(3);
  });

  it("starts from yesterday when today is missing, current=3", () => {
    // yesterday (-1), -2, -3 are active; today is absent
    const daily = activeDays([-1, -2, -3]);
    const result = computeStreaks(daily, NOW);
    expect(result.current).toBe(3);
  });

  it("returns current=0 when neither today nor yesterday is active", () => {
    // only old activity, 5+ days ago
    const daily = activeDays([-5, -6, -7]);
    const result = computeStreaks(daily, NOW);
    expect(result.current).toBe(0);
  });

  it("stops current streak at a gap", () => {
    // today and 2 days ago active, but yesterday (-1) missing → streak from today = 1
    const daily = activeDays([0, -2, -3]);
    const result = computeStreaks(daily, NOW);
    expect(result.current).toBe(1);
  });

  it("computes longest correctly across two separate runs", () => {
    // run A: offsets -10, -9, -8, -7 → length 4
    // run B: offsets -3, -2 → length 2
    // today and yesterday absent → current = 0
    const daily = activeDays([-10, -9, -8, -7, -3, -2]);
    const result = computeStreaks(daily, NOW);
    expect(result.longest).toBe(4);
    expect(result.current).toBe(0);
  });

  it("longest equals current when there is one unbroken run", () => {
    const daily = activeDays([0, -1, -2, -3, -4]);
    const result = computeStreaks(daily, NOW);
    expect(result.current).toBe(5);
    expect(result.longest).toBe(5);
  });

  it("ignores inactive entries (minutes=0) in streak counting", () => {
    const daily: Record<string, { minutes: number; claims: number }> = {
      [key(NOW)]: { minutes: 0, claims: 0 },
      [key(NOW - DAY)]: { minutes: 45, claims: 1 },
      [key(NOW - 2 * DAY)]: { minutes: 30, claims: 1 },
    };
    const result = computeStreaks(daily, NOW);
    // today is inactive, yesterday and day-before are active → current = 2
    expect(result.current).toBe(2);
    expect(result.longest).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// buildTrendSeries
// ---------------------------------------------------------------------------

describe("buildTrendSeries", () => {
  it("returns exactly rangeDays entries", () => {
    const result = buildTrendSeries({}, 7, NOW);
    expect(result).toHaveLength(7);
  });

  it("is ordered oldest to newest (last element is today)", () => {
    const result = buildTrendSeries({}, 7, NOW);
    const todayKey = key(NOW);
    expect(result[result.length - 1].date).toBe(todayKey);
    const oldest = key(NOW - 6 * DAY);
    expect(result[0].date).toBe(oldest);
  });

  it("zero-fills gaps", () => {
    // Only today has data
    const daily = activeDays([0]);
    const result = buildTrendSeries(daily, 7, NOW);
    // All but today should be 0
    const allButToday = result.slice(0, 6);
    for (const entry of allButToday) {
      expect(entry.minutes).toBe(0);
    }
  });

  it("reflects minutes for a day that has data", () => {
    const daily: Record<string, { minutes: number; claims: number }> = {
      [key(NOW)]: { minutes: 123, claims: 2 },
      [key(NOW - DAY)]: { minutes: 45, claims: 1 },
    };
    const result = buildTrendSeries(daily, 7, NOW);
    const todayEntry = result[result.length - 1];
    const yesterdayEntry = result[result.length - 2];
    expect(todayEntry.minutes).toBe(123);
    expect(yesterdayEntry.minutes).toBe(45);
  });

  it("handles rangeDays=1 (only today)", () => {
    const daily = activeDays([0]);
    const result = buildTrendSeries(daily, 1, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe(key(NOW));
    expect(result[0].minutes).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// topGames
// ---------------------------------------------------------------------------

describe("topGames", () => {
  const games: Record<string, number> = {
    Fortnite: 10,
    Valorant: 50,
    Minecraft: 30,
    "Apex Legends": 80,
    Dota2: 20,
    Overwatch: 15,
    "League of Legends": 70,
  };

  it("returns at most `limit` entries (default 5)", () => {
    const result = topGames(games);
    expect(result).toHaveLength(5);
  });

  it("sorts by claims descending", () => {
    const result = topGames(games, 3);
    expect(result[0]).toEqual({ name: "Apex Legends", claims: 80 });
    expect(result[1]).toEqual({ name: "League of Legends", claims: 70 });
    expect(result[2]).toEqual({ name: "Valorant", claims: 50 });
  });

  it("returns all entries when limit exceeds available games", () => {
    const result = topGames(games, 20);
    expect(result).toHaveLength(Object.keys(games).length);
  });

  it("returns empty array for empty input", () => {
    expect(topGames({})).toEqual([]);
  });

  it("returns correct top-5 names from 7 games", () => {
    const result = topGames(games, 5);
    const names = result.map((g) => g.name);
    expect(names).toContain("Apex Legends");
    expect(names).toContain("League of Legends");
    expect(names).toContain("Valorant");
    expect(names).toContain("Minecraft");
    expect(names).toContain("Dota2");
    expect(names).not.toContain("Fortnite"); // lowest among top 5+
    expect(names).not.toContain("Overwatch");
  });
});

// ---------------------------------------------------------------------------
// formatWatchTime
// ---------------------------------------------------------------------------

describe("formatWatchTime", () => {
  it('formats 0 minutes as "0m"', () => {
    expect(formatWatchTime(0)).toBe("0m");
  });

  it('formats 40 minutes as "40m"', () => {
    expect(formatWatchTime(40)).toBe("40m");
  });

  it('formats 120 minutes as "2h 0m"', () => {
    expect(formatWatchTime(120)).toBe("2h 0m");
  });

  it('formats 700 minutes as "11h 40m"', () => {
    expect(formatWatchTime(700)).toBe("11h 40m");
  });

  it("treats negative values as 0", () => {
    expect(formatWatchTime(-5)).toBe("0m");
  });

  it("treats NaN as 0", () => {
    expect(formatWatchTime(NaN)).toBe("0m");
  });

  it("truncates fractional minutes", () => {
    // 61.9 minutes → 1h 1m (floor to 61 mins)
    expect(formatWatchTime(61.9)).toBe("1h 1m");
  });
});
