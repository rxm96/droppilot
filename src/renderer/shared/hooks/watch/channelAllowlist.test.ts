import { describe, expect, it } from "vitest";
import type { ChannelEntry, InventoryItem } from "@renderer/shared/types";
import {
  buildAllowlistKey,
  buildChannelAllowlist,
  normalizeAllowlist,
  prioritizeChannelsByAllowlist,
  type WithCategory,
} from "./channelAllowlist";

const makeItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "drop-1",
  game: "Game",
  title: "Drop",
  requiredMinutes: 60,
  earnedMinutes: 0,
  status: "progress",
  ...overrides,
});

describe("channelAllowlist helpers", () => {
  it("builds an allowlist from all actionable drops in target game", () => {
    const withCategories: WithCategory[] = [
      {
        item: makeItem({
          id: "a",
          allowedChannelIds: ["1", "2"],
          allowedChannelLogins: ["alpha"],
        }),
        category: "in-progress",
      },
      {
        item: makeItem({
          id: "b",
          allowedChannelIds: ["2", "3"],
          allowedChannelLogins: ["Beta", "alpha"],
        }),
        category: "in-progress",
      },
      {
        item: makeItem({
          id: "c",
          game: "Other",
          allowedChannelIds: ["999"],
          allowedChannelLogins: ["other"],
        }),
        category: "in-progress",
      },
    ];

    expect(
      buildChannelAllowlist({
        targetGame: "Game",
        withCategories,
      }),
    ).toEqual({
      ids: ["1", "2", "3"],
      logins: ["alpha", "beta"],
    });
  });

  it("ignores non-actionable, claimed, blocked, and unrestricted drops", () => {
    const withCategories: WithCategory[] = [
      {
        item: makeItem({
          id: "claimed",
          status: "claimed",
          allowedChannelIds: ["1"],
        }),
        category: "finished",
      },
      {
        item: makeItem({
          id: "blocked",
          status: "locked",
          blocked: true,
          allowedChannelIds: ["2"],
        }),
        category: "upcoming",
      },
      {
        item: makeItem({
          id: "unrestricted",
          status: "progress",
        }),
        category: "in-progress",
      },
    ];

    expect(
      buildChannelAllowlist({
        targetGame: "Game",
        withCategories,
      }),
    ).toBeNull();
  });

  it("does not constrain the whole game when any actionable drop is unrestricted", () => {
    const withCategories: WithCategory[] = [
      {
        item: makeItem({
          id: "restricted",
          allowedChannelIds: ["1"],
          allowedChannelLogins: ["alpha"],
        }),
        category: "in-progress",
      },
      {
        item: makeItem({
          id: "unrestricted",
        }),
        category: "in-progress",
      },
    ];

    expect(
      buildChannelAllowlist({
        targetGame: "Game",
        withCategories,
      }),
    ).toBeNull();
  });

  it("can include upcoming drops when enabled", () => {
    const withCategories: WithCategory[] = [
      {
        item: makeItem({
          id: "upcoming",
          status: "locked",
          allowedChannelIds: ["42"],
          allowedChannelLogins: ["future"],
        }),
        category: "upcoming",
      },
    ];

    expect(
      buildChannelAllowlist({
        targetGame: "Game",
        withCategories,
      }),
    ).toBeNull();

    expect(
      buildChannelAllowlist({
        targetGame: "Game",
        withCategories,
        allowUpcoming: true,
      }),
    ).toEqual({
      ids: ["42"],
      logins: ["future"],
    });
  });
});

const ch = (over: Partial<ChannelEntry> = {}): ChannelEntry => ({
  id: "1",
  login: "alpha",
  displayName: "Alpha",
  title: "t",
  viewers: 10,
  game: "Game",
  ...over,
});

describe("channel allowlist helpers", () => {
  it("normalizeAllowlist returns null when there are no constraints", () => {
    expect(normalizeAllowlist(null)).toBeNull();
    expect(normalizeAllowlist({ ids: [], logins: [] })).toBeNull();
  });

  it("prioritizeChannelsByAllowlist hoists allowlisted channels before fallback", () => {
    const channels = [ch({ id: "1", login: "alpha" }), ch({ id: "2", login: "beta" })];
    const out = prioritizeChannelsByAllowlist(channels, { ids: ["2"], logins: [] });
    expect(out.map((c) => c.id)).toEqual(["2", "1"]);
  });

  it("prioritizeChannelsByAllowlist returns the same array when no reorder is needed", () => {
    const channels = [ch({ id: "1" }), ch({ id: "2", login: "beta" })];
    expect(prioritizeChannelsByAllowlist(channels, null)).toBe(channels);
  });

  it("prioritizeChannelsByAllowlist returns the same array when already in order", () => {
    const channels = [ch({ id: "2", login: "beta" }), ch({ id: "1", login: "alpha" })];
    // "beta" matches by login and is already first; "alpha" does not match → no reorder needed
    expect(prioritizeChannelsByAllowlist(channels, { ids: [], logins: ["beta"] })).toBe(channels);
  });

  it("buildAllowlistKey is stable regardless of input order", () => {
    const a = buildAllowlistKey({ ids: ["b", "a"], logins: ["y", "x"] });
    const b = buildAllowlistKey({ ids: ["a", "b"], logins: ["x", "y"] });
    expect(a).toBe(b);
    expect(buildAllowlistKey(null)).toBe("");
  });
});
