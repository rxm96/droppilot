import { rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The temp dir is created inside the (hoisted) mock factory, so it exists before
// storage.ts computes its file path at import.
vi.mock("electron", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "droppilot-session-"));
  return { app: { getPath: () => dir } };
});

import { app } from "electron";
import { updateSession } from "./session";
import { clearSession, loadSession, saveSession, type SessionData } from "./storage";

const userData = { dir: app.getPath("userData") };

const base: SessionData = { accessToken: "token-a", expiresAt: 1, scopes: [] };

beforeEach(async () => {
  await clearSession();
  await saveSession(base);
});

afterAll(() => {
  rmSync(userData.dir, { recursive: true, force: true });
});

describe("session persistence", () => {
  it("applies concurrent updates without losing any of them", async () => {
    // e.g. a token refresh racing the per-request cookie update
    await Promise.all([
      updateSession({ cookies: "device_id=1" }),
      updateSession({ accessToken: "token-b" }),
      updateSession({ loginName: "alice" }),
    ]);

    const session = await loadSession();
    expect(session).toMatchObject({
      accessToken: "token-b",
      cookies: "device_id=1",
      loginName: "alice",
    });
  });

  it("does not resurrect a session that was cleared while an update was in flight", async () => {
    await Promise.all([updateSession({ cookies: "device_id=1" }), clearSession()]);

    expect(await loadSession()).toBeNull();
  });

  it("never lets a reader see a missing session while writes are in flight", async () => {
    const writes = Array.from({ length: 25 }, (_, i) => updateSession({ cookies: `n=${i}` }));
    const reads = Array.from({ length: 25 }, () => loadSession());

    const [, results] = await Promise.all([Promise.all(writes), Promise.all(reads)]);
    expect(results.every((session) => session?.accessToken === "token-a")).toBe(true);
  });

  it("skips the write when nothing changed", async () => {
    await updateSession({ loginName: "alice" });
    const file = join(userData.dir, "session.json");
    const before = statSync(file).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 20));

    await updateSession({ loginName: "alice" });

    expect(statSync(file).mtimeMs).toBe(before);
  });
});
