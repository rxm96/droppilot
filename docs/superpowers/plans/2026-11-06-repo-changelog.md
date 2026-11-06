# Repo-maintained Changelog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI release-notes pipeline with a `CHANGELOG.md` that the release command moves forward and CI turns into the GitHub Release body.

**Architecture:** Pure, dependency-free ESM rules in `scripts/changelog/rules.mjs` (tested with Vitest). Two thin CLIs use them: `release.mjs` (local, replaces `npm version … && git push`) and `ci.mjs` (`check` before packaging, `body` in the release job).

**Tech Stack:** Node 20 ESM (`.mjs`, no deps), Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-06-repo-changelog-design.md`

## Global Constraints

- Scripts are dependency-free Node ESM: the release job runs them without `npm ci`.
- Notes rule (one function, used by script and CI): stable and `-rc` versions need non-empty notes. `-test` versions may have none.
- Notes source: a stable `x.y.z` uses `## [x.y.z]`. A prerelease (`-rc.N`, `-test.N`) uses `## [Unreleased]`.
- Empty `-test` notes become exactly: `- Test build of the release pipeline; no user-facing changes.`
- Release body shape: `## What's new for users\n\n<section>\n\n## Full changelog\n\n<tech notes>`. Every bullet is on one line.
- Release commit message: `chore(release): v<version>`. Tag: `v<version>`.
- Prettier 100 cols. `format`/`format:check` must cover `scripts/changelog/**/*.mjs`.

## Review Focus

- CRLF line endings in `CHANGELOG.md` (Windows checkout): sections must still be found. → test in Task 1.
- A wrapped bullet with an indented continuation line → joined into one line. → test in Task 1.
- `## [4.0.0]` must not match `## [4.0.0-rc.1]` or `## [14.0.0]` (exact heading match). → test in Task 1.
- `[Unreleased]` as the last section with no following `## ` heading → body still extracted. → test in Task 1.
- Empty tech notes (GitHub returns only a "Full Changelog" link) → body still has `## Full changelog` followed by nothing, and the parser still reads the bullets. → test in Task 1.

---

### Task 1: Pure changelog rules

**Files:**
- Create: `scripts/changelog/rules.mjs`
- Test: `scripts/changelog/rules.test.mjs`

**Interfaces:**
- Produces:
  - `isPrerelease(version: string): boolean`. True when `version` contains `-`.
  - `notesRequired(version: string): boolean`. False only for `-test.` versions.
  - `sectionBody(changelog: string, heading: string): string | null`. `heading` is the bracket text (`"Unreleased"`, `"4.0.0"`). Returns the trimmed text between `## [heading]` (optionally followed by ` - date`) and the next `## ` line, or the end of the file. Returns null when the heading is missing. Normalizes `\r\n` to `\n`.
  - `notesFor(changelog: string, version: string): string`. The section text per the notes-source rule. The empty string when the section is missing or empty.
  - `assertReleasable(changelog: string, version: string): void`. Throws `Error("CHANGELOG.md has no notes for <version>: add lines under ## [<heading>].")` when `notesRequired(version)` and `notesFor` is empty.
  - `withRelease(changelog: string, version: string, date: string): string`. Moves the `Unreleased` body under a new `## [version] - date` heading. Keeps an empty `## [Unreleased]`. Throws when `Unreleased` is missing, when it is empty, or when the version already has a heading.
  - `unwrapBullets(markdown: string): string`. Joins continuation lines (non-empty, not starting with `-`, `#`) onto the preceding bullet with a single space.
  - `releaseBody(notes: string, techNotes: string): string`.
  - `TEST_BUILD_NOTE` = `"- Test build of the release pipeline; no user-facing changes."`

