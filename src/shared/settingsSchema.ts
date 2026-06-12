import { DEFAULT_UPDATE_CHANNEL, UPDATE_CHANNELS, normalizeUpdateChannel } from "./updateChannels";

/**
 * Single source of truth for every persisted setting: key → default →
 * normalization. Both processes consume this module — main for load/persist,
 * the renderer for optimistic patches and response typing.
 *
 * A descriptor's `normalize(raw, fallback)` returns `raw` if acceptable,
 * otherwise `fallback`. The same descriptor serves both pipelines because only
 * the fallback differs: load falls back to the default, save falls back to the
 * current value (legacy `persistSettings` semantics).
 */
export type SettingDescriptor<T> = {
  default: T;
  normalize(raw: unknown, fallback: T): T;
};

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
};

const bool = (def: boolean): SettingDescriptor<boolean> => ({
  default: def,
  normalize: (raw, fallback) => (typeof raw === "boolean" ? raw : fallback),
});

const finiteNumber = (def: number): SettingDescriptor<number> => ({
  default: def,
  normalize: (raw, fallback) => (typeof raw === "number" && Number.isFinite(raw) ? raw : fallback),
});

/** Positive finite numbers clamped into [min, max]; everything else falls back. */
const clampedPositive = (def: number, min: number, max: number): SettingDescriptor<number> => ({
  default: def,
  normalize: (raw, fallback) =>
    typeof raw === "number" && Number.isFinite(raw) && raw > 0
      ? Math.min(max, Math.max(min, raw))
      : fallback,
});

const enumOf = <T extends string>(values: readonly T[], def: T): SettingDescriptor<T> => ({
  default: def,
  normalize: (raw, fallback) => (values.includes(raw as T) ? (raw as T) : fallback),
});

const nullableEnumOf = <T extends string>(values: readonly T[]): SettingDescriptor<T | null> => ({
  default: null,
  normalize: (raw, fallback) =>
    raw === null || values.includes(raw as T) ? (raw as T | null) : fallback,
});

const nullableString = (): SettingDescriptor<string | null> => ({
  default: null,
  normalize: (raw, fallback) => (typeof raw === "string" || raw === null ? raw : fallback),
});

const stringWithDefault = (def: string): SettingDescriptor<string> => ({
  default: def,
  normalize: (raw, fallback) => (typeof raw === "string" ? raw : fallback),
});

/** isArray check only — elements are deliberately NOT validated (legacy parity). */
const stringArray = (): SettingDescriptor<string[]> => ({
  default: [],
  normalize: (raw, fallback) => (Array.isArray(raw) ? (raw as string[]) : fallback),
});

const toWindowBounds = (raw: unknown): WindowBounds | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  const num = (val: unknown) => (typeof val === "number" && Number.isFinite(val) ? val : null);
  const x = num(candidate.x);
  const y = num(candidate.y);
  const width = num(candidate.width);
  const height = num(candidate.height);
  const isMaximized = typeof candidate.isMaximized === "boolean" ? candidate.isMaximized : false;
  if (x === null || y === null || width === null || height === null) return undefined;
  // Guard against degenerate bounds (e.g. 0x0 from a destroyed window snapshot)
  if (width < 200 || height < 200) return undefined;
  return { x, y, width, height, isMaximized };
};

const windowBoundsDescriptor = (): SettingDescriptor<WindowBounds | undefined> => ({
  default: undefined,
  // Deliberately ignores `fallback`: an invalid patch value CLEARS the
  // persisted bounds instead of keeping the current ones (legacy persist
  // semantics — degenerate bounds must never be restored).
  normalize: (raw) => toWindowBounds(raw),
});

// Key order matters: it is the JSON serialization order of settings.json and
// matches the legacy defaultSettings literal, keeping the file byte-compatible.
export const SETTINGS_SCHEMA = {
  priorityGames: stringArray(),
  excludeGames: stringArray(),
  obeyPriority: bool(false),
  language: enumOf(["de", "en"] as const, "de"),
  autoStart: bool(false),
  autoClaim: bool(true),
  autoSelect: bool(true),
  autoSwitch: bool(true),
  warmupEnabled: bool(true),
  updateChannel: enumOf(UPDATE_CHANNELS, DEFAULT_UPDATE_CHANNEL),
  refreshMinMs: finiteNumber(3_600_000),
  refreshMaxMs: finiteNumber(4_200_000),
  demoMode: bool(false),
  debugEnabled: bool(false),
  alertsEnabled: bool(true),
  alertsNotifyWhileFocused: bool(false),
  alertsDropClaimed: bool(true),
  alertsDropEndingSoon: bool(true),
  alertsDropEndingMinutes: clampedPositive(5, 1, 60),
  alertsWatchError: bool(true),
  alertsAutoSwitch: bool(true),
  alertsNewDrops: bool(true),
  enableBadgesEmotes: bool(false),
  allowUnlinkedGames: bool(false),
  closeToTray: bool(true),
  minimizeToTray: bool(false),
  theme: nullableEnumOf(["light", "dark"] as const),
  accent: nullableString(),
  fontPair: stringWithDefault("pro-console"),
  uiPrefsMigrated: bool(false),
  windowBounds: windowBoundsDescriptor(),
} satisfies Record<string, SettingDescriptor<unknown>>;

