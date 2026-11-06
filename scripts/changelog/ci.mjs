// scripts/changelog/ci.mjs
// CI side of the changelog-based release notes. Dependency-free (no `npm ci` needed).
//   check: the pushed tag names package.json's version, and CHANGELOG.md has its notes.
//          Runs before packaging, so a tag without notes never spends a build.
//   body:  writes rn-work/release_body.md for the GitHub Release from CHANGELOG.md plus
//          GitHub's generated PR list (TECH_NOTES).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  TEST_BUILD_NOTE,
  assertReleasable,
  hasNotes,
  notesFor,
  notesRequired,
  releaseBody,
} from "./rules.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (file) => readFileSync(root + file, "utf8");

function releaseVersion() {
  const version = JSON.parse(read("package.json")).version;
  const tag = process.env.GITHUB_REF_NAME ?? "";
  if (tag !== `v${version}`) {
    throw new Error(`The tag "${tag}" is not v${version}, the version in package.json.`);
  }
  return version;
}

function check() {
  const version = releaseVersion();
  assertReleasable(read("CHANGELOG.md"), version);
  console.log(`Release ${version}: tag, package.json and CHANGELOG.md agree.`);
}

function body() {
  const version = releaseVersion();
  const changelog = read("CHANGELOG.md");
  assertReleasable(changelog, version);
  const section = notesFor(changelog, version);
  const notes = hasNotes(section) || notesRequired(version) ? section : TEST_BUILD_NOTE;
  mkdirSync(root + "rn-work", { recursive: true });
  writeFileSync(root + "rn-work/release_body.md", releaseBody(notes, process.env.TECH_NOTES ?? ""));
  console.log(`Wrote rn-work/release_body.md for ${version}.`);
}

const commands = { check, body };

try {
  const command = commands[process.argv[2]];
  if (!command) throw new Error("Usage: node scripts/changelog/ci.mjs <check|body>");
  command();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
