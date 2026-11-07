import { describe, expect, it } from "vitest";
import type { CampaignSummary, InventoryItem } from "@renderer/shared/types";
import {
  TWITCH_INVENTORY_URL,
  buildDropDetails,
  campaignUrl,
  formatMinutesLeft,
  type DropDetailsContext,
} from "./dropDetails";
import type { DropsRow } from "./dropsModel";

const now = new Date(2026, 10, 7, 14, 14, 0).getTime();
const at = (h: number, m: number, day = 7) => new Date(2026, 10, day, h, m, 0).getTime();
const iso = (ts: number) => new Date(ts).toISOString();

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: "d",
  game: "Valorant",
  title: "Prime Vandal",
  requiredMinutes: 60,
  earnedMinutes: 0,
  status: "progress",
  campaignId: "camp-1",
  campaignName: "Champions Tour",
  endsAt: iso(at(18, 0, 9)),
  ...over,
});

const row = (over: Partial<DropsRow> = {}, itemOver: Partial<InventoryItem> = {}): DropsRow => ({
  id: "d",
  item: item(itemOver),
  title: "Prime Vandal",
  bucket: "farming",
  status: "watching",
  note: null,
  watched: 40,
  required: 60,
  ready: null,
  readyAt: null,
  ...over,
});

const campaign: CampaignSummary = {
  id: "camp-1",
  name: "Champions Tour",
  game: "Valorant",
  accountLinkUrl: "https://link/riot",
  startsAt: iso(at(10, 0, 1)),
  endsAt: iso(at(18, 0, 9)),
  drops: [{ id: "a" }, { id: "b" }, { id: "c" }],
};

const ctx = (over: Partial<DropDetailsContext> = {}): DropDetailsContext => ({
  campaigns: [campaign],
  rankedGames: ["Valorant"],
  farmingGame: "Valorant",
  now,
  ...over,
});

const keys = (r: DropsRow, c: DropDetailsContext = ctx()) =>
  buildDropDetails(r, c).why.map((p) => p.key);
const actionKinds = (r: DropsRow, c: DropDetailsContext = ctx()) =>
  buildDropDetails(r, c).actions.map((a) => a.kind);

