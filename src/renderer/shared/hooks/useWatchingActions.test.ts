import { describe, expect, it } from "vitest";
import {
  shouldLogoutForAuthError,
  updateAuthErrorTracker,
} from "@renderer/shared/hooks/useWatchingActions";

describe("useWatchingActions helpers", () => {
  it("increments auth error count inside the window", () => {
    const tracker = { count: 1, lastAt: 1_000 };
    const next = updateAuthErrorTracker(tracker, 1_500, 2_000);
    expect(next).toEqual({ count: 2, lastAt: 1_500 });
  });

  it("resets auth error count after the window", () => {
    const tracker = { count: 3, lastAt: 1_000 };
    const next = updateAuthErrorTracker(tracker, 4_000, 2_000);
    expect(next).toEqual({ count: 1, lastAt: 4_000 });
  });

  it("requests logout when token is missing", () => {
    const shouldLogout = shouldLogoutForAuthError({
      token: "",
      expiresAt: 0,
      now: 10_000,
      maxSoft: 1,
      count: 1,
    });
    expect(shouldLogout).toBe(true);
  });

  it("requests logout when token is expired", () => {
    const shouldLogout = shouldLogoutForAuthError({
      token: "abc",
      expiresAt: 5_000,
      now: 10_000,
      maxSoft: 1,
      count: 1,
    });
    expect(shouldLogout).toBe(true);
  });

  it("requests logout after too many soft errors", () => {
    const shouldLogout = shouldLogoutForAuthError({
      token: "abc",
      expiresAt: 0,
      now: 10_000,
      maxSoft: 1,
      count: 2,
    });
    expect(shouldLogout).toBe(true);
  });

  it("keeps session for a valid token with acceptable error count", () => {
    const shouldLogout = shouldLogoutForAuthError({
      token: "abc",
      expiresAt: 0,
      now: 10_000,
      maxSoft: 2,
      count: 1,
    });
    expect(shouldLogout).toBe(false);
  });
});
