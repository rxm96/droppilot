import { describe, expect, it } from "vitest";
import {
  isChannelEntry,
  isChannelLiveDiff,
  isChannelTrackerStatus,
  isInventoryItem,
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
  isPriorityPlan,
  isStatsData,
  isTwitchProfile,
  isUserPubSubEvent,
  isUserPubSubStatus,
} from "@renderer/shared/utils/ipc";

describe("ipc guards", () => {
  it("accepts ipc error payloads", () => {
    expect(isIpcErrorResponse({ error: "nope" })).toBe(true);
    expect(isIpcAuthErrorResponse({ error: "auth", message: "bad" })).toBe(true);
  });

  it("rejects non-error payloads", () => {
    expect(isIpcErrorResponse({ message: "no error key" })).toBe(false);
    expect(isIpcAuthErrorResponse({ error: "nope" })).toBe(false);
  });

  it("validates priority plan payloads", () => {
    const ok = {
      order: ["A", "B"],
      availableGames: ["A", "B", "C"],
      missingPriority: ["C"],
      totalActiveDrops: 3,
    };
    expect(isPriorityPlan(ok)).toBe(true);
    expect(isPriorityPlan({ ...ok, totalActiveDrops: "3" })).toBe(false);
  });

  it("validates channel tracker status payloads", () => {
    const ok = {
      mode: "polling",
      state: "ok",
      lastRequestAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      connectionState: "connected",
      requests: 2,
      failures: 0,
    };
    expect(isChannelTrackerStatus(ok)).toBe(true);
    expect(isChannelTrackerStatus({ ...ok, requests: "2" })).toBe(false);
  });

  it("validates user pubsub events", () => {
    const ok = {
      kind: "drop-progress",
      at: Date.now(),
      topic: "user-drop-events.1",
      messageType: "drop-progress",
      dropId: "drop-1",
      currentProgressMin: 10,
      requiredProgressMin: 60,
    };
    expect(isUserPubSubEvent(ok)).toBe(true);
    expect(isUserPubSubEvent({ ...ok, kind: "unknown" })).toBe(false);
  });

  it("validates channel entries", () => {
    const ok = {
      id: "1",
      login: "foo",
      displayName: "Foo",
      title: "Streaming",
      viewers: 10,
      game: "Game",
    };
    expect(isChannelEntry(ok)).toBe(true);
    expect(isChannelEntry({ ...ok, viewers: "10" })).toBe(false);
  });

  it("validates channel live diffs", () => {
    const entry = {
      id: "1",
      login: "foo",
      displayName: "Foo",
      title: "Streaming",
      viewers: 10,
      game: "Game",
    };
    const ok = {
      game: "Game",
      at: Date.now(),
      source: "ws",
      reason: "snapshot",
      added: [entry],
      removedIds: [],
      updated: [entry],
    };
    expect(isChannelLiveDiff(ok)).toBe(true);
    expect(isChannelLiveDiff({ ...ok, source: "invalid" })).toBe(false);
  });

  it("validates inventory items", () => {
    const ok = {
      id: "drop-1",
      game: "Game",
      title: "Drop 1",
      requiredMinutes: 60,
      earnedMinutes: 5,
      status: "progress",
    };
    expect(isInventoryItem(ok)).toBe(true);
    expect(isInventoryItem({ ...ok, status: "other" })).toBe(false);
  });

  it("validates twitch profiles", () => {
    const ok = { login: "foo", displayName: "Foo" };
    expect(isTwitchProfile(ok)).toBe(true);
    expect(isTwitchProfile({ displayName: "Foo" })).toBe(false);
  });

  it("validates user pubsub status payloads", () => {
    const ok = {
      state: "ok",
      connectionState: "connected",
      listening: true,
      reconnectAttempts: 0,
      lastMessageAt: null,
      lastErrorAt: null,
      events: 3,
      currentUserId: "1",
    };
    expect(isUserPubSubStatus(ok)).toBe(true);
    expect(isUserPubSubStatus({ ...ok, events: "3" })).toBe(false);
  });

  it("validates stats payloads", () => {
    const ok = {
      totalMinutes: 120,
      totalClaims: 2,
      lastReset: Date.now(),
      claimsByGame: { Game: 2 },
    };
    expect(isStatsData(ok)).toBe(true);
    expect(isStatsData({ ...ok, claimsByGame: { Game: "2" } })).toBe(false);
  });
});
