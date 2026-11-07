import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";

export interface SessionData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  scopes: string[];
  deviceId?: string;
  sessionId?: string;
  cookies?: string; // serialized cookie header
  loginName?: string;
}

const sessionFile = join(app.getPath("userData"), "session.json");

// The session is read on every Twitch request and updated from several places
// at once (cookie refresh, token refresh, login, logout). Every mutation runs
// through this one chain so read-modify-writes can't interleave (a stale write
// putting back an old token, or an update resurrecting a cleared session).
let writeQueue: Promise<unknown> = Promise.resolve();
let tmpCounter = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => undefined);
  return run;
}

/**
 * Write via a temp file + rename, so a concurrent reader sees the old or the
 * new session, never a truncated file that parses as "not logged in".
 */
async function writeSessionFile(session: SessionData): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const tmp = `${sessionFile}.${process.pid}.${++tmpCounter}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(session, null, 2), "utf-8");
  await fs.rename(tmp, sessionFile);
}

export function saveSession(session: SessionData): Promise<void> {
  return enqueue(() => writeSessionFile(session));
}

/**
 * Serialized read-modify-write. `update` gets the current session and returns
 * the next one, or null to leave the file alone. Unchanged results are not
 * written.
 */
export function mutateSession(
  update: (existing: SessionData | null) => SessionData | null,
): Promise<void> {
  return enqueue(async () => {
    const existing = await loadSession();
    const next = update(existing);
    if (!next) return;
    if (existing && JSON.stringify(next) === JSON.stringify(existing)) return;
    await writeSessionFile(next);
  });
}

export async function loadSession(): Promise<SessionData | null> {
  try {
    const raw = await fs.readFile(sessionFile, "utf-8");
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function clearSession(): Promise<void> {
  return enqueue(async () => {
    try {
      await fs.unlink(sessionFile);
    } catch {
      // ignore
    }
  });
}
