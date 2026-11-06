export type RawJsonRead =
  | { status: "ok"; raw: string }
  | { status: "missing" }
  | { status: "corrupt" };

/**
 * Classifies the text of a persisted JSON file. Blank or unparseable content
 * (a truncated write, or NUL bytes after a power loss) is "corrupt", so callers
 * recover from the backup instead of falling back to defaults that the next
 * save would write over both the primary and the backup.
 */
export function classifyJsonText(raw: string): RawJsonRead {
  if (!raw.trim()) return { status: "corrupt" };
  try {
    JSON.parse(raw);
  } catch {
    return { status: "corrupt" };
  }
  return { status: "ok", raw };
}
