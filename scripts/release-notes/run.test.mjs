// scripts/release-notes/run.test.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ESM test file — no __dirname; resolve run.mjs relative to this module.
const RUN = fileURLToPath(new URL("./run.mjs", import.meta.url));

function runPhase(phase, env, workDir) {
  const outputFile = join(workDir, "github-output.txt");
  if (!existsSync(outputFile)) writeFileSync(outputFile, "");
  execFileSync(process.execPath, [RUN, phase], {
    env: { ...process.env, RN_WORK_DIR: workDir, GITHUB_OUTPUT: outputFile, ...env },
    encoding: "utf8",
  });
  return readFileSync(outputFile, "utf8");
}

const TECH_NOTES = `## What's Changed
* fix(overview): correct Engine panel last_refresh and uptime by @rxm96 in https://github.com/rxm96/droppilot/pull/57`;

describe("run.mjs phases", () => {
  it("collect (no base tag → offline) builds evidence and opens the gate", () => {
    const workDir = mkdtempSync(join(tmpdir(), "rn-"));
    const out = runPhase("collect", { TAG: "v9.9.9", BASE_TAG: "", TECH_NOTES }, workDir);
    expect(out).toContain("has_candidates=true");
    const evidence = JSON.parse(readFileSync(join(workDir, "evidence.json"), "utf8"));
    expect(evidence.candidateIds).toEqual(["E1"]);
    expect(readFileSync(join(workDir, "gen-prompt.txt"), "utf8")).toContain("E1: fix(overview):");
  });

  it("collect with internal-only notes closes the gate (no prompt written)", () => {
    const workDir = mkdtempSync(join(tmpdir(), "rn-"));
    const out = runPhase(
      "collect",
      {
        TAG: "v9.9.9",
        BASE_TAG: "",
        TECH_NOTES:
          "## What's Changed\n* chore: cleanup by @rxm96 in https://github.com/rxm96/droppilot/pull/58",
      },
      workDir,
    );
    expect(out).toContain("has_candidates=false");
    expect(existsSync(join(workDir, "gen-prompt.txt"))).toBe(false);
  });

  it("parse-gen success writes bullets + judge prompt; finalize applies verdicts", () => {
    const workDir = mkdtempSync(join(tmpdir(), "rn-"));
    runPhase("collect", { TAG: "v9.9.9", BASE_TAG: "", TECH_NOTES }, workDir);

    const genResponse = join(workDir, "gen-response.txt");
    writeFileSync(
      genResponse,
      JSON.stringify({
        bullets: [{ text: "The Engine panel shows accurate uptime.", evidence: ["E1"] }],
      }),
    );
    const out = runPhase("parse-gen", { RESPONSE_FILE: genResponse, ATTEMPT: "1" }, workDir);
    expect(out).toContain("parse_ok=true");
    expect(out).toContain("has_bullets=true");
    expect(readFileSync(join(workDir, "judge-prompt.txt"), "utf8")).toContain("BULLET 1:");

    const judgeResponse = join(workDir, "judge-response.txt");
    writeFileSync(
      judgeResponse,
      JSON.stringify({ verdicts: [{ bullet: 1, supported: true, concrete: true }] }),
    );
    runPhase("finalize", { JUDGE_RESPONSE_FILE: judgeResponse }, workDir);
    const body = readFileSync(join(workDir, "release_body.md"), "utf8");
    expect(body).toContain("- The Engine panel shows accurate uptime.");
    expect(body).not.toContain("Internal maintenance");
  });

  it("parse-gen failure writes the strict retry prompt; finalize without bullets → internal note", () => {
    const workDir = mkdtempSync(join(tmpdir(), "rn-"));
    runPhase("collect", { TAG: "v9.9.9", BASE_TAG: "", TECH_NOTES }, workDir);

    const genResponse = join(workDir, "gen-response.txt");
    writeFileSync(genResponse, "Sure, here are some ideas!");
    const out = runPhase("parse-gen", { RESPONSE_FILE: genResponse, ATTEMPT: "1" }, workDir);
    expect(out).toContain("parse_ok=false");
    expect(readFileSync(join(workDir, "gen-prompt-strict.txt"), "utf8")).toContain(
      "ONLY the JSON object",
    );

    runPhase("finalize", {}, workDir);
    const body = readFileSync(join(workDir, "release_body.md"), "utf8");
    expect(body).toContain("- Internal maintenance and stability improvements.");
    expect(body).toContain("## Full changelog");
  });

  it("a crashed phase still exits 0 with fail-closed outputs (never fail the release)", () => {
    const workDir = mkdtempSync(join(tmpdir(), "rn-"));
    // parse-gen with no evidence.json → JSON.parse throws → top-level catch
    const out = runPhase("parse-gen", { ATTEMPT: "1" }, workDir);
    expect(out).toContain("parse_ok=false");
    expect(out).toContain("has_bullets=false");
  });

  it("missing judge response fails closed through the CLI (internal note, no leak)", () => {
    const workDir = mkdtempSync(join(tmpdir(), "rn-"));
    runPhase("collect", { TAG: "v9.9.9", BASE_TAG: "", TECH_NOTES }, workDir);
    const genResponse = join(workDir, "gen-response.txt");
    writeFileSync(
      genResponse,
      JSON.stringify({
        bullets: [{ text: "The Engine panel shows accurate uptime.", evidence: ["E1"] }],
      }),
    );
    runPhase("parse-gen", { RESPONSE_FILE: genResponse, ATTEMPT: "1" }, workDir);
    runPhase("finalize", {}, workDir); // no JUDGE_RESPONSE_FILE set
    const body = readFileSync(join(workDir, "release_body.md"), "utf8");
    expect(body).toContain("- Internal maintenance and stability improvements.");
    expect(body).not.toContain("The Engine panel shows accurate uptime.");
  });
});
