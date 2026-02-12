type ValueOf<T> = T[keyof T];

export const TWITCH_ERROR_CODES = {
  GQL_FAILED: "gql.failed",
  SPADE_FETCH_FAILED: "spade.fetch_failed",
  SPADE_URL_MISSING: "spade.url_missing",
  WATCH_MISSING_LOGIN: "watch.missing_login",
  WATCH_OFFLINE: "watch.offline",
  WATCH_MISSING_IDS: "watch.missing_ids",
  WATCH_PING_FAILED: "watch.ping_failed",
  GAME_SLUG_MISSING: "game.slug_missing",
  INVENTORY_EMPTY: "inventory.empty",
  CLAIM_MISSING_ID: "claim.missing_id",
  CLAIM_FAILED: "claim.failed",
  PROFILE_FETCH_FAILED: "profile.fetch_failed",
} as const;

export type TwitchErrorCode = ValueOf<typeof TWITCH_ERROR_CODES>;

export const RENDERER_ERROR_CODES = {
  CHANNELS_FETCH_FAILED: "channels.fetch_failed",
  CHANNELS_INVALID_RESPONSE: "channels.invalid_response",
  INVENTORY_FETCH_FAILED: "inventory.fetch_failed",
  INVENTORY_INVALID_RESPONSE: "inventory.invalid_response",
  PROFILE_INVALID_RESPONSE: "profile.invalid_response",
  STATS_LOAD_FAILED: "stats.load_failed",
  STATS_INVALID_RESPONSE: "stats.invalid_response",
  STATS_RESET_FAILED: "stats.reset_failed",
} as const;

export type RendererErrorCode = ValueOf<typeof RENDERER_ERROR_CODES>;

export const APP_ERROR_CODES = {
  ...TWITCH_ERROR_CODES,
  ...RENDERER_ERROR_CODES,
} as const;

export type AppErrorCode = ValueOf<typeof APP_ERROR_CODES>;

export function toErrorKey(code: string): string {
  return `error.${code}`;
}
