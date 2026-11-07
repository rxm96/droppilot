import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A WebSocket double the test drives by hand: it never touches the network.
const sockets = vi.hoisted(
  () => [] as Array<{ emit: (event: string, ...args: unknown[]) => void }>,
);
vi.mock("ws", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  class FakeWebSocket extends Emitter {
    static OPEN = 1;
    readyState = 0;
    constructor() {
      super();
      sockets.push(this);
      this.on("open", () => (this.readyState = 1));
    }
    send() {}
    close() {
      this.readyState = 3;
    }
  }
  return { WebSocket: FakeWebSocket };
});

import { UserPubSub } from "./userPubSub";

const latestSocket = () => sockets[sockets.length - 1] as EventEmitter;

/** Opens the newest socket and has Twitch reject the LISTEN. */
const rejectListen = (error = "ERR_BADAUTH") => {
  const socket = latestSocket();
  socket.emit("open");
  socket.emit("message", Buffer.from(JSON.stringify({ type: "RESPONSE", error })));
};

const acceptListen = () => {
  const socket = latestSocket();
  socket.emit("open");
  socket.emit("message", Buffer.from(JSON.stringify({ type: "RESPONSE", error: "" })));
};

beforeEach(() => {
  sockets.length = 0;
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ user_id: "123" }), { status: 200 })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const makePubSub = () =>
  new UserPubSub(async () => ({ accessToken: "token", expiresAt: 0, scopes: [] }), {
    reconnectMinMs: 1_000,
    reconnectMaxMs: 60_000,
    authSyncIntervalMs: 3_600_000,
  });

describe("UserPubSub reconnect backoff", () => {
  it("backs off exponentially while Twitch keeps rejecting the LISTEN", async () => {
    const pubSub = makePubSub();
    pubSub.start();
    await vi.advanceTimersByTimeAsync(0);

    rejectListen();
    await vi.advanceTimersByTimeAsync(1_000); // 1st retry after 1s
    expect(sockets).toHaveLength(2);

    rejectListen();
    await vi.advanceTimersByTimeAsync(1_999); // 2nd retry waits 2s, not 1s
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);

    rejectListen();
    expect(pubSub.getStatus().reconnectAttempts).toBe(3);
    pubSub.dispose();
  });

  it("resets the backoff once a LISTEN is accepted", async () => {
    const pubSub = makePubSub();
    pubSub.start();
    await vi.advanceTimersByTimeAsync(0);

    rejectListen();
    await vi.advanceTimersByTimeAsync(1_000);
    acceptListen();

    expect(pubSub.getStatus().reconnectAttempts).toBe(0);
    expect(pubSub.getStatus().listening).toBe(true);
    pubSub.dispose();
  });
});
