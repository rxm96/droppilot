import { randomUUID } from "node:crypto";
import {
  TWITCH_CLIENT_ID,
  TWITCH_WEB_USER_AGENT,
  TWITCH_INTEGRITY_URL,
  TWITCH_COOKIE_OVERRIDE,
} from "../config";
import type { SessionData } from "../core/storage";
import { ensureSessionIds, updateSession } from "../core/session";

export interface TwitchUser {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl?: string;
  email?: string;
}

export interface ValidateInfo {
  login: string;
  userId: string;
  expiresIn: number;
  scopes?: string[];
}

export class TwitchAuthError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "TwitchAuthError";
  }
}

export class TwitchClient {
  private deviceId: string;
  private sessionId: string;
  private validateInfo?: ValidateInfo;
  private integrityToken?: string;
  private clientVersion = "1.0.0";
  private cookieHeader = "";
  private log = (...args: unknown[]) => console.log("[TwitchClient]", ...args);
  private requireIntegrity = TWITCH_CLIENT_ID === "kimne78kx3ncx6brgo4mv6wki5h1ko";

  constructor(private sessionProvider: () => Promise<SessionData | null>) {
    // defaults, replaced in ensureIds()
    this.deviceId = randomUUID();
    this.sessionId = randomUUID();
  }

