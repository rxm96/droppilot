import { BrowserWindow, shell } from "electron";
import {
  TWITCH_CLIENT_ID,
  TWITCH_OAUTH_DEVICE_URL,
  TWITCH_OAUTH_TOKEN_URL,
  TWITCH_ACTIVATE_URL,
} from "../config";
import { saveSession } from "../core/storage";
import { ensureSessionIds } from "../core/session";

export interface AuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scopes: string[];
}

export class AuthController {
  private popup: BrowserWindow | null = null;
  private log = (...args: unknown[]) => console.log("[Auth]", ...args);

  async loginWithCredentials(params: {
    username: string;
    password: string;
    token?: string; // 2FA/email code
  }): Promise<AuthResult> {
    const ids = await ensureSessionIds();
    const payload: Record<string, any> = {
      client_id: TWITCH_CLIENT_ID,
      undelete_user: false,
      remember_me: true,
      username: params.username,
      password: params.password,
    };
    if (params.token) {
      payload.authy_token = params.token;
      payload.twitchguard_code = params.token;
    }
    const res = await fetch("https://passport.twitch.tv/login", {
      method: "POST",
      headers: {
        "Client-Id": TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Language": "en-US",
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as any;
    if (data.error_code) {
      throw new Error(`Login error ${data.error_code}: ${data.message ?? "unknown"}`);
    }
    if (!data.access_token) {
      throw new Error(`No access_token in response`);
    }

    // gather cookies from response headers
    const anyHeaders = res.headers as any;
    let cookies: string[] = [];
    if (typeof anyHeaders.getSetCookie === "function") {
      cookies = anyHeaders.getSetCookie().map((c: string) => c.split(";")[0].trim());
    } else {
      const raw = res.headers.get("set-cookie");
      if (raw) {
        cookies = raw.split(/,(?=[^;]+?=)/).map((c) => c.split(";")[0].trim());
      }
    }

    await saveSession({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in ?? 4 * 3600) * 1000,
      scopes: data.scope ?? [],
      deviceId: ids.deviceId,
      sessionId: ids.sessionId,
      cookies: cookies.join("; "),
      loginName: params.username,
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 4 * 3600,
      scopes: data.scope ?? [],
    };
  }

  async login(): Promise<AuthResult> {
    await this.ensureSinglePopupClosed();

    const ids = await ensureSessionIds();

    // 1) Request device code
    const device = await this.requestDeviceCode();

    // 2) Open verification URL inside Electron window to capture cookies
    const verifyUrl = device.verification_uri || TWITCH_ACTIVATE_URL;
    this.popup = new BrowserWindow({
      width: 520,
      height: 760,
      resizable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      title: "Twitch Login",
    });
    this.popup.removeMenu();
    this.popup.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });

    const cookieStore = new Map<string, string>();
    const cookieSession = this.popup.webContents.session;
    const cookieListener = (_event: any, cookie: Electron.Cookie) => {
      if (!cookie.domain || !cookie.domain.includes("twitch.tv")) return;
      cookieStore.set(cookie.name, cookie.value);
    };
    cookieSession.cookies.on("changed", cookieListener);
    let cancelled = false;
    const onClosed = () => {
      cancelled = true;
      this.popup = null;
    };
    this.popup.on("closed", onClosed);

    await this.popup.loadURL(verifyUrl);

    try {
      // 3) Poll token endpoint until user confirms or code expires
      const result = await this.pollForToken(device, () => cancelled);

      // collect cookies from session (changed listener may miss some)
      try {
        const domainCookies = await cookieSession.cookies.get({ domain: ".twitch.tv" });
        const urlCookies = await cookieSession.cookies.get({ url: "https://www.twitch.tv" });
        for (const c of [...domainCookies, ...urlCookies]) {
          cookieStore.set(c.name, c.value);
        }
        console.log("[Auth] Collected cookies", Array.from(cookieStore.entries()));
      } catch (err) {
        console.log("[Auth] Cookie collection error", err);
      }

      // fetch validate info to get login name and add auth-token/login cookies explicitly
      let loginName: string | undefined;
      try {
        const validateRes = await fetch("https://id.twitch.tv/oauth2/validate", {
          headers: { Authorization: `OAuth ${result.accessToken}` },
        });
        const validateJson = (await validateRes.json()) as any;
        loginName = validateJson?.login;
      } catch {
        // ignore
      }

      const cookiesList = Array.from(cookieStore.entries()).map(([k, v]) => `${k}=${v}`);
      cookiesList.push(`auth-token=${result.accessToken}`);
      if (loginName) {
        cookiesList.push(`login=${loginName}`);
      }
      const cookieHeader = cookiesList.join("; ");

      await saveSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: Date.now() + result.expiresIn * 1000,
        scopes: result.scopes,
        deviceId: ids.deviceId,
        sessionId: ids.sessionId,
        cookies: cookieHeader,
        loginName,
      });

      return result;
    } finally {
      cookieSession.cookies.removeListener("changed", cookieListener);
      this.popup?.removeListener("closed", onClosed);
      if (this.popup && !this.popup.isDestroyed()) {
        this.popup.close();
      }
      this.popup = null;
    }
  }

  private async requestDeviceCode(): Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  }> {
    const res = await fetch(TWITCH_OAUTH_DEVICE_URL, {
      method: "POST",
      headers: {
        "Client-Id": TWITCH_CLIENT_ID,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        scopes: "",
      }),
    });
    if (!res.ok) {
      throw new Error(`Device code request failed: ${res.status}`);
    }
    return (await res.json()) as any;
  }

  private async pollForToken(
    device: {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    },
    isCancelled?: () => boolean,
  ): Promise<AuthResult> {
    const start = Date.now();
    const expiresAt = start + device.expires_in * 1000;
    const intervalMs = Math.max(1500, device.interval * 1000);

    while (Date.now() < expiresAt) {
      if (isCancelled?.()) {
        throw new Error("Login abgebrochen (Fenster geschlossen).");
      }
      await new Promise((r) => setTimeout(r, intervalMs));

      const res = await fetch(TWITCH_OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          "Client-Id": TWITCH_CLIENT_ID,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: TWITCH_CLIENT_ID,
          device_code: device.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });

      if (res.status === 200) {
        const data = (await res.json()) as any;
        const expiresIn: number = data.expires_in ?? 4 * 60 * 60; // fallback 4h
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn,
          scopes: data.scope ?? [],
        };
      }

      if (res.status === 400) {
        const data = (await res.json()) as any;
        // Twitch sometimes returns message instead of error
        const err: string = data.error ?? data.message ?? "unknown_error";
        if (err === "authorization_pending") {
          continue;
        }
        if (err === "slow_down") {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        if (err === "expired_token") {
          throw new Error("Device code expired. Bitte erneut einloggen.");
        }
        if (err === "access_denied") {
          throw new Error("Login abgebrochen (access_denied).");
        }
        throw new Error(`Login failed: ${err}: ${data.message ?? ""}`);
      }

      // Other non-success responses: show body for debugging
      if (!res.ok) {
        let body = "";
        try {
          body = await res.text();
        } catch {
          body = "<no body>";
        }
        throw new Error(`Login failed: ${res.status} ${res.statusText} ${body}`);
      }
    }

    throw new Error("Login timed out.");
  }

  private async ensureSinglePopupClosed() {
    if (this.popup && !this.popup.isDestroyed()) {
      this.popup.close();
    }
  }
}
