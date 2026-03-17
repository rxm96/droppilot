import { describe, expect, it, vi } from "vitest";
import type { ClaimStatus, InventoryItem, UserPubSubEvent } from "@renderer/shared/types";
import { CLAIM_ATTEMPT_RETRY_MS } from "./inventoryRules";
import { InventoryClaimEngine, isAutoClaimCandidate } from "./inventoryClaimEngine";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop 1",
  requiredMinutes: 60,
  earnedMinutes: 60,
  status: "progress",
  campaignId: "camp-1",
  dropInstanceId: "inst-1",
  ...overrides,
});

const makeDropClaimEvent = (overrides: Partial<UserPubSubEvent> = {}): UserPubSubEvent => ({
  kind: "drop-claim",
  at: Date.now(),
  topic: "user-drop-events.1",
  messageType: "drop-claim",
  dropId: "drop-1",
  dropInstanceId: "inst-1",
  ...overrides,
});

describe("isAutoClaimCandidate", () => {
  it("allows fallback claim when only soft blocking hints are present", () => {
    const item = makeItem({
      isClaimable: false,
      blockingReasonHints: ["missing_drop_instance_id", "campaign_allow_disabled"],
    });
    expect(isAutoClaimCandidate(item, Date.now())).toBe(true);
  });

  it("blocks fallback claim when hard blocking hints are present", () => {
    const item = makeItem({
      isClaimable: false,
      blockingReasonHints: ["inventory_state_mismatch"],
    });
    expect(isAutoClaimCandidate(item, Date.now())).toBe(false);
  });

  it("blocks fallback claim for badge or emote icon drops", () => {
    const item = makeItem({
      isClaimable: false,
      dropHasBadgeOrEmote: true,
      blockingReasonHints: ["missing_drop_instance_id"],
    });
    expect(isAutoClaimCandidate(item, Date.now())).toBe(false);
  });
});

describe("InventoryClaimEngine.autoClaimFromInventory", () => {
  it("claims eligible drops and emits success status", async () => {
    const engine = new InventoryClaimEngine();
    const setClaimStatus = vi.fn<(status: ClaimStatus) => void>();
    const onClaimed = vi.fn<(payload: { title: string; game: string }) => void>();
    const claimDrop = vi.fn(async () => ({ ok: true }));

    const result = await engine.autoClaimFromInventory([makeItem()], {
      claimDrop,
      onAuthError: vi.fn(),
      onClaimed,
      setClaimStatus,
      now: () => 1_000,
    });

    expect(claimDrop).toHaveBeenCalledTimes(1);
    expect(claimDrop).toHaveBeenCalledWith({
      dropInstanceId: "inst-1",
      dropId: "drop-1",
      campaignId: "camp-1",
    });
    expect(result).toEqual({ claimedCount: 1, claimedIds: ["drop-1"] });
    expect(onClaimed).toHaveBeenCalledWith({ title: "Drop 1", game: "Game" });
    expect(setClaimStatus).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "success", message: "Auto-claimed: Drop 1" }),
    );
  });

  it("backs off failed claims and skips immediate retries with the same signature", async () => {
    const engine = new InventoryClaimEngine();
    const claimDrop = vi.fn(async () => ({ ok: false, message: "try later" }));
    const setClaimStatus = vi.fn<(status: ClaimStatus) => void>();

    const deps = {
      claimDrop,
      onAuthError: vi.fn(),
      onClaimed: vi.fn(),
      setClaimStatus,
      now: () => 2_000,
    };
    await engine.autoClaimFromInventory([makeItem()], deps);
    await engine.autoClaimFromInventory([makeItem()], deps);

    expect(claimDrop).toHaveBeenCalledTimes(1);
    expect(setClaimStatus).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error", message: "try later" }),
    );
  });

  it("caps fallback auto-claim attempts per run", async () => {
    const engine = new InventoryClaimEngine();
    const claimDrop = vi.fn(async () => ({ ok: true }));
    const base = {
      requiredMinutes: 30,
      earnedMinutes: 30,
      isClaimable: false as const,
      blockingReasonHints: ["missing_drop_instance_id"],
    };
    const items = [
      makeItem({ ...base, id: "drop-a", dropInstanceId: undefined, campaignId: "camp-a" }),
      makeItem({ ...base, id: "drop-b", dropInstanceId: undefined, campaignId: "camp-b" }),
      makeItem({ ...base, id: "drop-c", dropInstanceId: undefined, campaignId: "camp-c" }),
    ];

    await engine.autoClaimFromInventory(items, {
      claimDrop,
      onAuthError: vi.fn(),
      onClaimed: vi.fn(),
      setClaimStatus: vi.fn<(status: ClaimStatus) => void>(),
      now: () => 5_000,
    });

    expect(claimDrop).toHaveBeenCalledTimes(1);
  });
});

