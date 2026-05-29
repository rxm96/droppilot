import { describe, expect, it } from "vitest";
import type { WatchingState } from "@renderer/shared/types";
import { buildWatchPingKey } from "./useWatchPing";

const makeWatching = (overrides: Partial<NonNullable<WatchingState>> = {}): WatchingState => ({
  id: "chan-1",
  name: "Streamer One",
  game: "Escape from Tarkov",
  login: "streamerone",
  channelId: "chan-1",
  streamId: "stream-1",
  ...overrides,
});

describe("buildWatchPingKey", () => {
  it("returns an empty key when not watching", () => {
    expect(buildWatchPingKey(null)).toBe("");
  });

  it("is stable across distinct objects describing the same channel/stream", () => {
    // This is the regression guard: the watch-ping effect keys off this string,
    // so a fresh-but-equal `watching` object must NOT restart the loop (which
    // would fire an immediate ping and double-count watch minutes).
    const a = makeWatching();
    const b = makeWatching();
    expect(a).not.toBe(b);
    expect(buildWatchPingKey(a)).toBe(buildWatchPingKey(b));
  });

  it("ignores game changes (the ping targets the channel, not the game)", () => {
    const before = makeWatching({ game: "Escape from Tarkov" });
    const after = makeWatching({ game: "Overwatch" });
    expect(buildWatchPingKey(before)).toBe(buildWatchPingKey(after));
  });

  it("changes when the stream restarts (new streamId)", () => {
    const before = makeWatching({ streamId: "stream-1" });
    const after = makeWatching({ streamId: "stream-2" });
    expect(buildWatchPingKey(before)).not.toBe(buildWatchPingKey(after));
  });

  it("changes when switching to a different channel", () => {
    const before = makeWatching({ channelId: "chan-1", login: "streamerone" });
    const after = makeWatching({ channelId: "chan-2", login: "streamertwo" });
    expect(buildWatchPingKey(before)).not.toBe(buildWatchPingKey(after));
  });

  it("falls back to id/name when channelId/login are absent", () => {
    const viaCanonical = makeWatching({ channelId: "chan-9", login: "ninelogin" });
    const viaFallback = makeWatching({
      channelId: undefined,
      id: "chan-9",
      login: undefined,
      name: "ninelogin",
    });
    expect(buildWatchPingKey(viaFallback)).toBe(buildWatchPingKey(viaCanonical));
  });
});
