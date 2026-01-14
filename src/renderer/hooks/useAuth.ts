import { useEffect, useState } from "react";
import type { AuthState } from "../types";

type AuthHook = {
  auth: AuthState;
  startLogin: () => Promise<void>;
  startLoginWithCreds: (creds: {
    username: string;
    password: string;
    token?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
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
        message: err instanceof Error ? err.message : "Login abgebrochen",
      });
    }
  };

  const startLoginWithCreds = async (creds: {
    username: string;
    password: string;
    token?: string;
  }) => {
    setAuth({ status: "pending" });
    try {
      await window.electronAPI.auth.loginCredentials({
        username: creds.username,
        password: creds.password,
        token: creds.token || undefined,
      });
      setAuth({
        status: "ok",
      });
    } catch (err) {
      setAuth({
        status: "error",
        message: err instanceof Error ? err.message : "Login abgebrochen",
      });
    }
  };

  const logout = async () => {
    await window.electronAPI.auth.logout();
    setAuth({ status: "idle" });
  };

  return {
    auth,
    startLogin,
    startLoginWithCreds,
    logout,
  };
}
