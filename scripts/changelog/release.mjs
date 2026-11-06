// scripts/changelog/release.mjs
// `npm run release:<kind>` → `node scripts/changelog/release.mjs <kind>`, where kind is
// patch | minor | major | rc | rc:start | test.
// It does the whole release in one go: checks that main is clean and up to date, bumps the
// version (npm's semantics), moves `## [Unreleased]` under a stable version, commits
// `chore(release): v<version>`, tags `v<version>` and pushes both. Nothing stays modified
// if it stops before the commit.
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { npmVersionArgs, prepareChangelog } from "./rules.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const CHANGELOG = "CHANGELOG.md";
const VERSIONED_FILES = ["package.json", "package-lock.json"];

const read = (file) => readFileSync(root + file, "utf8");

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function npm(...args) {
  // npm is a .cmd shim on Windows and needs a shell, so this runs one command line. The
  // arguments come from npmVersionArgs (fixed strings), never from user input.
  execSync(["npm", ...args].join(" "), { cwd: root, stdio: "ignore" });
}

/** Today in local time, as the changelog writes dates. */
function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function assertCleanMain() {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") throw new Error(`Release on main, not on ${branch}.`);
  if (git("status", "--porcelain") !== "") {
    throw new Error("There are uncommitted changes. Commit or stash them first.");
  }
  git("fetch", "origin", "main");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    throw new Error("Local main is not origin/main. Pull (or push) first, then release.");
  }
}

function assertTagFree(tag) {
  if (git("tag", "--list", tag) !== "") throw new Error(`The tag ${tag} already exists locally.`);
  if (git("ls-remote", "--tags", "origin", `refs/tags/${tag}`) !== "") {
    throw new Error(`The tag ${tag} already exists on origin.`);
  }
}

function main(args) {
  if (args.length !== 1) throw new Error("Usage: node scripts/changelog/release.mjs <kind>");
  const versionArgs = npmVersionArgs(args[0]);
  assertCleanMain();

  const current = JSON.parse(read("package.json")).version;
  npm("version", ...versionArgs, "--no-git-tag-version");
  const version = JSON.parse(read("package.json")).version;
  const tag = `v${version}`;

  try {
    assertTagFree(tag);
    const changelog = read(CHANGELOG);
    const next = prepareChangelog(changelog, version, today());
    if (next !== changelog) writeFileSync(root + CHANGELOG, next);
  } catch (error) {
    git("checkout", "--", ...VERSIONED_FILES, CHANGELOG);
    throw error;
  }

  git("add", ...VERSIONED_FILES, CHANGELOG);
  git("commit", "-m", `chore(release): ${tag}`);
  git("tag", tag);
  console.log(`Release ${current} → ${version}: committed and tagged ${tag}.`);

  // Atomic: main and the tag land together or not at all, so CI never builds a tag
  // whose commit is not on main.
  try {
    execFileSync("git", ["push", "--atomic", "origin", "main", tag], {
      cwd: root,
      stdio: "inherit",
    });
  } catch {
    throw new Error(
      `Release committed and tagged locally, push failed. Finish with: git push --atomic origin main ${tag}`,
    );
  }
  console.log(`Pushed main and ${tag}. CI builds and publishes the release.`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
