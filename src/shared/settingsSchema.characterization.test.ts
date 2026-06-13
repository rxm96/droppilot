import { describe, expect, it } from "vitest";
import { applySettingsPatch, normalizeSettings, SETTINGS_DEFAULTS } from "./settingsSchema";

/**
 * Characterization of the LEGACY src/main/core/settings.ts normalization.
 * Each fixture is a realistic settings.json payload; each expectation is what
 * the legacy loadSettings()/persistSettings() produced for it. Derived from the
 * legacy code at the time of the refactor — do NOT "fix" expectations to make
 * the schema pass; fix the schema.
 */
describe("characterization: legacy loadSettings equivalence", () => {
  it("empty file object → exact legacy defaults", () => {
    expect(normalizeSettings({})).toEqual({
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
      webhookEnabled: false,
      webhookUrl: "",
      webhookDropClaimed: true,
      webhookWatchError: true,
      webhookDropEndingSoon: false,
      webhookAutoSwitch: false,
      webhookNewDrops: false,
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

  it("legacy pre-channel file (betaUpdates era) migrates to preview", () => {
    const legacyFile = {
      priorityGames: ["Rust", "PUBG: BATTLEGROUNDS"],
      obeyPriority: true,
      language: "en",
      betaUpdates: true,
      autoClaim: false,
    };
    const result = normalizeSettings(legacyFile);
    expect(result.priorityGames).toEqual(["Rust", "PUBG: BATTLEGROUNDS"]);
    expect(result.obeyPriority).toBe(true);
    expect(result.language).toBe("en");
    expect(result.updateChannel).toBe("preview");
    expect(result.autoClaim).toBe(false);
    expect("betaUpdates" in result).toBe(false);
  });

  it("hand-edited file with wrong types falls back field-by-field", () => {
    const mangled = {
      priorityGames: { 0: "Rust" },
      obeyPriority: "yes",
      language: "EN",
      autoStart: 1,
      refreshMinMs: "3600000",
      refreshMaxMs: 4_000_000,
      alertsDropEndingMinutes: -5,
      theme: "dark",
      accent: "#22ccff",
      fontPair: 7,
      uiPrefsMigrated: "true",
      windowBounds: { x: 100, y: 100, width: 1280, height: 720, isMaximized: true },
    };
    const result = normalizeSettings(mangled);
    expect(result.priorityGames).toEqual([]);
    expect(result.obeyPriority).toBe(false);
    expect(result.language).toBe("de"); // legacy: only exactly "en" switches
    expect(result.autoStart).toBe(false);
    // min invalid → default 3.6M; pair stays 3.6M/4.0M after clamping:
    expect(result.refreshMinMs).toBe(3_600_000);
    expect(result.refreshMaxMs).toBe(4_000_000);
    expect(result.alertsDropEndingMinutes).toBe(5);
    expect(result.theme).toBe("dark");
    expect(result.accent).toBe("#22ccff");
    expect(result.fontPair).toBe("pro-console");
    expect(result.uiPrefsMigrated).toBe(false); // legacy: `=== true` check
    expect(result.windowBounds).toEqual({
      x: 100,
      y: 100,
      width: 1280,
      height: 720,
      isMaximized: true,
    });
  });

  it("full modern file passes through unchanged", () => {
    const modern = {
      priorityGames: ["Apex Legends"],
      excludeGames: [],
      obeyPriority: true,
      language: "en",
      autoStart: true,
      autoClaim: true,
      autoSelect: false,
      autoSwitch: true,
      warmupEnabled: false,
      updateChannel: "preview",
      refreshMinMs: 3_600_000,
      refreshMaxMs: 5_000_000,
      demoMode: false,
      debugEnabled: true,
      alertsEnabled: true,
      alertsNotifyWhileFocused: true,
      alertsDropClaimed: false,
      alertsDropEndingSoon: true,
      alertsDropEndingMinutes: 15,
      alertsWatchError: true,
      alertsAutoSwitch: false,
      alertsNewDrops: true,
      webhookEnabled: false,
      webhookUrl: "",
      webhookDropClaimed: true,
      webhookWatchError: true,
      webhookDropEndingSoon: false,
      webhookAutoSwitch: false,
      webhookNewDrops: false,
      enableBadgesEmotes: true,
      allowUnlinkedGames: true,
      closeToTray: false,
      minimizeToTray: true,
      theme: "light",
      accent: "#ff5500",
      fontPair: "humanist",
      uiPrefsMigrated: true,
      windowBounds: { x: 0, y: 0, width: 1024, height: 768, isMaximized: false },
    };
    expect(normalizeSettings(modern)).toEqual(modern);
  });
});

describe("characterization: legacy persistSettings equivalence", () => {
  it("single-toggle patch (the most common save) only changes that key", () => {
    const next = applySettingsPatch(SETTINGS_DEFAULTS, { autoClaim: false });
    expect(next).toEqual({ ...SETTINGS_DEFAULTS, autoClaim: false });
  });

  it("legacy renderer pair-save (priorityGames + obeyPriority) behaves identically", () => {
    const next = applySettingsPatch(SETTINGS_DEFAULTS, {
      priorityGames: ["Rust"],
      obeyPriority: true,
    });
    expect(next.priorityGames).toEqual(["Rust"]);
    expect(next.obeyPriority).toBe(true);
  });

  it("automation reset patch restores exactly the legacy reset set", () => {
    const customized = {
      ...SETTINGS_DEFAULTS,
      autoClaim: false,
      autoSelect: false,
      autoSwitch: false,
      warmupEnabled: false,
      refreshMinMs: 4_000_000,
      refreshMaxMs: 6_000_000,
      demoMode: true,
      enableBadgesEmotes: true,
      allowUnlinkedGames: true,
      language: "en" as const, // not part of the reset set
    };
    const next = applySettingsPatch(customized, {
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
    expect(next).toEqual({ ...SETTINGS_DEFAULTS, language: "en" });
  });

  it("import path accepts a full legacy export including betaUpdates", () => {
    const pastedExport = {
      priorityGames: ["Rust"],
      obeyPriority: false,
      language: "de",
      betaUpdates: true,
      refreshMinMs: 1, // hand-tampered: must clamp to the 1h floor
      refreshMaxMs: 2,
      debugEnabled: true,
    };
    const next = applySettingsPatch(SETTINGS_DEFAULTS, pastedExport);
    expect(next.updateChannel).toBe("preview");
    expect(next.refreshMinMs).toBe(3_600_000);
    expect(next.refreshMaxMs).toBe(3_600_000);
    expect(next.debugEnabled).toBe(true);
    expect("betaUpdates" in next).toBe(false);
  });
});
