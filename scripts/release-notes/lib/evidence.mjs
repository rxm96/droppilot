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
