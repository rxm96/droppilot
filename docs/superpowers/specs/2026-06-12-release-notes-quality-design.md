# Release Notes Quality — Design

**Date:** 2026-06-12
**Branch:** `feat/release-notes-quality` (based on `main`; independent of PR #56 —
both touch `build.yml` but different regions, rebase if #56 merges first)
**Status:** Approved (brainstorming)

## Goal

The release job's AI-generated "What's new for users" section produces three
recurring content failures, all evidenced in shipped releases:

1. **Hallucination** — v3.1.0 claims a "demo mode" connected-state fix; none of
   the three PRs in that range (type errors, dependency pass, Electron upgrade)
   touch demo mode. The prompt demands 3–6 bullets even for internal-only
   releases, and the "inferred feature tags" (guessed from changed file names)
   feed the model misleading material.
2. **Vague fluff passes validation** — "Performance improvements" (v3.2.0),
   "enhanced stability" (v3.1.0). The validator is a regex blacklist; vagueness
   is semantic, not lexical, so the list can never be complete.
3. **Fallback leak** — the escape-hatch sentence ("Internal maintenance and
   stability improvements.") is part of the generation prompt, so the model
   emits it _alongside_ real bullets (v3.1.0, v3.1.1) instead of _instead of_
   them.

Additionally, releases without PRs in range (v3.1.1) give the model an empty
technical changelog to work from, and the ~370 lines of inline YAML JavaScript
(generate → validate → retry → validate → resolve) duplicate the validator and
are untestable.

Replace the generation steps with a **deterministic-gate + grounded-generation +
LLM-verify pipeline**: evidence is classified from Conventional Commits before
any model call, generation only ever sees user-facing candidates and must cite
which evidence supports each bullet, and a judge pass rejects unsupported or
vague bullets. The fallback sentence exists only in script code, never in a
prompt.

Success criteria (corrected during planning against the real compare ranges —
v3.1.1 contains a real `fix(overview)` commit and v3.2.0 a `perf` commit, so
neither is internal-only): (a) a range with zero `feat`/`fix`/`perf`/`revert`
entries produces exactly the single internal-maintenance line with **zero model
calls**; (b) the internal-maintenance line can never appear alongside other
bullets (leak structurally impossible — v3.1.1's failure); (c) the generation
prompt contains only the listed evidence texts — no file-name-derived material
(v3.1.0's hallucination source), and bullets citing invalid evidence ids are
dropped; (d) a bare vagueness bullet like "Performance improvements" is
rejected by judge-concreteness and, as last resort, the banned-phrase guard
(v3.2.0's failure). The published body format stays byte-compatible with the
`parseReleaseNotes` contract in `src/shared/releaseHistory.ts`.

## Decisions (locked during brainstorming)

| Question                     | Decision                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary objective            | **Content quality only** — hallucinations, fluff, fallback leak. German notes, model-cost upgrades, and broader refactors are explicitly out of scope.          |
| Infrastructure constraint    | **GitHub Models, free tier** (`actions/ai-inference`, `models: read`). Multiple calls per release are fine; no new secrets, no paid APIs.                       |
| Approach                     | **B: deterministic gate + grounded generation + LLM verify** (over prompt-tuning-only and extraction-only alternatives).                                        |
| Model                        | `openai/gpt-4o` for both generation and judge (better instruction-following than `gpt-4o-mini`, still free via GitHub Models).                                  |
| Judge unavailable/unparsable | **Fail closed: publish the internal-maintenance line.** The invariant "no unverified bullet is published" beats availability; the full changelog renders below. |
| Output format                | Unchanged: `## What's new for users` + `- ` bullets + `## Full changelog`. The in-app changelog parser is a hard contract.                                      |
| Release blocking             | Never — every failure path degrades to a valid body. Publishing must not fail because of notes.                                                                 |

## Pipeline (release job)

Kept from the existing job: "Download artifacts", "Generate technical release
notes", "Resolve release visibility", and "Publish GitHub Release". Replaced:
the five inline-JS generation steps (generate → validate → retry → validate →
resolve), "Gather additional release context", and "Build release body":

```
1. Checkout + setup-node          (new — the release job currently has no checkout)
2. Technical notes (existing)     → outputs: notes, base_tag, tag, is_prerelease
3. Script: collect + gate         → compare commits (GitHub API) + PR titles,
                                    Conventional Commit classification,
                                    writes evidence.json + generation prompt file;
                                    0 candidates → writes final body directly,
                                    steps 4–6 skip
4. ai-inference: generation       (gpt-4o; only if candidates exist)
5. ai-inference: judge            (gpt-4o; only if step 4 produced bullets)
6. Script: finalize               → apply verdicts, residual regex guard,
                                    assemble release_body.md (always runs)
7. (existing) resolve visibility
8. (existing) publish release
```

### Evidence collection & classification (step 3)

- Evidence units: PR titles in the tag range (from the GitHub-generated notes /
  API) plus non-merge commit subjects from `compareCommitsWithBasehead`,
  deduplicated (squash/merge overlap), each with a stable id (`E1..En`).
- Conventional Commit classification: `feat` / `fix` / `perf` (and `revert`) =
  user-facing **candidates**; `chore` / `docs` / `refactor` / `style` / `test` /
  `ci` / `build` and `chore(release)` = internal. Unparsable subjects = internal
  (conservative).
- The misleading file-name-based "inferred feature tags" are removed entirely.
- Gate: zero candidates → the script writes the body with exactly
  `- Internal maintenance and stability improvements.` and no model is invoked.

### Generation (step 4)

- Input: only candidate evidence units (id + text), product context, audience
  rules. No bullet minimum — 0 to 6 bullets allowed. No fallback sentence in
  the prompt.
- Output: strict JSON `{ bullets: [{ text, evidence: ["E1", ...] }] }`.
- Parse failure → one retry step with a hardened JSON-only instruction; still
  failing → internal-maintenance line.

### Judge (step 5)

- Input: each bullet with the full text of its cited evidence units.
- Per bullet verdicts: `supported` (claim follows from the cited evidence —
  uncertain = false) and `concrete` (names a specific behavior/UI element, not
  a generic quality claim). Keep = supported ∧ concrete.
- Output: strict JSON verdict array; unparsable/unavailable → fail closed
  (internal-maintenance line).

### Finalize (step 6)

- Drop rejected bullets; all rejected (or none generated) → internal line.
- Residual blacklist regex from the current pipeline runs as a last cheap
  guard (third line of defense), plus a hard cap of 6 bullets (model order,
  truncate the rest).
- Assemble `release_body.md`. If the GitHub-generated technical changelog is
  empty (no PRs in range, the v3.1.1 case), fill the "Full changelog" section
  deterministically with the commit-subject list (excluding `chore(release)`
  version bumps, mirroring the existing filter) so the section is never bare.

## Code layout

`scripts/release-notes/` — **dependency-free** Node code (stdlib + global
`fetch`; Node 20). The release job therefore needs **no `npm ci`** (which would
install Electron et al.). One CLI entry (`run.mjs <phase>`) invoked by the
workflow steps; logic lives in pure, exported functions:

- `parseConventionalSubject()`, `classifyEvidence()` — parsing + candidate
  decision
- `buildGenerationPrompt()`, `buildJudgePrompt()` — prompts are code, not YAML
- `parseModelJson()` — tolerant JSON extractor (code fences, stray prose)
- `applyVerdicts()`, `assembleReleaseBody()` — finalization

Data flows between steps via workspace files (`evidence.json`, `bullets.json`,
prompt files) and step outputs. The ai-inference steps read the prompt from the
script-written file (`prompt-file` input if supported by `actions/ai-inference`,
else a multiline step output — verify during implementation).

## Testing & verification

- `vitest.config.ts` `include` gains `scripts/**/*.test.ts` (one line). All
  pure functions above get unit tests per repo convention, including fixtures
  reproducing the three real failure modes (v3.1.0 hallucination evidence set,
  v3.1.1 empty range, v3.2.0 single-chore range).
- **Replay verification:** run the real evidence of v3.1.0/v3.1.1/v3.2.0
  through the pipeline locally (model calls via `gh models run` or manual) and
  check the success criteria from Goal.
- **Live proof after merge:** a `release:test` prerelease (lands as a draft
  release) exercises the pipeline end-to-end without reaching users.
- The `verify` CI job (PR #56, merged) runs on every PR; for the new script code it effectively gates **format and tests** — eslint and tsc do not cover `scripts/` (plain dependency-free `.mjs` outside both tsconfig programs and the eslint `src/**` glob; accepted, the modules are small and fully unit-tested).

## Out of scope

- German/bilingual notes (separate initiative; would extend the body format and
  `releaseHistory` parsing).
- Switching to paid models / new secrets.
- The update-overlay normalization in `src/main/index.ts` (consumes the same
  body; unaffected by a format-compatible change).
- electron-updater / packaging steps of the workflow.
