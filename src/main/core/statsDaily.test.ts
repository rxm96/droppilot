import { describe, it, expect } from "vitest";
import {
  localDateKey,
  addToDaily,
  pruneDaily,
  normalizeDaily,
  RETENTION_DAYS,
  type DailyMap,
} from "./statsDaily";

// Helper: build the expected YYYY-MM-DD key from a Date using local time fields
function expectedKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("localDateKey", () => {
  it("returns the correct YYYY-MM-DD for a known timestamp, timezone-independent", () => {
    const d = new Date(2025, 5, 15, 12, 0, 0); // June 15 2025, noon local
    expect(localDateKey(d.getTime())).toBe(expectedKey(d));
  });

  it("is stable: same timestamp always produces the same key", () => {
    const ts = new Date(2024, 0, 1, 0, 0, 0).getTime();
    expect(localDateKey(ts)).toBe(localDateKey(ts));
  });

  it("returns the correct key for a local-midnight Date", () => {
    const d = new Date(2026, 4, 15, 0, 0, 0); // May 15 2026, midnight local
    const expected = expectedKey(d);
    expect(localDateKey(d.getTime())).toBe(expected);
  });
});

describe("addToDaily", () => {
  it("creates a new bucket when the day is not yet in the map", () => {
    const ts = new Date(2025, 5, 15, 10, 0, 0).getTime();
    const result = addToDaily({}, ts, { minutes: 30, claims: 1 });
    const key = localDateKey(ts);
    expect(result[key]).toEqual({ minutes: 30, claims: 1 });
  });

  it("accumulates a second delta on the same day", () => {
    const ts = new Date(2025, 5, 15, 10, 0, 0).getTime();
    const first = addToDaily({}, ts, { minutes: 30, claims: 1 });
    const second = addToDaily(first, ts, { minutes: 15, claims: 2 });
    const key = localDateKey(ts);
    expect(second[key]).toEqual({ minutes: 45, claims: 3 });
  });

  it("leaves minutes at 0 when only claims is provided", () => {
    const ts = new Date(2025, 5, 15, 10, 0, 0).getTime();
    const result = addToDaily({}, ts, { claims: 5 });
    const key = localDateKey(ts);
    expect(result[key]).toEqual({ minutes: 0, claims: 5 });
  });

  it("does not mutate the input map", () => {
    const ts = new Date(2025, 5, 15, 10, 0, 0).getTime();
    const input: DailyMap = {};
    addToDaily(input, ts, { minutes: 10 });
    expect(Object.keys(input)).toHaveLength(0);
  });

  it("preserves other dates in the map", () => {
    const ts1 = new Date(2025, 5, 14, 10, 0, 0).getTime();
    const ts2 = new Date(2025, 5, 15, 10, 0, 0).getTime();
    const first = addToDaily({}, ts1, { minutes: 20 });
    const second = addToDaily(first, ts2, { minutes: 10 });
    expect(Object.keys(second)).toHaveLength(2);
    expect(second[localDateKey(ts1)]).toEqual({ minutes: 20, claims: 0 });
  });

  it("clamps Infinity minutes to 0", () => {
    const ts = new Date(2026, 4, 29, 10, 0, 0).getTime(); // 2026-05-29 local
    const result = addToDaily({}, ts, { minutes: Infinity });
    const key = localDateKey(ts);
    expect(result[key]).toEqual({ minutes: 0, claims: 0 });
  });
});

