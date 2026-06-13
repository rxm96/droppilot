import { describe, expect, it } from "vitest";
import { resolveAlertTargets, type AlertRoutingConfig } from "./alertRouting";

const base: AlertRoutingConfig = {
  alertsEnabled: true,
  notifyWhileFocused: false,
  focused: false,
  osToggles: {
    "drop-claimed": true,
    "drop-ending-soon": true,
    "watch-error": true,
    "auto-switch": true,
    "new-drops": true,
  },
  webhookEnabled: true,
  webhookUrlSet: true,
  webhookToggles: {
    "drop-claimed": true,
    "drop-ending-soon": false,
    "watch-error": true,
    "auto-switch": false,
    "new-drops": false,
  },
};

describe("resolveAlertTargets", () => {
  it("routes to both channels when both enable the event", () => {
    expect(resolveAlertTargets("drop-claimed", base)).toEqual({ os: true, webhook: true });
  });

  it("webhook is focus-agnostic; OS is suppressed while focused (notifyWhileFocused off)", () => {
    const focused = { ...base, focused: true };
    expect(resolveAlertTargets("watch-error", focused)).toEqual({ os: false, webhook: true });
  });

  it("OS fires while focused when notifyWhileFocused is on", () => {
    const cfg = { ...base, focused: true, notifyWhileFocused: true };
    expect(resolveAlertTargets("watch-error", cfg).os).toBe(true);
  });

  it("respects independent per-event toggles", () => {
    expect(resolveAlertTargets("new-drops", base)).toEqual({ os: true, webhook: false });
    expect(resolveAlertTargets("auto-switch", base)).toEqual({ os: true, webhook: false });
  });

  it("OS master off disables OS only; webhook stays independent", () => {
    const cfg = { ...base, alertsEnabled: false };
    expect(resolveAlertTargets("drop-claimed", cfg)).toEqual({ os: false, webhook: true });
  });

  it("webhook master off disables webhook only", () => {
    const cfg = { ...base, webhookEnabled: false };
    expect(resolveAlertTargets("drop-claimed", cfg)).toEqual({ os: true, webhook: false });
  });

  it("webhook needs a URL set", () => {
    const cfg = { ...base, webhookUrlSet: false };
    expect(resolveAlertTargets("drop-claimed", cfg).webhook).toBe(false);
  });
});
