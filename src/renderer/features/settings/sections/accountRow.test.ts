import { describe, expect, it } from "vitest";
import { demoProfile } from "@renderer/shared/demoData";
import type { ProfileState } from "@renderer/shared/types";
import { accountRowState } from "./accountRow";

const ready: ProfileState = { status: "ready", displayName: "Pilot", login: "pilot" };

describe("accountRowState", () => {
  it("shows the signed-in profile with sign out", () => {
    expect(accountRowState({ isLinked: true, demoMode: false, profile: ready })).toEqual({
      name: "Pilot",
      statusKey: "settings.account.connected",
      action: "logout",
    });
  });

  it("has no name while the profile is still loading", () => {
    expect(
      accountRowState({ isLinked: true, demoMode: false, profile: { status: "loading" } }),
    ).toEqual({ name: null, statusKey: "settings.account.connected", action: "logout" });
  });

  it("offers sign in when signed out", () => {
    expect(
      accountRowState({ isLinked: false, demoMode: false, profile: { status: "idle" } }),
    ).toEqual({ name: null, statusKey: "settings.account.notConnected", action: "login" });
  });

  it("ignores a stale profile when signed out", () => {
    expect(accountRowState({ isLinked: false, demoMode: false, profile: ready }).name).toBeNull();
  });

  it("shows the demo profile in demo mode, like the nav, without an account button", () => {
    expect(accountRowState({ isLinked: false, demoMode: true, profile: demoProfile })).toEqual({
      name: "Demo Pilot",
      statusKey: "settings.account.demo",
      action: "none",
    });
  });

  it("keeps the demo row when a real account is signed in underneath", () => {
    expect(accountRowState({ isLinked: true, demoMode: true, profile: demoProfile })).toEqual({
      name: "Demo Pilot",
      statusKey: "settings.account.demo",
      action: "none",
    });
  });
});
