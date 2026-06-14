import { describe, it, expect } from "vitest";
import {
  MIN_REFRESH_MINUTES,
  msToMinutes,
  refreshFromMinMinutes,
  refreshFromMaxMinutes,
} from "./refreshIntervalField";

describe("refreshIntervalField", () => {
  it("exposes the floor as 60 minutes (matches the engine's hard floor)", () => {
    expect(MIN_REFRESH_MINUTES).toBe(60);
  });

  it("converts milliseconds to whole minutes for display", () => {
    expect(msToMinutes(3_600_000)).toBe(60);
    expect(msToMinutes(4_200_000)).toBe(70);
    expect(msToMinutes(3_630_000)).toBe(61); // rounds to nearest minute
  });

  it("floors the min field at 60 minutes instead of silently snapping back", () => {
    // The original bug: the field accepted sub-floor values (it offered a 5s
    // floor), then the store/schema clamps bounced them back to the floor on the
    // next render. Now the field itself refuses to drop below the floor.
    expect(refreshFromMinMinutes(5, 4_200_000)).toEqual({ minMs: 3_600_000, maxMs: 4_200_000 });
    expect(refreshFromMinMinutes(0, 4_200_000)).toEqual({ minMs: 3_600_000, maxMs: 4_200_000 });
    expect(refreshFromMinMinutes(Number.NaN, 4_200_000)).toEqual({
      minMs: 3_600_000,
      maxMs: 4_200_000,
    });
  });

  it("accepts in-range min edits and keeps max ≥ min", () => {
    expect(refreshFromMinMinutes(65, 4_200_000)).toEqual({ minMs: 3_900_000, maxMs: 4_200_000 });
    // raising min above the current max pulls max up to match
    expect(refreshFromMinMinutes(90, 4_200_000)).toEqual({ minMs: 5_400_000, maxMs: 5_400_000 });
  });

  it("floors the max field and keeps min ≤ max", () => {
    expect(refreshFromMaxMinutes(120, 3_600_000)).toEqual({ minMs: 3_600_000, maxMs: 7_200_000 });
    expect(refreshFromMaxMinutes(5, 3_600_000)).toEqual({ minMs: 3_600_000, maxMs: 3_600_000 });
    // lowering max below the current min pulls min down with it (both stay ≥ floor)
    expect(refreshFromMaxMinutes(60, 4_200_000)).toEqual({ minMs: 3_600_000, maxMs: 3_600_000 });
  });
});
