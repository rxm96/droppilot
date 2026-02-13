import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import type { ChannelInfo, TwitchService } from "./service";
import { WsChannelTracker, normalizeTrackerMode } from "./tracker";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitFor = async (predicate: () => boolean, timeoutMs = 4_000, stepMs = 25) => {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    if (predicate()) return;
    await sleep(stepMs);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
};

const makeChannels = (count: number, game: string): ChannelInfo[] =>
  Array.from({ length: count }, (_, index) => {
    const id = String(10_000_000 + index);
    return {
      id,
      streamId: `stream-${id}`,
      displayName: `Channel ${index + 1}`,
      login: `channel_${index + 1}`,
      title: `Title ${index + 1}`,
      viewers: 5_000 - index,
      language: "en",
      thumbnail: "",
      game,
    };
  });

const makeTwitchService = (channelsByGame: Record<string, ChannelInfo[]>): TwitchService =>
  ({
    getChannelsForGame: async (gameName: string) => channelsByGame[gameName] ?? [],
  }) as unknown as TwitchService;

const createServer = async () => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Invalid websocket server address");
  }
  return {
    server,
    wsUrl: `ws://127.0.0.1:${address.port}`,
  };
};

const closeServer = (server: WebSocketServer) =>
  new Promise<void>((resolve, reject) => {
    server.close((err?: Error) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

const trackersToDispose: WsChannelTracker[] = [];
const serversToClose: WebSocketServer[] = [];

afterEach(async () => {
  for (const tracker of trackersToDispose.splice(0)) {
    tracker.dispose();
  }
  for (const server of serversToClose.splice(0)) {
    await closeServer(server);
  }
});

describe("normalizeTrackerMode", () => {
  it("normalizes supported values and falls back to polling", () => {
    expect(normalizeTrackerMode("ws")).toBe("ws");
    expect(normalizeTrackerMode("hybrid")).toBe("hybrid");
    expect(normalizeTrackerMode("polling")).toBe("polling");
    expect(normalizeTrackerMode("  WS  ")).toBe("ws");
    expect(normalizeTrackerMode("something-else")).toBe("polling");
    expect(normalizeTrackerMode(undefined)).toBe("polling");
  });
});

describe("WsChannelTracker", () => {
  it("caps desired topics and reports per-shard subscription status", async () => {
    const game = "TestGame";
    const { server, wsUrl } = await createServer();
    serversToClose.push(server);

    const tracker = new WsChannelTracker(makeTwitchService({ [game]: makeChannels(80, game) }), {
      mode: "ws",
      wsUrl,
      maxSockets: 2,
      maxTrackedTopics: 55,
      refreshMs: 60_000,
    });
    trackersToDispose.push(tracker);

    await tracker.getChannelsForGame(game);

    await waitFor(() => {
      const status = tracker.getStatus();
      return status.connectionState === "connected" && status.subscriptions === 55;
    });

    const status = tracker.getStatus();
    expect(status.mode).toBe("ws");
    expect(status.effectiveMode).toBe("ws");
    expect(status.topicLimit).toBe(55);
    expect(status.desiredSubscriptions).toBe(55);
    expect(status.subscriptions).toBe(55);
    expect(status.shards).toHaveLength(2);

    const shards = status.shards ?? [];
    expect(shards.every((shard) => shard.desiredSubscriptions <= 50)).toBe(true);
    expect(shards.every((shard) => shard.subscriptions <= 50)).toBe(true);
    expect(shards.reduce((total, shard) => total + shard.desiredSubscriptions, 0)).toBe(55);
    expect(shards.reduce((total, shard) => total + shard.subscriptions, 0)).toBe(55);
  });

  it("switches to polling fallback when reconnect budget is exhausted", async () => {
    const game = "FallbackGame";
    const tracker = new WsChannelTracker(makeTwitchService({ [game]: makeChannels(8, game) }), {
      mode: "hybrid",
      wsUrl: "ws://127.0.0.1:1",
      maxSockets: 1,
      fallbackAfterReconnectAttempts: 1,
      refreshMs: 60_000,
    });
    trackersToDispose.push(tracker);

    await tracker.getChannelsForGame(game);

    await waitFor(() => {
      const status = tracker.getStatus();
      return status.fallbackActive === true && status.effectiveMode === "polling";
    });

    const status = tracker.getStatus();
    expect(status.mode).toBe("hybrid");
    expect(status.effectiveMode).toBe("polling");
    expect(status.fallbackActive).toBe(true);
    expect(status.reconnectAttempts).toBeGreaterThanOrEqual(1);
  });
});
