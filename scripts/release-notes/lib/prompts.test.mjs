import { describe, expect, it } from "vitest";
import { STRICT_JSON_SUFFIX, buildGenerationPrompt, buildJudgePrompt } from "./prompts.mjs";

const CANDIDATES = [
  {
    id: "E1",
    text: "fix(overview): correct Engine panel last_refresh and uptime",
    source: "commit",
    userFacing: true,
  },
  { id: "E2", text: "feat(stats): weekly trend chart", source: "pr", userFacing: true },
];

describe("buildGenerationPrompt", () => {
  const prompt = buildGenerationPrompt(CANDIDATES);

  it("lists each candidate with its id and nothing else as changes", () => {
    expect(prompt).toContain("E1: fix(overview): correct Engine panel last_refresh and uptime");
    expect(prompt).toContain("E2: feat(stats): weekly trend chart");
  });

  it("allows zero bullets and never mentions a fallback sentence", () => {
    expect(prompt).toContain("Zero bullets is a correct, common answer");
    expect(prompt).not.toMatch(/internal maintenance/i); // the leak source must not exist here
  });

  it("demands pure JSON with the bullets/evidence shape", () => {
    expect(prompt).toContain('{"bullets":[{"text":"...","evidence":["E1"]}]}');
  });
});

describe("buildJudgePrompt", () => {
  it("pairs each bullet with the text of its cited evidence", () => {
    const unitsById = new Map(CANDIDATES.map((u) => [u.id, u.text]));
    const prompt = buildJudgePrompt(
      [{ text: "The Engine panel shows accurate uptime.", evidence: ["E1"] }],
      unitsById,
    );
    expect(prompt).toContain('BULLET 1: "The Engine panel shows accurate uptime."');
    expect(prompt).toContain("- E1: fix(overview): correct Engine panel last_refresh and uptime");
    expect(prompt).toContain('{"verdicts":[{"bullet":1,"supported":true,"concrete":true}]}');
  });
});

describe("STRICT_JSON_SUFFIX", () => {
  it("is appendable to the generation prompt", () => {
    expect(STRICT_JSON_SUFFIX).toMatch(/ONLY the JSON object/);
  });
});
