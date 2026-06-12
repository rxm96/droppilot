# Release Notes Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the release job's inline-YAML AI notes generation with a deterministic-gate + grounded-generation + LLM-verify pipeline so published bullets are evidence-backed, vagueness-free, and the fallback line can never leak next to real bullets.

**Architecture:** Dependency-free Node ESM modules under `scripts/release-notes/` (pure functions + thin CLI), invoked by three workflow steps interleaved with two `actions/ai-inference@v2` calls (gpt-4o, free GitHub Models). Evidence comes from Conventional-Commit classification of compare-range commits + PR titles; generation outputs JSON bullets citing evidence ids; a judge pass rejects unsupported/vague bullets; finalize assembles the body in the exact format `src/shared/releaseHistory.ts` parses.

**Tech Stack:** Node 20 stdlib only (global `fetch`), Vitest (`*.test.mjs`), GitHub Actions (`actions/ai-inference@v2` — `max-completion-tokens` and `temperature` exist ONLY in v2; v1 silently ignores them and caps at `max-tokens: 200`, which would truncate multi-bullet JSON. Outputs `response`, `response-file` unchanged across v1/v2).

**Spec:** `docs/superpowers/specs/2026-06-12-release-notes-quality-design.md`

**Branch:** `feat/release-notes-quality` (based on `main`)

**Working conventions for every task:** run commands from the repo root; after each task run `npx prettier --write <files you touched>`; commit messages follow Conventional Commits.

---

## Data shapes (used across all tasks)

```js
// EvidenceUnit
{ id: "E1", text: "fix(overview): correct Engine panel last_refresh and uptime",
  source: "pr" | "commit", userFacing: true }

// rn-work/evidence.json
{ tag: "v3.1.1", baseTag: "v3.1.0", units: EvidenceUnit[],
  candidateIds: ["E1"], commitSubjects: ["..."] }

// rn-work/bullets.json (parsed generation output)
{ bullets: [{ text: "…", evidence: ["E1"] }] }

// verdicts (parsed judge output) — array aligned with bullets by index
[{ supported: true, concrete: true }]
```

Workflow work dir: `rn-work/` in the runner workspace (override with env `RN_WORK_DIR` in tests). Files: `tech-notes.md`, `evidence.json`, `gen-prompt.txt`, `gen-prompt-strict.txt`, `bullets.json`, `judge-prompt.txt`, `release_body.md`.

---

### Task 1: Conventional-commit classification (`conventional.mjs`)

**Files:**

- Create: `scripts/release-notes/lib/conventional.mjs`
- Test: `scripts/release-notes/lib/conventional.test.mjs`

- [x] **Step 1: Write the failing test**

```js
// scripts/release-notes/lib/conventional.test.mjs
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/release-notes/lib/conventional.test.mjs`
Expected: FAIL — vitest finds no test because the include pattern does not cover `scripts/` yet. First extend `vitest.config.ts` (this is needed by every later task):

```ts
// vitest.config.ts — change the include line
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
```

Re-run: `npx vitest run scripts/release-notes/lib/conventional.test.mjs`
Expected: FAIL with "Cannot find module './conventional.mjs'"

- [x] **Step 3: Write the implementation**

```js
// scripts/release-notes/lib/conventional.mjs
// Conventional-Commit subject parsing + the user-facing gate decision.
// Conservative by design: anything unparsable counts as internal.

const CONVENTIONAL_RE = /^(\w+)(\([^)]*\))?!?:\s*(.+)$/;
const GIT_REVERT_RE = /^Revert\s+"(.+)"\s*$/;
const USER_FACING_TYPES = new Set(["feat", "fix", "perf", "revert"]);

export function parseConventionalSubject(subject) {
  const s = String(subject ?? "").trim();
  const revertMatch = s.match(GIT_REVERT_RE);
  if (revertMatch) {
    const inner = parseConventionalSubject(revertMatch[1]);
    return inner ? { ...inner, reverted: true } : null;
  }
  const m = s.match(CONVENTIONAL_RE);
  if (!m) return null;
  return {
    type: m[1].toLowerCase(),
    scope: m[2] ? m[2].slice(1, -1) : null,
    description: m[3].trim(),
    reverted: false,
  };
}

export function isUserFacing(subject) {
  const parsed = parseConventionalSubject(subject);
  if (!parsed) return false;
  return USER_FACING_TYPES.has(parsed.type);
}
```

