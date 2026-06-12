import { describe, expect, it } from "vitest";
import { isUserFacing, parseConventionalSubject } from "./conventional.mjs";

describe("parseConventionalSubject", () => {
  it("parses type, scope, description", () => {
    expect(
      parseConventionalSubject("fix(overview): correct Engine panel last_refresh and uptime"),
    ).toEqual({
      type: "fix",
      scope: "overview",
      description: "correct Engine panel last_refresh and uptime",
      reverted: false,
    });
  });

  it("parses scopeless and breaking subjects", () => {
    expect(parseConventionalSubject("feat!: drop legacy settings")).toMatchObject({
      type: "feat",
      scope: null,
    });
    expect(parseConventionalSubject("perf: render hot-path fixes")).toMatchObject({ type: "perf" });
  });

  it("unwraps git-style reverts", () => {
    expect(parseConventionalSubject('Revert "feat(stats): weekly chart"')).toMatchObject({
      type: "feat",
      scope: "stats",
      reverted: true,
    });
  });

  it("returns null for non-conventional subjects", () => {
    expect(
      parseConventionalSubject("Merge pull request #53 from rxm96/refactor/settings-schema"),
    ).toBeNull();
    expect(parseConventionalSubject("Update README")).toBeNull();
    expect(parseConventionalSubject("")).toBeNull();
  });
});

describe("isUserFacing", () => {
  it.each([
    "feat: x",
    "fix(ui): x",
    "perf(control,inventory): x",
    "revert: feat: x",
    'Revert "fix: x"',
  ])("candidate: %s", (s) => expect(isUserFacing(s)).toBe(true));

  it.each([
    "chore(release): v3.1.1",
    "chore(deps): upgrade Electron 40 → 42",
    "docs: add CLAUDE.md and overhaul project docs",
    "refactor(settings): drive persistence from the shared schema",
    "style: prettier",
    "test: add fixtures",
    "ci: gate node tsc",
    "build: tweak esbuild",
    "Update README",
    'Revert "chore: bump deps"',
  ])("internal: %s", (s) => expect(isUserFacing(s)).toBe(false));
});
