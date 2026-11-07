import { TwitchAuthError, TwitchServiceError } from "../twitch/errors";
import type { TwitchServiceErrorCode } from "../twitch/errors";

export type IpcErrorResponse =
  | { error: "auth"; message: string; status?: number }
  | { error: "twitch"; code: TwitchServiceErrorCode; message: string }
  | { error: "unknown"; message: string };

/**
 * Maps an error thrown by a Twitch IPC handler to the serializable response
 * shape the renderer understands (see `isIpcAuthErrorResponse` /
 * `isIpcErrorResponse` in the renderer's `utils/ipc`).
 */
export function toIpcErrorResponse(err: unknown): IpcErrorResponse {
  if (err instanceof TwitchAuthError) {
    return { error: "auth", message: err.message, status: err.status };
  }
  if (err instanceof TwitchServiceError) {
    return { error: "twitch", code: err.code, message: err.message };
  }
  return { error: "unknown", message: err instanceof Error ? err.message : String(err) };
}
