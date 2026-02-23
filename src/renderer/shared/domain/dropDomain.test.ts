import { describe, expect, it } from "vitest";
import type { InventoryItem, WatchingState } from "@renderer/shared/types";
import { DropChannelRestriction, InventoryDrop, InventoryDropCollection } from "./dropDomain";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop 1",
  requiredMinutes: 60,
  earnedMinutes: 10,
  status: "progress",
  ...overrides,
});

describe("DropChannelRestriction", () => {
  it("allows any channel when no constraints are configured", () => {
    const restriction = new DropChannelRestriction();
    expect(restriction.allowsChannel({ id: "1", login: "alpha" })).toBe(true);
  });

  it("matches channels by normalized id/login constraints", () => {
    const restriction = new DropChannelRestriction({
      ids: [" 123 "],
      logins: [" Alpha "],
    });
    expect(restriction.allowsChannel({ id: "123", login: "nope" })).toBe(true);
    expect(restriction.allowsChannel({ id: "999", login: "alpha" })).toBe(true);
    expect(restriction.allowsChannel({ id: "999", login: "beta" })).toBe(false);
  });

  it("matches watching channel info", () => {
    const watching: WatchingState = {
      id: "other",
      channelId: "chan-1",
      name: "Alpha",
      login: "alpha",
      game: "Game",
    };
    const restriction = new DropChannelRestriction({ ids: ["chan-1"] });
    expect(restriction.allowsWatching(watching)).toBe(true);
  });

  it("can merge restrictions and serialize to allowlist", () => {
    const first = DropChannelRestriction.fromAllowlist({
      ids: ["1"],
      logins: ["alpha"],
    });
    const second = new DropChannelRestriction({
      ids: ["2", "1"],
      logins: ["beta", "alpha"],
    });
    const merged = first.mergedWith(second);
    expect(merged.matchesId("2")).toBe(true);
    expect(merged.matchesLogin("beta")).toBe(true);
    expect(merged.toAllowlist()).toEqual({
      ids: ["1", "2"],
      logins: ["alpha", "beta"],
    });
  });
});

describe("InventoryDrop", () => {
  it("computes normalized minute fields", () => {
    const drop = new InventoryDrop(makeItem({ requiredMinutes: 45, earnedMinutes: 12 }));
    expect(drop.requiredMinutes).toBe(45);
    expect(drop.earnedMinutes).toBe(12);
    expect(drop.remainingMinutes).toBe(33);
  });

  it("detects expired campaigns by status or end date", () => {
    const now = Date.now();
    const expiredByStatus = new InventoryDrop(makeItem({ campaignStatus: "EXPIRED" }));
    const expiredByEnd = new InventoryDrop(
      makeItem({ campaignStatus: "ACTIVE", endsAt: new Date(now - 1000).toISOString() }),
    );
    expect(expiredByStatus.isExpired(now)).toBe(true);
    expect(expiredByEnd.isExpired(now)).toBe(true);
  });
});

describe("InventoryDropCollection", () => {
  it("filters drops by game", () => {
    const collection = new InventoryDropCollection([
      makeItem({ id: "a", game: "Game A" }),
      makeItem({ id: "b", game: "Game B" }),
    ]);
    expect(collection.forGame("Game A").map((drop) => drop.id)).toEqual(["a"]);
  });
});
