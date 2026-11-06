// Pure helpers for the HLS-playlist based watch ping (see TwitchService.sendWatchPing).
//
// Twitch credits drop minutes when the stream's HLS segments are requested, the same
// way a real player does. A HEAD request per segment is enough; no video is downloaded.

/** Usher URL that returns the master playlist (one variant playlist per quality). */
export function buildUsherPlaylistUrl(
  login: string,
  token: { value: string; signature: string },
): string {
  const channel = encodeURIComponent(login.trim().toLowerCase());
  const sig = encodeURIComponent(token.signature);
  return `https://usher.ttvnw.net/api/channel/hls/${channel}.m3u8?sig=${sig}&token=${encodeURIComponent(token.value)}`;
}

const urlLines = (playlist: string): string[] =>
  playlist
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("http"));

/** Variants are listed from highest to lowest quality; the last one is the cheapest. */
export function pickLowestQualityVariantUrl(masterPlaylist: string): string | null {
  const urls = urlLines(masterPlaylist);
  return urls[urls.length - 1] ?? null;
}

/** Segment URLs of a media playlist. URLs inside `#EXT…` tags are not segments. */
export function extractSegmentUrls(mediaPlaylist: string): string[] {
  return urlLines(mediaPlaylist);
}

/**
 * Usher and the playlist hosts answer errors (offline channel, expired token) with
 * JSON instead of an m3u8 body. Returns the error message, or null for an m3u8 body.
 */
export function extractPlaylistError(body: string): string | null {
  const text = body.trim();
  if (text.startsWith("#EXTM3U")) return null;
  // The JSON can have unescaped quotes inside the "url" value; drop that key first.
  const cleaned = text.replace(/"url": ?".+}",/, "");
  try {
    const parsed: unknown = JSON.parse(cleaned);
    const entry = (Array.isArray(parsed) ? parsed[0] : parsed) as { error?: unknown } | null;
    if (entry && typeof entry.error === "string" && entry.error) return entry.error;
  } catch {
    // not JSON: fall through
  }
  return "unexpected playlist response";
}
