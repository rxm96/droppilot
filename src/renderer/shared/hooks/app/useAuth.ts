import { useEffect, useState } from "react";
import type { AuthState } from "@renderer/shared/types";

const AUTH_LOGIN_CANCELLED_KEY = "error.auth.login_cancelled";
const AUTH_LOGIN_FAILED_KEY = "error.auth.login_failed";

function toAuthErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const message = err.message?.trim();
    if (!message) return AUTH_LOGIN_FAILED_KEY;
    const normalized = message.toLowerCase();
    if (normalized === "login was cancelled" || normalized === "login was canceled") {
      return AUTH_LOGIN_CANCELLED_KEY;
    }
    return message;
  }
  return AUTH_LOGIN_CANCELLED_KEY;
}

type AuthHook = {
  auth: AuthState;
  startLogin: () => Promise<void>;
  logout: () => Promise<void>;
  markExpired: () => Promise<void>;
};

export function useAuth(): AuthHook {
  const [auth, setAuth] = useState<AuthState>({ status: "idle" });

  const loadSession = async () => {
    const session = await window.electronAPI.auth.session();
    if (!session?.accessToken) {
      setAuth({ status: "idle" });
      return;
    }
    setAuth({
      status: "ok",
    });
  };

  useEffect(() => {
    loadSession();
  }, []);

  const startLogin = async () => {
    setAuth({ status: "pending" });
    try {
      await window.electronAPI.auth.login();
      setAuth({
        status: "ok",
      });
    } catch (err) {
      setAuth({
        status: "error",
        message: toAuthErrorMessage(err),
      });
    }
  };

  const logout = async () => {
    await window.electronAPI.auth.logout();
    setAuth({ status: "idle" });
  };

  const markExpired = async () => {
    // Clear the dead token server-side, but keep the dashboard mounted by moving
    // to a distinct "expired" state instead of "idle". Never stomps an in-flight
    // re-login (pending) or an already-expired state.
    await window.electronAPI.auth.logout();
    setAuth((prev) =>
      prev.status === "pending" || prev.status === "expired" ? prev : { status: "expired" },
    );
  };

  return {
    auth,
    startLogin,
    logout,
    markExpired,
  };
}