Note: `revert: feat: x` parses as type `revert` (candidate); `Revert "fix: x"` unwraps to the inner type — both user-facing, while `Revert "chore: …"` stays internal.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/release-notes/lib/conventional.test.mjs`
Expected: PASS (all tests)

- [x] **Step 5: Verify the existing suite still passes (config change!)**

Run: `npm test`
Expected: all previous tests + the new file pass.

- [x] **Step 6: Commit**

```bash
npx prettier --write scripts/release-notes/lib/conventional.mjs scripts/release-notes/lib/conventional.test.mjs vitest.config.ts
git add scripts/release-notes/lib/conventional.mjs scripts/release-notes/lib/conventional.test.mjs vitest.config.ts
git commit -m "feat(release-notes): conventional-commit classification + vitest scripts include"
```

---

### Task 2: Evidence collection (`evidence.mjs`)

**Files:**

- Create: `scripts/release-notes/lib/evidence.mjs`
- Test: `scripts/release-notes/lib/evidence.test.mjs`

- [x] **Step 1: Write the failing test** (fixtures are the real v3.1.1 / v3.1.0 ranges)

```js
// scripts/release-notes/lib/evidence.test.mjs
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


**Full Changelog**: https://github.com/rxm96/droppilot/compare/v3.0.6...v3.1.0`;

