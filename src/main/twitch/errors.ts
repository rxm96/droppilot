export type TwitchServiceErrorCode =
  | "gql.failed"
  | "spade.fetch_failed"
  | "spade.url_missing"
  | "watch.missing_login"
  | "watch.offline"
  | "watch.missing_ids"
  | "watch.ping_failed"
  | "game.slug_missing"
  | "inventory.empty"
  | "claim.missing_id"
  | "claim.failed"
  | "profile.fetch_failed";

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
