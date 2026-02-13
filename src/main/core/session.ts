import { loadSession, saveSession, type SessionData } from "./storage";
import { randomBytes } from "node:crypto";

function hexId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export async function ensureSessionIds(): Promise<{
  deviceId: string;
  sessionId: string;
}> {
  const existing = await loadSession();
  const deviceId = existing?.deviceId ?? hexId(16);
  const sessionId = existing?.sessionId ?? hexId(16);
  if (!existing) {
    // Avoid creating an empty session file if we cannot read it.
    return { deviceId, sessionId };
  }
  if (!existing.deviceId || !existing.sessionId) {
    await saveSession({
      ...existing,
      deviceId,
      sessionId,
    });
  }
  return { deviceId, sessionId };
}

export async function updateSession(partial: Partial<SessionData>) {
  const existing = await loadSession();
  if (!existing) {
    const accessToken = typeof partial.accessToken === "string" ? partial.accessToken.trim() : "";
    if (!accessToken) {
      // Avoid overwriting an unreadable session file with an empty token.
      return;
    }
    const safe: SessionData = {
      accessToken,
      expiresAt: typeof partial.expiresAt === "number" ? partial.expiresAt : Date.now(),
      scopes: Array.isArray(partial.scopes) ? partial.scopes : [],
    };
    await saveSession({
      ...safe,
      ...partial,
    });
    return;
  }
  await saveSession({ ...existing, ...partial });
}
