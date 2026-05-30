export const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/rxm96/droppilot/releases?per_page=100";

export const RELEASE_CACHE_TTL_MS = 30 * 60_000;

const FULL_CHANGELOG_MARKER = /^#{1,6}\s*Full changelog\b/im;
const WHATS_NEW_HEADING = /^#{1,6}\s*What's new[^\n]*\n/i;

export type ReleaseEntry = {
  version: string; // tag without a leading "v", e.g. "3.0.5"
  tag: string; // raw tag, e.g. "v3.0.5"
  date: number; // published_at as epoch ms (0 if unknown)
  prerelease: boolean;
  notes: string[]; // "What's new for users" bullets
  fullChangelog: string; // remaining technical changelog (raw)
  url: string; // html_url of the GitHub release
};

export type ReleaseHistoryResult =
  | { status: "ready"; releases: ReleaseEntry[]; stale: boolean }
  | { status: "error"; message: string };

export type ReleaseCache = { at: number; entries: ReleaseEntry[] } | null;

export function parseReleaseNotes(body: string | null | undefined): {
  notes: string[];
  fullChangelog: string;
} {
  const text = String(body ?? "").trim();
  if (!text) return { notes: [], fullChangelog: "" };

  const markerMatch = text.match(FULL_CHANGELOG_MARKER);
  let whatsNew = text;
  let fullChangelog = "";
  if (markerMatch && markerMatch.index !== undefined) {
    whatsNew = text.slice(0, markerMatch.index);
    fullChangelog = text.slice(markerMatch.index + markerMatch[0].length).trim();
  }

  whatsNew = whatsNew.replace(WHATS_NEW_HEADING, "");
  const notes = whatsNew
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);

  if (notes.length === 0 && !fullChangelog) {
    return { notes: [], fullChangelog: text };
  }
  return { notes, fullChangelog };
}
