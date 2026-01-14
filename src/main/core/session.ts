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
  if (!existing?.deviceId || !existing?.sessionId) {
    await saveSession({
      ...(existing as SessionData | null),
      accessToken: existing?.accessToken ?? "",
      expiresAt: existing?.expiresAt ?? Date.now(),
      scopes: existing?.scopes ?? [],
      deviceId,
      sessionId,
      refreshToken: existing?.refreshToken,
      cookies: existing?.cookies,
    });
  }
  return { deviceId, sessionId };
}

export async function updateSession(partial: Partial<SessionData>) {
  const existing = (await loadSession()) ?? {
    accessToken: "",
    expiresAt: Date.now(),
    scopes: [],
  };
  await saveSession({
    ...existing,
    ...partial,
  });
}
