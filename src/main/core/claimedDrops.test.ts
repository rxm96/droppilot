import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  clearRecentClaimedDrops,
  CLAIM_WINDOW_AFTER_CAMPAIGN_END_MS,
  loadRecentClaimedDropIds,
  markRecentClaimedDrop,
  pruneClaimedDropRecords,
  RECENT_CLAIM_TTL_MS,
  resolveRecentClaimExpiry,
} from "./claimedDrops";

const tempDirs: string[] = [];

const makeTempFile = async () => {
  const dir = await mkdtemp(join(tmpdir(), "droppilot-claimed-drops-"));
  tempDirs.push(dir);
  return join(dir, "recentClaimedDrops.json");
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("pruneClaimedDropRecords", () => {
  it("keeps only non-expired valid entries", () => {
    const now = 10_000;
    expect(
      pruneClaimedDropRecords(
        {
          "keep-me": { claimedAt: 1_000, expiresAt: now + 1 },
          "": { claimedAt: 1_000, expiresAt: now + 1 },
          expired: { claimedAt: 1_000, expiresAt: now - 1 },
          invalid: { claimedAt: Number.NaN, expiresAt: now + 1 },
        },
        now,
      ),
    ).toEqual({
      "keep-me": { claimedAt: 1_000, expiresAt: now + 1 },
    });
  });
});

describe("recent claimed drop persistence", () => {
  it("prefers campaign end plus claim window when endsAt is available", () => {
    expect(
      resolveRecentClaimExpiry({
        claimedAt: Date.parse("2026-03-17T12:00:00Z"),
        endsAt: "2026-03-18T00:00:00Z",
      }),
    ).toBe(Date.parse("2026-03-18T00:00:00Z") + CLAIM_WINDOW_AFTER_CAMPAIGN_END_MS);
  });

  it("falls back to ttl when campaign end is missing or already behind us", () => {
    expect(
      resolveRecentClaimExpiry({
        claimedAt: 12_345,
      }),
    ).toBe(12_345 + RECENT_CLAIM_TTL_MS);
    expect(
      resolveRecentClaimExpiry({
        claimedAt: Date.parse("2026-03-19T12:00:00Z"),
        endsAt: "2026-03-18T00:00:00Z",
      }),
    ).toBe(Date.parse("2026-03-19T12:00:00Z") + RECENT_CLAIM_TTL_MS);
  });

  it("persists marked claim keys and prunes expired ones on load", async () => {
    const file = await makeTempFile();
    await markRecentClaimedDrop("user-1#camp-1#drop-1", {
      claimedAt: 5_000,
      expiresAt: 8_000,
      file,
    });
    await markRecentClaimedDrop("inst-1", {
      claimedAt: 5_000,
      expiresAt: 20_000,
      file,
    });

    const ids = await loadRecentClaimedDropIds({ now: 10_000, file });
    expect(ids).toEqual(new Set(["inst-1"]));

    const persisted = JSON.parse(await readFile(file, "utf-8")) as Record<
      string,
      { claimedAt: number; expiresAt: number }
    >;
    expect(Object.keys(persisted)).toEqual(["inst-1"]);
  });

  it("uses campaign end plus claim window when available and no explicit expiry is provided", async () => {
    const file = await makeTempFile();
    await markRecentClaimedDrop("user-1#camp-1#drop-1", {
      claimedAt: 12_345,
      endsAt: "2026-03-20T00:00:00Z",
      file,
    });

    const persisted = JSON.parse(await readFile(file, "utf-8")) as Record<
      string,
      { claimedAt: number; expiresAt: number }
    >;
    expect(persisted["user-1#camp-1#drop-1"]).toEqual({
      claimedAt: 12_345,
      expiresAt: Date.parse("2026-03-20T00:00:00Z") + CLAIM_WINDOW_AFTER_CAMPAIGN_END_MS,
    });
  });

  it("clears the persistence file", async () => {
    const file = await makeTempFile();
    await markRecentClaimedDrop("user-1#camp-1#drop-1", { file });
    await clearRecentClaimedDrops({ file });
    const ids = await loadRecentClaimedDropIds({ file });
    expect(ids.size).toBe(0);
  });
});
