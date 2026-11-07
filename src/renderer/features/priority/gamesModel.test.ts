import { describe, expect, it } from "vitest";
import type { FarmPlan, FarmPlanDropRow } from "@renderer/shared/domain/farmPlan";
import type { InventoryItem } from "@renderer/shared/types";
import { adjacentGame, buildGamesView, fallbackRuleFor, obeyPriorityFor } from "./gamesModel";

const now = new Date(2026, 10, 6, 14, 0, 0).getTime();
const at = (h: number, m: number, day = 6) => new Date(2026, 10, day, h, m, 0).getTime();
const iso = (ts: number) => new Date(ts).toISOString();

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: "d",
  game: "Valorant",
  title: "Drop",
  requiredMinutes: 60,
  earnedMinutes: 0,
  status: "locked",
  endsAt: iso(at(12, 0, 8)),
  ...over,
});

const planRow = (over: Partial<FarmPlanDropRow>): FarmPlanDropRow => ({
  kind: "drop",
  dropId: "d",
  game: "Valorant",
  title: "Drop",
  earnedMinutes: 0,
  requiredMinutes: 60,
  readyAt: at(15, 0),
  status: "queued",
  wontFinishInTime: false,
  ...over,
});

const emptyPlan: FarmPlan = { rows: [], doneAt: null };

const view = (over: Partial<Parameters<typeof buildGamesView>[0]>) =>
  buildGamesView({
    priorityGames: [],
    items: [],
    plan: emptyPlan,
    farmingGame: "",
    liveChannels: null,
    now,
    ...over,
  });

describe("fallbackRuleFor / obeyPriorityFor", () => {
  it("Wait is obeyPriority on", () => {
    expect(fallbackRuleFor(true)).toBe("wait");
    expect(obeyPriorityFor("wait")).toBe(true);
  });

  it("farm other games is obeyPriority off", () => {
    expect(fallbackRuleFor(false)).toBe("farm-others");
    expect(obeyPriorityFor("farm-others")).toBe(false);
  });

  it("round-trips", () => {
    for (const obey of [true, false]) expect(obeyPriorityFor(fallbackRuleFor(obey))).toBe(obey);
  });
});

describe("adjacentGame", () => {
  const list = ["Valorant", "Apex Legends", "Rust"];

  it("previous game for up", () => {
    expect(adjacentGame(list, "Apex Legends", -1)).toBe("Valorant");
  });

  it("next game for down", () => {
    expect(adjacentGame(list, "Apex Legends", 1)).toBe("Rust");
  });

  it("null at the ends and for unknown games", () => {
    expect(adjacentGame(list, "Valorant", -1)).toBeNull();
    expect(adjacentGame(list, "Rust", 1)).toBeNull();
    expect(adjacentGame(list, "Missing", 1)).toBeNull();
  });
});

