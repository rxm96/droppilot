import { loadSession, mutateSession, type SessionData } from "./storage";
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
    // Re-read inside the write queue: only fill ids that are still missing.
    await mutateSession((current) =>
      current
        ? {
            ...current,
            deviceId: current.deviceId ?? deviceId,
            sessionId: current.sessionId ?? sessionId,
          }
        : null,
    );
  }
  return { deviceId, sessionId };
}

export function updateSession(partial: Partial<SessionData>): Promise<void> {
  return mutateSession((existing) => {
    if (existing) return { ...existing, ...partial };
    const accessToken = typeof partial.accessToken === "string" ? partial.accessToken.trim() : "";
    if (!accessToken) {
      // Avoid overwriting an unreadable or cleared session with an empty token.
      return null;
    }
    return {
      accessToken,
      expiresAt: typeof partial.expiresAt === "number" ? partial.expiresAt : Date.now(),
      scopes: Array.isArray(partial.scopes) ? partial.scopes : [],
      ...partial,
    };
  });
}
