import { describe, expect, it } from "vitest";
import { parseReleaseNotes } from "./releaseHistory";

describe("parseReleaseNotes", () => {
  it("splits the CI body into user notes and full changelog", () => {
    const body = [
      "## What's new for users",
      "",
      "- Heatmap hover now matches the design.",
      "- Watch-time stats no longer over-count.",
      "",
      "## Full changelog",
      "",
      "fix(watch): stop inflating stats",
    ].join("\n");
    const { notes, fullChangelog } = parseReleaseNotes(body);
    expect(notes).toEqual([
      "Heatmap hover now matches the design.",
      "Watch-time stats no longer over-count.",
    ]);
    expect(fullChangelog).toContain("fix(watch): stop inflating stats");
  });

  it("returns empty for an empty body", () => {
    expect(parseReleaseNotes("")).toEqual({ notes: [], fullChangelog: "" });
    expect(parseReleaseNotes(null)).toEqual({ notes: [], fullChangelog: "" });
  });

  it("treats a marker-less bullet list as notes", () => {
    const { notes, fullChangelog } = parseReleaseNotes("- one\n- two");
    expect(notes).toEqual(["one", "two"]);
    expect(fullChangelog).toBe("");
  });

  it("falls back to full changelog when there is no recognizable structure", () => {
    const { notes, fullChangelog } = parseReleaseNotes("just some prose, no bullets");
    expect(notes).toEqual([]);
    expect(fullChangelog).toBe("just some prose, no bullets");
  });
});

import {
  filterReleasesByChannel,
  isReleaseHistoryResult,
  normalizeRelease,
  type ReleaseEntry,
} from "./releaseHistory";

const entry = (over: Partial<ReleaseEntry> = {}): ReleaseEntry => ({
  version: "3.0.5",
  tag: "v3.0.5",
  date: 1000,
  prerelease: false,
  notes: [],
  fullChangelog: "",
  url: "",
  ...over,
});

describe("normalizeRelease", () => {
  it("maps a GitHub release and strips the leading v", () => {
    const result = normalizeRelease({
      tag_name: "v3.0.5",
      published_at: "2026-05-30T00:00:00Z",
      prerelease: false,
      draft: false,
      body: "## What's new for users\n\n- Did a thing.",
      html_url: "https://example.test/v3.0.5",
    });
    expect(result).not.toBeNull();
    expect(result?.version).toBe("3.0.5");
    expect(result?.tag).toBe("v3.0.5");
    expect(result?.date).toBe(Date.parse("2026-05-30T00:00:00Z"));
    expect(result?.notes).toEqual(["Did a thing."]);
  });

  it("returns null for drafts and missing tags", () => {
    expect(normalizeRelease({ tag_name: "v1", draft: true })).toBeNull();
    expect(normalizeRelease({ published_at: "2026-05-30T00:00:00Z" })).toBeNull();
  });
});

describe("filterReleasesByChannel", () => {
  const stable = entry({ tag: "v3.0.5", prerelease: false, date: 2 });
  const pre = entry({ tag: "v3.1.0-rc.1", prerelease: true, date: 3 });

  it("hides prereleases on the stable channel", () => {
    expect(filterReleasesByChannel([stable, pre], false).map((r) => r.tag)).toEqual(["v3.0.5"]);
  });

  it("keeps prereleases on the preview channel, newest first", () => {
    expect(filterReleasesByChannel([stable, pre], true).map((r) => r.tag)).toEqual([
      "v3.1.0-rc.1",
      "v3.0.5",
    ]);
  });
});

describe("isReleaseHistoryResult", () => {
  it("accepts ready with a releases array and error results", () => {
    expect(isReleaseHistoryResult({ status: "ready", releases: [], stale: false })).toBe(true);
    expect(isReleaseHistoryResult({ status: "error", message: "x" })).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isReleaseHistoryResult(null)).toBe(false);
    expect(isReleaseHistoryResult({ status: "ready" })).toBe(false);
    expect(isReleaseHistoryResult({ status: "weird" })).toBe(false);
  });
});