describe("InventoryClaimEngine.claimFromPubSubDropClaim", () => {
  it("deduplicates claim attempts within retry window", async () => {
    const engine = new InventoryClaimEngine();
    const claimDrop = vi.fn(async () => ({ ok: true }));
    const setClaimStatus = vi.fn<(status: ClaimStatus) => void>();
    let now = 1_000_000;

    await engine.claimFromPubSubDropClaim({
      claimDrop,
      onAuthError: vi.fn(),
      setClaimStatus,
      event: makeDropClaimEvent(),
      claimedItem: makeItem(),
      now: () => now,
    });

    now += CLAIM_ATTEMPT_RETRY_MS - 1;
    await engine.claimFromPubSubDropClaim({
      claimDrop,
      onAuthError: vi.fn(),
      setClaimStatus,
      event: makeDropClaimEvent(),
      claimedItem: makeItem(),
      now: () => now,
    });

    now += 1;
    await engine.claimFromPubSubDropClaim({
      claimDrop,
      onAuthError: vi.fn(),
      setClaimStatus,
      event: makeDropClaimEvent(),
      claimedItem: makeItem(),
      now: () => now,
    });

    // After first successful claim, the drop ID is permanently tracked —
    // subsequent attempts for the same drop are skipped entirely.
    expect(claimDrop).toHaveBeenCalledTimes(1);
    expect(setClaimStatus).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "success", message: "Auto-claimed: Drop 1" }),
    );
  });

  it("does not re-claim a drop that was already successfully claimed via auto-claim", async () => {
    const engine = new InventoryClaimEngine();
    const claimDrop = vi.fn(async () => ({ ok: true }));
    const setClaimStatus = vi.fn<(status: ClaimStatus) => void>();

    // First: auto-claim succeeds
    await engine.autoClaimFromInventory([makeItem()], {
      claimDrop,
      onAuthError: vi.fn(),
      onClaimed: vi.fn(),
      setClaimStatus,
      now: () => 1_000,
    });
    expect(claimDrop).toHaveBeenCalledTimes(1);

    // Second: same item still appears as claimable (Twitch hasn't updated yet)
    await engine.autoClaimFromInventory([makeItem()], {
      claimDrop,
      onAuthError: vi.fn(),
      onClaimed: vi.fn(),
      setClaimStatus,
      now: () => 100_000,
    });
    // Should NOT claim again
    expect(claimDrop).toHaveBeenCalledTimes(1);
  });

  it("surfaces auth errors via onAuthError", async () => {
    const engine = new InventoryClaimEngine();
    const onAuthError = vi.fn<(message?: string) => void>();
    const setClaimStatus = vi.fn<(status: ClaimStatus) => void>();

    await engine.claimFromPubSubDropClaim({
      claimDrop: async () => ({ error: "auth", message: "session expired" }),
      onAuthError,
      setClaimStatus,
      event: makeDropClaimEvent(),
      claimedItem: makeItem(),
      now: () => 1_000_000,
    });

    expect(onAuthError).toHaveBeenCalledWith("session expired");
    expect(setClaimStatus).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
  });
});