describe("buildGamesView", () => {
  it("ranks the user's games in their order with padded ranks and codes", () => {
    const v = view({ priorityGames: ["Valorant", "Apex Legends", "Counter-Strike 2"] });
    expect(v.rows.map((r) => [r.rank, r.game, r.code])).toEqual([
      ["01", "Valorant", "VAL"],
      ["02", "Apex Legends", "AL"],
      ["03", "Counter-Strike 2", "CS2"],
    ]);
    expect(v.rows.map((r) => [r.isFirst, r.isLast])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it("counts open drops and the earliest end, skipping claimed and expired drops", () => {
    const v = view({
      priorityGames: ["Valorant"],
      items: [
        item({ id: "a", endsAt: iso(at(12, 0, 8)) }),
        item({ id: "b", endsAt: iso(at(20, 0)) }),
        item({ id: "c", status: "claimed", endsAt: iso(at(15, 0)) }),
        item({ id: "e", endsAt: iso(at(10, 0)) }),
      ],
    });
    expect(v.rows[0].meta).toEqual({ dropsLeft: 2, endsIn: "6h", live: null });
  });

  it("says no drops when a ranked game has none open", () => {
    const v = view({
      priorityGames: ["Rust"],
      items: [item({ id: "a", game: "Rust", status: "claimed" })],
    });
    expect(v.rows[0].meta).toEqual({ dropsLeft: 0, endsIn: null, live: null });
  });

  it("shows live channels only for the game whose channels are loaded", () => {
    const v = view({
      priorityGames: ["Valorant", "Rust"],
      items: [item({ id: "a" }), item({ id: "b", game: "Rust" })],
      liveChannels: { game: "valorant", count: 41 },
    });
    expect(v.rows.map((r) => r.meta.live)).toEqual([41, null]);
  });

  it("marks the watched game as farming, matching names case-insensitively", () => {
    const v = view({
      priorityGames: ["valorant", "Rust"],
      items: [item({ id: "a" }), item({ id: "b", game: "Rust" })],
      farmingGame: "Valorant",
    });
    expect(v.rows.map((r) => r.farming)).toEqual([true, false]);
    expect(view({ priorityGames: ["Valorant"] }).rows[0].farming).toBe(false);
  });

  it("marks games with a link-blocked plan row as needing a link", () => {
    const items = [
      item({ id: "a", game: "Rust", linked: false }),
      item({ id: "b", game: "Apex Legends" }),
    ];
    const plan: FarmPlan = {
      rows: [
        planRow({
          dropId: "a",
          game: "Rust",
          status: "blocked",
          readyAt: null,
          blockedReason: "account_not_linked",
        }),
        planRow({
          dropId: "b",
          game: "Apex Legends",
          status: "blocked",
          readyAt: null,
          blockedReason: "campaign_not_started",
        }),
      ],
      doneAt: null,
    };
    const v = view({ priorityGames: ["Rust", "Apex Legends"], items, plan });
    expect(v.rows.map((r) => r.needsLink)).toEqual([true, false]);
  });

  it("lists other games with open drops by name, without the user's games", () => {
    const v = view({
      priorityGames: ["valorant"],
      items: [
        item({ id: "a" }),
        item({ id: "b", game: "Overwatch 2" }),
        item({ id: "c", game: "Counter-Strike 2", endsAt: iso(at(14, 0, 12)) }),
        item({ id: "d", game: "Counter-Strike 2", endsAt: iso(at(14, 0, 13)) }),
      ],
      liveChannels: { game: "Overwatch 2", count: 17 },
      farmingGame: "Overwatch 2",
    });
    expect(v.others).toEqual([
      {
        game: "Counter-Strike 2",
        code: "CS2",
        farming: false,
        meta: { dropsLeft: 2, endsIn: "6d", live: null },
      },
      {
        game: "Overwatch 2",
        code: "O2",
        farming: true,
        meta: { dropsLeft: 1, endsIn: "1d", live: 17 },
      },
    ]);
  });

  it("keeps games that are not in the list", () => {
    const v = view({
      priorityGames: ["Apex"],
      items: [item({ id: "a", game: "Rust" }), item({ id: "b", game: "WoW" })],
    });
    expect(v.others.map((g) => g.game)).toEqual(["Rust", "WoW"]);
  });

  it("is empty when every game with drops is listed", () => {
    const v = view({
      priorityGames: ["Rust", "WoW"],
      items: [item({ id: "a", game: "Rust" }), item({ id: "b", game: "WoW" })],
    });
    expect(v.others).toEqual([]);
  });

  it("leaves games with only claimed or expired drops out of the other games", () => {
    const v = view({
      items: [
        item({ id: "a", game: "Rust", status: "claimed" }),
        item({ id: "b", game: "WoW", campaignStatus: "EXPIRED" }),
      ],
    });
    expect(v.others).toEqual([]);
  });

  it("uses the campaign image for the tile when there is one", () => {
    const v = view({
      priorityGames: ["Valorant"],
      items: [
        item({ id: "a" }),
        item({ id: "b", campaignImageUrl: " https://img/val.png " }),
        item({ id: "c", game: "Rust", campaignImageUrl: "https://img/rust.png" }),
      ],
    });
    expect(v.rows[0].imageUrl).toBe("https://img/val.png");
    expect(v.others[0].imageUrl).toBe("https://img/rust.png");
  });
});
