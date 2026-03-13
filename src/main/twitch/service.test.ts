import { describe, expect, it } from "vitest";
import { extractSpadeUrl } from "./spade";

describe("extractSpadeUrl", () => {
  it("accepts direct spade_url values from channel html", () => {
    const html =
      '<script>{"spade_url":"https://prod-spade.twitch.tv/track/watch.ts?allow_stream=true"}</script>';

    expect(extractSpadeUrl(html)).toBe(
      "https://prod-spade.twitch.tv/track/watch.ts?allow_stream=true",
    );
  });

  it("accepts beacon_url values that do not use the old video-edge host prefix", () => {
    const settingsJs =
      '"beacon_url":"https://video-weaver.fra02.hls.ttvnw.net/spade/watch.ts?allow_stream=true"';

    expect(extractSpadeUrl(settingsJs)).toBe(
      "https://video-weaver.fra02.hls.ttvnw.net/spade/watch.ts?allow_stream=true",
    );
  });

  it("returns null when no tracking url is present", () => {
    expect(extractSpadeUrl("<html></html>")).toBeNull();
  });
});
