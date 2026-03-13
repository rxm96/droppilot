export const SETTINGS_PATTERN = /src="(https:\/\/[\w.]+\/config\/settings\.[0-9a-f]{32}\.js)"/i;
export const SPADE_PATTERN =
  /"(?:beacon|spade)_?url": ?"(https:\/\/[.\w\-/]+(?:\?[^"]+)?)"/i;

export function extractSpadeUrl(source: string): string | null {
  return source.match(SPADE_PATTERN)?.[1] ?? null;
}