describe("extractPrTitlesFromTechNotes", () => {
  it("extracts PR titles from GitHub-generated notes", () => {
    expect(extractPrTitlesFromTechNotes(TECH_NOTES_V310)).toEqual([
      "fix(types): resolve 17 pre-existing type errors + gate CI on tsc",
      "chore(deps): dependency pass — in-range updates + lucide/TS6 majors",
      "chore(deps): upgrade Electron 40 → 42",
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/release-notes/lib/evidence.test.mjs`
Expected: FAIL with "Cannot find module './evidence.mjs'"

- [x] **Step 3: Write the implementation**

```js
// scripts/release-notes/lib/evidence.mjs
// Builds the evidence-unit list the model is allowed to see. PR titles and
// commit subjects only — never file names (the old pipeline's
// file-name-derived "feature tags" were a hallucination source).
import { isUserFacing } from "./conventional.mjs";

const PR_LINE_RE = /^\*\s+(.+?)\s+by\s+@\S+\s+in\s+\S*\/pull\/\d+\s*$/;
const MERGE_RE = /^Merge (pull request|branch|remote-tracking branch)\b/;
const RELEASE_CHORE_RE = /^chore\(release\):/i;

export function extractPrTitlesFromTechNotes(techNotes) {
  return String(techNotes ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().match(PR_LINE_RE))
    .filter(Boolean)
    .map((m) => m[1].trim());
}

export function commitsFromCompareResponse(compareJson) {
  const commits = Array.isArray(compareJson?.commits) ? compareJson.commits : [];
  const subjects = commits
    .map((c) =>
      String(c?.commit?.message ?? "")
        .split("\n")[0]
        .trim(),
    )
    .filter((s) => s.length > 0)
    .filter((s) => !MERGE_RE.test(s))
    .filter((s) => !RELEASE_CHORE_RE.test(s));
  return Array.from(new Set(subjects));
}

function normalizeForDedupe(text) {
  return text
    .toLowerCase()
    .replace(/\s*\(#\d+\)\s*$/, "")
    .trim();
}

export function buildEvidence({ prTitles, commitSubjects }) {
  const units = [];
  const seen = new Set();
  const push = (text, source) => {
    const key = normalizeForDedupe(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    units.push({ id: `E${units.length + 1}`, text, source, userFacing: isUserFacing(text) });
  };
  for (const t of prTitles) push(t, "pr");
  for (const s of commitSubjects) push(s, "commit");
  return { units, candidateIds: units.filter((u) => u.userFacing).map((u) => u.id) };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/release-notes/lib/evidence.test.mjs`
Expected: PASS

- [x] **Step 5: Commit**

```bash
npx prettier --write scripts/release-notes/lib/evidence.mjs scripts/release-notes/lib/evidence.test.mjs
git add scripts/release-notes/lib/evidence.mjs scripts/release-notes/lib/evidence.test.mjs
git commit -m "feat(release-notes): evidence collection from PR titles + compare commits"
```

---

### Task 3: Prompts (`prompts.mjs`)

**Files:**

- Create: `scripts/release-notes/lib/prompts.mjs`
- Test: `scripts/release-notes/lib/prompts.test.mjs`

- [x] **Step 1: Write the failing test**

```js
// scripts/release-notes/lib/prompts.test.mjs
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/release-notes/lib/prompts.test.mjs`
Expected: FAIL with "Cannot find module './prompts.mjs'"

- [x] **Step 3: Write the implementation** (prompts are code — this is the full production wording)

```js
// scripts/release-notes/lib/prompts.mjs
// The model only ever sees evidence texts listed here. The fallback sentence
// lives in finalize.mjs, deliberately NOT in any prompt (leak prevention).

export function buildGenerationPrompt(candidates) {
  const list = candidates.map((u) => `${u.id}: ${u.text}`).join("\n");
  return `You are writing user-facing release notes for DropPilot, a Windows desktop app that automates Twitch Drops (inventory tracking, automatic stream selection, automatic claiming). Audience: non-technical end users.

Product facts you must respect:
- DropPilot runs in the background; it has no in-app video playback.
- Never imply that users watch streams inside the app.

Below are the changes in this release that could be user-visible. Each line has an id.

CHANGES:
${list}

Write 0 to 6 release-note bullets describing what users will notice. Rules:
- Every bullet must be fully supported by one or more listed changes; cite their ids in "evidence".
- If no change produces something a user would notice, return an empty "bullets" array. Zero bullets is a correct, common answer.
- Each bullet must name the concrete feature, setting, panel, or behavior that changed. No generic quality claims (nothing like "improvements", "more stable", "better performance" without a concrete subject).
- Plain language; describe outcomes, not implementation. Never mention file paths, commits, pull requests, refactoring, dependencies, CI, or version numbers.

Respond with ONLY this JSON shape (no markdown fences, no prose):
{"bullets":[{"text":"...","evidence":["E1"]}]}`;
}

export const STRICT_JSON_SUFFIX = `

IMPORTANT: The previous answer was not valid JSON. Respond with ONLY the JSON object described above. The first character of your reply must be "{" and the last must be "}".`;

export function buildJudgePrompt(bullets, unitsById) {
  const blocks = bullets
    .map((b, i) => {
      const evidence = b.evidence
        .map((id) => `- ${id}: ${unitsById.get(id) ?? "(unknown)"}`)
        .join("\n");
      return `BULLET ${i + 1}: "${b.text}"\nEVIDENCE:\n${evidence}`;
    })
    .join("\n\n");
  return `You review draft release-note bullets for DropPilot, a Twitch-Drops automation desktop app. For each bullet you get the changelog entries cited as its evidence. Judge strictly:

- "supported": the bullet's claim follows from its cited entries alone. If the entries do not clearly state what the bullet claims, or you are unsure, answer false.
- "concrete": the bullet names a specific feature, setting, panel, or behavior. Generic quality claims ("improvements", "more stable", "better performance", "enhanced stability") are not concrete.

${blocks}

Respond with ONLY this JSON shape (no markdown fences, no prose), one verdict per bullet in order:
{"verdicts":[{"bullet":1,"supported":true,"concrete":true}]}`;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/release-notes/lib/prompts.test.mjs`
Expected: PASS

- [x] **Step 5: Commit**

```bash
npx prettier --write scripts/release-notes/lib/prompts.mjs scripts/release-notes/lib/prompts.test.mjs
git add scripts/release-notes/lib/prompts.mjs scripts/release-notes/lib/prompts.test.mjs
git commit -m "feat(release-notes): generation + judge prompts as tested code"
```

---

### Task 4: Model output parsing (`modelJson.mjs`)

**Files:**

- Create: `scripts/release-notes/lib/modelJson.mjs`
- Test: `scripts/release-notes/lib/modelJson.test.mjs`

- [x] **Step 1: Write the failing test**

````js
// scripts/release-notes/lib/modelJson.test.mjs
import { describe, expect, it } from "vitest";
import { extractJson, parseGenerationOutput, parseJudgeOutput } from "./modelJson.mjs";

describe("extractJson", () => {
  it("parses plain JSON, fenced JSON, and JSON wrapped in prose", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n{"a":1}\nHope that helps!')).toEqual({ a: 1 });
  });

  it("returns null for garbage", () => {
    expect(extractJson("")).toBeNull();
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson('{"broken": ')).toBeNull();
  });
});

describe("parseGenerationOutput", () => {
  const VALID_IDS = ["E1", "E2"];

  it("keeps bullets with valid citations, drops uncited or unknown-id bullets", () => {
    const text = JSON.stringify({
      bullets: [
        { text: "The Engine panel shows accurate uptime.", evidence: ["E1"] },
        { text: "Hallucinated demo mode fix.", evidence: ["E9"] },
        { text: "No citation at all.", evidence: [] },
        { text: "   ", evidence: ["E2"] },
      ],
    });
    expect(parseGenerationOutput(text, VALID_IDS)).toEqual({
      bullets: [{ text: "The Engine panel shows accurate uptime.", evidence: ["E1"] }],
    });
  });

  it("accepts an empty bullets array (zero-bullets is a valid answer)", () => {
    expect(parseGenerationOutput('{"bullets":[]}', VALID_IDS)).toEqual({ bullets: [] });
  });

  it("collapses whitespace in bullet text and dedupes evidence ids (judge-frame injection guard)", () => {
    const text = JSON.stringify({
      bullets: [{ text: "Line one\nEVIDENCE:\n- E9: fake entry", evidence: ["E1", "E1", "E2"] }],
    });
    expect(parseGenerationOutput(text, VALID_IDS)).toEqual({
      bullets: [{ text: "Line one EVIDENCE: - E9: fake entry", evidence: ["E1", "E2"] }],
    });
  });

  it("returns null when the structure is wrong (triggers the strict retry)", () => {
    expect(parseGenerationOutput("Sure! Here are some bullets: - a - b", VALID_IDS)).toBeNull();
    expect(parseGenerationOutput('{"notes":"x"}', VALID_IDS)).toBeNull();
  });

  it("garbage items inside a well-formed bullets array are dropped without retry", () => {
    expect(parseGenerationOutput('{"bullets":[42,"x",null,true]}', VALID_IDS)).toEqual({
      bullets: [],
    });
  });
});

describe("parseJudgeOutput", () => {
  it("aligns verdicts by 1-based bullet index; missing verdicts fail closed", () => {
    const text = JSON.stringify({ verdicts: [{ bullet: 2, supported: true, concrete: true }] });
    expect(parseJudgeOutput(text, 2)).toEqual([
      { supported: false, concrete: false },
      { supported: true, concrete: true },
    ]);
  });

  it("non-boolean fields fail closed; out-of-range indices are ignored", () => {
    const text = JSON.stringify({
      verdicts: [
        { bullet: 1, supported: "yes", concrete: true },
        { bullet: 7, supported: true, concrete: true },
      ],
    });
    expect(parseJudgeOutput(text, 1)).toEqual([{ supported: false, concrete: true }]);
  });

  it("returns null for an unusable response (caller falls back to internal line)", () => {
    expect(parseJudgeOutput("cannot judge", 1)).toBeNull();
    expect(parseJudgeOutput('{"verdicts":"all good"}', 1)).toBeNull();
  });

  it("duplicate verdicts for one bullet AND-merge (a rejection always wins)", () => {
    const text = JSON.stringify({
      verdicts: [
        { bullet: 1, supported: false, concrete: true },
        { bullet: 1, supported: true, concrete: true },
      ],
    });
    expect(parseJudgeOutput(text, 1)).toEqual([{ supported: false, concrete: true }]);
  });
});
````

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/release-notes/lib/modelJson.test.mjs`
Expected: FAIL with "Cannot find module './modelJson.mjs'"

- [x] **Step 3: Write the implementation**

````js
// scripts/release-notes/lib/modelJson.mjs
// Tolerant JSON extraction + strict shape validation for both model calls.

export function extractJson(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseGenerationOutput(text, validIds) {
  const obj = extractJson(text);
  if (!obj || !Array.isArray(obj.bullets)) return null;
  const valid = new Set(validIds);
  const bullets = [];
  for (const item of obj.bullets) {
    if (!item || typeof item.text !== "string") continue;
    // Collapse ALL whitespace runs: model-supplied newlines could otherwise
    // fabricate EVIDENCE blocks in the judge prompt, break the one-line
    // bullet contract of parseReleaseNotes, and dodge the banned-phrase
    // regexes (which use literal spaces).
    const trimmed = item.text.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const evidence = Array.from(
      new Set(
        (Array.isArray(item.evidence) ? item.evidence : []).filter(
          (id) => typeof id === "string" && valid.has(id),
        ),
      ),
    );
    if (evidence.length === 0) continue; // uncited claims never survive
    bullets.push({ text: trimmed, evidence });
  }
  return { bullets };
}

export function parseJudgeOutput(text, bulletCount) {
  const obj = extractJson(text);
  if (!obj || !Array.isArray(obj.verdicts)) return null;
  const seen = new Set();
  const verdicts = Array.from({ length: bulletCount }, () => ({
    supported: false,
    concrete: false,
  }));
  for (const v of obj.verdicts) {
    const idx = Number(v?.bullet) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= bulletCount) continue;
    const supported = v.supported === true;
    const concrete = v.concrete === true;
    if (seen.has(idx)) {
      // Duplicate verdicts for one bullet AND-merge: a rejection always wins,
      // so an extra permissive verdict can never override a real one.
      verdicts[idx] = {
        supported: verdicts[idx].supported && supported,
        concrete: verdicts[idx].concrete && concrete,
      };
    } else {
      seen.add(idx);
      verdicts[idx] = { supported, concrete };
    }
  }
  return verdicts;
}
````

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/release-notes/lib/modelJson.test.mjs`
Expected: PASS

- [x] **Step 5: Commit**

```bash
npx prettier --write scripts/release-notes/lib/modelJson.mjs scripts/release-notes/lib/modelJson.test.mjs
git add scripts/release-notes/lib/modelJson.mjs scripts/release-notes/lib/modelJson.test.mjs
git commit -m "feat(release-notes): tolerant JSON extraction + strict output validation"
```

---

### Task 5: Finalization (`finalize.mjs`)

**Files:**

- Create: `scripts/release-notes/lib/finalize.mjs`
- Test: `scripts/release-notes/lib/finalize.test.mjs`

- [x] **Step 1: Write the failing test** (includes the leak-impossible and v3.2.0 banned-phrase scenarios)

```js
// scripts/release-notes/lib/finalize.test.mjs
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

  it("link-only tech notes (GitHub's real no-PR body) get the commit list prepended", () => {
    const body = assembleReleaseBody({
      bullets: [],
      techNotes: "**Full Changelog**: https://github.com/rxm96/droppilot/compare/v3.1.0...v3.1.1",
      commitSubjects: ["fix(overview): correct Engine panel last_refresh and uptime"],
      baseTag: "v3.1.0",
    });
    expect(body).toContain(
      "## What's Changed\n* fix(overview): correct Engine panel last_refresh and uptime",
    );
    expect(body).toContain("**Full Changelog**: https://github.com/rxm96/droppilot/compare/");
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/release-notes/lib/finalize.test.mjs`
Expected: FAIL with "Cannot find module './finalize.mjs'"

- [x] **Step 3: Write the implementation**

```js
// scripts/release-notes/lib/finalize.mjs
// The ONLY place the internal-maintenance sentence exists. It is rendered
// exclusively when zero bullets survive — it can never sit next to real
// bullets, which was the old pipeline's leak.

export const INTERNAL_NOTE = "Internal maintenance and stability improvements.";

// Carried over from the old build.yml validator, plus two patterns for the
// bare-vagueness bullets that slipped through it (v3.1.0 "enhanced stability",
// v3.2.0 "Performance improvements").
const BANNED_PATTERNS = [
  /\bmore smoothly\b/i,
  /\benhancing your viewing experience\b/i,
  /\bviewing experience\b/i,
  /\bwatch streams? in the app\b/i,
  /\bwatching got smoother\b/i,
  /\bvideo playback\b/i,
  /\bbetter (performance|reliability|stability|experience)\b/i,
  /\bimproved (performance|reliability|stability|experience)\b/i,
  /\bseamless(ly)?\b/i,
  /\b(performance|stability|reliability) improvements?\b/i,
  /\benhanced (performance|reliability|stability)\b/i,
];

export function violatesBannedPhrases(text) {
  return BANNED_PATTERNS.some((re) => re.test(text));
}

// GitHub's generateReleaseNotes body for a range without PRs is exactly this
// one line (verified against the published v3.1.1 release).
const FULL_CHANGELOG_LINK_RE = /^\*\*Full Changelog\*\*:\s*\S+$/;

export function applyVerdicts(bullets, verdicts) {
  if (!verdicts) return []; // judge unusable → fail closed
  return bullets.filter(
    (_, i) => verdicts[i]?.supported === true && verdicts[i]?.concrete === true,
  );
}

export function finalizeBullets(bullets, verdicts) {
  return applyVerdicts(bullets, verdicts)
    .filter((b) => !violatesBannedPhrases(b.text))
    .slice(0, 6);
}

export function assembleReleaseBody({ bullets, techNotes, commitSubjects, baseTag }) {
  // Locally enforce the one-line, non-empty bullet contract instead of only
  // trusting upstream normalization (defense in depth — parseReleaseNotes
  // silently drops continuation lines). This also makes the function total:
  // any input degrades to a valid body, never a throw.
  const cleaned = (bullets ?? [])
    .map((b) => ({
      ...b,
      text: String(b?.text ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    }))
    .filter((b) => b.text.length > 0);
  const noteLines = cleaned.length ? cleaned.map((b) => `- ${b.text}`) : [`- ${INTERNAL_NOTE}`];
  let changelog = String(techNotes ?? "").trim();
  const subjects = commitSubjects ?? [];
  if (!changelog) {
    changelog = subjects.length
      ? ["## What's Changed", ...subjects.map((s) => `* ${s}`)].join("\n")
      : `Compared against ${baseTag || "the previous release"}.`;
  } else if (FULL_CHANGELOG_LINK_RE.test(changelog) && subjects.length) {
    // GitHub's real no-PR body is not empty — it is exactly the bold compare
    // link. Prepend the commit list so the section isn't bare (v3.1.1 case).
    changelog = ["## What's Changed", ...subjects.map((s) => `* ${s}`), "", changelog].join("\n");
  }
  return `## What's new for users\n\n${noteLines.join("\n")}\n\n## Full changelog\n\n${changelog}\n`;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/release-notes/lib/finalize.test.mjs`
Expected: PASS — including the cross-import contract test against `parseReleaseNotes`.

- [x] **Step 5: Commit**

```bash
npx prettier --write scripts/release-notes/lib/finalize.mjs scripts/release-notes/lib/finalize.test.mjs
git add scripts/release-notes/lib/finalize.mjs scripts/release-notes/lib/finalize.test.mjs
git commit -m "feat(release-notes): verdict application, banned-phrase guard, body assembly"
```

---

### Task 6: GitHub API wrapper + CLI entry (`githubApi.mjs`, `run.mjs`)

**Files:**

- Create: `scripts/release-notes/lib/githubApi.mjs`
- Create: `scripts/release-notes/run.mjs`
- Test: `scripts/release-notes/run.test.mjs`

- [x] **Step 1: Write the failing test** (drives the CLI through real files in a temp dir — `collect` offline via empty BASE_TAG, `parse-gen`, `finalize`)

```js
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
    // Assert the exact bullet text is absent — "Engine panel" alone also
    // appears legitimately in the tech-notes changelog section.
    expect(body).not.toContain("The Engine panel shows accurate uptime.");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/release-notes/run.test.mjs`
Expected: FAIL ("Cannot find module …/run.mjs" from execFileSync)

- [x] **Step 3: Write `githubApi.mjs`** (thin, no unit test — the response parsing it feeds is tested in Task 2)

```js
// scripts/release-notes/lib/githubApi.mjs
export async function fetchCompareCommits({ repo, baseTag, tag, token }) {
  const url = `https://api.github.com/repos/${repo}/compare/${encodeURIComponent(baseTag)}...${encodeURIComponent(tag)}?per_page=100`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`compare API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
```

- [x] **Step 4: Write `run.mjs`**

```js
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
  const attempt = process.env.ATTEMPT ?? "1";
  const response = readResponseFile("RESPONSE_FILE");
  if (response) {
    // Capture the raw model response for the debug artifact — the
    // response-file itself lives in RUNNER_TEMP and dies with the runner.
    writeFileSync(workPath(`gen-response-${attempt}.txt`), response);
  }
  const parsed = parseGenerationOutput(response, evidence.candidateIds);
  if (!parsed) {
    if (attempt === "1") {
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
      const judgeResponse = readResponseFile("JUDGE_RESPONSE_FILE");
      if (judgeResponse) {
        writeFileSync(workPath("judge-response.txt"), judgeResponse);
      }
      const verdicts = parseJudgeOutput(judgeResponse, generated.length);
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
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run scripts/release-notes/run.test.mjs`
Expected: PASS (4 tests)

- [x] **Step 6: Run the whole suite**

Run: `npm test`
Expected: all files pass (previous 403 + new script tests).

- [x] **Step 7: Commit**

```bash
npx prettier --write scripts/release-notes/run.mjs scripts/release-notes/run.test.mjs scripts/release-notes/lib/githubApi.mjs
git add scripts/release-notes/run.mjs scripts/release-notes/run.test.mjs scripts/release-notes/lib/githubApi.mjs
git commit -m "feat(release-notes): CLI phases (collect/parse-gen/finalize) + compare API wrapper"
```

---

### Task 7: Wire the workflow (`build.yml`)

**Files:**

- Modify: `.github/workflows/build.yml` — `release` job only

- [x] **Step 1: Replace the release-job steps.** Delete these steps entirely: `Gather additional release context`, `Generate user-friendly notes with GitHub Models`, `Validate generated user notes`, `Retry user-friendly notes (strict mode)`, `Validate retried user notes`, `Resolve final user notes`, `Build release body`. Keep `Generate technical release notes`, `Resolve release visibility`, `Publish GitHub Release` (with one path change below). Insert `Checkout`/`Setup Node` at the top of the job. The job becomes:

```yaml
release:
  runs-on: ubuntu-latest
  needs: build
  if: startsWith(github.ref, 'refs/tags/v')
  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: 20

    - name: Download artifacts
      uses: actions/download-artifact@v4
      with:
        path: artifacts
        merge-multiple: true

    # --- "Generate technical release notes" step stays byte-identical here ---

    - name: Collect evidence and gate
      id: collect
      env:
        GITHUB_TOKEN: ${{ github.token }}
        TAG: ${{ steps.generated_notes.outputs.tag }}
        BASE_TAG: ${{ steps.generated_notes.outputs.base_tag }}
        TECH_NOTES: ${{ steps.generated_notes.outputs.notes }}
      run: node scripts/release-notes/run.mjs collect

    - name: Generate user notes
      id: gen
      if: steps.collect.outputs.has_candidates == 'true'
      continue-on-error: true
      uses: actions/ai-inference@v2
      with:
        model: openai/gpt-4o
        prompt-file: rn-work/gen-prompt.txt
        max-completion-tokens: "800"
        temperature: "0.2"

    - name: Parse generation output
      id: parse_gen
      if: steps.collect.outputs.has_candidates == 'true'
      env:
        RESPONSE_FILE: ${{ steps.gen.outputs.response-file }}
        ATTEMPT: "1"
      run: node scripts/release-notes/run.mjs parse-gen

    - name: Generate user notes (strict retry)
      id: gen_retry
      if: steps.collect.outputs.has_candidates == 'true' && steps.parse_gen.outputs.parse_ok == 'false'
      continue-on-error: true
      uses: actions/ai-inference@v2
      with:
        model: openai/gpt-4o
        prompt-file: rn-work/gen-prompt-strict.txt
        max-completion-tokens: "800"
        temperature: "0"

    - name: Parse retry output
      id: parse_gen_retry
      if: steps.collect.outputs.has_candidates == 'true' && steps.parse_gen.outputs.parse_ok == 'false'
      env:
        RESPONSE_FILE: ${{ steps.gen_retry.outputs.response-file }}
        ATTEMPT: "2"
      run: node scripts/release-notes/run.mjs parse-gen

    - name: Judge bullets
      id: judge
      if: steps.parse_gen.outputs.has_bullets == 'true' || steps.parse_gen_retry.outputs.has_bullets == 'true'
      continue-on-error: true
      uses: actions/ai-inference@v2
      with:
        model: openai/gpt-4o
        prompt-file: rn-work/judge-prompt.txt
        max-completion-tokens: "600"
        temperature: "0"

    - name: Finalize release body
      env:
        TECH_NOTES: ${{ steps.generated_notes.outputs.notes }}
        JUDGE_RESPONSE_FILE: ${{ steps.judge.outputs.response-file }}
      run: node scripts/release-notes/run.mjs finalize

    # --- "Resolve release visibility" step stays byte-identical here ---

    # --- "Publish GitHub Release": ONLY this line changes ---
    #   body_path: release_body.md   →   body_path: rn-work/release_body.md
```

Skip/failure semantics to preserve exactly: gate closed → `gen`…`judge` all skip and `finalize` writes the internal line with zero model calls; an errored ai-inference step (`continue-on-error`) leaves `response-file` empty, which the parse phases treat as a parse failure (retry, then fail closed); a crashed `parse_gen` still emits `parse_ok=false` via its top-level catch, so the retry fires against a missing `gen-prompt-strict.txt`, errors under `continue-on-error`, and `parse_gen_retry` fails closed — one wasted ai-inference step on a path that still ends at the internal line (accepted). A hard process death (OOM/runner kill) in a script step fails the job before `finalize` — accepted residual risk, since the catch-based never-fail invariant cannot survive process death.

Also add a debug-artifact step directly after "Finalize release body" (the `rn-work/` dir dies with the runner; this makes every notes run post-mortemable):

```yaml
- name: Upload notes-pipeline debug artifacts
  if: always()
  # A debug artifact must never gate the publish, and re-runs must be able
  # to overwrite the previous attempt's capture (artifact names are shared
  # across re-run attempts; without overwrite the upload fails the job).
  continue-on-error: true
  uses: actions/upload-artifact@v4
  with:
    name: release-notes-debug
    path: rn-work/
    if-no-files-found: ignore
    overwrite: true
```

Additionally add `rn-work/` to `.gitignore` (running the CLI locally drops the work dir at the repo root).

- [x] **Step 2: Validate the YAML parses**

Run: `node -e "const y=require('js-yaml'),f=require('fs');y.load(f.readFileSync('.github/workflows/build.yml','utf8'));console.log('yaml ok')"`
Expected: `yaml ok`

- [x] **Step 3: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci(release-notes): wire gate + generation + judge pipeline into release job"
```

---

### Task 8: Full verification + docs touch-ups

**Files:**

- Modify: `CLAUDE.md` (Releases paragraph, one sentence)
- Modify: `docs/superpowers/specs/2026-06-12-release-notes-quality-design.md` (already corrected during planning — verify it is committed)

- [x] **Step 1: Run the complete local gate**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Expected: typecheck clean (scripts are plain `.mjs` — not part of either tsc program, by design), lint 0 errors (5 pre-existing watch-hook warnings), format clean, all tests pass, build clean.

- [x] **Step 2: Append one sentence to the Releases paragraph in CLAUDE.md** (after "…publish a GitHub Release with AI-generated notes.")

```markdown
The notes pipeline lives in `scripts/release-notes/` (deterministic conventional-commit gate → grounded generation → LLM judge; spec: `docs/superpowers/specs/2026-06-12-release-notes-quality-design.md`) — dependency-free Node, tested via `scripts/**/*.test.mjs`.
```

- [x] **Step 3: Commit**

```bash
npx prettier --write CLAUDE.md
git add CLAUDE.md docs/superpowers/specs/2026-06-12-release-notes-quality-design.md
git commit -m "docs(release-notes): document pipeline location + corrected spec criteria"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/release-notes-quality
gh pr create --title "feat(release-notes): grounded release notes generation (gate + judge)" --body "<summary per repo convention: why (3 evidenced failure modes), what (pipeline), verification record>"
```

Expected: the `verify` CI job (from PR #56, if merged) runs lint/format/typecheck/tests/build on the PR.

- [ ] **Step 5: Record the live-verification plan in the PR body** — after merge, run `npm run release:test` (draft prerelease, invisible to users) and check on the run: gate decision matches the range's commits, prompts contain only evidence texts, the published draft body parses in the in-app changelog format, and no internal-note leak. Delete the draft release + tag afterwards:

```bash
gh release delete <tag> --yes && git push --delete origin <tag>
```

---

## Self-review record (per writing-plans skill)

1. **Spec coverage:** gate (Task 2+6), grounded generation prompt (Task 3), JSON+citation validation (Task 4), judge + fail-closed (Tasks 3/4/5), leak-impossible assembly + banned guard + cap (Task 5), empty-changelog fallback (Task 5), zero-`npm ci` release job + prompt-file wiring + skip semantics (Tasks 6/7), format contract (Task 5 cross-import test), success criteria (a)–(d) mapped to tests in Tasks 2/5/6, live `release:test` proof (Task 8). ✓
2. **Placeholder scan:** PR body in Task 8 references "per repo convention" — executor writes it from the verification outputs of Steps 1–5; all code steps contain complete code. ✓
3. **Type consistency:** shapes in the header match usage (`candidateIds`, `units`, `bullets[].evidence`, verdict array); function names identical across tasks (`finalizeBullets`, `buildEvidence`, `parseGenerationOutput`, …). ✓
