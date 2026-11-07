import { describe, expect, it } from "vitest";
import { normalizeReleaseNotes, parseUpdateNoteSections } from "./updateNotes";

// Trimmed copy of the real v4.1.0 GitHub release body (CI output of
// scripts/changelog/ci.mjs body): Keep-a-Changelog sub-headings under the
// user heading, then GitHub's generated PR list.
const V410_BODY = [
  "## What's new for users",
  "",
  "### Added",
  "",
  '- A "plan · today" table on the overview shows when each drop will be ready.',
  "- An autopilot button in the top bar shows whether DropPilot is running or paused, on every screen. Click it to pause or resume.",
  "",
  "### Changed",
  "",
  "- The overview shows when a drop will be ready as a clock time with the minutes left.",
  "",
  "### Removed",
  "",
  '- The always-visible "claim now" button. Claiming now happens in the "needs you" panel when there is something to claim.',
  "",
  "### Fixed",
  "",
  "- Finished drops can still be claimed during the 24 hours after their campaign ends.",
  '- "Check for updates" no longer offers an older or skipped version.',
  "",
  "## Full changelog",
  "",
  "## What's Changed",
  "* feat(release): repo-maintained CHANGELOG.md instead of AI release notes by @rxm96 in https://github.com/rxm96/droppilot/pull/77",
  "* fix: claim, account, persistence and priority bugs from logic audit by @rxm96 in https://github.com/rxm96/droppilot/pull/78",
  "",
  "",
  "**Full Changelog**: https://github.com/rxm96/droppilot/compare/v4.0.0...v4.1.0",
].join("\r\n");

describe("normalizeReleaseNotes", () => {
  it("keeps the sub-headings of the user section of the real v4.1.0 body", () => {
    const notes = normalizeReleaseNotes(V410_BODY);
    expect(notes).toBeDefined();
    expect(notes).toMatch(/^### Added\n/);
    expect(notes).toContain("### Changed");
    expect(notes).toContain("### Removed");
    expect(notes).toContain("### Fixed");
    expect(notes).toContain("- Finished drops can still be claimed");
    expect(notes).toContain('- "Check for updates" no longer offers an older or skipped version.');
    expect(notes).not.toContain("Full changelog");
    expect(notes).not.toContain("What's Changed");
    expect(notes).not.toContain("pull/77");
    expect(notes).not.toContain("\r");
  });

  it("handles GitHub's rendered HTML body", () => {
    const html = [
      "<h2>What&#39;s new for users</h2>",
      "<h3>Added</h3>",
      "<ul>",
      "<li>Drop details open right in the drops list.</li>",
      "<li>A cleaner debug view &amp; a one-click bug report.</li>",
      "</ul>",
      '<h3 dir="auto">Fixed</h3>',
      "<ul>",
      "<li>Updates no longer block the app while they download.</li>",
      "</ul>",
      "<h2>Full changelog</h2>",
      "<h2>What's Changed</h2>",
      "<ul>",
      "<li>feat: something by @rxm96</li>",
      "</ul>",
    ].join("\n");
    const notes = normalizeReleaseNotes(html);
    expect(notes).toMatch(/^### Added\n/);
    expect(notes).not.toMatch(/<|What's Changed|feat: something/);
    expect(parseUpdateNoteSections(notes)).toEqual([
      {
        heading: "added",
        items: [
          "Drop details open right in the drops list.",
          "A cleaner debug view & a one-click bug report.",
        ],
      },
      { heading: "fixed", items: ["Updates no longer block the app while they download."] },
    ]);
  });

  it("keeps minified HTML list items on their own lines", () => {
    const notes = normalizeReleaseNotes(
      "<h2>What’s new for users</h2><h3>Fixed</h3><ul><li>one</li><li>two</li></ul><h2>Full changelog</h2>",
    );
    expect(notes).toBe("### Fixed\n- one\n- two");
  });

  it("ends the user section at a heading of the same level", () => {
    const notes = normalizeReleaseNotes(
      ["## What's new for users", "- one", "### Fixed", "- two", "## Internals", "- three"].join(
        "\n",
      ),
    );
    expect(notes).toBe(["- one", "### Fixed", "- two"].join("\n"));
  });

  it("falls back to everything before the changelog without a user heading", () => {
    const notes = normalizeReleaseNotes(
      ["- Faster startup.", "- Fewer reconnects.", "", "## What's Changed", "* chore: x"].join(
        "\n",
      ),
    );
    expect(notes).toBe("- Faster startup.\n- Fewer reconnects.");
  });

  it("joins electron-updater's array form and drops empty input", () => {
    expect(
      normalizeReleaseNotes([{ version: "4.1.0", note: "- a" }, { note: "" }, { note: "- b" }]),
    ).toBe("- a\n\n- b");
    expect(normalizeReleaseNotes(undefined)).toBeUndefined();
    expect(normalizeReleaseNotes("   ")).toBeUndefined();
    expect(
      normalizeReleaseNotes("## What's new for users\n\n## Full changelog\n* x"),
    ).toBeUndefined();
  });
});

describe("parseUpdateNoteSections", () => {
  it("groups the normalized v4.1.0 notes by heading", () => {
    const sections = parseUpdateNoteSections(normalizeReleaseNotes(V410_BODY));
    expect(sections.map((s) => s.heading)).toEqual(["added", "changed", "removed", "fixed"]);
    expect(sections[0].items).toHaveLength(2);
    expect(sections[0].items[0]).toBe(
      'A "plan · today" table on the overview shows when each drop will be ready.',
    );
    expect(sections[3].items).toEqual([
      "Finished drops can still be claimed during the 24 hours after their campaign ends.",
      '"Check for updates" no longer offers an older or skipped version.',
    ]);
  });

  it("treats a bare line as a heading and drops empty sections", () => {
    expect(
      parseUpdateNoteSections(["Added", "- one", "### Changed", "Fixed:", "- two"].join("\n")),
    ).toEqual([
      { heading: "added", items: ["one"] },
      { heading: "fixed", items: ["two"] },
    ]);
  });

  it("puts bullets before any heading into an unlabelled section", () => {
    expect(parseUpdateNoteSections("- one\n- two\n\n### Fixed\n- three")).toEqual([
      { heading: null, items: ["one", "two"] },
      { heading: "fixed", items: ["three"] },
    ]);
  });

  it("keeps prose that has no bullets under it", () => {
    expect(parseUpdateNoteSections("Bug fixes and improvements.\nThanks for testing.")).toEqual([
      { heading: null, items: ["Bug fixes and improvements.", "Thanks for testing."] },
    ]);
  });

  it("returns nothing for empty notes", () => {
    expect(parseUpdateNoteSections(undefined)).toEqual([]);
    expect(parseUpdateNoteSections("\n  \n")).toEqual([]);
  });
});
