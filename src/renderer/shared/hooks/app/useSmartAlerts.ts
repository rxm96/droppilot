import { useCallback, useRef } from "react";

type SmartAlertSettings = {
  enabled: boolean;
  notifyWhileFocused: boolean;
};

type AlertPayload = {
  key: string;
  title: string;
  body?: string;
  dedupeMs?: number;
  force?: boolean;
};

export function useSmartAlerts(settings: SmartAlertSettings) {
  const lastSentRef = useRef(new Map<string, number>());

  const canNotify = useCallback(() => {
    if (!settings.enabled) return false;
    if (settings.notifyWhileFocused) return true;
    if (typeof document === "undefined") return true;
    return !document.hasFocus();
  }, [settings.enabled, settings.notifyWhileFocused]);

  const notify = useCallback(
    (payload: AlertPayload) => {
      if (!payload.force && !canNotify()) return;
      const api = window.electronAPI?.app?.notify;
      if (!api) return;
      const now = Date.now();
      const last = lastSentRef.current.get(payload.key) ?? 0;
      const dedupeMs = payload.dedupeMs ?? 60_000;
      if (dedupeMs > 0 && now - last < dedupeMs) return;
      lastSentRef.current.set(payload.key, now);
      void api({ title: payload.title, body: payload.body });
    },
    [canNotify],
  );

  return { notify };
}
