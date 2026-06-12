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