describe("pruneDaily", () => {
  it("drops keys older than RETENTION_DAYS", () => {
    const now = new Date(2025, 5, 15, 12, 0, 0).getTime();
    // A date well beyond the retention window
    const old = addToDaily({}, now - (RETENTION_DAYS + 2) * 86_400_000, { minutes: 10 });
    const pruned = pruneDaily(old, now);
    expect(Object.keys(pruned)).toHaveLength(0);
  });

  it("keeps the cutoff day itself", () => {
    const now = new Date(2025, 5, 15, 12, 0, 0).getTime();
    // Exactly at the cutoff
    const cutoffTs = now - RETENTION_DAYS * 86_400_000;
    const map = addToDaily({}, cutoffTs, { minutes: 5 });
    const pruned = pruneDaily(map, now);
    expect(Object.keys(pruned)).toHaveLength(1);
    expect(pruned[localDateKey(cutoffTs)]).toEqual({ minutes: 5, claims: 0 });
  });

  it("keeps entries newer than the cutoff", () => {
    const now = new Date(2025, 5, 15, 12, 0, 0).getTime();
    const recentTs = now - 5 * 86_400_000;
    const map = addToDaily({}, recentTs, { minutes: 20, claims: 1 });
    const pruned = pruneDaily(map, now);
    expect(Object.keys(pruned)).toHaveLength(1);
  });

  it("does not mutate the input map", () => {
    const now = new Date(2025, 5, 15, 12, 0, 0).getTime();
    const oldTs = now - (RETENTION_DAYS + 5) * 86_400_000;
    const input = addToDaily({}, oldTs, { minutes: 5 });
    const inputKeys = Object.keys(input);
    pruneDaily(input, now);
    expect(Object.keys(input)).toEqual(inputKeys);
  });

  it("respects a custom retentionDays argument", () => {
    const now = new Date(2025, 5, 15, 12, 0, 0).getTime();
    const oldTs = now - 10 * 86_400_000;
    const map = addToDaily({}, oldTs, { minutes: 5 });
    // With 5-day retention the 10-day-old entry should be pruned
    expect(Object.keys(pruneDaily(map, now, 5))).toHaveLength(0);
    // With 15-day retention it should be kept
    expect(Object.keys(pruneDaily(map, now, 15))).toHaveLength(1);
  });

  it("hard-coded boundary: drops 2026-05-18, keeps 2026-05-19 (cutoff) and 2026-05-29 (now)", () => {
    // now = 2026-05-29 local noon; retentionDays = 10 → cutoff = 2026-05-19
    // Computed by hand: 29 - 10 = 19, so "2026-05-19" is kept, "2026-05-18" is dropped.
    const now = new Date(2026, 4, 29, 12, 0, 0).getTime(); // May 29 2026, noon local
    const map: DailyMap = {
      "2026-05-18": { minutes: 10, claims: 1 }, // 11 days before now → dropped
      "2026-05-19": { minutes: 20, claims: 2 }, // exactly 10 days before now → kept
      "2026-05-29": { minutes: 30, claims: 3 }, // today → kept
    };
    const pruned = pruneDaily(map, now, 10);
    expect(Object.keys(pruned).sort()).toEqual(["2026-05-19", "2026-05-29"]);
    expect(pruned["2026-05-18"]).toBeUndefined();
    expect(pruned["2026-05-19"]).toEqual({ minutes: 20, claims: 2 });
    expect(pruned["2026-05-29"]).toEqual({ minutes: 30, claims: 3 });
  });
});

describe("normalizeDaily", () => {
  it("returns empty object for non-object input", () => {
    expect(normalizeDaily(null)).toEqual({});
    expect(normalizeDaily(undefined)).toEqual({});
    expect(normalizeDaily("string")).toEqual({});
    expect(normalizeDaily(42)).toEqual({});
  });

  it("drops bad keys like 'foo' and '2026-1-1'", () => {
    const result = normalizeDaily({
      foo: { minutes: 10, claims: 1 },
      "2026-1-1": { minutes: 5, claims: 0 },
      "2026-01-01": { minutes: 5, claims: 1 },
    });
    expect(Object.keys(result)).toEqual(["2026-01-01"]);
  });

  it("clamps negative values to 0 and drops all-zero entries", () => {
    // Negative minutes and claims both clamp to 0 → entry dropped
    const result = normalizeDaily({
      "2026-01-01": { minutes: -5, claims: -3 },
    });
    expect(result).toEqual({});
  });

  it("clamps negative minutes but keeps entry when claims > 0", () => {
    const result = normalizeDaily({
      "2026-01-01": { minutes: -10, claims: 2 },
    });
    expect(result["2026-01-01"]).toEqual({ minutes: 0, claims: 2 });
  });

  it("drops entries that are all-zero (after clamping)", () => {
    const result = normalizeDaily({
      "2026-01-01": { minutes: 0, claims: 0 },
    });
    expect(result).toEqual({});
  });

  it("drops entries where value is not an object", () => {
    const result = normalizeDaily({
      "2026-01-01": "not-an-object",
      "2026-01-02": null,
      "2026-01-03": { minutes: 5, claims: 1 },
    });
    expect(Object.keys(result)).toEqual(["2026-01-03"]);
  });

  it("normalizes valid entries correctly", () => {
    const result = normalizeDaily({
      "2025-06-15": { minutes: 45, claims: 2 },
      "2025-06-16": { minutes: 0, claims: 1 },
    });
    expect(result["2025-06-15"]).toEqual({ minutes: 45, claims: 2 });
    expect(result["2025-06-16"]).toEqual({ minutes: 0, claims: 1 });
  });

  it("clamps Infinity minutes to 0 and keeps entry when claims > 0", () => {
    const result = normalizeDaily({ "2026-05-29": { minutes: Infinity, claims: 1 } });
    expect(result["2026-05-29"]).toEqual({ minutes: 0, claims: 1 });
  });
});