- [ ] **Step 1: Write failing tests** covering:
  - `sectionBody` finds `Unreleased` and `4.0.0` (with ` - 2026-11-06`). `"4.0.0"` does not match `## [4.0.0-rc.1]` or `## [14.0.0]`. It handles CRLF, and it handles the last section with no following heading.
  - `notesFor("…", "4.0.1-rc.0")` returns the Unreleased body. `notesFor(…, "4.0.0")` returns the 4.0.0 body.
  - `assertReleasable` throws for an empty stable or rc, and passes for an empty `4.0.1-test.0`.
  - `withRelease` output has `## [Unreleased]\n\n## [4.0.1] - 2026-11-07\n\n### Fixed\n- x` with older sections untouched below. It throws for an empty Unreleased and for an existing version.
  - `unwrapBullets("- a\n  b\n- c")` returns `"- a b\n- c"`. `### Fixed` lines are kept as they are.
  - `releaseBody("### Fixed\n- a", "")` equals `"## What's new for users\n\n### Fixed\n- a\n\n## Full changelog\n"`. Feeding it to `parseReleaseNotes` from `src/shared/releaseHistory.ts` yields `notes: ["a"]`. (Import the TS file directly: Vitest transpiles it.)
- [ ] **Step 2:** `npx vitest run scripts/changelog/rules.test.mjs`. Expect FAIL (module missing).
- [ ] **Step 3:** Implement `rules.mjs` with the signatures above. `releaseBody` applies `unwrapBullets` to `notes`.
- [ ] **Step 4:** Re-run. Expect PASS.
- [ ] **Step 5:** Commit `feat(release): changelog rules for release notes`.

### Task 2: Release command

**Files:**
- Create: `scripts/changelog/release.mjs`
- Modify: `scripts/changelog/rules.mjs` (+ test), `package.json` (`release:*`, `format`, `format:check`)

**Interfaces:**
- Consumes: `assertReleasable`, `withRelease`, `isPrerelease` from Task 1.
- Produces: `npmVersionArgs(kind: string): string[]` in `rules.mjs`, with these mappings:
  - `patch|minor|major` → `[kind]`
  - `rc` → `["prerelease", "--preid", "rc"]`
  - `rc:start` → `["prepatch", "--preid", "rc"]`
  - `test` → `["prerelease", "--preid", "test"]`
  - anything else throws.

- [ ] **Step 1:** Add failing tests for `npmVersionArgs` (all six kinds plus a bad kind). Run, see FAIL, implement, see PASS.
- [ ] **Step 2:** Implement `release.mjs <kind>`. It shells out with `execFileSync` (`shell: true` on Windows for `npm`), in this order:
  1. Branch is `main`. `git status --porcelain` is empty. `git fetch origin main` runs, then `rev-parse HEAD` must equal `rev-parse origin/main`.
  2. `npm version <args> --no-git-tag-version` writes `package.json` and `package-lock.json`. Read the new version from `package.json`.
  3. In a `try`:
     - Refuse if `git tag -l v<new>` is non-empty, or if `git ls-remote --tags origin v<new>` finds the tag.
     - Run `assertReleasable(changelog, new)`.
     - If the version is stable, write `withRelease(changelog, new, today)`, with today as the local `YYYY-MM-DD`.
     - On any throw: `git checkout -- package.json package-lock.json CHANGELOG.md`, print the error, exit 1.
  4. `git add package.json package-lock.json CHANGELOG.md`, `git commit -m "chore(release): v<new>"`, `git tag v<new>`.
  5. `git push origin main v<new>`. On failure, print `Release committed and tagged locally, push failed. Finish with: git push origin main v<new>` and exit 1.
- [ ] **Step 3:** Point `package.json` `release:patch|minor|major|rc|rc:start|test` at `node scripts/changelog/release.mjs <kind>`. Add `scripts/changelog/**/*.mjs` to `format` and `format:check`. (The `release-notes` glob goes away in Task 4.)
- [ ] **Step 4: Manual check, nothing pushed.** On a scratch branch, `node scripts/changelog/release.mjs patch` must refuse with "not on main". Then `git status` must be clean.
- [ ] **Step 5:** Commit `feat(release): release command moves the changelog`.

