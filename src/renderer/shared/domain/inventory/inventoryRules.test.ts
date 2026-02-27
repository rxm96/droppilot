import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@renderer/shared/types";
import { canClaimDrop, canEarnDrop } from "./inventoryRules";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop 1",
  requiredMinutes: 60,
  earnedMinutes: 10,
  status: "progress",
  campaignId: "camp-1",
  dropInstanceId: "inst-1",
  ...overrides,
});

describe("canEarnDrop", () => {
  it("allows in-progress drops with remaining watch minutes", () => {
    expect(canEarnDrop(makeItem(), { category: "in-progress" })).toBe(true);
  });

  it("blocks claimed, claimable, and zero-minute drops", () => {
    expect(canEarnDrop(makeItem({ status: "claimed" }), { category: "in-progress" })).toBe(false);
    expect(canEarnDrop(makeItem({ isClaimable: true }), { category: "in-progress" })).toBe(false);
    expect(
      canEarnDrop(makeItem({ requiredMinutes: 0, earnedMinutes: 0, status: "locked" }), {
        category: "upcoming",
        allowUpcoming: true,
      }),
    ).toBe(false);
  });

  it("requires allowUpcoming for upcoming drops and rejects hard blockers", () => {
    const upcoming = makeItem({ status: "locked", earnedMinutes: 0 });
    expect(canEarnDrop(upcoming, { category: "upcoming" })).toBe(false);
    expect(canEarnDrop(upcoming, { category: "upcoming", allowUpcoming: true })).toBe(true);
    expect(
      canEarnDrop(
        makeItem({
          status: "locked",
          earnedMinutes: 0,
          blockingReasonHints: ["preconditions_not_met"],
        }),
        { category: "upcoming", allowUpcoming: true },
      ),
    ).toBe(false);
  });

  it("keeps soft blocker upcoming drops earnable when upcoming is enabled", () => {
    expect(
      canEarnDrop(
        makeItem({
          status: "locked",
          earnedMinutes: 0,
          blockingReasonHints: ["account_not_linked"],
        }),
        { category: "upcoming", allowUpcoming: true },
      ),
    ).toBe(true);
  });
});

describe("canClaimDrop", () => {
  it("accepts explicit claimable drops when progress is complete", () => {
    const item = makeItem({
      status: "progress",
      earnedMinutes: 60,
      isClaimable: true,
    });
    expect(canClaimDrop(item)).toBe(true);
  });

  it("accepts fallback claim when only soft blockers are present", () => {
    const item = makeItem({
      earnedMinutes: 60,
      isClaimable: false,
      blockingReasonHints: ["missing_drop_instance_id", "campaign_allow_disabled"],
    });
    expect(canClaimDrop(item)).toBe(true);
  });

  it("rejects hard blockers, missing claim ids, and closed claim windows", () => {
    expect(
      canClaimDrop(
        makeItem({
          earnedMinutes: 60,
          isClaimable: false,
          blockingReasonHints: ["inventory_state_mismatch"],
        }),
      ),
    ).toBe(false);
    expect(
      canClaimDrop(
        makeItem({
          earnedMinutes: 60,
          dropInstanceId: undefined,
          campaignId: "",
        }),
      ),
    ).toBe(false);
    expect(
      canClaimDrop(
        makeItem({
          earnedMinutes: 60,
          endsAt: "2026-01-01T00:00:00Z",
        }),
        { now: Date.parse("2026-01-03T12:00:00Z") },
      ),
    ).toBe(false);
  });
});
