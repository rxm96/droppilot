import { describe, expect, it } from "vitest";
import { selectWarmupTarget, type CampaignSummary } from "./useCampaignWarmup";

const makeCampaign = (overrides: Partial<CampaignSummary> = {}): CampaignSummary => ({
  id: "c1",
  game: "Game A",
  startsAt: "2026-02-01T00:00:00Z",
  endsAt: "2026-03-01T00:00:00Z",
  status: "ACTIVE",
  isActive: undefined,
  hasUnclaimedDrops: true,
  ...overrides,
});

describe("selectWarmupTarget", () => {
  it("selects active campaign that matches priority", () => {
    const now = Date.parse("2026-02-14T00:00:00Z");
    const campaigns = [makeCampaign({ id: "c1", game: "Pokemon" })];
    const result = selectWarmupTarget({
      campaigns,
      priorityGames: ["Pokemon"],
      knownCampaignIds: new Set(),
      knownActiveGames: new Set(),
      attemptedCampaignIds: new Set(),
      now,
    });
    expect(result).toEqual({ game: "Pokemon", campaignId: "c1", reason: "ok" });
  });

  it("skips campaigns already known by id", () => {
    const now = Date.parse("2026-02-14T00:00:00Z");
    const campaigns = [makeCampaign({ id: "c1", game: "Pokemon" })];
    const result = selectWarmupTarget({
      campaigns,
      priorityGames: ["Pokemon"],
      knownCampaignIds: new Set(["c1"]),
      knownActiveGames: new Set(),
      attemptedCampaignIds: new Set(),
      now,
    });
    expect(result).toEqual({ game: "", reason: "campaigns-known" });
  });

  it("skips campaigns already known by game", () => {
    const now = Date.parse("2026-02-14T00:00:00Z");
    const campaigns = [makeCampaign({ id: "c1", game: "Pokemon" })];
    const result = selectWarmupTarget({
      campaigns,
      priorityGames: ["Pokemon"],
      knownCampaignIds: new Set(),
      knownActiveGames: new Set(["pokemon"]),
      attemptedCampaignIds: new Set(),
      now,
    });
    expect(result).toEqual({ game: "", reason: "campaigns-known" });
  });

  it("skips campaigns that are fully claimed", () => {
    const now = Date.parse("2026-02-14T00:00:00Z");
    const campaigns = [makeCampaign({ id: "c1", game: "Pokemon", hasUnclaimedDrops: false })];
    const result = selectWarmupTarget({
      campaigns,
      priorityGames: ["Pokemon"],
      knownCampaignIds: new Set(),
      knownActiveGames: new Set(),
      attemptedCampaignIds: new Set(),
      now,
    });
    expect(result).toEqual({ game: "", reason: "campaigns-claimed" });
  });

  it("returns no-active-campaigns when campaigns are in the future", () => {
    const now = Date.parse("2026-02-14T00:00:00Z");
    const campaigns = [
      makeCampaign({
        id: "c1",
        game: "Pokemon",
        startsAt: "2026-02-20T00:00:00Z",
      }),
    ];
    const result = selectWarmupTarget({
      campaigns,
      priorityGames: ["Pokemon"],
      knownCampaignIds: new Set(),
      knownActiveGames: new Set(),
      attemptedCampaignIds: new Set(),
      now,
    });
    expect(result).toEqual({ game: "", reason: "no-active-campaigns" });
  });

  it("returns no-priority-campaigns when no priority match exists", () => {
    const now = Date.parse("2026-02-14T00:00:00Z");
    const campaigns = [makeCampaign({ id: "c1", game: "Pokemon" })];
    const result = selectWarmupTarget({
      campaigns,
      priorityGames: ["Other Game"],
      knownCampaignIds: new Set(),
      knownActiveGames: new Set(),
      attemptedCampaignIds: new Set(),
      now,
    });
    expect(result).toEqual({ game: "", reason: "no-priority-campaigns" });
  });

  it("skips campaigns already attempted", () => {
    const now = Date.parse("2026-02-14T00:00:00Z");
    const campaigns = [makeCampaign({ id: "c1", game: "Pokemon" })];
    const result = selectWarmupTarget({
      campaigns,
      priorityGames: ["Pokemon"],
      knownCampaignIds: new Set(),
      knownActiveGames: new Set(),
      attemptedCampaignIds: new Set(["c1"]),
      now,
    });
    expect(result).toEqual({ game: "", reason: "campaigns-attempted" });
  });
});
