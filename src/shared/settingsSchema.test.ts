import { describe, expect, it } from "vitest";
import {
  AUTOMATION_RESET_KEYS,
  SETTINGS_DEFAULTS,
  SETTINGS_SCHEMA,
  automationResetPatch,
} from "./settingsSchema";

describe("SETTINGS_SCHEMA descriptors", () => {
  it("bool: accepts booleans, falls back otherwise", () => {
    const d = SETTINGS_SCHEMA.autoClaim;
    expect(d.normalize(false, true)).toBe(false);
    expect(d.normalize(true, false)).toBe(true);
    expect(d.normalize("yes", true)).toBe(true);
    expect(d.normalize(undefined, false)).toBe(false);
    expect(d.normalize(1, false)).toBe(false);
  });

  it("enumOf (language): accepts members, falls back otherwise", () => {
    const d = SETTINGS_SCHEMA.language;
    expect(d.normalize("en", "de")).toBe("en");
    expect(d.normalize("fr", "de")).toBe("de");
    expect(d.normalize(42, "en")).toBe("en");
  });

  it("clamped positive number (alertsDropEndingMinutes): clamps valid, falls back on invalid or <= 0", () => {
    const d = SETTINGS_SCHEMA.alertsDropEndingMinutes;
    expect(d.normalize(10, 5)).toBe(10);
    expect(d.normalize(120, 5)).toBe(60);
    expect(d.normalize(0.5, 5)).toBe(1);
    expect(d.normalize(0, 5)).toBe(5);
    expect(d.normalize(-3, 5)).toBe(5);
    expect(d.normalize("10", 5)).toBe(5);
    expect(d.normalize(Number.NaN, 5)).toBe(5);
  });

  it("finiteNumber (refreshMinMs): accepts finite numbers only (clamping is cross-field, not here)", () => {
    const d = SETTINGS_SCHEMA.refreshMinMs;
    expect(d.normalize(1000, 3_600_000)).toBe(1000);
    expect(d.normalize(Number.POSITIVE_INFINITY, 3_600_000)).toBe(3_600_000);
    expect(d.normalize("1000", 3_600_000)).toBe(3_600_000);
  });

  it("nullableEnumOf (theme): accepts members and null, falls back otherwise", () => {
    const d = SETTINGS_SCHEMA.theme;
    expect(d.normalize("light", null)).toBe("light");
    expect(d.normalize(null, "dark")).toBe(null);
    expect(d.normalize("blue", null)).toBe(null);
    expect(d.normalize("blue", "dark")).toBe("dark");
  });

  it("nullableString (accent): accepts strings and null, falls back otherwise", () => {
    const d = SETTINGS_SCHEMA.accent;
    expect(d.normalize("#ff0000", null)).toBe("#ff0000");
    expect(d.normalize(null, "#ff0000")).toBe(null);
    expect(d.normalize(42, "#ff0000")).toBe("#ff0000");
  });

  it("stringArray (priorityGames): isArray check only, no element filtering (equivalence over strictness)", () => {
    const d = SETTINGS_SCHEMA.priorityGames;
    expect(d.normalize(["a", "b"], [])).toEqual(["a", "b"]);
    expect(d.normalize("nope", ["x"])).toEqual(["x"]);
    // Deliberate: elements are NOT validated (matches legacy behavior).
    expect(d.normalize([1, "b"], [])).toEqual([1, "b"]);
  });

  it("windowBounds: invalid shapes normalize to undefined REGARDLESS of fallback (legacy clear-on-invalid)", () => {
    const d = SETTINGS_SCHEMA.windowBounds;
    const valid = { x: 10, y: 20, width: 800, height: 600, isMaximized: false };
    expect(d.normalize(valid, undefined)).toEqual(valid);
    // Degenerate bounds (< 200px) are rejected:
    expect(d.normalize({ x: 0, y: 0, width: 100, height: 600, isMaximized: false }, valid)).toBe(
      undefined,
    );
    // Wrong shape is rejected even with a valid fallback — fallback is IGNORED here:
    expect(d.normalize({ x: "a" }, valid)).toBe(undefined);
    expect(d.normalize(undefined, valid)).toBe(undefined);
    // isMaximized defaults to false when not a boolean:
    expect(
      d.normalize({ x: 1, y: 2, width: 300, height: 300, isMaximized: "yes" }, undefined),
    ).toEqual({ x: 1, y: 2, width: 300, height: 300, isMaximized: false });
  });

  it("SETTINGS_DEFAULTS matches the legacy defaultSettings values", () => {
    expect(SETTINGS_DEFAULTS).toEqual({
      priorityGames: [],
      excludeGames: [],
      obeyPriority: false,
      language: "de",
      autoStart: false,
      autoClaim: true,
      autoSelect: true,
      autoSwitch: true,
      warmupEnabled: true,
      updateChannel: "stable",
      refreshMinMs: 3_600_000,
      refreshMaxMs: 4_200_000,
      demoMode: false,
      debugEnabled: false,
      alertsEnabled: true,
      alertsNotifyWhileFocused: false,
      alertsDropClaimed: true,
      alertsDropEndingSoon: true,
      alertsDropEndingMinutes: 5,
      alertsWatchError: true,
      alertsAutoSwitch: true,
      alertsNewDrops: true,
      enableBadgesEmotes: false,
      allowUnlinkedGames: false,
      closeToTray: true,
      minimizeToTray: false,
      theme: null,
      accent: null,
      fontPair: "pro-console",
      uiPrefsMigrated: false,
      windowBounds: undefined,
    });
  });

  it("automationResetPatch picks exactly the reset keys with their defaults", () => {
    expect(AUTOMATION_RESET_KEYS).toEqual([
      "autoClaim",
      "autoSelect",
      "autoSwitch",
      "warmupEnabled",
      "refreshMinMs",
      "refreshMaxMs",
      "demoMode",
      "enableBadgesEmotes",
      "allowUnlinkedGames",
    ]);
    expect(automationResetPatch()).toEqual({
      autoClaim: true,
      autoSelect: true,
      autoSwitch: true,
      warmupEnabled: true,
      refreshMinMs: 3_600_000,
      refreshMaxMs: 4_200_000,
      demoMode: false,
      enableBadgesEmotes: false,
      allowUnlinkedGames: false,
    });
  });
});
