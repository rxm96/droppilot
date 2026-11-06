import { afterEach, describe, expect, it, vi } from "vitest";

// The session module persists to Electron's userData dir; the client only needs
// these two calls to be inert here.
vi.mock("../core/session", () => ({
  ensureSessionIds: vi.fn(async () => ({ deviceId: "dev", sessionId: "sess" })),
  updateSession: vi.fn(async () => undefined),
}));

import type { SessionData } from "../core/storage";
import { TwitchClient } from "./client";

const USERS: Record<string, { user_id: string; login: string }> = {
  "token-a": { user_id: "111", login: "alice" },
  "token-b": { user_id: "222", login: "bob" },
};

const stubValidateEndpoint = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
      const token = (init?.headers?.Authorization ?? "").replace("OAuth ", "");
      const user = USERS[token];
      return new Response(JSON.stringify({ ...user, expires_in: 3600, scopes: [] }), {
        status: user ? 200 : 401,
      });
    }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TwitchClient.resetUserState", () => {
  it("drops the cached identity so the next account is validated fresh", async () => {
    stubValidateEndpoint();
    let session: SessionData = { accessToken: "token-a" } as SessionData;
    const client = new TwitchClient(async () => session);

    expect((await client.getValidateInfo()).userId).toBe("111");

    session = { accessToken: "token-b" } as SessionData;
    client.resetUserState();

    const info = await client.getValidateInfo();
    expect(info.userId).toBe("222");
    expect(info.login).toBe("bob");
  });
});
