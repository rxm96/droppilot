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

export async function saveSession(session: SessionData): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(sessionFile, JSON.stringify(session, null, 2), "utf-8");
}

export async function loadSession(): Promise<SessionData | null> {
  try {
    const raw = await fs.readFile(sessionFile, "utf-8");
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await fs.unlink(sessionFile);
  } catch {
    // ignore
  }
}
