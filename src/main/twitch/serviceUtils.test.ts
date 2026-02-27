import { describe, expect, it } from "vitest";
import {
  buildCampaignSummaries,
  extractAllowedChannelFilters,
  mergePrimaryData,
  normalizeDropWatchState,
} from "./serviceUtils";

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

  it("keeps requiredMinutesWatched when secondary payload regresses to zero", () => {
    const primary = {
      timeBasedDrops: [
        {
          id: "drop-1",
          requiredMinutesWatched: 240,
          self: { currentMinutesWatched: 240, status: "CLAIMED" },
        },
      ],
    };
    const secondary = {
      timeBasedDrops: [
        {
          id: "drop-1",
          requiredMinutesWatched: 0,
          self: { currentMinutesWatched: 240, status: "CLAIMED" },
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

    expect(merged.timeBasedDrops[0].requiredMinutesWatched).toBe(240);
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

  it("prefers drop-level allow channels when available", () => {
    const campaign = {
      id: "camp-3",
      name: "Campaign 3",
      allow: {
        isEnabled: true,
        channels: [{ id: "111", login: "campaignonly" }],
      },
    };
    const drop = {
      id: "drop-1",
      name: "Drop",
      allow: {
        channels: [{ channel: { id: "222", login: "dropspecific" } }],
      },
    };

    const result = extractAllowedChannelFilters(campaign, drop);

    expect(result.ids).toEqual(["222"]);
    expect(result.logins).toEqual(["dropspecific"]);
  });

  it("supports direct allow channel shape without channels array", () => {
    const campaign = {
      id: "camp-4",
      name: "Campaign 4",
    };
    const drop = {
      id: "drop-2",
      name: "Drop 2",
      allow: {
        channel: { id: "333", login: "singlechannel" },
      },
    };

    const result = extractAllowedChannelFilters(campaign, drop);

    expect(result.ids).toEqual(["333"]);
    expect(result.logins).toEqual(["singlechannel"]);
  });

  it("ignores campaign allow channels when allow is explicitly disabled", () => {
    const result = extractAllowedChannelFilters({
      id: "camp-5",
      name: "Campaign 5",
      allow: {
        isEnabled: false,
        channels: [{ id: "999", login: "should_be_ignored" }],
      },
    });

    expect(result.ids).toEqual([]);
    expect(result.logins).toEqual([]);
  });

  it("treats drop-level disabled allow as unrestricted and does not fall back to campaign acl", () => {
    const campaign = {
      id: "camp-6",
      name: "Campaign 6",
      allow: {
        isEnabled: true,
        channels: [{ id: "111", login: "campaignonly" }],
      },
    };
    const drop = {
      id: "drop-6",
      name: "Drop 6",
      allow: {
        isEnabled: false,
        channels: [{ id: "222", login: "dropshouldbeignored" }],
      },
    };

    const result = extractAllowedChannelFilters(campaign, drop);

    expect(result.ids).toEqual([]);
    expect(result.logins).toEqual([]);
  });
});

describe("normalizeDropWatchState", () => {
  it("fills claimed drop minutes when claim signal arrives via claimed benefits", () => {
    const drop = {
      id: "drop-1",
      name: "Drop 1",
      requiredMinutesWatched: 240,
      self: {
        status: "LOCKED",
        currentMinutesWatched: 0,
      },
    };
    const normalized = normalizeDropWatchState({
      drop,
      rawStatus: "LOCKED",
      requiredMinutes: 240,
      watchedMinutes: 0,
      benefitClaimed: true,
    });

    expect(normalized.isClaimed).toBe(true);
    expect(normalized.status).toBe("claimed");
    expect(normalized.watchedMinutes).toBe(240);
    expect(normalized.earnedMinutes).toBe(240);
  });

  it("keeps in-progress signal when watched minutes are below requirement", () => {
    const drop = {
      id: "drop-2",
      name: "Drop 2",
      requiredMinutesWatched: 120,
      self: {
        status: "LOCKED",
        currentMinutesWatched: 12,
      },
    };
    const normalized = normalizeDropWatchState({
      drop,
      rawStatus: "LOCKED",
      requiredMinutes: 120,
      watchedMinutes: 12,
      benefitClaimed: false,
    });

    expect(normalized.isClaimed).toBe(false);
    expect(normalized.status).toBe("progress");
    expect(normalized.watchedMinutes).toBe(12);
    expect(normalized.earnedMinutes).toBe(12);
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

  it("applies claimed benefit ids when drop self status is stale locked", () => {
    const campaigns = buildCampaignSummaries(
      [
        {
          id: "camp-claimed",
          name: "Campaign",
          game: { displayName: "Game" },
          timeBasedDrops: [
            {
              id: "drop-claimed",
              name: "Claimed Drop",
              requiredMinutesWatched: 240,
              self: {
                status: "LOCKED",
                currentMinutesWatched: 0,
              },
              benefitEdges: [{ benefit: { id: "benefit-1" } }],
            },
          ],
        },
      ],
      new Set(["benefit-1"]),
    );

    expect(campaigns[0]?.drops?.[0]?.status).toBe("claimed");
    expect(campaigns[0]?.drops?.[0]?.earnedMinutes).toBe(240);
    expect(campaigns[0]?.drops?.[0]?.requiredMinutes).toBe(240);
  });

  it("treats zero-minute locked drops as non-unclaimed for campaign rollup", () => {
    const campaigns = buildCampaignSummaries([
      {
        id: "camp-zero",
        name: "Campaign",
        game: { displayName: "Game" },
        timeBasedDrops: [
          {
            id: "drop-claimed",
            name: "Claimed",
            requiredMinutesWatched: 240,
            self: {
              status: "CLAIMED",
              currentMinutesWatched: 240,
              isClaimed: true,
            },
          },
          {
            id: "drop-zero",
            name: "Zero",
            requiredMinutesWatched: 0,
            self: {
              status: "LOCKED",
              currentMinutesWatched: 0,
            },
          },
        ],
      },
    ]);

    expect(campaigns[0]?.hasUnclaimedDrops).toBe(false);
  });
});
