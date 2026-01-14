// Default: Android App client to avoid integrity checks. Override via env if needed.
export const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";
// Optional: needed for refresh_token grant. Leave unset if you cannot store secrets.
export const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
export const TWITCH_OAUTH_DEVICE_URL = "https://id.twitch.tv/oauth2/device";
export const TWITCH_OAUTH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
export const TWITCH_ACTIVATE_URL = "https://www.twitch.tv/activate";

const TWITCH_ANDROID_USER_AGENTS = [
  "Dalvik/2.1.0 (Linux; U; Android 16; SM-S911B Build/TP1A.220624.014) tv.twitch.android.app/25.3.0/2503006",
  "Dalvik/2.1.0 (Linux; U; Android 16; SM-S938B Build/BP2A.250605.031) tv.twitch.android.app/25.3.0/2503006",
  "Dalvik/2.1.0 (Linux; Android 16; SM-X716N Build/UP1A.231005.007) tv.twitch.android.app/25.3.0/2503006",
  "Dalvik/2.1.0 (Linux; U; Android 15; SM-G990B Build/AP3A.240905.015.A2) tv.twitch.android.app/25.3.0/2503006",
  "Dalvik/2.1.0 (Linux; U; Android 15; SM-G970F Build/AP3A.241105.008) tv.twitch.android.app/25.3.0/2503006",
  "Dalvik/2.1.0 (Linux; U; Android 15; SM-A566E Build/AP3A.240905.015.A2) tv.twitch.android.app/25.3.0/2503006",
  "Dalvik/2.1.0 (Linux; U; Android 14; SM-X306B Build/UP1A.231005.007) tv.twitch.android.app/25.3.0/2503006",
];

const DEFAULT_TWITCH_USER_AGENT = TWITCH_ANDROID_USER_AGENTS[0];
const pickUserAgent = (list: string[]) =>
  list[Math.floor(Math.random() * list.length)] || DEFAULT_TWITCH_USER_AGENT;

// User-Agent matching the Android app client.
export const TWITCH_WEB_USER_AGENT =
  process.env.TWITCH_WEB_USER_AGENT ?? pickUserAgent(TWITCH_ANDROID_USER_AGENTS);

// Twitch Integrity endpoint (used to obtain Client-Integrity header for GQL when using the web client)
export const TWITCH_INTEGRITY_URL = "https://gql.twitch.tv/integrity";
// Optional manual cookie override (e.g., "auth-token=...; persistent=...; login=...")
export const TWITCH_COOKIE_OVERRIDE = process.env.TWITCH_COOKIES;