  private async authHeaders(): Promise<HeadersInit> {
    const session = await this.sessionProvider();
    if (!session?.accessToken) {
      throw new TwitchAuthError("Not logged in");
    }
    return {
      Accept: "*/*",
      "Accept-Language": "en-US",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent": TWITCH_WEB_USER_AGENT,
      // Helix expects Bearer
      Authorization: `Bearer ${session.accessToken}`,
      "Client-Id": TWITCH_CLIENT_ID,
      "Client-Session-Id": this.sessionId,
      "X-Device-Id": this.deviceId,
    };
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (res.status === 401) {
      throw new TwitchAuthError("Unauthorized", 401);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twitch API error ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }

  private async gqlHeaders(): Promise<HeadersInit> {
    // Only the web client requires integrity; Android app client works without it.
    if (this.requireIntegrity) {
      await this.ensureIntegrity();
    }
    await this.ensureWebCookies();
    const session = await this.sessionProvider();
    if (!session?.accessToken) {
      throw new TwitchAuthError("Not logged in");
    }
    const baseCookies = [`device_id=${this.deviceId}`];
    if (this.cookieHeader) {
      baseCookies.push(this.cookieHeader);
    }
    return {
      Accept: "*/*",
      "Accept-Encoding": "gzip",
      "Accept-Language": "en-US",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "User-Agent": TWITCH_WEB_USER_AGENT,
      Authorization: `OAuth ${session.accessToken}`,
      "Client-Id": TWITCH_CLIENT_ID,
      "Client-Session-Id": this.sessionId,
      "X-Device-Id": this.deviceId,
      ...(this.requireIntegrity && this.integrityToken
        ? { "Client-Integrity": this.integrityToken }
        : {}),
      ...(this.requireIntegrity && this.clientVersion
        ? { "Client-Version": this.clientVersion }
        : {}),
      Cookie: baseCookies.join("; "),
      Origin: "https://www.twitch.tv",
      Referer: "https://www.twitch.tv",
    };
  }

  async gqlRequest<T>(body: Record<string, unknown>): Promise<T> {
    const headers = await this.gqlHeaders();
    this.log("GQL request", {
      headers: {
        ...headers,
        Authorization: "<redacted>",
        Cookie: headers.Cookie,
      },
    });
    const res = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      throw new TwitchAuthError("Unauthorized", 401);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twitch GQL error ${res.status}: ${text}`);
    }
    const payload = (await res.json()) as any;
    // basic error surfacing
    const list = Array.isArray(payload) ? payload : [payload];
    for (const entry of list) {
      if (entry?.errors?.length) {
        throw new Error(
          `GQL errors: ${entry.errors
            .map((e: any) => e.message ?? JSON.stringify(e))
            .join("; ")} | payload=${JSON.stringify(entry)}`,
        );
      }
    }
    return payload as T;
  }

  async getCookieHeader(): Promise<string> {
    await this.ensureWebCookies();
    return this.cookieHeader;
  }

  async getAccessToken(): Promise<string | null> {
    const session = await this.sessionProvider();
    return session?.accessToken ?? null;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getIntegrityToken(): string | undefined {
    return this.integrityToken;
  }

  getClientVersion(): string | undefined {
    return this.clientVersion;
  }

  private async ensureIntegrity(): Promise<void> {
    if (!this.requireIntegrity) return;
    if (this.integrityToken) return;
    await this.ensureIds();
    const session = await this.sessionProvider();
    if (!session?.accessToken) {
      throw new TwitchAuthError("Not logged in");
    }
    const res = await fetch(TWITCH_INTEGRITY_URL, {
      method: "POST",
      headers: {
        "Client-Id": TWITCH_CLIENT_ID,
        "X-Device-Id": this.deviceId,
        "Client-Session-Id": this.sessionId,
        "User-Agent": TWITCH_WEB_USER_AGENT,
        Authorization: `OAuth ${session.accessToken}`,
        Origin: "https://www.twitch.tv",
        Referer: "https://www.twitch.tv",
        Accept: "*/*",
        "Accept-Language": "en-US",
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: "",
    });
    if (!res.ok) {
      const text = await res.text();
      this.log("Integrity failed", res.status, text);
      throw new Error(`Integrity fetch failed ${res.status}: ${text}`);
    }
    const data = (await res.json()) as any;
    const token = data?.token;
    if (!token) {
      throw new Error("Integrity token missing in response");
    }
    this.integrityToken = token;
    const resClientVersion = res.headers.get("client-version");
    if (resClientVersion) {
      this.clientVersion = resClientVersion;
    }
    this.log("Integrity ok", {
      clientVersion: this.clientVersion,
      tokenPreview: this.integrityToken.slice(0, 8),
    });
  }

  private async ensureWebCookies(): Promise<void> {
    await this.ensureIds();
    const session = await this.sessionProvider();
    if (!session?.accessToken) {
      throw new TwitchAuthError("Not logged in");
    }

    // Start from stored cookies if present (session or prior header)
    let parts: string[] = [];
    const baseCookieStr = session.cookies || this.cookieHeader || "";
    if (baseCookieStr) {
      parts = baseCookieStr
        .split(";")
        .map((c) => c.trim())
        .filter(Boolean);
    }

    // manual override if provided
    if (TWITCH_COOKIE_OVERRIDE) {
      parts = TWITCH_COOKIE_OVERRIDE.split(";").map((c) => c.trim());
    }

    // If still empty, fetch basic cookies from twitch.tv
    if (!parts.length) {
      const res = await fetch("https://www.twitch.tv/?no-cache=1", {
        redirect: "follow",
        headers: {
          "User-Agent": TWITCH_WEB_USER_AGENT,
          Authorization: `OAuth ${session.accessToken}`,
          "Client-Id": TWITCH_CLIENT_ID,
          Accept: "*/*",
          "Accept-Language": "en-US",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      const anyHeaders = res.headers as any;
      if (typeof anyHeaders.getSetCookie === "function") {
        parts = anyHeaders.getSetCookie().map((c: string) => c.split(";")[0].trim());
      } else {
        const raw = res.headers.get("set-cookie");
        if (raw) {
          parts = raw
            .split(/,(?=[^;]+?=)/)
            .map((c) => c.split(";")[0].trim())
            .filter(Boolean);
        }
      }
    }

    // Ensure device_id/auth-token are present and dedupe by key (last wins).
    // Keep a small allowlist; exclude twilight/csrf cookies.
    const validate = await this.getValidateInfo();
    const cookieMap = new Map<string, string>();
    const allow = new Set([
      "device_id",
      "server_session_id",
      "unique_id",
      "unique_id_durable",
      "auth-token",
      "persistent",
      "twitch.lohp.countryCode",
    ]);
    for (const p of parts) {
      const [k, v] = p.split("=", 2);
      if (!k) continue;
      const key = k.trim();
      if (!allow.has(key)) continue;
      cookieMap.set(key, (v ?? "").trim());
    }
    const cookieDeviceId =
      cookieMap.get("device_id") ?? cookieMap.get("unique_id") ?? this.deviceId;
    cookieMap.set("device_id", cookieDeviceId);
    this.deviceId = cookieDeviceId;

    const cookieSessionId = cookieMap.get("server_session_id");
    if (cookieSessionId) {
      this.sessionId = cookieSessionId;
    }

    cookieMap.set("auth-token", session.accessToken);

    const finalParts = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`);
    this.cookieHeader = finalParts.join("; ");
    await updateSession({
      cookies: this.cookieHeader,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      loginName: validate.login,
    });
    this.log("Final cookies", {
      parts: finalParts,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
    });
  }

