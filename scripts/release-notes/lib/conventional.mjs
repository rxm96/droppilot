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