describe("buildDropDetails: why", () => {
  it("watching on a channel names the channel and the ready clock", () => {
    const r = row({
      note: { kind: "on-channel", channel: "agentzero" },
      ready: { clock: "14:34", dayOffset: 0 },
      readyAt: at(14, 34),
    });
    expect(buildDropDetails(r, ctx()).why).toEqual([
      { key: "drops.details.why.watching", vars: { channel: "agentzero", clock: "14:34" } },
    ]);
  });

  it("watching on a later day shows the day offset", () => {
    const r = row({
      note: { kind: "on-channel", channel: "agentzero" },
      ready: { clock: "01:10", dayOffset: 1 },
      readyAt: at(1, 10, 8),
    });
    expect(buildDropDetails(r, ctx()).why[0].vars).toMatchObject({ clock: "01:10 +1d" });
  });

  it("watching without a channel says it is farming right now", () => {
    expect(keys(row({ ready: { clock: "14:34", dayOffset: 0 }, readyAt: at(14, 34) }))).toEqual([
      "drops.details.why.farming",
    ]);
  });

  it("next/queued after a game switch name the game and the switch clock", () => {
    const r = row(
      {
        status: "next",
        note: { kind: "after-switch", at: { clock: "16:34", dayOffset: 0 } },
        ready: { clock: "17:04", dayOffset: 0 },
        readyAt: at(17, 4),
      },
      { game: "Apex Legends" },
    );
    expect(buildDropDetails(r, ctx()).why).toEqual([
      { key: "drops.details.why.afterSwitch", vars: { game: "Apex Legends", clock: "16:34" } },
    ]);
  });

  it("next/queued that ends first warns that DropPilot will probably miss it", () => {
    expect(keys(row({ status: "queued", note: { kind: "ends-first" } }))).toEqual([
      "drops.details.why.endsFirst",
    ]);
  });

  it("other next/queued drops fill up while the game is farmed", () => {
    expect(buildDropDetails(row({ status: "next" }), ctx()).why).toEqual([
      { key: "drops.details.why.shared", vars: { game: "Valorant" } },
    ]);
    expect(keys(row({ status: "queued", note: { kind: "ends-soon", endsIn: "5h" } }))).toEqual([
      "drops.details.why.shared",
    ]);
  });

  it("queued drops of another game say when DropPilot gets to that game", () => {
    const r = row({ status: "queued", ready: { clock: "16:34", dayOffset: 0 } });
    expect(buildDropDetails(r, ctx({ farmingGame: "Apex Legends" })).why).toEqual([
      { key: "drops.details.why.later", vars: { game: "Valorant", clock: "16:34" } },
    ]);
    // Nothing farmed right now (paused): still the later sentence, not "fills up".
    expect(keys(r, ctx({ farmingGame: null }))).toEqual(["drops.details.why.later"]);
    // Same game as the one farmed: the shared-minutes sentence.
    expect(keys(r, ctx({ farmingGame: "valorant" }))).toEqual(["drops.details.why.shared"]);
  });

  it("fully watched drops wait for the claim", () => {
    expect(keys(row({ status: "queued", note: { kind: "waiting-claim" } }))).toEqual([
      "drops.details.why.waitingClaim",
    ]);
  });

  it("claimable, claimed and expired drops", () => {
    expect(keys(row({ status: "claim", bucket: "needs-you", note: { kind: "claim" } }))).toEqual([
      "drops.details.why.claim",
    ]);
    expect(keys(row({ status: "claimed", bucket: "claimed" }))).toEqual([
      "drops.details.why.claimed",
    ]);
    expect(keys(row({ status: "expired", bucket: "expired" }))).toEqual([
      "drops.details.why.expired",
    ]);
  });

  it("needs-link names the game", () => {
    const r = row(
      { status: "needs-link", bucket: "needs-you", note: { kind: "link", game: "Rust" } },
      { game: "Rust" },
    );
    expect(buildDropDetails(r, ctx()).why).toEqual([
      { key: "drops.details.why.needsLink", vars: { game: "Rust" } },
    ]);
  });

  it("blocked carries the raw blocking hint for translation", () => {
    const r = row({
      status: "blocked",
      bucket: "not-farmed",
      note: { kind: "blocked", reason: "subscription_required" },
    });
    expect(buildDropDetails(r, ctx()).why).toEqual([
      {
        key: "drops.details.why.blocked",
        vars: { reason: { kind: "reason", hint: "subscription_required" } },
      },
    ]);
  });

  it("not-farmed: not ranked names the game, ranked says not farmed right now", () => {
    const notFarmed = { status: "not-farmed" as const, bucket: "not-farmed" as const, watched: 0 };
    expect(buildDropDetails(row(notFarmed, { game: "Counter-Strike 2" }), ctx()).why).toEqual([
      { key: "drops.details.why.notRanked", vars: { game: "Counter-Strike 2" } },
    ]);
    expect(keys(row(notFarmed))).toEqual(["drops.details.why.notFarmed"]);
  });

  it("not-farmed with watched minutes appends the self-watching sentence", () => {
    const r = row({ status: "not-farmed", bucket: "not-farmed", watched: 45 }, { game: "CS2" });
    expect(keys(r)).toEqual(["drops.details.why.notRanked", "drops.details.why.watchedSelf"]);
  });

  it("not-farmed no-watch drops are not earned by watching", () => {
    const r = row({
      status: "not-farmed",
      bucket: "not-farmed",
      note: { kind: "no-watch" },
      watched: 0,
      required: 0,
    });
    expect(keys(r)).toEqual(["drops.details.why.noWatch"]);
  });

  it("not-farmed in a campaign that has not started appends the start date", () => {
    const later = { ...campaign, startsAt: iso(at(9, 0, 10)) };
    const r = row({ status: "not-farmed", bucket: "not-farmed", watched: 0 });
    expect(buildDropDetails(r, ctx({ campaigns: [later] })).why).toEqual([
      { key: "drops.details.why.notFarmed" },
      { key: "drops.details.why.startsLater", vars: { date: { kind: "date", at: at(9, 0, 10) } } },
    ]);
    // Falls back to the item's start without a campaign summary.
    const fromItem = row(
      { status: "not-farmed", bucket: "not-farmed", watched: 0 },
      { startsAt: iso(at(9, 0, 10)) },
    );
    expect(keys(fromItem, ctx({ campaigns: [] }))).toContain("drops.details.why.startsLater");
    // A started campaign appends nothing.
    expect(keys(r)).toEqual(["drops.details.why.notFarmed"]);
  });
});