  private async ensureIds(): Promise<void> {
    if (
      this.deviceId &&
      this.sessionId &&
      this.deviceId.indexOf("-") === -1 &&
      this.sessionId.indexOf("-") === -1
    ) {
      return;
    }
    const ids = await ensureSessionIds();
    this.deviceId = ids.deviceId;
    this.sessionId = ids.sessionId;
  }

  async getValidateInfo(): Promise<ValidateInfo> {
    if (this.validateInfo) return this.validateInfo;

    const session = await this.sessionProvider();
    if (!session?.accessToken) {
      throw new TwitchAuthError("Not logged in");
    }
    const validateRes = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${session.accessToken}` },
    });
    if (validateRes.status === 401) {
      throw new TwitchAuthError("Unauthorized", 401);
    }
    if (!validateRes.ok) {
      throw new Error(`Validate failed: ${validateRes.status}`);
    }
    const validate = (await validateRes.json()) as {
      login: string;
      user_id: string;
      expires_in: number;
      scopes?: string[];
    };
    this.validateInfo = {
      login: validate.login,
      userId: validate.user_id,
      expiresIn: validate.expires_in,
      scopes: validate.scopes,
    };
    return this.validateInfo;
  }

  async getUser(): Promise<TwitchUser> {
    // 1) Validate token to get login/user_id without relying on Helix scopes
    const validate = await this.getValidateInfo();

    // 2) Try Helix users with the known user_id to enrich profile
    const headers = await this.authHeaders();
    try {
      const data = await this.fetchJson<{ data: any[] }>(
        `https://api.twitch.tv/helix/users?id=${validate.userId}`,
        { headers },
      );
      const user = data.data?.[0];
      if (user) {
        return {
          id: user.id,
          login: user.login,
          displayName: user.display_name,
          profileImageUrl: user.profile_image_url,
          email: user.email,
        };
      }
    } catch (err) {
      if (err instanceof TwitchAuthError) {
        throw err;
      }
      // fall through to GQL
    }

    // 3) Fallback: GQL currentUser
    const gqlBody = {
      query: `
        query CurrentUser {
          currentUser {
            id
            login
            displayName
            profileImageURL(width: 70)
            email
          }
        }
      `,
      variables: {},
    };
    const res = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(gqlBody),
    });

    if (res.status === 401) {
      throw new TwitchAuthError("Unauthorized", 401);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twitch GQL error ${res.status}: ${text}`);
    }
    const payload = (await res.json()) as any;
    const user = payload?.data?.currentUser;
    if (!user) {
      // As last resort, return validate info
      return {
        id: validate.userId,
        login: validate.login,
        displayName: validate.login,
      };
    }
    return {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      profileImageUrl: user.profileImageURL,
      email: user.email,
    };
  }
}
