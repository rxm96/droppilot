// scripts/release-notes/lib/prompts.mjs
// The model only ever sees evidence texts listed here. The fallback sentence
// lives in finalize.mjs, deliberately NOT in any prompt (leak prevention).

export function buildGenerationPrompt(candidates) {
  const list = candidates.map((u) => `${u.id}: ${u.text}`).join("\n");
  return `You are writing user-facing release notes for DropPilot, a Windows desktop app that automates Twitch Drops (inventory tracking, automatic stream selection, automatic claiming). Audience: non-technical end users.

Product facts you must respect:
- DropPilot runs in the background; it has no in-app video playback.
- Never imply that users watch streams inside the app.

Below are the changes in this release that could be user-visible. Each line has an id.

CHANGES:
${list}

Write 0 to 6 release-note bullets describing what users will notice. Rules:
- Every bullet must be fully supported by one or more listed changes; cite their ids in "evidence".
- If no change produces something a user would notice, return an empty "bullets" array. Zero bullets is a correct, common answer.
- Each bullet must name the concrete feature, setting, panel, or behavior that changed. No generic quality claims (nothing like "improvements", "more stable", "better performance" without a concrete subject).
- Plain language; describe outcomes, not implementation. Never mention file paths, commits, pull requests, refactoring, dependencies, CI, or version numbers.

Respond with ONLY this JSON shape (no markdown fences, no prose):
{"bullets":[{"text":"...","evidence":["E1"]}]}`;
}

export const STRICT_JSON_SUFFIX = `

IMPORTANT: The previous answer was not valid JSON. Respond with ONLY the JSON object described above. The first character of your reply must be "{" and the last must be "}".`;

export function buildJudgePrompt(bullets, unitsById) {
  const blocks = bullets
    .map((b, i) => {
      const evidence = b.evidence
        .map((id) => `- ${id}: ${unitsById.get(id) ?? "(unknown)"}`)
        .join("\n");
      return `BULLET ${i + 1}: "${b.text}"\nEVIDENCE:\n${evidence}`;
    })
    .join("\n\n");
  return `You review draft release-note bullets for DropPilot, a Twitch-Drops automation desktop app. For each bullet you get the changelog entries cited as its evidence. Judge strictly:

- "supported": the bullet's claim follows from its cited entries alone. If the entries do not clearly state what the bullet claims, or you are unsure, answer false.
- "concrete": the bullet names a specific feature, setting, panel, or behavior. Generic quality claims ("improvements", "more stable", "better performance", "enhanced stability") are not concrete.

${blocks}

Respond with ONLY this JSON shape (no markdown fences, no prose), one verdict per bullet in order:
{"verdicts":[{"bullet":1,"supported":true,"concrete":true}]}`;
}
