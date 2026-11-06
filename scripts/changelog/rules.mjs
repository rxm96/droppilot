// scripts/changelog/rules.mjs
// Pure rules for CHANGELOG.md-based release notes, shared by the release command
// (release.mjs) and CI (ci.mjs). Dependency-free on purpose: the release job runs
// without `npm ci`.

export const TEST_BUILD_NOTE = "- Test build of the release pipeline; no user-facing changes.";

const UNRELEASED = "Unreleased";

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toLf = (text) => String(text ?? "").replace(/\r\n/g, "\n");

/** Prerelease versions (`4.0.1-rc.0`, `4.0.1-test.2`) contain a dash. */
export function isPrerelease(version) {
  return version.includes("-");
}

/** Stable and rc releases need notes; test builds (pipeline trials) may have none. */
export function notesRequired(version) {
  return !/-test\./.test(version);
}

/** Where `## [heading]` (optionally ` - date`) and its body sit, or null. Expects LF text. */
function locateSection(text, heading) {
  const match = new RegExp(`^## \\[${escapeRegExp(heading)}\\](?: - [^\\n]*)?$`, "m").exec(text);
  if (!match) return null;
  const bodyStart = match.index + match[0].length;
  const next = text.indexOf("\n## ", bodyStart);
  const bodyEnd = next < 0 ? text.length : next + 1;
  return { headingStart: match.index, bodyStart, bodyEnd };
}

/** Trimmed text under `## [heading]` up to the next `## ` heading, or null if missing. */
export function sectionBody(changelog, heading) {
  const text = toLf(changelog);
  const section = locateSection(text, heading);
  return section ? text.slice(section.bodyStart, section.bodyEnd).trim() : null;
}

/** Notes source: a stable version's own section; a prerelease's `Unreleased` section. */
export function notesFor(changelog, version) {
  return sectionBody(changelog, isPrerelease(version) ? UNRELEASED : version) ?? "";
}

/** Throws when `version` needs notes and the changelog has none for it. */
export function assertReleasable(changelog, version) {
  if (!notesRequired(version) || notesFor(changelog, version)) return;
  const heading = isPrerelease(version) ? UNRELEASED : version;
  throw new Error(`CHANGELOG.md has no notes for ${version}: add lines under ## [${heading}].`);
}

/**
 * Moves everything under `## [Unreleased]` into a new `## [version] - date` below it,
 * leaving an empty `## [Unreleased]`. Keeps the file's line endings.
 */
export function withRelease(changelog, version, date) {
  const original = String(changelog ?? "");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const text = toLf(original);
  const section = locateSection(text, UNRELEASED);
  if (!section) throw new Error(`CHANGELOG.md has no "## [${UNRELEASED}]" heading.`);
  if (locateSection(text, version)) throw new Error(`CHANGELOG.md already has ${version}.`);
  const body = text.slice(section.bodyStart, section.bodyEnd).trim();
  if (!body)
    throw new Error(`There is nothing under ## [${UNRELEASED}] in CHANGELOG.md to release.`);
  const rest = text.slice(section.bodyEnd);
  const next =
    text.slice(0, section.bodyStart) +
    `\n\n## [${version}] - ${date}\n\n${body}\n` +
    (rest ? `\n${rest}` : "");
  return eol === "\n" ? next : next.replace(/\n/g, eol);
}

/** Joins wrapped continuation lines onto their bullet, so each bullet is one line. */
export function unwrapBullets(markdown) {
  const out = [];
  for (const line of toLf(markdown).split("\n")) {
    const trimmed = line.trim();
    const previous = out[out.length - 1];
    const continues =
      trimmed !== "" &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("#") &&
      previous !== undefined &&
      previous.startsWith("- ");
    if (continues) out[out.length - 1] = `${previous} ${trimmed}`;
    else out.push(line);
  }
  return out.join("\n");
}

/**
 * The GitHub Release body. Its shape is what src/shared/releaseHistory.ts parses:
 * bullets before `## Full changelog` are the user-facing notes.
 */
export function releaseBody(notes, techNotes) {
  const tech = String(techNotes ?? "").trim();
  return (
    `## What's new for users\n\n${unwrapBullets(notes).trim()}\n\n## Full changelog\n` +
    (tech ? `\n${tech}\n` : "")
  );
}

const NPM_VERSION_ARGS = {
  patch: ["patch"],
  minor: ["minor"],
  major: ["major"],
  rc: ["prerelease", "--preid", "rc"],
  "rc:start": ["prepatch", "--preid", "rc"],
  test: ["prerelease", "--preid", "test"],
};

/** `npm version` arguments for a release kind, matching the release:* npm scripts. */
export function npmVersionArgs(kind) {
  const args = NPM_VERSION_ARGS[kind];
  if (!args) {
    throw new Error(
      `Unknown release kind "${kind}": use patch, minor, major, rc, rc:start or test.`,
    );
  }
  return [...args];
}
