import { describe, expect, it } from "vitest";
import { parseReleaseNotes } from "../../src/shared/releaseHistory.ts";
import {
  TEST_BUILD_NOTE,
  assertReleasable,
  isPrerelease,
  notesFor,
  notesRequired,
  releaseBody,
  sectionBody,
  unwrapBullets,
  withRelease,
} from "./rules.mjs";

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Fixed

- Unreleased fix

## [14.0.0] - 2026-12-01

- Fourteen

## [4.0.0-rc.1] - 2026-11-05

- Candidate

## [4.0.0] - 2026-11-06

### Fixed

- Drop progress counts again.
`;

const EMPTY_UNRELEASED = `# Changelog

## [Unreleased]

## [4.0.0] - 2026-11-06

### Fixed

- Drop progress counts again.
`;

describe("isPrerelease / notesRequired", () => {
  it("treats versions with a dash as prereleases", () => {
    expect(isPrerelease("4.0.0")).toBe(false);
    expect(isPrerelease("4.0.1-rc.0")).toBe(true);
    expect(isPrerelease("4.0.1-test.2")).toBe(true);
  });

  it("requires notes for stable and rc, not for test builds", () => {
    expect(notesRequired("4.0.1")).toBe(true);
    expect(notesRequired("4.0.1-rc.0")).toBe(true);
    expect(notesRequired("4.0.1-test.0")).toBe(false);
  });
});

describe("sectionBody", () => {
  it("returns the Unreleased body", () => {
    expect(sectionBody(CHANGELOG, "Unreleased")).toBe("### Fixed\n\n- Unreleased fix");
  });

  it("matches a version heading with a date exactly", () => {
    expect(sectionBody(CHANGELOG, "4.0.0")).toBe("### Fixed\n\n- Drop progress counts again.");
    expect(sectionBody(CHANGELOG, "4.0.0-rc.1")).toBe("- Candidate");
    expect(sectionBody(CHANGELOG, "14.0.0")).toBe("- Fourteen");
  });

  it("reads the last section up to the end of the file", () => {
    expect(sectionBody("## [Unreleased]\n\n- last\n", "Unreleased")).toBe("- last");
  });

  it("handles CRLF line endings", () => {
    expect(sectionBody(CHANGELOG.replace(/\n/g, "\r\n"), "4.0.0")).toBe(
      "### Fixed\n\n- Drop progress counts again.",
    );
  });

  it("returns null for a missing heading", () => {
    expect(sectionBody(CHANGELOG, "3.0.0")).toBeNull();
  });
});

describe("notesFor", () => {
  it("uses the version section for stable versions", () => {
    expect(notesFor(CHANGELOG, "4.0.0")).toBe("### Fixed\n\n- Drop progress counts again.");
  });

  it("uses Unreleased for prereleases", () => {
    expect(notesFor(CHANGELOG, "4.0.1-rc.0")).toBe("### Fixed\n\n- Unreleased fix");
    expect(notesFor(CHANGELOG, "4.0.1-test.0")).toBe("### Fixed\n\n- Unreleased fix");
  });

  it("returns an empty string for a missing section", () => {
    expect(notesFor(CHANGELOG, "9.9.9")).toBe("");
  });
});

describe("assertReleasable", () => {
  it("throws for a stable version without a section", () => {
    expect(() => assertReleasable(CHANGELOG, "9.9.9")).toThrow(
      "CHANGELOG.md has no notes for 9.9.9: add lines under ## [9.9.9].",
    );
  });

  it("throws for an rc with an empty Unreleased", () => {
    expect(() => assertReleasable(EMPTY_UNRELEASED, "4.0.1-rc.0")).toThrow(
      "CHANGELOG.md has no notes for 4.0.1-rc.0: add lines under ## [Unreleased].",
    );
  });

  it("allows a test build with an empty Unreleased", () => {
    expect(() => assertReleasable(EMPTY_UNRELEASED, "4.0.1-test.0")).not.toThrow();
  });

  it("passes a stable version with notes", () => {
    expect(() => assertReleasable(CHANGELOG, "4.0.0")).not.toThrow();
  });
});

describe("withRelease", () => {
  it("moves Unreleased under the new version and keeps older sections", () => {
    const next = withRelease(CHANGELOG, "14.0.1", "2026-12-02");
    expect(next).toContain(
      "## [Unreleased]\n\n## [14.0.1] - 2026-12-02\n\n### Fixed\n\n- Unreleased fix\n\n## [14.0.0] - 2026-12-01",
    );
    expect(sectionBody(next, "Unreleased")).toBe("");
    expect(sectionBody(next, "4.0.0")).toBe("### Fixed\n\n- Drop progress counts again.");
  });

  it("throws when Unreleased is empty", () => {
    expect(() => withRelease(EMPTY_UNRELEASED, "4.0.1", "2026-11-07")).toThrow(/nothing under/i);
  });

  it("throws when the version already exists", () => {
    expect(() => withRelease(CHANGELOG, "4.0.0", "2026-11-07")).toThrow(/already has 4\.0\.0/);
  });

  it("throws without an Unreleased heading", () => {
    expect(() => withRelease("# Changelog\n", "4.0.1", "2026-11-07")).toThrow(/Unreleased/);
  });
});

describe("unwrapBullets", () => {
  it("joins continuation lines onto their bullet", () => {
    expect(unwrapBullets("- a\n  b\n- c")).toBe("- a b\n- c");
  });

  it("keeps headings and blank lines", () => {
    expect(unwrapBullets("### Fixed\n\n- a\n  b\n\n### Changed\n\n- c")).toBe(
      "### Fixed\n\n- a b\n\n### Changed\n\n- c",
    );
  });
});

describe("releaseBody", () => {
  it("builds the body shape the in-app history parses", () => {
    expect(releaseBody("### Fixed\n- a", "")).toBe(
      "## What's new for users\n\n### Fixed\n- a\n\n## Full changelog\n",
    );
  });

  it("appends the technical notes after the Full changelog heading", () => {
    expect(releaseBody("- a", "* PR list")).toBe(
      "## What's new for users\n\n- a\n\n## Full changelog\n\n* PR list\n",
    );
  });

  it("round-trips through parseReleaseNotes with wrapped bullets joined", () => {
    const body = releaseBody("### Fixed\n\n- first line\n  continued\n- second", "* PR list");
    expect(parseReleaseNotes(body)).toEqual({
      notes: ["first line continued", "second"],
      fullChangelog: "* PR list",
    });
  });

  it("parses the test-build note as one bullet", () => {
    expect(parseReleaseNotes(releaseBody(TEST_BUILD_NOTE, "")).notes).toEqual([
      "Test build of the release pipeline; no user-facing changes.",
    ]);
  });
});
