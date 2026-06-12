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
