import { describe, expect, it } from "vitest";
import type { ChannelEntry } from "@renderer/shared/types";
import { buildChannelPickerRows } from "./channelPicker";

const ch = (id: string, displayName: string, viewers: number): ChannelEntry => ({
  id,
  login: displayName.toLowerCase(),
  displayName,
  title: "",
  viewers,
  game: "Valorant",
});

const channels = [
  ch("1", "LotusLane", 5020),
  ch("2", "AgentZero", 12800),
  ch("3", "ClutchOrKick", 3310),
  ch("4", "NightOwlAim", 9100),
];

describe("buildChannelPickerRows", () => {
  it("sorts by viewers and marks the watched channel", () => {
    const rows = buildChannelPickerRows({ channels, allowlist: null, watchingId: "4", query: "" });
    expect(rows.map((r) => r.channel.displayName)).toEqual([
      "AgentZero",
      "NightOwlAim",
      "LotusLane",
      "ClutchOrKick",
    ]);
    expect(rows.filter((r) => r.isCurrent).map((r) => r.channel.id)).toEqual(["4"]);
    expect(rows.every((r) => r.countsDrops)).toBe(true);
  });

  it("marks channels outside the drop allowlist as not counting", () => {
    const rows = buildChannelPickerRows({
      channels,
      allowlist: { ids: ["2"], logins: ["lotuslane"] },
      watchingId: null,
      query: "",
    });
    const counts = Object.fromEntries(rows.map((r) => [r.channel.id, r.countsDrops]));
    expect(counts).toEqual({ "1": true, "2": true, "3": false, "4": false });
  });

  it("filters by name or login, ignoring case and spaces", () => {
    const rows = buildChannelPickerRows({
      channels,
      allowlist: null,
      watchingId: null,
      query: "  owl ",
    });
    expect(rows.map((r) => r.channel.id)).toEqual(["4"]);
  });
});
