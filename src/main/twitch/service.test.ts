import { describe, expect, it, vi } from "vitest";
import { extractSpadeUrl } from "./spade";
import { TwitchService } from "./service";

vi.mock("electron", () => ({
  app: {
    getPath: () => ".",
  },
}));

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

describe("TwitchService recent claim guard", () => {
  it("marks stale claimable drops as recently claimed without forcing claimed ui status", () => {
    const service = new TwitchService(async () => null);
    const items = service["buildInventoryItems"](
      [
        {
          id: "camp-1",
          name: "Campaign",
          status: "ACTIVE",
          startAt: "2026-03-10T00:00:00Z",
          endAt: "2026-03-20T00:00:00Z",
          game: { displayName: "Game" },
          self: { isAccountConnected: true },
          timeBasedDrops: [
            {
              id: "drop-1",
              name: "Drop 1",
              requiredMinutesWatched: 60,
              self: {
                currentMinutesWatched: 60,
                status: "ACTIVE",
                dropInstanceID: "inst-1",
                hasPreconditionsMet: true,
              },
            },
          ],
        },
      ] as never,
      new Set(),
      "summary",
      new Set(["user-1#camp-1#drop-1"]),
      "user-1",
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "drop-1",
      status: "progress",
      isClaimable: false,
      recentlyClaimed: true,
      earnedMinutes: 60,
    });
  });
});
