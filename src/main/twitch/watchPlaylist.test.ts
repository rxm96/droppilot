import { describe, expect, it } from "vitest";
import {
  buildUsherPlaylistUrl,
  extractPlaylistError,
  extractSegmentUrls,
  pickLowestQualityVariantUrl,
} from "./watchPlaylist";

// Shapes captured from live usher / playlist responses (URLs shortened).
const MASTER = `#EXTM3U
#EXT-X-TWITCH-INFO:NODE="node.hls.ttvnw.net",MANIFEST-NODE-TYPE="weaver_cluster"
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="1080p60",NAME="1080p60",AUTOSELECT=YES,DEFAULT=YES
#EXT-X-STREAM-INF:BANDWIDTH=8042999,RESOLUTION=1920x1080,VIDEO="1080p60",FRAME-RATE=60.000
https://euc11.playlist.ttvnw.net/v1/playlist/1080.m3u8
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="720p60",NAME="720p60",AUTOSELECT=YES,DEFAULT=YES
#EXT-X-STREAM-INF:BANDWIDTH=3322199,RESOLUTION=1280x720,VIDEO="720p60",FRAME-RATE=60.000
https://euc11.playlist.ttvnw.net/v1/playlist/720.m3u8
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="160p30",NAME="160p30",AUTOSELECT=YES,DEFAULT=YES
#EXT-X-STREAM-INF:BANDWIDTH=216299,RESOLUTION=284x160,VIDEO="160p30",FRAME-RATE=30.000
https://euc11.playlist.ttvnw.net/v1/playlist/160.m3u8
`;

const MEDIA = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:10613
#EXT-X-DATERANGE:ID="trigger-1",CLASS="twitch-trigger",X-TV-TWITCH-TRIGGER-URL="https://euc11.playlist.ttvnw.net/trigger"
#EXT-X-MAP:URI="https://cdn.hls.ttvnw.net/v1/segment/init"
#EXT-X-PROGRAM-DATE-TIME:2026-11-06T17:02:54.744Z
#EXTINF:2.000,live
https://cdn.hls.ttvnw.net/v1/segment/a.ts
#EXTINF:2.000,live
https://cdn.hls.ttvnw.net/v1/segment/b.ts
#EXTINF:2.000,live
https://cdn.hls.ttvnw.net/v1/segment/c.ts
`;

describe("buildUsherPlaylistUrl", () => {
  it("encodes the login, signature and token value", () => {
    const url = buildUsherPlaylistUrl("SomeLogin", { value: '{"a":"b c"}', signature: "sig123" });
    expect(url).toBe(
      "https://usher.ttvnw.net/api/channel/hls/somelogin.m3u8?sig=sig123&token=%7B%22a%22%3A%22b%20c%22%7D",
    );
  });
});

describe("pickLowestQualityVariantUrl", () => {
  it("returns the last variant playlist URL (lowest quality)", () => {
    expect(pickLowestQualityVariantUrl(MASTER)).toBe(
      "https://euc11.playlist.ttvnw.net/v1/playlist/160.m3u8",
    );
  });

  it("returns null when the master playlist has no variant URLs", () => {
    expect(pickLowestQualityVariantUrl("#EXTM3U\n")).toBeNull();
    expect(pickLowestQualityVariantUrl("")).toBeNull();
  });
});

describe("extractSegmentUrls", () => {
  it("returns only the segment URL lines, ignoring URLs embedded in tags", () => {
    expect(extractSegmentUrls(MEDIA)).toEqual([
      "https://cdn.hls.ttvnw.net/v1/segment/a.ts",
      "https://cdn.hls.ttvnw.net/v1/segment/b.ts",
      "https://cdn.hls.ttvnw.net/v1/segment/c.ts",
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(extractSegmentUrls("#EXTM3U\r\n#EXTINF:2.000,live\r\nhttps://x/a.ts\r\n")).toEqual([
      "https://x/a.ts",
    ]);
  });
});

describe("extractPlaylistError", () => {
  it("returns null for a normal m3u8 body", () => {
    expect(extractPlaylistError(MASTER)).toBeNull();
    expect(extractPlaylistError(MEDIA)).toBeNull();
  });

  it("reads the error from usher's JSON array (offline channel)", () => {
    expect(extractPlaylistError('[{"error":"Can not find channel"}]')).toBe("Can not find channel");
  });

  it("reads the error from a JSON object with a broken url value", () => {
    // Twitch sometimes returns invalid JSON with unescaped quotes inside "url".
    const body = '{"url": "https://x/"y"}", "error": "transcode does not exist"}';
    expect(extractPlaylistError(body)).toBe("transcode does not exist");
  });

  it("reports unparseable non-m3u8 bodies as an error", () => {
    expect(extractPlaylistError("<html>bad gateway</html>")).toBe("unexpected playlist response");
  });
});