type SchemaShape = typeof SETTINGS_SCHEMA;

export type AppSettings = {
  [K in keyof SchemaShape]: SchemaShape[K] extends SettingDescriptor<infer T> ? T : never;
};

export type SettingKey = keyof AppSettings;

/** Renderer-facing setter signature (key ↔ value type enforced). */
export type SettingsSetter = <K extends SettingKey>(key: K, value: AppSettings[K]) => void;

/** Save payload: any subset of settings, plus the accepted legacy input key. */
export type SettingsSaveData = Partial<AppSettings> & { betaUpdates?: boolean };

// SETTING_KEYS preserves the schema declaration order — it IS the settings.json
// serialization contract; never sort or reorder it.
const SETTING_KEYS = Object.keys(SETTINGS_SCHEMA) as SettingKey[];

export const SETTINGS_DEFAULTS: AppSettings = Object.fromEntries(
  SETTING_KEYS.map((key) => [key, SETTINGS_SCHEMA[key].default]),
) as AppSettings;

export const AUTOMATION_RESET_KEYS = [
  "autoClaim",
  "autoSelect",
  "autoSwitch",
  "warmupEnabled",
  "refreshMinMs",
  "refreshMaxMs",
  "demoMode",
  "enableBadgesEmotes",
  "allowUnlinkedGames",
] as const satisfies readonly SettingKey[];

export const automationResetPatch = (): Partial<AppSettings> =>
  Object.fromEntries(
    AUTOMATION_RESET_KEYS.map((key) => [key, SETTINGS_DEFAULTS[key]]),
  ) as Partial<AppSettings>;

const MIN_REFRESH_MS = 3_600_000;

const asRecord = (raw: unknown): Record<string, unknown> =>
  raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

/**
 * Cross-field pass: the refresh pair is clamped together (min ≥ 1h, min ≤ max,
 * max ≥ min) — a per-key normalize cannot see its sibling. Exact port of the
 * legacy normalizeRefreshIntervals formula.
 */
const clampRefreshIntervals = (settings: AppSettings): AppSettings => {
  const clampedMin = Math.max(
    MIN_REFRESH_MS,
    Math.min(settings.refreshMinMs, settings.refreshMaxMs),
  );
  const clampedMax = Math.max(clampedMin, settings.refreshMaxMs);
  if (clampedMin === settings.refreshMinMs && clampedMax === settings.refreshMaxMs) {
    return settings;
  }
  return { ...settings, refreshMinMs: clampedMin, refreshMaxMs: clampedMax };
};

/**
 * Load path: per-key normalize with fallback = default, then the legacy
 * updateChannel/betaUpdates resolution (always runs on load), then the
 * cross-field clamp. Non-object input yields all defaults.
 */
export function normalizeSettings(raw: unknown): AppSettings {
  const source = asRecord(raw);
  const result = {} as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) {
    const descriptor = SETTINGS_SCHEMA[key] as SettingDescriptor<unknown>;
    result[key] = descriptor.normalize(source[key], descriptor.default);
  }
  const settings = result as AppSettings;
  settings.updateChannel = normalizeUpdateChannel(source.updateChannel, source.betaUpdates);
  return clampRefreshIntervals(settings);
}

/**
 * Save path: only keys PRESENT in the patch are applied, each normalized with
 * fallback = current[key] (an invalid patch value keeps the stored value).
 * Unknown keys are dropped. Two legacy quirks are preserved deliberately:
 * updateChannel resolves through normalizeUpdateChannel whenever the patch
 * carries a string channel OR a boolean betaUpdates (an invalid string thus
 * resolves to the default, not to current), and windowBounds' descriptor
 * ignores the fallback (invalid bounds clear the stored value).
 */
export function applySettingsPatch(current: AppSettings, patch: unknown): AppSettings {
  const source = asRecord(patch);
  const next: AppSettings = { ...current };
  for (const key of SETTING_KEYS) {
    if (source[key] === undefined) continue;
    const descriptor = SETTINGS_SCHEMA[key] as SettingDescriptor<unknown>;
    (next as Record<SettingKey, unknown>)[key] = descriptor.normalize(source[key], current[key]);
  }
  if (typeof source.updateChannel === "string" || typeof source.betaUpdates === "boolean") {
    next.updateChannel = normalizeUpdateChannel(source.updateChannel, source.betaUpdates);
  }
  return clampRefreshIntervals(next);
}
