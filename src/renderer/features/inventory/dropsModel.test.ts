import { describe, expect, it } from "vitest";
import type { FarmPlan, FarmPlanDropRow } from "@renderer/shared/domain/farmPlan";
import type { CampaignSummary, InventoryItem } from "@renderer/shared/types";
import { buildDropsView, classifyDrop, formatRank, gameCode, orderGames } from "./dropsModel";

const now = new Date(2026, 10, 6, 14, 14, 0).getTime();
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

describe("classifyDrop", () => {
  it("claimed drops are claimed", () => {
    expect(classifyDrop(item({ status: "claimed" }), { now })).toEqual({
      bucket: "claimed",
      status: "claimed",
    });
  });

  it("claimable drops need you, even after the campaign ended", () => {
    expect(classifyDrop(item({ isClaimable: true, earnedMinutes: 60 }), { now })).toEqual({
      bucket: "needs-you",
      status: "claim",
    });
    const ended = item({ isClaimable: true, earnedMinutes: 60, endsAt: iso(at(10, 0)) });
    expect(classifyDrop(ended, { now }).bucket).toBe("needs-you");
  });

  it("expired campaigns go to the expired section", () => {
    expect(classifyDrop(item({ endsAt: iso(at(10, 0)) }), { now })).toEqual({
      bucket: "expired",
      status: "expired",
    });
    expect(classifyDrop(item({ campaignStatus: "EXPIRED" }), { now }).bucket).toBe("expired");
    expect(classifyDrop(item({ blockingReasonHints: ["campaign_expired"] }), { now }).bucket).toBe(
      "expired",
    );
    const claimedEnded = item({ status: "claimed", endsAt: iso(at(10, 0)) });
    expect(classifyDrop(claimedEnded, { now })).toEqual({ bucket: "expired", status: "claimed" });
  });

  it("plan rows with a ready time are farming with the plan's status", () => {
    expect(classifyDrop(item({}), { now, planRow: planRow({ status: "watching" }) })).toEqual({
      bucket: "farming",
      status: "watching",
    });
    expect(classifyDrop(item({}), { now, planRow: planRow({ status: "next" }) }).status).toBe(
      "next",
    );
  });

  it("blocked plan rows that need a link need you", () => {
    const row = planRow({ readyAt: null, status: "blocked", blockedReason: "account_not_linked" });
    expect(classifyDrop(item({}), { now, planRow: row })).toEqual({
      bucket: "needs-you",
      status: "needs-link",
    });
  });

  it("other blocked plan rows are not farmed", () => {
    const row = planRow({
      readyAt: null,
      status: "blocked",
      blockedReason: "subscription_required",
    });
    expect(classifyDrop(item({}), { now, planRow: row })).toEqual({
      bucket: "not-farmed",
      status: "blocked",
    });
  });

  it("fully watched but not claimable is farming/queued", () => {
    expect(classifyDrop(item({ earnedMinutes: 60 }), { now })).toEqual({
      bucket: "farming",
      status: "queued",
    });
  });

  it("games outside the farm sequence are not farmed", () => {
    expect(classifyDrop(item({ status: "progress", earnedMinutes: 10 }), { now })).toEqual({
      bucket: "not-farmed",
      status: "not-farmed",
    });
  });

  it("zero-minute drops stay visible as not farmed", () => {
    expect(classifyDrop(item({ requiredMinutes: 0 }), { now })).toEqual({
      bucket: "not-farmed",
      status: "not-farmed",
    });
  });
});

describe("orderGames", () => {
  const plan: FarmPlan = {
    rows: [
      planRow({ dropId: "a", game: "Apex Legends" }),
      { kind: "switch", game: "Valorant", at: at(16, 0) },
      planRow({ dropId: "b", game: "Valorant" }),
    ],
    doneAt: null,
  };

  it("plan order first, then ranked games, then the rest by name", () => {
    expect(
      orderGames(["Zelda", "Rust", "Valorant", "Apex Legends", "Counter-Strike 2"], plan, [
        "Valorant",
        "Rust",
      ]),
    ).toEqual(["Apex Legends", "Valorant", "Rust", "Counter-Strike 2", "Zelda"]);
  });

  it("matches game names case-insensitively", () => {
    expect(orderGames(["valorant", "apex legends"], plan, ["VALORANT"])).toEqual([
      "apex legends",
      "valorant",
    ]);
  });
});