describe("buildDropDetails: facts", () => {
  it("watched uses the row's minutes with a percent", () => {
    expect(buildDropDetails(row(), ctx()).facts.watched).toEqual({
      watched: 40,
      required: 60,
      percent: 67,
    });
    expect(
      buildDropDetails(row({ watched: 0, required: 0 }), ctx()).facts.watched.percent,
    ).toBeNull();
    expect(buildDropDetails(row({ watched: 80 }), ctx()).facts.watched.percent).toBe(100);
  });

  it("ready shows the clock and minutes left for farming rows", () => {
    const r = row({ ready: { clock: "14:34", dayOffset: 0 }, readyAt: at(14, 34) });
    expect(buildDropDetails(r, ctx()).facts.ready).toEqual({
      kind: "at",
      clock: { clock: "14:34", dayOffset: 0 },
      minutesLeft: 20,
    });
  });

  it("ready gives a reason otherwise", () => {
    const reason = (over: Partial<DropsRow>) => buildDropDetails(row(over), ctx()).facts.ready;
    expect(reason({ status: "queued", note: { kind: "waiting-claim" } })).toEqual({
      kind: "none",
      reason: "watched",
    });
    expect(reason({ status: "claim" })).toEqual({ kind: "none", reason: "claim" });
    expect(reason({ status: "needs-link" })).toEqual({ kind: "none", reason: "link" });
    expect(reason({ status: "blocked" })).toEqual({ kind: "none", reason: "blocked" });
    expect(reason({ status: "not-farmed" })).toEqual({ kind: "none", reason: "not-farmed" });
    expect(reason({ status: "claimed" })).toEqual({ kind: "none", reason: "claimed" });
    expect(reason({ status: "expired" })).toEqual({ kind: "none", reason: "expired" });
  });

  it("campaign has the summary's name and drop count, else the item's name", () => {
    expect(buildDropDetails(row(), ctx()).facts.campaign).toEqual({
      name: "Champions Tour",
      dropCount: 3,
    });
    expect(buildDropDetails(row(), ctx({ campaigns: [] })).facts.campaign).toEqual({
      name: "Champions Tour",
      dropCount: null,
    });
    expect(
      buildDropDetails(row({}, { campaignName: undefined, campaignId: undefined }), ctx()).facts
        .campaign,
    ).toBeNull();
  });

  it("campaign ends is an absolute time with 'in X', or ended", () => {
    expect(buildDropDetails(row(), ctx()).facts.ends).toEqual({
      at: at(18, 0, 9),
      endsIn: "2d",
    });
    const over = { ...campaign, endsAt: iso(at(10, 0)) };
    expect(buildDropDetails(row(), ctx({ campaigns: [over] })).facts.ends).toEqual({
      at: at(10, 0),
      endsIn: null,
    });
    expect(
      buildDropDetails(row({}, { endsAt: undefined }), ctx({ campaigns: [] })).facts.ends,
    ).toBeNull();
  });
});

describe("buildDropDetails: actions", () => {
  it("a ranked farming drop only links to the campaign", () => {
    expect(buildDropDetails(row(), ctx()).actions).toEqual([
      { kind: "campaign", url: "https://www.twitch.tv/drops/campaigns?dropID=camp-1" },
    ]);
  });

  it("needs-link links the campaign's account url, or falls back without one", () => {
    const r = row({ status: "needs-link", bucket: "needs-you" });
    expect(buildDropDetails(r, ctx()).actions[0]).toEqual({
      kind: "link",
      url: "https://link/riot",
    });
    expect(buildDropDetails(r, ctx({ campaigns: [] })).actions[0]).toEqual({ kind: "link" });
  });

  it("an unlinked account also offers the link on not-farmed drops, not on claimed ones", () => {
    const hint = { blockingReasonHints: ["account_not_linked"] };
    expect(actionKinds(row({ status: "not-farmed", bucket: "not-farmed" }, hint))).toEqual([
      "link",
      "campaign",
    ]);
    expect(actionKinds(row({ status: "claimed", bucket: "claimed" }, { linked: false }))).toEqual([
      "inventory",
      "campaign",
    ]);
  });

  it("an unranked game offers add to games unless it is expired", () => {
    const r = row({ status: "not-farmed", bucket: "not-farmed" }, { game: " Counter-Strike 2 " });
    expect(buildDropDetails(r, ctx()).actions).toEqual([
      { kind: "add-game", game: "Counter-Strike 2" },
      { kind: "campaign", url: campaignUrl("camp-1") },
    ]);
    expect(
      actionKinds(row({ status: "expired", bucket: "expired" }, { game: "Counter-Strike 2" })),
    ).toEqual(["campaign"]);
    expect(
      actionKinds(row({ status: "claimed", bucket: "expired" }, { game: "Counter-Strike 2" })),
    ).toEqual(["inventory", "campaign"]);
  });

  it("ranked games match by name, ignoring case", () => {
    expect(actionKinds(row({}, { game: "VALORANT" }))).toEqual(["campaign"]);
  });

  it("claimed drops open the Twitch inventory", () => {
    expect(buildDropDetails(row({ status: "claimed", bucket: "claimed" }), ctx()).actions).toEqual([
      { kind: "inventory", url: TWITCH_INVENTORY_URL },
      { kind: "campaign", url: campaignUrl("camp-1") },
    ]);
  });

  it("drops without a campaign id have no campaign link (possibly no actions)", () => {
    expect(actionKinds(row({}, { campaignId: undefined }))).toEqual([]);
  });

  it("orders primary actions first", () => {
    const r = row(
      { status: "needs-link", bucket: "needs-you" },
      { game: "Rust", campaignId: "camp-1" },
    );
    expect(actionKinds(r)).toEqual(["link", "add-game", "campaign"]);
  });
});

describe("formatMinutesLeft", () => {
  it("uses one compact span", () => {
    expect(
      [0, 20, 59, 60, 80, 120, 23 * 60 + 59, 24 * 60, 3 * 24 * 60 + 5].map(formatMinutesLeft),
    ).toEqual(["0m", "20m", "59m", "1h", "1h 20m", "2h", "23h 59m", "1d", "3d"]);
  });
});
