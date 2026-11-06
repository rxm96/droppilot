# Repo-maintained changelog instead of AI release notes

Date: 2026-11-06. Status: awaiting owner review.

## Why

The release pipeline writes the user-facing part of every GitHub Release with an LLM
(`scripts/release-notes/`, three `actions/ai-inference` steps in `.github/workflows/build.yml`,
spec `2026-06-12-release-notes-quality-design.md`). In practice it often writes nothing useful.
v3.4.9 shipped five real fixes as "Internal maintenance and stability improvements". v4.0.0
got the same line for the fix that made drops progress again, and its notes had to be rewritten
by hand. The owner no longer wants generated notes. What users read should be written by
whoever makes the change, in the repo, like in `rxm96/wardogs-recorder`.

## Goals

- `CHANGELOG.md` at the repo root is the single source of the user-facing release notes.
- Every user-facing change adds a short, plain line under `## [Unreleased]` in the same PR.
- Releasing stays one command (`npm run release:patch|minor|major|rc|rc:start|test`). It bumps the
  version, moves `Unreleased` under the new version, commits, tags and pushes. It runs without
  stopping for review.
- The GitHub Release body is built deterministically from the changelog. No model, no judge.
- The in-app update history keeps working unchanged (see "Release body contract").

## Non-goals

- No German changelog. Release notes stay English only, as the app already shows them.
- No backfill of versions older than 4.0.0. Older notes stay on their GitHub Releases.
- No CI rule that forces every PR to touch the changelog.
- No change to the app's renderer or `src/shared/releaseHistory.ts`.

## Anti-goals

- A release whose notes are empty or generic. The tooling refuses to release a stable version
  with nothing under `Unreleased`.
- Spending the Windows/macOS build on a tag whose changelog has no notes. The check runs first.
- A changelog line that the in-app history cuts off or drops.

## The changelog

- Format: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), Semantic Versioning.
  A short intro paragraph says who it is for and how to add lines (modeled on wardogs).
- Headings: `## [Unreleased]`, then `## [x.y.z] - YYYY-MM-DD`, newest first. Inside a version:
  `### Added`, `### Changed`, `### Fixed`, `### Removed` as needed.
- One bullet = one change, written for users: what they notice, not how the code changed.
- It starts with `## [Unreleased]` (empty) and `## [4.0.0] - 2026-11-06`, whose content is the
  hand-written v4.0.0 notes now on GitHub, under `### Fixed` / `### Changed`.

## Release command

`npm run release:<kind>` calls one script (for example `node scripts/changelog/release.mjs <kind>`)
instead of `npm version … && git push --follow-tags`. In order:

1. Refuse unless on `main`, the tree is clean, and local `main` equals `origin/main` after a fetch.
   (A past incident: a release from a stale checkout produced the wrong version.)
2. Compute the next version with npm's own semantics for each kind. That includes `prepatch`/`prerelease` with
   `--preid rc|test`, as today's scripts do. Refuse if the tag `v<new>` already exists, locally
   or on `origin`.
3. Notes rule, the same one CI applies (see below). Stable and `-rc` versions need notes: refuse
   if `## [Unreleased]` is empty. `-test` versions may go out with an empty `Unreleased`.
   *(Builder-check call: test builds exist to try out the pipeline and often have no user-facing
   change. Without this rule a test tag would be pushed and then fail in CI, leaving behind a
   tag that can't be reused.)*
4. Stable versions only: move everything under `## [Unreleased]` into a new
   `## [<new>] - <today>` right below it. Leave `Unreleased` as an empty heading.
   Prerelease versions (`-rc.N`, `-test.N`) leave the changelog untouched.
5. Write the version to `package.json` and `package-lock.json`, commit
   `chore(release): v<new>` (with `CHANGELOG.md` when it changed), tag `v<new>`, push `main` and
   the tag.
6. If any step before the commit fails, no file stays modified. If the push fails after the
   commit and tag exist locally, nothing is rolled back (the commit is correct). The script
   prints the one command that finishes the release (`git push origin main v<new>`) and exits
   non-zero. *(Builder-check call.)*

## CI on a tag push

- Early check, before packaging (first step of the build job, only for tags): the tag equals
  `v` + `package.json` version, and the notes follow the rule from step 3. A stable tag needs a
  non-empty `## [<version>]` section. An `-rc` tag needs a non-empty `## [Unreleased]` section.
  A `-test` tag may have none. Script and CI share one function for this rule.
- A `-test` release with no notes gets the single bullet
  `- Test build of the release pipeline; no user-facing changes.`
- The release job builds `release_body.md` with a small dependency-free Node script and
  publishes it as today (`softprops/action-gh-release`, same files, same draft/prerelease rules).
- Removed: `scripts/release-notes/` (code and tests), the "Collect evidence", "Generate user
  notes", "strict retry", "Judge bullets", "Finalize", and debug-artifact steps, and the
  `models: read` permission.
- GitHub's generated PR list (`generateReleaseNotes`) stays, as the "Full changelog" part.

## Release body contract

`src/shared/releaseHistory.ts` takes every line that starts with `- ` before a
`## Full changelog` heading as one note, and everything after it as the technical changelog.
So the body is:

```
## What's new for users

### Fixed
- <one bullet per line>

## Full changelog

<GitHub generated notes>
```

Subsection headings may stay (the parser ignores non-bullet lines). A bullet that is wrapped
over several lines in `CHANGELOG.md` must be joined into one line in the body. Otherwise the
in-app history shows only its first line.

## Docs to update

- `CLAUDE.md` "Commands"/release paragraph: describe the changelog flow, drop the AI pipeline.
- `package.json` `format`/`format:check` globs that point at `scripts/release-notes/`.
- The 2026-06-12 release-notes spec gets a one-line "superseded by" note at the top.

## Left to the builder

- File and function names, where the new scripts live, and how they are split for testing.
  Tests follow the repo convention: pure functions, Vitest, `scripts/**/*.test.mjs`.
- Whether the release script calls `npm version --no-git-tag-version` or computes versions
  itself, as long as rc/test semantics match today's scripts.
- How the early CI check is wired, as long as it runs before packaging and only for tags.
