import type { ProfileState } from "@renderer/shared/types";

export type AccountRowState = {
  name: string | null;
  statusKey:
    | "settings.account.connected"
    | "settings.account.notConnected"
    | "settings.account.demo";
  action: "logout" | "login" | "none";
};

/**
 * What the settings account row shows: name, status line and which account button.
 *
 * Demo mode shows the demo profile, as the nav does, and no account button: signing in or
 * out has no visible effect while demo data is shown (and sign out would end a real session
 * the row does not name). The buttons come back once demo mode is off.
 */
export function accountRowState(input: {
  isLinked: boolean;
  demoMode: boolean;
  profile: ProfileState;
}): AccountRowState {
  const ready = input.profile.status === "ready" ? input.profile.displayName : null;
  if (input.demoMode) return { name: ready, statusKey: "settings.account.demo", action: "none" };
  const name = input.isLinked ? ready : null;
  return input.isLinked
    ? { name, statusKey: "settings.account.connected", action: "logout" }
    : { name, statusKey: "settings.account.notConnected", action: "login" };
}
