import { describe, expect, it } from "vitest";
import type { FarmPlan, FarmPlanDropRow } from "@renderer/shared/domain/farmPlan";
import type { InventoryItem } from "@renderer/shared/types";
import { buildPlanTable, formatPlanClock } from "./planTable";

const now = new Date(2026, 10, 6, 14, 14, 0).getTime();
const at = (h: number, m: number, day = 6) => new Date(2026, 10, day, h, m, 0).getTime();

const row = (over: Partial<FarmPlanDropRow>): FarmPlanDropRow => ({
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

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: "d",
  game: "Valorant",
  title: "Drop",
  requiredMinutes: 60,
  earnedMinutes: 0,
  status: "locked",
  ...over,
});

describe("formatPlanClock", () => {
  it("gives the clock and how many days ahead it is", () => {
    expect(formatPlanClock(at(14, 34), now)).toEqual({ clock: "14:34", dayOffset: 0 });
    expect(formatPlanClock(at(9, 5, 7), now)).toEqual({ clock: "09:05", dayOffset: 1 });
    expect(formatPlanClock(at(23, 59, 8), now)).toEqual({ clock: "23:59", dayOffset: 2 });
  });
});

describe("buildPlanTable", () => {
  const plan: FarmPlan = {
    rows: [
      row({
        dropId: "a",
        title: "Prime Vandal",
        earnedMinutes: 30,
        readyAt: at(14, 34),
        status: "watching",
      }),
      row({
        dropId: "b",
        title: "Player Card",
        requiredMinutes: 120,
        readyAt: at(16, 34),
        status: "next",
      }),
      { kind: "switch", game: "Apex Legends", at: at(16, 34) },
      row({ dropId: "c", game: "Apex Legends", title: "Legend Skin", readyAt: at(17, 4) }),
      row({
        dropId: "d",
        game: "Rust",
        title: "Door",
        readyAt: null,
        status: "blocked",
        blockedReason: "account_not_linked",
      }),
      row({
        dropId: "e",
        game: "Rust",
        title: "Hoodie",
        readyAt: null,
        status: "blocked",
        blockedReason: "campaign_not_started",
      }),
    ],
    doneAt: at(17, 4),
  };
  const items = [
    item({ id: "a" }),
    item({ id: "b" }),
    item({ id: "c", endsAt: new Date(at(8, 0, 7)).toISOString() }),
    item({ id: "d" }),
    item({ id: "e" }),
  ];
  const base = {
    items,
    gameOrder: ["Valorant", "apex legends"],
    activeDrop: { id: "a", earnedMinutes: 40.7 },
    now,
    limit: 10,
  };

  it("maps plan rows to table rows with live minutes for the watched drop", () => {
    const table = buildPlanTable(plan, base);
    expect(table.doneAt).toEqual({ clock: "17:04", dayOffset: 0 });
    expect(table.hiddenCount).toBe(0);
    const [first, second, sw] = table.rows;
    expect(first).toMatchObject({
      kind: "drop",
      title: "Prime Vandal",
      ready: { clock: "14:34", dayOffset: 0 },
      watched: 40,
      required: 60,
      status: "watching",
    });
    expect(second).toMatchObject({ status: "next", watched: 0, required: 120 });
    expect(sw).toMatchObject({ kind: "switch", game: "Apex Legends", ranked: true });
  });

  it("labels blocked rows, and account links as needs-link", () => {
    const rows = buildPlanTable(plan, base).rows.filter((r) => r.kind === "drop");
    expect(rows.slice(-2).map((r) => (r.kind === "drop" ? r.status : null))).toEqual([
      "needs-link",
      "blocked",
    ]);
    expect(rows[rows.length - 1]).toMatchObject({
      ready: null,
      blockedReason: "campaign_not_started",
    });
  });

  it("notes a campaign that ends within a day, or ends before the drop", () => {
    const rows = buildPlanTable(plan, base).rows;
    expect(rows.find((r) => r.kind === "drop" && r.title === "Legend Skin")).toMatchObject({
      note: { kind: "ends-soon", hours: 18 },
    });
    const late = buildPlanTable(
      { rows: [row({ dropId: "c", wontFinishInTime: true })], doneAt: null },
      base,
    ).rows[0];
    expect(late).toMatchObject({ note: { kind: "ends-first" } });
    expect(buildPlanTable(plan, base).rows[0]).toMatchObject({ note: null });
  });

  it("marks switch rows to games outside the user's list", () => {
    const table = buildPlanTable(plan, { ...base, gameOrder: ["Valorant"] });
    expect(table.rows[2]).toMatchObject({ kind: "switch", ranked: false });
  });

  it("caps the drop rows, counts the rest and never ends on a switch row", () => {
    const table = buildPlanTable(plan, { ...base, limit: 2 });
    expect(table.rows.map((r) => r.kind)).toEqual(["drop", "drop"]);
    expect(table.hiddenCount).toBe(3);
  });

  it("has no done time when nothing can be timed", () => {
    expect(buildPlanTable({ rows: [], doneAt: null }, base)).toEqual({
      rows: [],
      hiddenCount: 0,
      doneAt: null,
    });
  });
});
