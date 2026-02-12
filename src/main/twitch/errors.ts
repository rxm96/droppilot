import type { TwitchErrorCode } from "../../shared/errorCodes";

export type TwitchServiceErrorCode = TwitchErrorCode;

export class TwitchServiceError extends Error {
  code: TwitchServiceErrorCode;
  cause?: unknown;

  constructor(code: TwitchServiceErrorCode, message?: string, cause?: unknown) {
    super(message ?? code);
    this.name = "TwitchServiceError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
