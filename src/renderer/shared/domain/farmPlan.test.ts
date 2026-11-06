import { describe, expect, it } from "vitest";
import type { InventoryItem } from "@renderer/shared/types";
import {
  buildFarmPlan,
  type FarmPlanDropRow,
  type FarmPlanInput,
  type FarmPlanRow,
} from "./farmPlan";

const MIN = 60_000;
const now = new Date(2026, 10, 6, 14, 14).getTime();

function item(partial: Partial<InventoryItem> & { id: string; game: string }): InventoryItem {
  return {
    title: partial.id,
    status: "progress",
    requiredMinutes: 60,
    earnedMinutes: 0,
    linked: true,
    ...partial,
  };
}

function withCategories(items: InventoryItem[]): FarmPlanInput["withCategories"] {
  return items.map((it) => ({
    item: it,
    category:
      it.status === "progress" ? "in-progress" : it.status === "locked" ? "upcoming" : "finished",
  }));
}

function plan(items: InventoryItem[], overrides: Partial<FarmPlanInput> = {}) {
  return buildFarmPlan({
    withCategories: withCategories(items),
    gameOrder: [],
    fallbackOrder: [],
    obeyPriority: false,
    activeTargetGame: "Valorant",
    activeDrop: null,
    allowUpcoming: false,
    now,
    ...overrides,
  });
}

const drops = (rows: FarmPlanRow[]) => rows.filter((r): r is FarmPlanDropRow => r.kind === "drop");
const drop = (rows: FarmPlanRow[], id: string) => drops(rows).find((r) => r.dropId === id);

