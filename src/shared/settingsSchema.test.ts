import { describe, expect, it } from "vitest";
import {
  AUTOMATION_RESET_KEYS,
  SETTINGS_DEFAULTS,
  SETTINGS_SCHEMA,
  applySettingsPatch,
  automationResetPatch,
  normalizeSettings,
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

  it("schema key order is the settings.json serialization contract", () => {
    expect(Object.keys(SETTINGS_SCHEMA)).toEqual([
      "priorityGames",
      "excludeGames",
      "obeyPriority",
      "language",
      "autoStart",
      "autoClaim",
      "autoSelect",
      "autoSwitch",
      "warmupEnabled",
      "updateChannel",
      "refreshMinMs",
      "refreshMaxMs",
      "demoMode",
      "debugEnabled",
      "alertsEnabled",
      "alertsNotifyWhileFocused",
      "alertsDropClaimed",
      "alertsDropEndingSoon",
      "alertsDropEndingMinutes",
      "alertsWatchError",
      "alertsAutoSwitch",
      "alertsNewDrops",
      "enableBadgesEmotes",
      "allowUnlinkedGames",
      "closeToTray",
      "minimizeToTray",
      "theme",
      "accent",
      "fontPair",
      "uiPrefsMigrated",
      "windowBounds",
    ]);
  });
});

describe("normalizeSettings (load path: fallback = default)", () => {
  it("non-object input yields all defaults", () => {
    expect(normalizeSettings(undefined)).toEqual(SETTINGS_DEFAULTS);
    expect(normalizeSettings(null)).toEqual(SETTINGS_DEFAULTS);
    expect(normalizeSettings("garbage")).toEqual(SETTINGS_DEFAULTS);
  });

  it("wrong-typed fields fall back to defaults, valid fields pass through", () => {
    const result = normalizeSettings({
      autoClaim: "yes",
      demoMode: true,
      language: "fr",
      priorityGames: "nope",
      theme: "blue",
      accent: 42,
    });
    expect(result.autoClaim).toBe(true); // default
    expect(result.demoMode).toBe(true); // valid input
    expect(result.language).toBe("de"); // default
    expect(result.priorityGames).toEqual([]); // default
    expect(result.theme).toBe(null); // default
    expect(result.accent).toBe(null); // default
  });

  it("legacy betaUpdates maps to the preview channel", () => {
    expect(normalizeSettings({ betaUpdates: true }).updateChannel).toBe("preview");
    expect(normalizeSettings({ betaUpdates: false }).updateChannel).toBe("stable");
    // Explicit valid channel wins over the legacy flag:
    expect(normalizeSettings({ updateChannel: "stable", betaUpdates: true }).updateChannel).toBe(
      "stable",
    );
    // Invalid channel + legacy flag → flag decides:
    expect(normalizeSettings({ updateChannel: "weird", betaUpdates: true }).updateChannel).toBe(
      "preview",
    );
  });

  it("clamps the refresh pair cross-field (min ≥ 1h, min ≤ max, max ≥ min)", () => {
    const low = normalizeSettings({ refreshMinMs: 1000, refreshMaxMs: 999_999_999 });
    expect(low.refreshMinMs).toBe(3_600_000);
    expect(low.refreshMaxMs).toBe(999_999_999);

    const inverted = normalizeSettings({ refreshMinMs: 7_200_000, refreshMaxMs: 3_600_000 });
    expect(inverted.refreshMinMs).toBe(3_600_000);
    expect(inverted.refreshMaxMs).toBe(3_600_000);

    const invalid = normalizeSettings({ refreshMinMs: "soon", refreshMaxMs: null });
    expect(invalid.refreshMinMs).toBe(3_600_000);
    expect(invalid.refreshMaxMs).toBe(4_200_000);
  });

  it("drops unknown keys", () => {
    const result = normalizeSettings({ futureFlag: true, autoClaim: false });
    expect("futureFlag" in result).toBe(false);
    expect(result.autoClaim).toBe(false);
  });

  it("never emits a betaUpdates key", () => {
    expect("betaUpdates" in normalizeSettings({ betaUpdates: true })).toBe(false);
  });
});

describe("applySettingsPatch (save path: fallback = current)", () => {
  const current = { ...SETTINGS_DEFAULTS, autoClaim: false, language: "en" as const };

  it("applies valid patch values and keeps everything else", () => {
    const next = applySettingsPatch(current, { demoMode: true });
    expect(next.demoMode).toBe(true);
    expect(next.autoClaim).toBe(false); // untouched
    expect(next.language).toBe("en"); // untouched
  });

  it("invalid patch values fall back to CURRENT, not default", () => {
    const next = applySettingsPatch(current, { autoClaim: "yes", language: 42 });
    expect(next.autoClaim).toBe(false); // current, NOT the default true
    expect(next.language).toBe("en"); // current, NOT the default "de"
  });

  it("keys explicitly set to undefined are treated as absent", () => {
    const withBounds = {
      ...current,
      windowBounds: { x: 1, y: 2, width: 800, height: 600, isMaximized: false },
    };
    const next = applySettingsPatch(withBounds, { windowBounds: undefined, autoClaim: undefined });
    expect(next.windowBounds).toEqual(withBounds.windowBounds);
    expect(next.autoClaim).toBe(false);
  });

  it("windowBounds: an INVALID present value clears the current bounds (legacy quirk)", () => {
    const withBounds = {
      ...current,
      windowBounds: { x: 1, y: 2, width: 800, height: 600, isMaximized: false },
    };
    const next = applySettingsPatch(withBounds, {
      windowBounds: { x: 0, y: 0, width: 10, height: 10, isMaximized: false },
    });
    expect(next.windowBounds).toBe(undefined);
  });

  it("updateChannel: an invalid string in the patch resolves to the DEFAULT, not current (legacy quirk)", () => {
    const onPreview = { ...SETTINGS_DEFAULTS, updateChannel: "preview" as const };
    expect(applySettingsPatch(onPreview, { updateChannel: "weird" }).updateChannel).toBe("stable");
    // Legacy flag still accepted on the patch path:
    expect(applySettingsPatch(SETTINGS_DEFAULTS, { betaUpdates: true }).updateChannel).toBe(
      "preview",
    );
    // Neither key present → current is kept:
    expect(applySettingsPatch(onPreview, { autoClaim: true }).updateChannel).toBe("preview");
    // Non-string channel without the flag → current is kept (legacy || condition):
    expect(applySettingsPatch(onPreview, { updateChannel: 42 }).updateChannel).toBe("preview");
  });

  it("clamps the refresh pair against patch-or-current values", () => {
    const next = applySettingsPatch(SETTINGS_DEFAULTS, { refreshMaxMs: 3_700_000 });
    expect(next.refreshMinMs).toBe(3_600_000);
    expect(next.refreshMaxMs).toBe(3_700_000);

    // Patch min above current max: min is clamped down to max.
    const inverted = applySettingsPatch(SETTINGS_DEFAULTS, { refreshMinMs: 9_999_999 });
    expect(inverted.refreshMinMs).toBe(4_200_000);
    expect(inverted.refreshMaxMs).toBe(4_200_000);
  });

  it("drops unknown keys instead of persisting them (deliberate delta vs legacy spread)", () => {
    const next = applySettingsPatch(SETTINGS_DEFAULTS, { futureFlag: true });
    expect("futureFlag" in next).toBe(false);
  });

  it("does not mutate the current object", () => {
    const before = JSON.parse(JSON.stringify(current));
    applySettingsPatch(current, { demoMode: true });
    expect(current).toEqual(before);
  });
});
