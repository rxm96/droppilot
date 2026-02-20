import { describe, expect, it } from "vitest";
import { buildCampaignSummaries, extractAllowedChannelFilters, mergePrimaryData } from "./serviceUtils";

describe("mergePrimaryData", () => {
  it("keeps inventory watch progress when secondary drop payload reports zero", () => {
    const primary = {
      timeBasedDrops: [
        {
          id: "drop-1",
          self: { currentMinutesWatched: 17, status: "IN_PROGRESS" },
        },
      ],
    };
    const secondary = {
      timeBasedDrops: [
        {
          id: "drop-1",
          requiredMinutesWatched: 60,
          self: { currentMinutesWatched: 0, status: "LOCKED" },
        },
      ],
    };

    const merged = mergePrimaryData(primary, secondary) as {
      timeBasedDrops: Array<{
        id: string;
        requiredMinutesWatched?: number;
        self?: { currentMinutesWatched?: number; status?: string };
      }>;
    };
    const drop = merged.timeBasedDrops[0];

    expect(drop.id).toBe("drop-1");
    expect(drop.requiredMinutesWatched).toBe(60);
    expect(drop.self?.currentMinutesWatched).toBe(17);
    expect(drop.self?.status).toBe("LOCKED");
  });

  it("keeps primary drops that are missing from secondary arrays", () => {
    const primary = {
      timeBasedDrops: [
        { id: "drop-1", self: { currentMinutesWatched: 3 } },
        { id: "drop-2", self: { currentMinutesWatched: 9 } },
      ],
    };
    const secondary = {
      timeBasedDrops: [{ id: "drop-1", self: { currentMinutesWatched: 0 } }],
    };

    const merged = mergePrimaryData(primary, secondary) as {
      timeBasedDrops: Array<{ id: string; self?: { currentMinutesWatched?: number } }>;
    };
    const ids = merged.timeBasedDrops.map((drop) => drop.id);

    expect(ids).toEqual(["drop-1", "drop-2"]);
    expect(merged.timeBasedDrops[0].self?.currentMinutesWatched).toBe(3);
    expect(merged.timeBasedDrops[1].self?.currentMinutesWatched).toBe(9);
  });

  it("still prefers secondary for non-id arrays", () => {
    const merged = mergePrimaryData(
      { preconditionDrops: ["a", "b"] },
      { preconditionDrops: ["c"] },
    ) as { preconditionDrops: string[] };

    expect(merged.preconditionDrops).toEqual(["c"]);
  });
});

describe("extractAllowedChannelFilters", () => {
  it("extracts ids and logins from campaign allow channels", () => {
    const result = extractAllowedChannelFilters({
      id: "camp-1",
      name: "Campaign",
      allow: {
        isEnabled: true,
        channels: [
          { id: "123", login: "FooBar" },
          { broadcaster: { id: 456, login: "Baz" } },
          { channel: { id: "123", displayName: "StreamerName" } },
        ],
      },
    });

    expect(result.ids).toEqual(["123", "456"]);
    expect(result.logins).toEqual(["foobar", "baz", "streamername"]);
  });

  it("returns empty filters when allow channels are missing", () => {
    const result = extractAllowedChannelFilters({
      id: "camp-2",
      name: "Campaign 2",
    });

    expect(result.ids).toEqual([]);
    expect(result.logins).toEqual([]);
  });
});

describe("buildCampaignSummaries", () => {
  it("keeps absolute account link urls", () => {
    const campaigns = buildCampaignSummaries([
      {
        id: "camp-1",
        name: "Campaign",
        game: { displayName: "Game" },
        accountLinkURL: "https://www.twitch.tv/settings/connections",
      },
    ]);

    expect(campaigns[0]?.accountLinkUrl).toBe("https://www.twitch.tv/settings/connections");
  });

  it("normalizes relative and lower-camel account link urls", () => {
    const campaigns = buildCampaignSummaries([
      {
        id: "camp-2",
        name: "Campaign",
        game: { displayName: "Game" },
        accountLinkUrl: "/settings/connections",
      },
    ]);

    expect(campaigns[0]?.accountLinkUrl).toBe("https://www.twitch.tv/settings/connections");
  });
});