describe("gameCode", () => {
  it("three letters for one word", () => {
    expect(gameCode("Valorant")).toBe("VAL");
    expect(gameCode("Rust")).toBe("RUS");
  });

  it("initials for several words", () => {
    expect(gameCode("Counter-Strike 2")).toBe("CS2");
    expect(gameCode("World of Warcraft")).toBe("WOW");
    expect(gameCode("Apex Legends")).toBe("AL");
    expect(gameCode("  ")).toBe("?");
  });
});

describe("formatRank", () => {
  it("English ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map((n) => formatRank(n, "en"))).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
    ]);
  });

  it("German ordinal dot", () => {
    expect(formatRank(1, "de")).toBe("1.");
    expect(formatRank(12, "de")).toBe("12.");
  });
});

describe("buildDropsView", () => {
  const items: InventoryItem[] = [
    item({
      id: "v1",
      title: "Prime Vandal",
      earnedMinutes: 30,
      status: "progress",
      campaignName: "Champions",
      campaignId: "c-val",
      campaignImageUrl: "https://img/val.png",
      imageUrl: "https://img/vandal.png",
    }),
    item({ id: "v2", title: "Player Card", requiredMinutes: 120, campaignName: "Champions" }),
    item({ id: "v3", title: "Spray", status: "claimed", earnedMinutes: 45, requiredMinutes: 45 }),
    item({
      id: "a1",
      game: "Apex Legends",
      title: "Legend Skin",
      earnedMinutes: 90,
      requiredMinutes: 120,
      endsAt: iso(at(20, 0)),
      campaignName: "Season A",
    }),
    item({
      id: "r1",
      game: "Rust",
      title: "Metal Door",
      requiredMinutes: 180,
      linked: false,
      campaignId: "c-rust",
      campaignName: "Rust Drops",
    }),
    item({ id: "cs1", game: "Counter-Strike 2", title: "Sticker", campaignName: "Major" }),
    item({ id: "cs2", game: "Counter-Strike 2", title: "Graffiti", campaignName: "Major 2" }),
    item({ id: "old", game: "Rust", title: "Old Skin", endsAt: iso(at(9, 0, 1)) }),
  ];
  const campaigns: CampaignSummary[] = [
    { id: "c-rust", name: "Rust Drops", game: "Rust", accountLinkUrl: "https://link/rust" },
  ];
  const plan: FarmPlan = {
    rows: [
      planRow({ dropId: "v1", title: "Prime Vandal", readyAt: at(14, 34), status: "watching" }),
      planRow({ dropId: "v2", title: "Player Card", readyAt: at(16, 34), status: "next" }),
      { kind: "switch", game: "Apex Legends", at: at(16, 34) },
      planRow({ dropId: "a1", game: "Apex Legends", readyAt: at(17, 4), status: "queued" }),
      planRow({
        dropId: "r1",
        game: "Rust",
        readyAt: null,
        status: "blocked",
        blockedReason: "account_not_linked",
      }),
    ],
    doneAt: at(17, 4),
  };
  const base = {
    items,
    campaigns,
    plan,
    rankedGames: ["Valorant", "Apex Legends", "Rust"],
    activeDrop: { id: "v1", earnedMinutes: 40.6 },
    watchingChannel: "agentzero",
    filter: "all" as const,
    search: "",
    now,
  };

  it("groups by game in farm order with rank and campaign meta", () => {
    const view = buildDropsView(base);
    expect(view.groups.map((g) => g.game)).toEqual([
      "Valorant",
      "Apex Legends",
      "Rust",
      "Counter-Strike 2",
    ]);
    expect(view.totalDrops).toBe(7);
    expect(view.totalGames).toBe(4);
    const [val, , , cs] = view.groups;
    expect(val).toMatchObject({
      code: "VAL",
      imageUrl: "https://img/val.png",
      rank: 1,
      campaign: { kind: "one", name: "Champions" },
      endsIn: "1d",
    });
    expect(cs).toMatchObject({ rank: null, campaign: { kind: "many", count: 2 } });
  });

  it("filters by bucket and counts every bucket", () => {
    const view = buildDropsView({ ...base, filter: "farming" });
    expect(view.counts).toEqual({
      all: 7,
      farming: 3,
      "needs-you": 1,
      claimed: 1,
      "not-farmed": 2,
    });
    expect(view.groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(["v1", "v2", "a1"]);
  });

  it("search matches drop, game and campaign", () => {
    const ids = (search: string) =>
      buildDropsView({ ...base, search }).groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids("vandal")).toEqual(["v1"]);
    expect(ids("APEX")).toEqual(["a1"]);
    expect(ids("major 2")).toEqual(["cs2"]);
    expect(buildDropsView({ ...base, search: "vandal" }).counts.all).toBe(1);
  });

  it("hides groups without visible rows", () => {
    const view = buildDropsView({ ...base, filter: "claimed" });
    expect(view.groups.map((g) => g.game)).toEqual(["Valorant"]);
  });

  it("expired drops only in the expired section", () => {
    const view = buildDropsView(base);
    expect(view.groups.flatMap((g) => g.rows.map((r) => r.id))).not.toContain("old");
    expect(view.expiredCount).toBe(1);
    expect(view.expired).toHaveLength(1);
    expect(view.expired[0]).toMatchObject({ game: "Rust" });
    expect(view.expired[0].rows[0]).toMatchObject({ id: "old", status: "expired" });
    expect(buildDropsView({ ...base, filter: "not-farmed" }).expired).toEqual([]);
  });

  it("uses live minutes for the watched drop", () => {
    const v1 = buildDropsView(base).groups[0].rows[0];
    expect(v1).toMatchObject({
      id: "v1",
      title: "Prime Vandal",
      imageUrl: "https://img/vandal.png",
      watched: 40,
      required: 60,
      ready: { clock: "14:34", dayOffset: 0 },
      status: "watching",
      note: { kind: "on-channel", channel: "agentzero" },
    });
  });

  it("notes the game switch and a campaign ending soon", () => {
    const view = buildDropsView(base);
    const apex = view.groups[1].rows[0];
    expect(apex).toMatchObject({ note: { kind: "ends-soon", endsIn: "5h" } });
    const noEnd = buildDropsView({
      ...base,
      items: items.map((i) => (i.id === "a1" ? { ...i, endsAt: iso(at(12, 0, 9)) } : i)),
    }).groups[1].rows[0];
    expect(noEnd.note).toEqual({ kind: "after-switch", at: { clock: "16:34", dayOffset: 0 } });
  });

  it("marks groups that need a link with the campaign's link url", () => {
    const rust = buildDropsView(base).groups[2];
    expect(rust).toMatchObject({ needsLink: true, linkUrl: "https://link/rust", rank: 3 });
    expect(rust.rows[0]).toMatchObject({
      status: "needs-link",
      bucket: "needs-you",
      ready: null,
      note: { kind: "link", game: "Rust" },
    });
    expect(buildDropsView(base).groups[0].needsLink).toBe(false);
  });

  it("orders rows inside a game", () => {
    const view = buildDropsView({
      ...base,
      items: [
        ...items,
        item({ id: "v4", title: "Ready", isClaimable: true, earnedMinutes: 60 }),
        item({ id: "v5", title: "Zero", requiredMinutes: 0 }),
      ],
    });
    expect(view.groups[0].rows.map((r) => r.id)).toEqual(["v1", "v2", "v4", "v5", "v3"]);
  });
});
