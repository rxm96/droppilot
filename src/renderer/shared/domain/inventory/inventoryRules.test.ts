import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@renderer/shared/types";
import { canClaimDrop, canEarnDrop, isUpcomingDropStartable } from "./inventoryRules";

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

  it("treats a missing subscription as a hard watching blocker", () => {
    const item = makeItem({ blockingReasonHints: ["subscription_required"] });
    expect(canEarnDrop(item, { category: "in-progress" })).toBe(false);
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

describe("fresh linked campaigns", () => {
  // A DropCampaignDetails drop of an active, account-connected campaign: no `self`, so
  // status "locked" with 0 earned minutes — category "upcoming".
  const fresh = (overrides: Partial<InventoryItem> = {}) =>
    makeItem({
      status: "locked",
      earnedMinutes: 0,
      dropInstanceId: undefined,
      linked: true,
      campaignStatus: "ACTIVE",
      blockingReasonHints: [],
      ...overrides,
    });

  it("treats only linked upcoming drops as startable without the unlinked opt-in", () => {
    expect(isUpcomingDropStartable(fresh())).toBe(true);
    expect(isUpcomingDropStartable(fresh({ linked: false }))).toBe(false);
    expect(isUpcomingDropStartable(fresh({ linked: undefined }))).toBe(false);
    expect(isUpcomingDropStartable(fresh({ linked: false }), true)).toBe(true);
  });

  it("makes an active, linked, unblocked 0-minute drop earnable with default settings", () => {
    expect(canEarnDrop(fresh(), { category: "upcoming" })).toBe(true);
    expect(canEarnDrop(fresh(), { category: "upcoming", allowUpcoming: false })).toBe(true);
    // category derived from status ("locked" → "upcoming")
    expect(canEarnDrop(fresh())).toBe(true);
  });

  it("keeps unlinked fresh drops behind the unlinked opt-in", () => {
    const unlinked = fresh({ linked: false, blockingReasonHints: ["account_not_linked"] });
    expect(canEarnDrop(unlinked, { category: "upcoming" })).toBe(false);
    expect(canEarnDrop(unlinked, { category: "upcoming", allowUpcoming: true })).toBe(true);
  });

  it("keeps not-started, expired and chained linked drops excluded", () => {
    const blockedCases: Array<Partial<InventoryItem>> = [
      { blocked: true, blockingReasonHints: ["campaign_not_started"] },
      { blocked: true, blockingReasonHints: ["campaign_expired"] },
      { blocked: true, blockingReasonHints: ["missing_prerequisite_drops:drop-0"] },
      { blocked: true, blockingReasonHints: ["preconditions_not_met"] },
      // hard hint alone (e.g. a patched item that lost `blocked`) is still enough
      { blockingReasonHints: ["campaign_not_started"] },
      { blockingReasonHints: ["missing_prerequisite_drops:drop-0"] },
    ];
    for (const overrides of blockedCases) {
      expect(canEarnDrop(fresh(overrides), { category: "upcoming" })).toBe(false);
      expect(canEarnDrop(fresh(overrides), { category: "upcoming", allowUpcoming: true })).toBe(
        false,
      );
    }
  });

  it("does not turn non-watchable linked drops earnable", () => {
    expect(canEarnDrop(fresh({ requiredMinutes: 0 }), { category: "upcoming" })).toBe(false);
    expect(canEarnDrop(fresh(), { category: "not-linked" })).toBe(false);
    expect(canEarnDrop(fresh(), { category: "expired" })).toBe(false);
  });
});

describe("canClaimDrop", () => {
  it("rejects fallback claims for sub drops whose subscription is missing", () => {
    const item = makeItem({
      requiredMinutes: 0,
      earnedMinutes: 0,
      status: "locked",
      dropInstanceId: undefined,
      isClaimable: false,
      blocked: true,
      blockingReasonHints: ["subscription_required"],
    });
    expect(canClaimDrop(item)).toBe(false);
  });

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