### Task 3: CI check and release body

**Files:**
- Create: `scripts/changelog/ci.mjs`
- Modify: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: `notesFor`, `assertReleasable`, `notesRequired`, `releaseBody`, `TEST_BUILD_NOTE` from Task 1.

- [ ] **Step 1:** Implement `ci.mjs check`. It reads `GITHUB_REF_NAME` and `package.json`. Exit 1 with a clear message if the tag is not `v<version>`. Otherwise run `assertReleasable(CHANGELOG.md, version)`.
- [ ] **Step 2:** Implement `ci.mjs body`. It writes `rn-work/release_body.md` = `releaseBody(notes || TEST_BUILD_NOTE, process.env.TECH_NOTES ?? "")`. The fallback note only applies when `!notesRequired(version)`. Otherwise the empty notes hit `assertReleasable` first.
- [ ] **Step 3:** `build.yml` changes:
  - In the `build` job, after "Install deps", add the step "Changelog has notes for this tag" (`if: startsWith(github.ref, 'refs/tags/v')`, `run: node scripts/changelog/ci.mjs check`).
  - In the `release` job, keep "Checkout" and "Generate technical release notes", and replace the steps from "Collect evidence and gate" through "Upload notes-pipeline debug artifacts" with one step "Build release body" (`env: TECH_NOTES`, `run: node scripts/changelog/ci.mjs body`).
  - Remove `models: read`. Leave "Publish GitHub Release" unchanged (`body_path: rn-work/release_body.md`).
- [ ] **Step 4: Local check.** Run `GITHUB_REF_NAME=v4.0.0 node scripts/changelog/ci.mjs check` (needs Task 4's `CHANGELOG.md`; run after it if missing). Expect success. `GITHUB_REF_NAME=v9.9.9` must fail. Then run `ci.mjs body` and read `rn-work/release_body.md`. Delete `rn-work/` afterwards.
- [ ] **Step 5:** Commit `ci(release): build release notes from CHANGELOG.md`.

### Task 4: CHANGELOG.md, docs, cleanup

**Files:**
- Create: `CHANGELOG.md`
- Delete: `scripts/release-notes/` (all files)
- Modify:
  - `package.json` (drop the `release-notes` globs)
  - `CLAUDE.md` (the release paragraph under Commands)
  - `docs/superpowers/specs/2026-06-12-release-notes-quality-design.md` (one top line: `> Superseded by 2026-11-06-repo-changelog-design.md: release notes now come from CHANGELOG.md.`)

- [ ] **Step 1:** Write `CHANGELOG.md`:
  - An intro modeled on wardogs: for users, Keep a Changelog 1.1.0, SemVer, and "new lines go under Unreleased in the PR that makes the change; `npm run release:*` moves them under the next version".
  - An empty `## [Unreleased]`.
  - `## [4.0.0] - 2026-11-06`: `### Fixed` with the first two v4.0.0 GitHub notes, and `### Changed` with the 20-second note.
- [ ] **Step 2:** Delete `scripts/release-notes/`. Confirm `grep -rn "release-notes" --exclude-dir=node_modules .` hits only docs/specs/plans.
- [ ] **Step 3:** Rewrite the CLAUDE.md release paragraph. Say that user-facing changes add a line under `## [Unreleased]` in `CHANGELOG.md`, describe the six `release:*` commands, what they refuse, and that CI builds the Release body from the changelog. Drop the AI pipeline text.
- [ ] **Step 4:** Commit `docs(release): add CHANGELOG.md, remove AI release notes`.

### Task 5: Verify and ship

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build`. All pass, and lint shows no new warnings.
- [ ] **Step 2:** Run Task 3 Step 4 now if it was deferred.
- [ ] **Step 3:** Push the branch and open a PR. After `verify` passes, merge (`--merge --admin`), the same flow as #76.
- [ ] **Step 4:** No release is made in this task. The first real use is the next release.
