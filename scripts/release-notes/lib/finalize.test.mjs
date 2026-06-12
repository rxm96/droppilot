import { describe, expect, it } from "vitest";
import {
  INTERNAL_NOTE,
  assembleReleaseBody,
  finalizeBullets,
  violatesBannedPhrases,
} from "./finalize.mjs";

const B = (text) => ({ text, evidence: ["E1"] });
const KEEP = { supported: true, concrete: true };
const DROP = { supported: false, concrete: false };

describe("finalizeBullets", () => {
  it("keeps only supported+concrete bullets", () => {
    expect(
      finalizeBullets([B("a"), B("b"), B("c")], [KEEP, DROP, { supported: true, concrete: false }]),
    ).toEqual([B("a")]);
  });

  it("null verdicts (judge unusable) fail closed to zero bullets", () => {
    expect(finalizeBullets([B("a")], null)).toEqual([]);
  });

  it("banned phrases are removed even if the judge kept them (v3.2.0 case)", () => {
    expect(
      finalizeBullets(
        [B("Performance improvements"), B("The channel grid loads faster.")],
        [KEEP, KEEP],
      ),
    ).toEqual([B("The channel grid loads faster.")]);
  });

  it("caps at 6 bullets in model order", () => {
    const bullets = ["a", "b", "c", "d", "e", "f", "g"].map(B);
    const verdicts = bullets.map(() => KEEP);
    expect(finalizeBullets(bullets, verdicts)).toEqual(bullets.slice(0, 6));
  });

  it("a banned bullet frees its slot for the 7th verified bullet", () => {
    const bullets = [B("Performance improvements"), ...["a", "b", "c", "d", "e", "f"].map(B)];
    const verdicts = bullets.map(() => KEEP);
    expect(finalizeBullets(bullets, verdicts)).toEqual(["a", "b", "c", "d", "e", "f"].map(B));
  });

  it("the internal note itself trips the banned guard (self-defending backstop)", () => {
    expect(violatesBannedPhrases(INTERNAL_NOTE)).toBe(true);
  });
});

describe("violatesBannedPhrases", () => {
  it.each([
    "Performance improvements",
    "stability improvements",
    "enhanced stability for everyone",
    "better performance overall",
    "a more seamless flow",
  ])("bans: %s", (s) => expect(violatesBannedPhrases(s)).toBe(true));

  it.each([
    "The Engine panel shows accurate uptime.",
    "Faster channel switching when a stream goes offline.",
  ])("allows concrete text: %s", (s) => expect(violatesBannedPhrases(s)).toBe(false));
});

describe("assembleReleaseBody", () => {
  const TECH =
    "## What's Changed\n* fix(overview): … by @rxm96 in https://github.com/rxm96/droppilot/pull/57";

  it("renders kept bullets without ever appending the internal note (leak impossible)", () => {
    const body = assembleReleaseBody({
      bullets: [B("The Engine panel shows accurate uptime.")],
      techNotes: TECH,
      commitSubjects: [],
      baseTag: "v3.1.0",
    });
    expect(body).toContain(
      "## What's new for users\n\n- The Engine panel shows accurate uptime.\n",
    );
    expect(body).not.toContain(INTERNAL_NOTE);
    expect(body).toContain("## Full changelog\n\n## What's Changed");
  });

  it("zero bullets → exactly the internal note", () => {
    const body = assembleReleaseBody({
      bullets: [],
      techNotes: TECH,
      commitSubjects: [],
      baseTag: "v3.1.0",
    });
    expect(body).toContain(`## What's new for users\n\n- ${INTERNAL_NOTE}\n`);
  });

  it("empty tech notes (v3.1.1: no PRs) → commit-subject changelog fallback", () => {
    const body = assembleReleaseBody({
      bullets: [],
      techNotes: "",
      commitSubjects: ["fix(overview): correct Engine panel last_refresh and uptime"],
      baseTag: "v3.1.0",
    });
    expect(body).toContain(
      "## Full changelog\n\n## What's Changed\n* fix(overview): correct Engine panel last_refresh and uptime",
    );
  });

  it("no tech notes and no commits → compared-against line", () => {
    const body = assembleReleaseBody({
      bullets: [],
      techNotes: "",
      commitSubjects: [],
      baseTag: "",
    });
    expect(body).toContain("Compared against the previous release.");
  });

  it("normalizes multiline/empty bullet text locally (defense in depth)", () => {
    const body = assembleReleaseBody({
      bullets: [
        { text: "line1\nline2", evidence: ["E1"] },
        { text: "   ", evidence: ["E1"] },
      ],
      techNotes: TECH,
      commitSubjects: [],
      baseTag: "v3.1.0",
    });
    expect(body).toContain("- line1 line2\n");
    expect(body).not.toContain(INTERNAL_NOTE);
  });

  it("zero-bullet body round-trips through parseReleaseNotes as the internal note", async () => {
    const { parseReleaseNotes } = await import("../../../src/shared/releaseHistory.ts");
    const parsed = parseReleaseNotes(
      assembleReleaseBody({ bullets: [], techNotes: TECH, commitSubjects: [], baseTag: "" }),
    );
    expect(parsed.notes).toEqual([INTERNAL_NOTE]);
  });

  it("matches the parseReleaseNotes contract from src/shared/releaseHistory.ts", async () => {
    const { parseReleaseNotes } = await import("../../../src/shared/releaseHistory.ts");
    const body = assembleReleaseBody({
      bullets: [B("The Engine panel shows accurate uptime."), B("Faster channel switching.")],
      techNotes: TECH,
      commitSubjects: [],
      baseTag: "v3.1.0",
    });
    const parsed = parseReleaseNotes(body);
    expect(parsed.notes).toEqual([
      "The Engine panel shows accurate uptime.",
      "Faster channel switching.",
    ]);
    expect(parsed.fullChangelog).toContain("## What's Changed");
  });
});
