import { describe, expect, it } from "vitest";
import {
  buildEvidence,
  commitsFromCompareResponse,
  extractPrTitlesFromTechNotes,
} from "./evidence.mjs";

const TECH_NOTES_V310 = `## What's Changed
* fix(types): resolve 17 pre-existing type errors + gate CI on tsc by @rxm96 in https://github.com/rxm96/droppilot/pull/49
* chore(deps): dependency pass — in-range updates + lucide/TS6 majors by @rxm96 in https://github.com/rxm96/droppilot/pull/47
* chore(deps): upgrade Electron 40 → 42 by @rxm96 in https://github.com/rxm96/droppilot/pull/48
* fix: handle messages by @viewer in chat panel by @rxm96 in https://github.com/rxm96/droppilot/pull/51

## New Contributors
* @newuser made their first contribution in https://github.com/rxm96/droppilot/pull/51

**Full Changelog**: https://github.com/rxm96/droppilot/compare/v3.0.6...v3.1.0`;

describe("extractPrTitlesFromTechNotes", () => {
  it("extracts PR titles from GitHub-generated notes", () => {
    expect(extractPrTitlesFromTechNotes(TECH_NOTES_V310)).toEqual([
      "fix(types): resolve 17 pre-existing type errors + gate CI on tsc",
      "chore(deps): dependency pass — in-range updates + lucide/TS6 majors",
      "chore(deps): upgrade Electron 40 → 42",
      "fix: handle messages by @viewer in chat panel",
    ]);
  });

  it("returns empty for empty notes (v3.1.1: no PRs in range)", () => {
    expect(extractPrTitlesFromTechNotes("")).toEqual([]);
    expect(extractPrTitlesFromTechNotes("**Full Changelog**: https://x/compare/a...b")).toEqual([]);
  });
});

describe("commitsFromCompareResponse", () => {
  it("takes first lines, drops merges and release chores, dedupes", () => {
    const compare = {
      commits: [
        {
          commit: {
            message:
              "fix(overview): correct Engine panel last_refresh and uptime\n\nlast_refresh showed wrong…",
          },
        },
        { commit: { message: "chore(release): v3.1.1" } },
        { commit: { message: "Merge pull request #53 from rxm96/refactor/settings-schema" } },
        { commit: { message: "fix(overview): correct Engine panel last_refresh and uptime" } },
        { commit: { message: "" } },
      ],
    };
    expect(commitsFromCompareResponse(compare)).toEqual([
      "fix(overview): correct Engine panel last_refresh and uptime",
    ]);
  });

  it("tolerates missing commits array", () => {
    expect(commitsFromCompareResponse({})).toEqual([]);
    expect(commitsFromCompareResponse(null)).toEqual([]);
  });
});

describe("buildEvidence", () => {
  it("ids units, classifies, dedupes commit echoing a PR title", () => {
    const { units, candidateIds } = buildEvidence({
      prTitles: ["feat: in-app changelog / release history"],
      commitSubjects: ["feat: in-app changelog / release history (#46)", "docs: update README"],
    });
    expect(units).toEqual([
      {
        id: "E1",
        text: "feat: in-app changelog / release history",
        source: "pr",
        userFacing: true,
      },
      { id: "E2", text: "docs: update README", source: "commit", userFacing: false },
    ]);
    expect(candidateIds).toEqual(["E1"]);
  });

  it("v3.1.1 fixture: no PRs, one real fix commit → gate opens", () => {
    const { candidateIds, units } = buildEvidence({
      prTitles: [],
      commitSubjects: ["fix(overview): correct Engine panel last_refresh and uptime"],
    });
    expect(candidateIds).toEqual(["E1"]);
    expect(units[0].userFacing).toBe(true);
  });

  it("docs/chore-only range → zero candidates (gate closes, no model call)", () => {
    const { candidateIds } = buildEvidence({
      prTitles: ["chore(deps): upgrade Electron 40 → 42"],
      commitSubjects: ["docs: add CLAUDE.md and overhaul project docs"],
    });
    expect(candidateIds).toEqual([]);
  });
});
