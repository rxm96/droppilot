// scripts/release-notes/run.mjs
// CLI entry for the release-notes pipeline. Phases: collect | parse-gen | finalize.
// Dependency-free on purpose: the release job runs it without `npm ci`.
// Invariant: no phase ever fails the workflow — every error path degrades to
// the internal-maintenance body.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildEvidence,
  commitsFromCompareResponse,
  extractPrTitlesFromTechNotes,
} from "./lib/evidence.mjs";
import { assembleReleaseBody, finalizeBullets } from "./lib/finalize.mjs";
import { fetchCompareCommits } from "./lib/githubApi.mjs";
import { STRICT_JSON_SUFFIX, buildGenerationPrompt, buildJudgePrompt } from "./lib/prompts.mjs";
import { parseGenerationOutput, parseJudgeOutput } from "./lib/modelJson.mjs";

const WORK_DIR = process.env.RN_WORK_DIR || "rn-work";
const workPath = (name) => join(WORK_DIR, name);

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`[release-notes] output ${name}=${value}`);
}

function readWorkFile(name) {
  const file = workPath(name);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function readResponseFile(envName) {
  const file = process.env[envName];
  if (!file || !existsSync(file)) return "";
  return readFileSync(file, "utf8");
}

async function collect() {
  mkdirSync(WORK_DIR, { recursive: true });
  const techNotes = process.env.TECH_NOTES ?? "";
  writeFileSync(workPath("tech-notes.md"), techNotes);
  const tag = process.env.TAG ?? "";
  const baseTag = process.env.BASE_TAG ?? "";

  let commitSubjects = [];
  if (baseTag) {
    try {
      const compare = await fetchCompareCommits({
        repo: process.env.GITHUB_REPOSITORY,
        baseTag,
        tag,
        token: process.env.GITHUB_TOKEN,
      });
      commitSubjects = commitsFromCompareResponse(compare);
    } catch (err) {
      console.warn(`[release-notes] compare failed, falling back to PR titles only: ${err}`);
    }
  }

  const prTitles = extractPrTitlesFromTechNotes(techNotes);
  const { units, candidateIds } = buildEvidence({ prTitles, commitSubjects });
  writeFileSync(
    workPath("evidence.json"),
    JSON.stringify({ tag, baseTag, units, candidateIds, commitSubjects }, null, 2),
  );
  console.log(
    `[release-notes] evidence: units=${units.length} candidates=[${candidateIds.join(", ")}]`,
  );

  const candidates = units.filter((u) => u.userFacing);
  if (candidates.length > 0) {
    writeFileSync(workPath("gen-prompt.txt"), buildGenerationPrompt(candidates));
  }
  setOutput("has_candidates", candidates.length > 0 ? "true" : "false");
}

function parseGen() {
  const evidence = JSON.parse(readWorkFile("evidence.json"));
  const parsed = parseGenerationOutput(readResponseFile("RESPONSE_FILE"), evidence.candidateIds);
  if (!parsed) {
    if ((process.env.ATTEMPT ?? "1") === "1") {
      writeFileSync(
        workPath("gen-prompt-strict.txt"),
        readWorkFile("gen-prompt.txt") + STRICT_JSON_SUFFIX,
      );
    }
    setOutput("parse_ok", "false");
    setOutput("has_bullets", "false");
    return;
  }
  writeFileSync(workPath("bullets.json"), JSON.stringify(parsed, null, 2));
  if (parsed.bullets.length > 0) {
    const unitsById = new Map(evidence.units.map((u) => [u.id, u.text]));
    writeFileSync(workPath("judge-prompt.txt"), buildJudgePrompt(parsed.bullets, unitsById));
  }
  setOutput("parse_ok", "true");
  setOutput("has_bullets", parsed.bullets.length > 0 ? "true" : "false");
}

function finalize() {
  let body;
  try {
    const evidenceRaw = readWorkFile("evidence.json");
    const evidence = evidenceRaw ? JSON.parse(evidenceRaw) : { commitSubjects: [], baseTag: "" };
    const techNotes = readWorkFile("tech-notes.md") || (process.env.TECH_NOTES ?? "");
    const bulletsRaw = readWorkFile("bullets.json");
    const generated = bulletsRaw ? JSON.parse(bulletsRaw).bullets : [];
    let kept = [];
    if (generated.length > 0) {
      const verdicts = parseJudgeOutput(readResponseFile("JUDGE_RESPONSE_FILE"), generated.length);
      kept = finalizeBullets(generated, verdicts);
    }
    console.log(`[release-notes] bullets: generated=${generated.length} kept=${kept.length}`);
    body = assembleReleaseBody({
      bullets: kept,
      techNotes,
      commitSubjects: evidence.commitSubjects ?? [],
      baseTag: evidence.baseTag ?? "",
    });
  } catch (err) {
    console.warn(`[release-notes] finalize degraded to internal note: ${err}`);
    // assembleReleaseBody is total (normalizes/defaults all inputs), so the
    // degraded path reuses it — the body template exists in exactly one place.
    body = assembleReleaseBody({
      bullets: [],
      techNotes: process.env.TECH_NOTES ?? "",
      commitSubjects: [],
      baseTag: "",
    });
  }
  mkdirSync(WORK_DIR, { recursive: true });
  writeFileSync(workPath("release_body.md"), body);
}

const phase = process.argv[2];
try {
  if (phase === "collect") await collect();
  else if (phase === "parse-gen") parseGen();
  else if (phase === "finalize") finalize();
  else {
    console.error(`Unknown phase: ${phase}`);
    process.exitCode = 1;
  }
} catch (err) {
  // Never fail the release because of notes — degrade and let finalize cope.
  console.error(`[release-notes] phase ${phase} failed: ${err}`);
  if (phase === "collect") setOutput("has_candidates", "false");
  if (phase === "parse-gen") {
    setOutput("parse_ok", "false");
    setOutput("has_bullets", "false");
  }
}
