import { describe, expect, it } from "vitest";
import { narrateClaim } from "./claimNarration";
import type { ClaimStatus } from "@renderer/shared/types";

const DICT: Record<string, string> = {
  "error.claim.failed": "Claim failed",
  "hero.claim.retryIn": "retry in {time}",
  "error.unknown": "Something went wrong",
};

const t = (key: string, vars?: Record<string, string | number>): string => {
  const template = DICT[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? "")) : template;
};

const NOW = 1_000_000;

describe("narrateClaim", () => {
  it("returns null when there is no status", () => {
    expect(narrateClaim(null, NOW, t)).toBeNull();
    expect(narrateClaim(undefined, NOW, t)).toBeNull();
  });

  it("renders a success as the ok tone with its message", () => {
    const status: ClaimStatus = { kind: "success", message: "Auto-claimed: Cap", at: NOW };
    expect(narrateClaim(status, NOW, t)).toEqual({ tone: "ok", text: "Auto-claimed: Cap" });
  });

  it("renders a success with no message as null (nothing to say)", () => {
    const status: ClaimStatus = { kind: "success", at: NOW };
    expect(narrateClaim(status, NOW, t)).toBeNull();
  });

  it("renders an auto-retrying error as warn with a localized message and countdown", () => {
    const status: ClaimStatus = {
      kind: "error",
      code: "claim.failed",
      message: "Drop claim failed",
      at: NOW,
      nextRetryAt: NOW + 240_000,
      attempts: 1,
    };
    expect(narrateClaim(status, NOW, t)).toEqual({
      tone: "warn",
      text: "Claim failed · retry in 4m",
    });
  });

  it("treats an elapsed retry as terminal err (no countdown)", () => {
    const status: ClaimStatus = {
      kind: "error",
      code: "claim.failed",
      at: NOW,
      nextRetryAt: NOW - 1,
      attempts: 3,
    };
    expect(narrateClaim(status, NOW, t)).toEqual({ tone: "err", text: "Claim failed" });
  });

  it("renders an error with no scheduled retry as terminal err", () => {
    const status: ClaimStatus = { kind: "error", code: "claim.failed", at: NOW };
    expect(narrateClaim(status, NOW, t)).toEqual({ tone: "err", text: "Claim failed" });
  });

  it("shows seconds granularity under a minute", () => {
    const status: ClaimStatus = {
      kind: "error",
      code: "claim.failed",
      at: NOW,
      nextRetryAt: NOW + 30_000,
      attempts: 1,
    };
    expect(narrateClaim(status, NOW, t)).toEqual({
      tone: "warn",
      text: "Claim failed · retry in 30s",
    });
  });
});
