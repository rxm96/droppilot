import { describe, expect, it } from "vitest";
import {
  buildCampaignDetailsQueries,
  buildCampaignSummaries,
  collectBlockingReasonHints,
  DROP_CAMPAIGN_DETAILS_HASH,
  extractAllowedChannelFilters,
  isUnmetSubscriptionDrop,
  mergeCampaignDetails,
  mergePrimaryData,
  needsCampaignDetails,
  normalizeDropWatchState,
  type CampaignNode,
  type DropCampaignDetailsResponse,
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

describe("needsCampaignDetails", () => {
  it("requests details only for dashboard campaigns without drops", () => {
    expect(needsCampaignDetails({ id: "c1", name: "C1", status: "ACTIVE" })).toBe(true);
    expect(needsCampaignDetails({ id: "c2", name: "C2", status: "UPCOMING" })).toBe(true);
    expect(needsCampaignDetails({ id: "c3", name: "C3", timeBasedDrops: [] })).toBe(false);
  });

  it("skips expired campaigns and nodes without an id", () => {
    expect(needsCampaignDetails({ id: "c1", name: "C1", status: "expired" })).toBe(false);
    expect(needsCampaignDetails({ id: "", name: "C1", status: "ACTIVE" })).toBe(false);
    expect(needsCampaignDetails(undefined)).toBe(false);
  });
});

describe("buildCampaignDetailsQueries", () => {
  it("identifies the user by numeric id, one query per campaign", () => {
    const queries = buildCampaignDetailsQueries(["c1", "c2"], "123456");
    expect(queries).toHaveLength(2);
    expect(queries[0]).toEqual({
      operationName: "DropCampaignDetails",
      extensions: { persistedQuery: { version: 1, sha256Hash: DROP_CAMPAIGN_DETAILS_HASH } },
      variables: { channelLogin: "123456", dropID: "c1" },
    });
    expect(queries[1].variables).toEqual({ channelLogin: "123456", dropID: "c2" });
  });
});

describe("mergeCampaignDetails", () => {
  const detailsFor = (node: CampaignNode): DropCampaignDetailsResponse => ({
    data: { user: { dropCampaign: node } },
  });

  it("merges drops into known campaigns and counts them", () => {
    const campaigns = new Map<string, CampaignNode>([
      ["c1", { id: "c1", name: "C1", status: "ACTIVE", game: { displayName: "Game" } }],
    ]);
    const merged = mergeCampaignDetails(campaigns, [
      detailsFor({
        id: "c1",
        name: "C1",
        timeBasedDrops: [{ id: "d1", name: "Drop", requiredMinutesWatched: 60 }],
      }),
    ]);
    expect(merged).toBe(1);
    const campaign = campaigns.get("c1");
    expect(campaign?.status).toBe("ACTIVE");
    expect(campaign?.game?.displayName).toBe("Game");
    expect(campaign?.timeBasedDrops?.map((drop) => drop.id)).toEqual(["d1"]);
  });

  it("ignores empty (user: null) responses and unknown campaigns", () => {
    const campaigns = new Map<string, CampaignNode>([["c1", { id: "c1", name: "C1" }]]);
    const merged = mergeCampaignDetails(campaigns, [
      { data: { user: null as unknown as undefined } },
      detailsFor({ id: "other", name: "Other", timeBasedDrops: [] }),
    ]);
    expect(merged).toBe(0);
    expect(campaigns.get("c1")?.timeBasedDrops).toBeUndefined();
    expect(campaigns.has("other")).toBe(false);
  });

  it("accepts a single, non-batched response", () => {
    const campaigns = new Map<string, CampaignNode>([["c1", { id: "c1", name: "C1" }]]);
    expect(mergeCampaignDetails(campaigns, detailsFor({ id: "c1", name: "C1" }))).toBe(1);
    expect(mergeCampaignDetails(campaigns, undefined)).toBe(0);
  });
});

describe("isUnmetSubscriptionDrop", () => {
  it("flags sub-based drops until the sub requirement is met", () => {
    expect(
      isUnmetSubscriptionDrop({
        id: "d1",
        name: "Subs",
        requiredMinutesWatched: 0,
        requiredSubs: 2,
      }),
    ).toBe(true);
    expect(
      isUnmetSubscriptionDrop({
        id: "d1",
        name: "Subs",
        requiredMinutesWatched: 0,
        requiredSubs: 2,
        self: { currentSubs: 2 },
      }),
    ).toBe(false);
  });

  it("ignores watch-time drops", () => {
    expect(isUnmetSubscriptionDrop({ id: "d1", name: "Watch", requiredMinutesWatched: 60 })).toBe(
      false,
    );
    expect(
      isUnmetSubscriptionDrop({
        id: "d1",
        name: "Watch",
        requiredMinutesWatched: 60,
        requiredSubs: 0,
      }),
    ).toBe(false);
  });
});

describe("collectBlockingReasonHints", () => {
  const base = {
    linked: true,
    campaignNotStarted: false,
    campaignExpired: false,
    missingPrerequisiteDropIds: [],
    progressDone: false,
    withinClaimWindow: true,
    isClaimed: false,
  };

  it("adds subscription_required for unmet sub drops", () => {
    expect(collectBlockingReasonHints({ ...base, subscriptionRequired: true })).toEqual([
      "subscription_required",
    ]);
    expect(collectBlockingReasonHints(base)).toEqual([]);
  });

  it("reports nothing for claimed drops", () => {
    expect(
      collectBlockingReasonHints({ ...base, subscriptionRequired: true, isClaimed: true }),
    ).toEqual([]);
  });
});
