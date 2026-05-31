import { describe, expect, it } from "vitest";
import {
  INITIAL_WATCHING_SINCE,
  nextWatchingSince,
  type WatchingSinceState,
} from "./useWatchingSince";

describe("nextWatchingSince", () => {
  it("stamps the start time on the inactive -> active edge", () => {
    const next = nextWatchingSince(true, INITIAL_WATCHING_SINCE, 1_000);
    expect(next).toEqual({ active: true, since: 1_000 });
  });

  it("keeps the original start time while active (e.g. across a channel switch)", () => {
    const prev: WatchingSinceState = { active: true, since: 1_000 };
    const next = nextWatchingSince(true, prev, 5_000);
    expect(next).toBe(prev);
    expect(next.since).toBe(1_000);
  });

  it("resets to null when watching stops", () => {
    const prev: WatchingSinceState = { active: true, since: 1_000 };
    const next = nextWatchingSince(false, prev, 9_000);
    expect(next).toEqual({ active: false, since: null });
  });

  it("re-stamps the start time on a new active session after stopping", () => {
    const stopped = nextWatchingSince(false, { active: true, since: 1_000 }, 2_000);
    const restarted = nextWatchingSince(true, stopped, 8_000);
    expect(restarted).toEqual({ active: true, since: 8_000 });
  });

  it("is idempotent for repeated inactive states (strict-mode safe)", () => {
    const next = nextWatchingSince(false, INITIAL_WATCHING_SINCE, 1_000);
    expect(next).toBe(INITIAL_WATCHING_SINCE);
  });

  it("is idempotent for repeated active renders (strict-mode safe)", () => {
    const first = nextWatchingSince(true, INITIAL_WATCHING_SINCE, 1_000);
    const second = nextWatchingSince(true, first, 1_000);
    expect(second).toBe(first);
  });
});
