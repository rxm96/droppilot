// Default: Android App client (matches Python app, avoids integrity checks). Override via env if needed.
export const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";
// Optional: needed for refresh_token grant. Leave unset if you cannot store secrets.
export const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
export const TWITCH_OAUTH_DEVICE_URL = "https://id.twitch.tv/oauth2/device";
export const TWITCH_OAUTH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
export const TWITCH_ACTIVATE_URL = "https://www.twitch.tv/activate";

// User-Agent similar to the Python client (Android app)
export const TWITCH_WEB_USER_AGENT =
  "Dalvik/2.1.0 (Linux; U; Android 16; SM-S911B Build/TP1A.220624.014) tv.twitch.android.app/25.3.0/2503006";

// Twitch Integrity endpoint (used to obtain Client-Integrity header for GQL when using the web client)
export const TWITCH_INTEGRITY_URL = "https://gql.twitch.tv/integrity";
// Optional manual cookie override (e.g., "auth-token=...; persistent=...; login=...")
export const TWITCH_COOKIE_OVERRIDE = process.env.TWITCH_COOKIES;
