export const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/rxm96/droppilot/releases?per_page=100";

export const RELEASE_CACHE_TTL_MS = 30 * 60_000;

const FULL_CHANGELOG_MARKER = /^#{1,6}\s*Full changelog\b/im;
const WHATS_NEW_HEADING = /^#{1,6}\s*What's new[^\n]*\n/im;

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

export type RawGithubRelease = {
  tag_name?: unknown;
  name?: unknown;
  published_at?: unknown;
  created_at?: unknown;
  prerelease?: unknown;
  draft?: unknown;
  body?: unknown;
  html_url?: unknown;
};

export function normalizeRelease(raw: RawGithubRelease): ReleaseEntry | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.draft === true) return null;
  const tag = typeof raw.tag_name === "string" ? raw.tag_name.trim() : "";
  if (!tag) return null;

  const dateStr =
    typeof raw.published_at === "string"
      ? raw.published_at
      : typeof raw.created_at === "string"
        ? raw.created_at
        : null;
  const parsed = dateStr ? Date.parse(dateStr) : NaN;
  const { notes, fullChangelog } = parseReleaseNotes(typeof raw.body === "string" ? raw.body : "");

  return {
    version: tag.replace(/^v/i, ""),
    tag,
    date: Number.isFinite(parsed) ? parsed : 0,
    prerelease: raw.prerelease === true,
    notes,
    fullChangelog,
    url: typeof raw.html_url === "string" ? raw.html_url : "",
  };
}

export function filterReleasesByChannel(
  entries: ReleaseEntry[],
  allowPrerelease: boolean,
): ReleaseEntry[] {
  const filtered = allowPrerelease ? entries : entries.filter((e) => !e.prerelease);
  return [...filtered].sort((a, b) => b.date - a.date);
}

export function isReleaseHistoryResult(value: unknown): value is ReleaseHistoryResult {
  if (!value || typeof value !== "object") return false;
  const v = value as { status?: unknown; releases?: unknown };
  if (v.status === "ready") return Array.isArray(v.releases);
  if (v.status === "error") return typeof (v as { message?: unknown }).message === "string";
  return false;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export async function loadReleaseHistory(opts: {
  allowPrerelease: boolean;
  cache: ReleaseCache;
  now: number;
  fetchImpl: FetchLike;
}): Promise<{ result: ReleaseHistoryResult; cache: ReleaseCache }> {
  const { allowPrerelease, cache, now, fetchImpl } = opts;

  if (cache && now - cache.at < RELEASE_CACHE_TTL_MS) {
    return {
      result: {
        status: "ready",
        releases: filterReleasesByChannel(cache.entries, allowPrerelease),
        stale: false,
      },
      cache,
    };
  }

  try {
    const res = await fetchImpl(GITHUB_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) throw new Error("Unexpected releases payload");

    const entries = json
      .map((raw) => normalizeRelease(raw as RawGithubRelease))
      .filter((e): e is ReleaseEntry => e !== null);

    return {
      result: {
        status: "ready",
        releases: filterReleasesByChannel(entries, allowPrerelease),
        stale: false,
      },
      cache: { at: now, entries },
    };
  } catch (err) {
    if (cache) {
      return {
        result: {
          status: "ready",
          releases: filterReleasesByChannel(cache.entries, allowPrerelease),
          stale: true,
        },
        cache,
      };
    }
    return {
      result: { status: "error", message: err instanceof Error ? err.message : String(err) },
      cache: null,
    };
  }
}
