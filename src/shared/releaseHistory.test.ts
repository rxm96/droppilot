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