describe("buildFarmPlan", () => {
  it("active drop uses its live eta and is 'watching'", () => {
    const result = plan([item({ id: "pv", game: "Valorant", earnedMinutes: 40 })], {
      activeDrop: { id: "pv", eta: now + 20 * MIN },
    });
    expect(drop(result.rows, "pv")).toMatchObject({ readyAt: now + 20 * MIN, status: "watching" });
  });

  it("drops of one game progress at once", () => {
    const result = plan([
      item({ id: "pv", game: "Valorant", earnedMinutes: 40 }),
      item({ id: "pc", game: "Valorant", status: "locked", requiredMinutes: 120 }),
    ]);
    expect(drop(result.rows, "pv")).toMatchObject({ readyAt: now + 20 * MIN, status: "next" });
    expect(drop(result.rows, "pc")).toMatchObject({ readyAt: now + 120 * MIN, status: "queued" });
  });

  it("next game starts when the previous one is done and gets a switch row", () => {
    const result = plan(
      [
        item({ id: "pv", game: "Valorant", earnedMinutes: 40 }),
        item({ id: "pc", game: "Valorant", status: "locked", requiredMinutes: 120 }),
        item({ id: "ls", game: "Apex Legends", earnedMinutes: 90, requiredMinutes: 120 }),
      ],
      { gameOrder: ["Valorant", "Apex Legends"] },
    );
    const switchIndex = result.rows.findIndex((r) => r.kind === "switch");
    expect(result.rows[switchIndex]).toEqual({
      kind: "switch",
      game: "Apex Legends",
      at: now + 120 * MIN,
    });
    expect(result.rows[switchIndex + 1]).toMatchObject({ dropId: "ls", readyAt: now + 150 * MIN });
    expect(result.doneAt).toBe(now + 150 * MIN);
  });

  it("chained drop starts after its prerequisite", () => {
    const result = plan([
      item({ id: "a", game: "Valorant", status: "locked", requiredMinutes: 60 }),
      item({
        id: "b",
        game: "Valorant",
        status: "locked",
        requiredMinutes: 30,
        // Main marks every drop with a hard hint as blocked (service.ts), so
        // real chained drops arrive with blocked: true.
        blocked: true,
        blockingReasonHints: ["missing_prerequisite_drops:a"],
      }),
    ]);
    expect(drop(result.rows, "b")).toMatchObject({ readyAt: now + 90 * MIN, status: "queued" });
  });

  it("finished or claimable drops are not listed as blocked", () => {
    const result = plan([
      item({ id: "pv", game: "Valorant", earnedMinutes: 40 }),
      item({ id: "ready", game: "Valorant", earnedMinutes: 60, isClaimable: true }),
      item({ id: "full", game: "Valorant", earnedMinutes: 60 }),
    ]);
    expect(drops(result.rows).map((r) => r.dropId)).toEqual(["pv"]);
  });

  it("other drops of the active game include the live progress since the last poll", () => {
    // Snapshot says pv has 20 min left, but its live eta is 10 min away:
    // 10 min were watched since the poll, and they count for pc too.
    const result = plan(
      [
        item({ id: "pv", game: "Valorant", earnedMinutes: 40 }),
        item({ id: "pc", game: "Valorant", earnedMinutes: 0, requiredMinutes: 120 }),
      ],
      { activeDrop: { id: "pv", eta: now + 10 * MIN } },
    );
    expect(drop(result.rows, "pc")?.readyAt).toBe(now + 110 * MIN);
  });

  it("a campaign that ends early ends its game early", () => {
    const result = plan(
      [
        item({ id: "x", game: "Valorant", endsAt: new Date(now + 30 * MIN).toISOString() }),
        item({ id: "y", game: "Apex Legends", requiredMinutes: 10 }),
      ],
      { gameOrder: ["Valorant", "Apex Legends"] },
    );
    expect(result.rows.find((r) => r.kind === "switch")).toMatchObject({ at: now + 30 * MIN });
    expect(drop(result.rows, "y")?.readyAt).toBe(now + 40 * MIN);
  });

  it("blocked rows appear only for games the user ranked", () => {
    const result = plan(
      [
        item({ id: "pv", game: "Valorant", earnedMinutes: 40 }),
        item({
          id: "icon",
          game: "Overwatch 2",
          status: "locked",
          linked: false,
          blockingReasonHints: ["account_not_linked"],
        }),
      ],
      { gameOrder: ["Valorant"], fallbackOrder: ["Overwatch 2"], obeyPriority: false },
    );
    expect(drop(result.rows, "icon")).toBeUndefined();
  });

  it("flags drops that cannot finish before endsAt", () => {
    const result = plan([
      item({ id: "x", game: "Valorant", endsAt: new Date(now + 30 * MIN).toISOString() }),
    ]);
    expect(drop(result.rows, "x")?.wontFinishInTime).toBe(true);
  });

  it("blocked-only game adds rows but no time and no switch", () => {
    const result = plan(
      [
        item({ id: "pv", game: "Valorant", earnedMinutes: 40 }),
        item({
          id: "door",
          game: "Rust",
          status: "locked",
          linked: false,
          requiredMinutes: 180,
          blockingReasonHints: ["account_not_linked"],
        }),
      ],
      { gameOrder: ["Valorant", "Rust"] },
    );
    expect(drop(result.rows, "door")).toMatchObject({
      status: "blocked",
      blockedReason: "account_not_linked",
      readyAt: null,
    });
    expect(result.rows.some((r) => r.kind === "switch" && r.game === "Rust")).toBe(false);
    expect(result.doneAt).toBe(now + 20 * MIN);
  });

  it("strict mode ignores fallback games", () => {
    const items = [
      item({ id: "pv", game: "Valorant", earnedMinutes: 40 }),
      item({ id: "st", game: "Counter-Strike 2", earnedMinutes: 45, requiredMinutes: 90 }),
    ];
    const strict = plan(items, {
      gameOrder: ["Valorant"],
      fallbackOrder: ["Counter-Strike 2"],
      obeyPriority: true,
    });
    expect(drop(strict.rows, "st")).toBeUndefined();
    const loose = plan(items, {
      gameOrder: ["Valorant"],
      fallbackOrder: ["Counter-Strike 2"],
      obeyPriority: false,
    });
    const ids = drops(loose.rows).map((r) => r.dropId);
    expect(ids).toEqual(["pv", "st"]);
  });

  it("claimed and expired drops are left out", () => {
    const result = plan([
      item({ id: "done", game: "Valorant", status: "claimed", earnedMinutes: 60 }),
      item({
        id: "old",
        game: "Valorant",
        status: "locked",
        blockingReasonHints: ["campaign_expired"],
      }),
      item({ id: "pv", game: "Valorant", earnedMinutes: 40 }),
    ]);
    expect(drops(result.rows).map((r) => r.dropId)).toEqual(["pv"]);
  });

  it("game names match case-insensitively", () => {
    const result = plan([item({ id: "pv", game: "Valorant", earnedMinutes: 40 })], {
      activeTargetGame: "valorant",
      gameOrder: ["VALORANT"],
    });
    expect(drops(result.rows)).toHaveLength(1);
    expect(result.rows.some((r) => r.kind === "switch")).toBe(false);
  });
});
