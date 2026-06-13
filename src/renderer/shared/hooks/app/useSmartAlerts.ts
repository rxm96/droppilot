import { useCallback, useRef } from "react";
import {
  resolveAlertTargets,
  type AlertChannelToggles,
  type AlertEventType,
} from "@renderer/shared/domain/alerts/alertRouting";
import { buildDiscordPayload } from "@renderer/shared/domain/alerts/discordPayload";

export type SmartAlertsConfig = {
  alertsEnabled: boolean;
  notifyWhileFocused: boolean;
  osToggles: AlertChannelToggles;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookToggles: AlertChannelToggles;
};

type AlertPayload = {
  /** Omitted only for the forced OS test alert. */
  type?: AlertEventType;
  key: string;
  title: string;
  body?: string;
  dedupeMs?: number;
  force?: boolean;
};

/** Returns true (and records the send) when the key is outside its dedupe window. */
function passesDedupe(
  map: Map<string, number>,
  key: string,
  dedupeMs: number,
  now: number,
): boolean {
  const last = map.get(key) ?? 0;
  if (dedupeMs > 0 && now - last < dedupeMs) return false;
  map.set(key, now);
  return true;
}

export function useSmartAlerts(config: SmartAlertsConfig) {
  const configRef = useRef(config);
  configRef.current = config;
  const osLastSent = useRef(new Map<string, number>());
  const webhookLastSent = useRef(new Map<string, number>());

  const notify = useCallback((payload: AlertPayload) => {
    const cfg = configRef.current;
    const now = Date.now();
    const dedupeMs = payload.dedupeMs ?? 60_000;

    // Forced OS test alert: OS only, bypass routing + focus (keeps existing behavior).
    if (payload.force) {
      if (passesDedupe(osLastSent.current, payload.key, dedupeMs, now)) {
        void window.electronAPI?.app?.notify?.({ title: payload.title, body: payload.body });
      }
      return;
    }
    if (!payload.type) return;

    const focused = typeof document === "undefined" ? true : document.hasFocus();
    const targets = resolveAlertTargets(payload.type, {
      alertsEnabled: cfg.alertsEnabled,
      notifyWhileFocused: cfg.notifyWhileFocused,
      focused,
      osToggles: cfg.osToggles,
      webhookEnabled: cfg.webhookEnabled,
      webhookUrlSet: Boolean(cfg.webhookUrl),
      webhookToggles: cfg.webhookToggles,
    });

    if (targets.os && passesDedupe(osLastSent.current, payload.key, dedupeMs, now)) {
      void window.electronAPI?.app?.notify?.({ title: payload.title, body: payload.body });
    }

    if (targets.webhook && passesDedupe(webhookLastSent.current, payload.key, dedupeMs, now)) {
      const discordBody = buildDiscordPayload({
        type: payload.type,
        title: payload.title,
        body: payload.body,
        timestampIso: new Date(now).toISOString(),
      });
      void window.electronAPI?.webhook?.send?.(cfg.webhookUrl, discordBody);
    }
  }, []);

  return { notify };
}
