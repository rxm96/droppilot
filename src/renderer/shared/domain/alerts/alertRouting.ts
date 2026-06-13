export type AlertEventType =
  | "drop-claimed"
  | "drop-ending-soon"
  | "watch-error"
  | "auto-switch"
  | "new-drops";

export type AlertChannelToggles = Record<AlertEventType, boolean>;

export type AlertRoutingConfig = {
  // OS channel
  alertsEnabled: boolean;
  notifyWhileFocused: boolean;
  focused: boolean;
  osToggles: AlertChannelToggles;
  // Webhook channel (focus-agnostic, independent of the OS master)
  webhookEnabled: boolean;
  webhookUrlSet: boolean;
  webhookToggles: AlertChannelToggles;
};

/** Pure routing decision for one event type. Dedupe lives in the dispatcher. */
export function resolveAlertTargets(
  type: AlertEventType,
  config: AlertRoutingConfig,
): { os: boolean; webhook: boolean } {
  const os =
    config.alertsEnabled &&
    config.osToggles[type] &&
    (config.notifyWhileFocused || !config.focused);
  const webhook = config.webhookEnabled && config.webhookUrlSet && config.webhookToggles[type];
  return { os, webhook };
}
