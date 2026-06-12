# Settings Pipeline Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 9-station hand-written settings pipeline with one descriptor schema in `src/shared/settingsSchema.ts` consumed by both processes, so adding a setting = one schema entry + one UI control.

**Architecture:** A pure descriptor schema (`{ default, normalize(raw, fallback) }` per key) derives the `AppSettings` type, defaults, and two pure functions — `normalizeSettings` (load, fallback=default) and `applySettingsPatch` (save, fallback=current). Main keeps its atomic-write/backup/queue infrastructure verbatim and swaps only the normalization blocks; the renderer store becomes one `useState<AppSettings>` + generic `saveSettings(patch)`/`setSetting(key, value)`, and the `useSettingsActions` ceremony layer is deleted. `settings.json` stays byte-compatible.

**Tech Stack:** TypeScript (mapped types over the schema), Vitest for pure functions, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-12-settings-pipeline-design.md` — read it first, especially "Decisions", "Behavior preservation", and "Planning amendments".

**Two PRs:**

- **PR 1** (Tasks 1–5), branch `refactor/settings-schema` (exists, based on `main` post-#51): schema + tests + characterization + main `settings.ts` migration + preload payload type. Renderer behavior code untouched.
- **PR 2** (Tasks 6–10), branch `refactor/settings-renderer`: requires **both** PR 1 and PR #52 (`refactor/useappmodel-watch-extraction`) in its base. Store rewrite, actions-layer deletion, `useAppModel`, SettingsView + sections.

**Conventions that gate CI:** run `npx prettier --write <files>` on every new/changed file before committing; `npm run lint` warnings are OK, errors are not; `npx tsc --noEmit -p tsconfig.json` must stay clean (CI runs it; `npm run build` does NOT typecheck). CI does not run on PRs — all verification is local.

---

## PR 1 — shared schema + main process

### Task 1: Descriptor helpers, schema object, derived types/defaults

**Files:**

- Create: `src/shared/settingsSchema.ts`
- Create: `src/shared/settingsSchema.test.ts`

- [ ] **Step 1: Write the failing test for descriptors + derived artifacts**

Create `src/shared/settingsSchema.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/settingsSchema.test.ts`
Expected: FAIL — `Cannot find module './settingsSchema'` (or equivalent resolve error).

- [ ] **Step 3: Write the schema module (descriptors + schema + derived artifacts only — pipeline functions come in Task 2)**

Create `src/shared/settingsSchema.ts`:

```ts
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
  normalize: (raw: unknown, fallback: T) => T;
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

// normalizeUpdateChannel is re-used by the pipeline functions added in Task 2.
// This export keeps TS from flagging it unused until then; Task 2 removes it.
export { normalizeUpdateChannel as __internalNormalizeUpdateChannel };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/shared/settingsSchema.test.ts`
Expected: PASS (all descriptor + defaults + reset-keys tests green).

- [ ] **Step 5: Typecheck, format, commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx prettier --write src/shared/settingsSchema.ts src/shared/settingsSchema.test.ts
git add src/shared/settingsSchema.ts src/shared/settingsSchema.test.ts
git commit -m "feat(settings): add descriptor schema with derived types and defaults"
```

---

### Task 2: `normalizeSettings` + `applySettingsPatch` (pipeline functions)

**Files:**

- Modify: `src/shared/settingsSchema.ts` (append functions, remove the temporary re-export)
- Modify: `src/shared/settingsSchema.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/settingsSchema.test.ts` (extend the import to include the two functions):

```ts
import {
  AUTOMATION_RESET_KEYS,
  SETTINGS_DEFAULTS,
  SETTINGS_SCHEMA,
  applySettingsPatch,
  automationResetPatch,
  normalizeSettings,
} from "./settingsSchema";
```

```ts
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
```

- [ ] **Step 2: Run the tests to verify the new blocks fail**

Run: `npx vitest run src/shared/settingsSchema.test.ts`
Expected: FAIL — `normalizeSettings is not a function` / export missing (Task 1 tests stay green).

- [ ] **Step 3: Implement the pipeline functions**

In `src/shared/settingsSchema.ts`, **delete** the temporary re-export line:

```ts
export { normalizeUpdateChannel as __internalNormalizeUpdateChannel };
```

and append:

```ts
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
```

Note: `windowBounds: undefined` in a patch is "absent" under the `source[key] === undefined`
check — matching the legacy `restData.windowBounds !== undefined` guard. The
`theme`/`accent` null values pass through because `null !== undefined`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared/settingsSchema.test.ts`
Expected: PASS — all blocks.

- [ ] **Step 5: Typecheck, format, commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx prettier --write src/shared/settingsSchema.ts src/shared/settingsSchema.test.ts
git add src/shared/settingsSchema.ts src/shared/settingsSchema.test.ts
git commit -m "feat(settings): add normalizeSettings/applySettingsPatch pipeline functions"
```

---

### Task 3: Characterization fixtures (old↔new equivalence proof)

These fixtures encode the **legacy** behavior of `src/main/core/settings.ts`
(`loadSettings` / `persistSettings`) as literal expectations. They are written and
committed BEFORE Task 4 deletes the legacy blocks — they are the project's
"prove no behavior change" evidence (CLAUDE.md). Expected values below were derived
by hand-executing the legacy code paths; if any assertion fails, the SCHEMA is wrong,
not the test — fix the descriptor, never the expectation.

**Files:**

- Create: `src/shared/settingsSchema.characterization.test.ts`

- [ ] **Step 1: Write the characterization tests (they must pass immediately against Task 2's implementation)**

Create `src/shared/settingsSchema.characterization.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the characterization suite**

Run: `npx vitest run src/shared/settingsSchema.characterization.test.ts`
Expected: PASS. If any case fails, STOP — re-read the legacy code path in
`src/main/core/settings.ts` for that field and fix the descriptor/pipeline in
`src/shared/settingsSchema.ts` (never the expectation), then re-run.

- [ ] **Step 3: Run the full suite, format, commit**

```bash
npm test
npx prettier --write src/shared/settingsSchema.characterization.test.ts
git add src/shared/settingsSchema.characterization.test.ts
git commit -m "test(settings): characterization fixtures pinning legacy load/persist behavior"
```

---

### Task 4: Migrate main `settings.ts` to the schema; fix preload's payload type

The file-I/O infrastructure (atomic write, backup mirror, corrupt recovery, write
queue) is load-bearing and stays **verbatim**. Only the normalization/merge blocks and
the local type definitions are replaced.

**Files:**

- Modify: `src/main/core/settings.ts` (full rewrite below — shrinks ~390 → ~120 lines)
- Modify: `src/preload/index.ts` (replace the local `SettingsPayload` type)
- Modify: `tsconfig.node.json` (one line — make the main-process typecheck runnable)

- [ ] **Step 0: Make the node tsconfig usable as a gate**

Discovered during Task 1 review: `npm run typecheck` covers ONLY `src/renderer`
(tsconfig.json); the main-process program (tsconfig.node.json) is gated by nothing —
and currently exits 2 on a TS5107 deprecation error (`moduleResolution=node10`),
before checking any code. From this task on, `src/main` imports the schema, so the
node program must be checkable. Add one line to the `compilerOptions` of
`tsconfig.node.json`:

```json
    "ignoreDeprecations": "6.0",
```

Then run `npx tsc --noEmit -p tsconfig.node.json`. **Reality (discovered on first
execution): exit 0 is NOT achievable** — un-gating the node program revealed 9
pre-existing type errors in unrelated main-process code (pinned list in Findings #2;
fixing them is the separate CI-gate task, NOT this refactor). The gate for this plan
is therefore **scoped**: the tsc output must contain ZERO errors referencing
`src/shared/settingsSchema.ts`, `src/main/core/settings.ts`, or
`src/preload/index.ts`, and no errors beyond the pinned Findings #2 list. (Before this
task's rewrite, settings.ts/preload contribute 2 errors via their renderer-i18n
imports — this task removes both.) Apply the same scoped reading wherever a
verification block below runs the node tsc.

- [ ] **Step 1: Rewrite `src/main/core/settings.ts`**

Replace the entire file content with:

```ts
import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  applySettingsPatch,
  normalizeSettings,
  type AppSettings,
  type SettingsSaveData,
} from "../../shared/settingsSchema";

// The schema (src/shared/settingsSchema.ts) is the single source of truth for
// keys, defaults, and normalization. This module only owns durable storage:
// atomic writes, the backup mirror, corrupt-primary recovery, and write
// serialization.
export type SettingsData = AppSettings;
export type { SettingsSaveData };

const settingsFile = join(app.getPath("userData"), "settings.json");
// Mirror of the last successfully-written settings. If the primary file is ever
// truncated/corrupted (e.g. a write interrupted by an update restart), load
// recovers from here instead of falling back to empty defaults — which a later
// save would otherwise persist over the real data.
const backupFile = join(app.getPath("userData"), "settings.bak.json");

// All writes flow through one promise chain so concurrent saves (window-bounds
// autosave + a settings toggle, etc.) can't interleave their read-modify-write.
let writeQueue: Promise<unknown> = Promise.resolve();
let tmpCounter = 0;

/**
 * Write atomically: write to a temp file, then rename over the target. rename
 * is atomic on the same volume (Windows + POSIX), so an interrupted or crashed
 * write never leaves a half-written, unparseable file behind.
 */
async function atomicWrite(file: string, contents: string): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const tmp = `${file}.${process.pid}.${++tmpCounter}.tmp`;
  await fs.writeFile(tmp, contents, "utf-8");
  await fs.rename(tmp, file);
}

type RawRead = { status: "ok"; raw: string } | { status: "missing" } | { status: "corrupt" };

async function readRawJson(file: string): Promise<RawRead> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return { status: "missing" };
    return { status: "corrupt" };
  }
  // An empty/whitespace file means a previous write was truncated mid-flight.
  if (!raw.trim()) return { status: "corrupt" };
  return { status: "ok", raw };
}

export async function loadSettings(): Promise<SettingsData> {
  let source = await readRawJson(settingsFile);
  if (source.status === "corrupt") {
    // Primary file is unreadable/truncated. Preserve it for forensics (best
    // effort) and recover from the backup rather than returning empty defaults
    // that a subsequent save would persist over the user's real data.
    await fs.rename(settingsFile, `${settingsFile}.corrupt`).catch(() => undefined);
    const backup = await readRawJson(backupFile);
    if (backup.status === "ok") {
      source = backup;
      await atomicWrite(settingsFile, backup.raw).catch(() => undefined);
    }
  }
  if (source.status !== "ok") return normalizeSettings(undefined);

  try {
    return normalizeSettings(JSON.parse(source.raw));
  } catch {
    return normalizeSettings(undefined);
  }
}

export async function saveSettings(data: SettingsSaveData): Promise<SettingsData> {
  // Serialize through the write queue so overlapping saves (e.g. window-bounds
  // autosave racing a settings toggle) can't interleave their read-modify-write.
  const run = writeQueue.then(() => persistSettings(data));
  writeQueue = run.catch(() => undefined);
  return run;
}

async function persistSettings(data: SettingsSaveData): Promise<SettingsData> {
  const current = await loadSettings();
  const next = applySettingsPatch(current, data);
  const serialized = JSON.stringify(next, null, 2);
  await atomicWrite(settingsFile, serialized);
  // Mirror to the backup so a future corrupt primary can be recovered.
  await atomicWrite(backupFile, serialized).catch(() => undefined);
  return next;
}

export async function exportSettings(): Promise<SettingsData> {
  return loadSettings();
}

export async function importSettings(payload: SettingsSaveData): Promise<SettingsData> {
  // Reuse the same merge/validation logic as saveSettings
  return saveSettings(payload);
}
```

Why this is behavior-identical: `normalizeSettings(undefined)` returns the full
defaults object (legacy `{ ...defaultSettings }`); the schema declares keys in the
legacy `defaultSettings` literal order, so `JSON.stringify(next, null, 2)` emits the
same key order and the file stays byte-compatible; `JSON.stringify` drops the
`windowBounds: undefined` entry exactly like the legacy optional property. The
consumers in `src/main/ipc/index.ts` and `src/main/index.ts` import
`loadSettings`/`saveSettings`/`exportSettings`/`importSettings`/`SettingsData`/
`SettingsSaveData` — all still exported with identical signatures, so **zero changes**
in those files. Note the legacy renderer-`Language` import from
`../../renderer/i18n` is gone (layering fix).

- [ ] **Step 2: Typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: clean typecheck, all tests PASS (characterization suite now guards the swap).

- [ ] **Step 3: Replace preload's `SettingsPayload`**

In `src/preload/index.ts`:

Delete the import line:

```ts
import type { Language } from "../renderer/shared/i18n";
```

Add to the imports:

```ts
import type { SettingsSaveData } from "../shared/settingsSchema";
```

Delete the whole local type (lines ~5–34):

```ts
type SettingsPayload = {
  priorityGames?: string[];
  // ... all fields ...
  uiPrefsMigrated?: boolean;
};
```

And change the two usages in the `settings` block:

```ts
  settings: {
    get: () => ipcRenderer.invoke("settings/get"),
    save: (payload: SettingsSaveData) => ipcRenderer.invoke("settings/save", payload),
    export: () => ipcRenderer.invoke("settings/export"),
    import: (payload: SettingsSaveData) => ipcRenderer.invoke("settings/import", payload),
  },
```

Do NOT add return types to the invoke calls yet — the legacy `useSettingsStore` reads
`res.betaUpdates` from the (currently untyped) response, and typing the returns as
`AppSettings` here would break the renderer typecheck. Return types land in PR 2 /
Task 7 together with the store rewrite.

If `Language` is referenced anywhere else in `src/preload/index.ts` (it is not, at the
time of writing), leave its import in place — verify with:
`npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 4: Verify, format, commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.node.json
npm test
npx prettier --write src/main/core/settings.ts src/preload/index.ts tsconfig.node.json
git add src/main/core/settings.ts src/preload/index.ts tsconfig.node.json
git commit -m "refactor(settings): drive main settings persistence from the shared schema"
```

---

### Task 5: PR 1 verification + PR

- [ ] **Step 1: Full local gate (CI does not run on PRs — this IS the gate)**

```bash
npm run lint
npm run format:check
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.node.json
npm test
npm run build
```

Expected: lint exits 0 (warnings allowed), format clean, both tsc programs clean, all tests pass, build succeeds.

- [ ] **Step 2: Behavioral smoke (main process)**

Run `npm run dev`, then in the app: toggle any setting (e.g. Auto-Claim) → quit →
inspect `%APPDATA%/droppilot/settings.json` (userData dir) → confirm the toggle
persisted, key order looks unchanged, and `settings.bak.json` mirrors it. Relaunch and
confirm the toggle state survived.

- [ ] **Step 3: Update the plan checkboxes, then hand off**

Mark Tasks 1–5 complete in this file, commit the plan update
(`docs(settings): check off PR 1 tasks`), then use the
**superpowers:finishing-a-development-branch** skill to create the PR for
`refactor/settings-schema` → `main`. PR description: link the spec, mention the two
deliberate behavior deltas (unknown-key dropping; import drift-bug fix lands in PR 2)
and the characterization suite as the equivalence proof.

---

## PR 2 — renderer vertical

### Task 6: Branch setup for PR 2

PR 2 needs **both** PR 1 (schema) and PR #52 (`refactor/useappmodel-watch-extraction`,
the extracted-hooks `useAppModel`) in its base. The `useAppModel` edits in Tasks 7–8
quote the **PR #52 shape** of the file (~700 lines, `useWatchEngine()` etc.).

- [ ] **Step 1: Create the branch from the right base**

Check merge state: `git log --oneline -5 main` and `gh pr view 52 --json state`.

- If PR #52 is already merged into `main`: rebase `refactor/settings-schema` onto
  `main` if needed, then `git checkout refactor/settings-schema && git checkout -b refactor/settings-renderer`.
- If PR #52 is still open:
  `git checkout refactor/settings-schema && git checkout -b refactor/settings-renderer && git merge refactor/useappmodel-watch-extraction`
  (settings-layer files are identical on both sides — expect no conflicts; if the
  merge does conflict, stop and resolve with the #52 side for watch files).

- [ ] **Step 2: Sanity-check the base**

```bash
npx tsc --noEmit -p tsconfig.json && npm test
```

Both must be green before starting Task 7. Also confirm the base has the extracted
hooks: `git grep -n "useWatchEngine" src/renderer/shared/hooks/app/useAppModel.ts`
must return a match.

---

### Task 7: Store rewrite + renderer plumbing (one compiling unit)

This task rewrites `useSettingsStore`, deletes `useSettingsActions`, slims
`useAppActions`, and rewires `useAppModel` — but keeps `settingsProps` in its **flat
legacy shape** (built from inline `setSetting` arrows), so `SettingsView`/sections/
`App.tsx` compile untouched. The object-shape migration is Task 8.

**Files:**

- Rewrite: `src/renderer/shared/hooks/app/useSettingsStore.ts`
- Delete: `src/renderer/shared/hooks/app/useSettingsActions.ts`
- Rewrite: `src/renderer/shared/hooks/app/useAppActions.ts`
- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (PR #52 shape)
- Modify: `src/renderer/shared/hooks/app/index.ts` (barrel)
- Modify: `src/preload/index.ts` (now add the return types)

- [ ] **Step 1: Rewrite `src/renderer/shared/hooks/app/useSettingsStore.ts`**

Replace the entire file content with:

```ts
import { useCallback, useEffect, useState } from "react";
import {
  SETTINGS_DEFAULTS,
  applySettingsPatch,
  automationResetPatch,
  normalizeSettings,
  type AppSettings,
  type SettingKey,
  type SettingsSetter,
} from "../../../../shared/settingsSchema";

type SettingsHook = {
  settings: AppSettings;
  /** Persist any subset of settings. Optimistic local apply, then canonical response. */
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** Typed single-key sugar over saveSettings (fire-and-forget). */
  setSetting: SettingsSetter;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => Promise<void>;
  importSettings: () => Promise<void>;
  settingsInfo: string | null;
  settingsError: string | null;
};

const toErrorMessage = (err: unknown, fallbackKey: string): string => {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallbackKey;
};

export function useSettingsStore(): SettingsHook {
  const [settings, setSettings] = useState<AppSettings>(SETTINGS_DEFAULTS);
  const [settingsJson, setSettingsJson] = useState<string>("");
  const [settingsInfo, setSettingsInfo] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Main's response is canonical (it merged against the on-disk state); the
  // defensive normalize types the IPC boundary and protects against a stale
  // main build. The JSON preview keeps the RAW response (incl. windowBounds).
  const applyResponse = useCallback((saved: unknown) => {
    setSettings(normalizeSettings(saved));
    setSettingsJson(JSON.stringify(saved, null, 2));
  }, []);

  useEffect(() => {
    void window.electronAPI.settings
      .get()
      .then((res) => applyResponse(res))
      .catch((err) => {
        console.error("settings load failed", err);
        setSettingsError(toErrorMessage(err, "error.settings.load_failed"));
      });
  }, [applyResponse]);

  const saveSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      setSettings((prev) => applySettingsPatch(prev, patch)); // optimistic
      try {
        const saved = await window.electronAPI.settings.save(patch);
        applyResponse(saved);
      } catch (err) {
        // Matches legacy behavior: the optimistic value stays, only the error
        // banner is raised (rollback would be a behavior change — see spec).
        setSettingsError(toErrorMessage(err, "error.settings.save_failed"));
      }
    },
    [applyResponse],
  );

  const setSetting = useCallback(
    <K extends SettingKey>(key: K, value: AppSettings[K]) => {
      void saveSettings({ [key]: value } as Partial<AppSettings>);
    },
    [saveSettings],
  );

  const setRefreshIntervals = useCallback(
    (minMs: number, maxMs: number) => {
      // Cross-field clamping happens inside applySettingsPatch/main.
      void saveSettings({ refreshMinMs: minMs, refreshMaxMs: maxMs });
    },
    [saveSettings],
  );

  const resetAutomation = useCallback(() => {
    void saveSettings(automationResetPatch());
  }, [saveSettings]);

  const exportSettings = useCallback(async () => {
    try {
      const res = await window.electronAPI.settings.export();
      const json = JSON.stringify(res, null, 2);
      setSettingsJson(json);
      setSettingsInfo("settings.info.exported");
      setSettingsError(null);
      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(json);
        } catch {
          // ignore clipboard failure
        }
      }
    } catch (err) {
      setSettingsError(toErrorMessage(err, "error.settings.export_failed"));
    }
  }, []);

  const importSettings = useCallback(async () => {
    try {
      const parsed: unknown = JSON.parse(settingsJson);
      const saved = await window.electronAPI.settings.import(parsed as Partial<AppSettings>);
      applyResponse(saved);
      setSettingsInfo("settings.info.imported");
      setSettingsError(null);
    } catch (err) {
      setSettingsError(toErrorMessage(err, "error.settings.import_failed"));
    }
  }, [applyResponse, settingsJson]);

  useEffect(() => {
    if (!settingsInfo && !settingsError) return;
    const id = window.setTimeout(() => {
      setSettingsInfo(null);
      setSettingsError(null);
    }, 8000);
    return () => window.clearTimeout(id);
  }, [settingsInfo, settingsError]);

  return {
    settings,
    saveSettings,
    setSetting,
    setRefreshIntervals,
    resetAutomation,
    settingsJson,
    setSettingsJson,
    exportSettings,
    importSettings,
    settingsInfo,
    settingsError,
  };
}
```

Notes: `selectedGame`/`newGame` are gone (they move to `useAppModel` in Step 4 — they
are transient priority-view UI state, not settings). The legacy import drift bug
(missing `setDebugEnabled` on import) is gone by construction — `applyResponse`
replaces the whole object. The three hand-written response-apply blocks are now one.

- [ ] **Step 2: Add the preload return types (deferred from PR 1)**

In `src/preload/index.ts`, extend the schema import and type the invoke returns:

```ts
import type { AppSettings, SettingsSaveData } from "../shared/settingsSchema";
```

```ts
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke("settings/get"),
    save: (payload: SettingsSaveData): Promise<AppSettings> =>
      ipcRenderer.invoke("settings/save", payload),
    export: (): Promise<AppSettings> => ipcRenderer.invoke("settings/export"),
    import: (payload: SettingsSaveData): Promise<AppSettings> =>
      ipcRenderer.invoke("settings/import", payload),
  },
```

- [ ] **Step 3: Delete the ceremony layer**

```bash
git rm src/renderer/shared/hooks/app/useSettingsActions.ts
```

In `src/renderer/shared/hooks/app/index.ts`, delete the line:

```ts
export * from "./useSettingsActions";
```

- [ ] **Step 4: Rewrite `src/renderer/shared/hooks/app/useAppActions.ts`**

Replace the entire file content with:

```ts
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { ChannelEntry, FilterKey } from "@renderer/shared/types";
import type { AppSettings } from "../../../../shared/settingsSchema";
import { usePriorityActions } from "@renderer/shared/hooks/priority";
import type { AppUpdateStatus } from "./useAppBootstrap";
import { useUpdateActions } from "./useUpdateActions";
import { useWatchingActions } from "@renderer/shared/hooks/watch";

type Params = {
  newGame: string;
  setNewGame: (val: string) => void;
  selectedGame: string;
  priorityGames: string[];
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
  setAutoSelectEnabled: (next: boolean) => void;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<void>;
  isLinked: boolean;
  logout: () => Promise<void>;
  onManualStartWatching?: (channel: ChannelEntry) => void;
  setUpdateStatus: Dispatch<SetStateAction<AppUpdateStatus>>;
  setFilter: (next: FilterKey) => void;
};

export function useAppActions({
  newGame,
  setNewGame,
  selectedGame,
  priorityGames,
  saveSettings,
  setWatchingFromChannel,
  clearWatching,
  setAutoSelectEnabled,
  fetchInventory,
  isLinked,
  logout,
  onManualStartWatching,
  setUpdateStatus,
  setFilter,
}: Params) {
  const savePriorityGames = useCallback(
    (list: string[]) => saveSettings({ priorityGames: list }),
    [saveSettings],
  );

  const priorityActions = usePriorityActions({
    newGame,
    setNewGame,
    selectedGame,
    priorityGames,
    setAutoSelectEnabled,
    savePriorityGames,
  });

  const watchingActions = useWatchingActions({
    setWatchingFromChannel,
    clearWatching,
    setAutoSelectEnabled,
    fetchInventory,
    isLinked,
    logout,
    onManualStartWatching,
  });

  const updateActions = useUpdateActions({ setUpdateStatus });

  const handleFilterChange = useCallback((key: FilterKey) => setFilter(key), [setFilter]);

  return {
    ...priorityActions,
    ...watchingActions,
    ...updateActions,
    handleFilterChange,
  };
}
```

(The legacy pair-save quirk — `savePriorityGames` co-sending `obeyPriority` — is
dropped per spec: the patch merge keeps untouched keys by definition.
`handleFilterChange` moves here from the deleted `useSettingsActions`; its consumer is
`inventoryProps.onFilterChange` in `useAppModel`.)

- [ ] **Step 5: Rewire `useAppModel.ts` (PR #52 shape) — store consumption**

Replace the store destructure (starts `const {` right after
`const [view, setView] = useState<View>("inventory");`, ends `} = useSettingsStore();`
— lines ~50–111 in the #52 shape) with:

```ts
const {
  settings,
  setSetting,
  saveSettings,
  setRefreshIntervals,
  resetAutomation,
  settingsJson,
  setSettingsJson,
  exportSettings,
  importSettings,
  settingsInfo,
  settingsError,
} = useSettingsStore();
const {
  priorityGames,
  obeyPriority,
  language,
  autoStart,
  autoClaim,
  autoSelect,
  autoSwitch,
  warmupEnabled,
  updateChannel,
  refreshMinMs,
  refreshMaxMs,
  demoMode,
  debugEnabled,
  alertsEnabled,
  alertsNotifyWhileFocused,
  alertsDropClaimed,
  alertsDropEndingSoon,
  alertsDropEndingMinutes,
  alertsWatchError,
  alertsAutoSwitch,
  alertsNewDrops,
  enableBadgesEmotes,
  allowUnlinkedGames,
  closeToTray,
  minimizeToTray,
} = settings;
const [selectedGame, setSelectedGame] = useState<string>("");
const [newGame, setNewGame] = useState<string>("");
```

Every downstream value reference keeps compiling unchanged — with ONE exception: the
old destructure exposed `autoSwitchEnabled`, the new one exposes `autoSwitch` (the
persisted name; spec "Planning amendments" #1). Fix the two subsystem call sites,
which keep their parameter name:

In the `useChannels({ ... })` call (~line 424 in the #52 shape), change:

```ts
    autoSwitchEnabled,
```

to:

```ts
    autoSwitchEnabled: autoSwitch,
```

In the `useDebugSnapshot({ ... })` call (~line 520), change:

```ts
    autoSwitchEnabled,
```

to:

```ts
    autoSwitchEnabled: autoSwitch,
```

- [ ] **Step 6: Rewire `useAppModel.ts` — actions call + priorityProps + settingsProps (interim flat shape)**

Replace the `useAppActions({ ... })` argument list (lines ~249–288 in the #52 shape;
the call starts `const actions = useAppActions({`) with:

```ts
const actions = useAppActions({
  newGame,
  setNewGame,
  selectedGame,
  priorityGames,
  saveSettings,
  setWatchingFromChannel,
  clearWatching,
  setAutoSelectEnabled,
  fetchInventory,
  isLinked,
  logout,
  onManualStartWatching: (channel) => {
    setManualWatchOverride({ at: Date.now(), game: channel.game });
  },
  setUpdateStatus,
  setFilter,
});
```

In `priorityProps`, change:

```ts
    setObeyPriority: actions.handleSetObeyPriority,
```

to:

```ts
    setObeyPriority: (val: boolean) => setSetting("obeyPriority", val),
```

Replace the whole `const settingsProps = { ... };` object (lines ~631–694 in the #52
shape) with this interim flat version (same outward shape, handlers now inline over
`setSetting` — SettingsView stays untouched until Task 8):

```ts
const settingsProps = {
  isLinked,
  onLogout: logout,
  onLogin: startLogin,
  theme,
  setTheme,
  accent,
  setAccent,
  fontPair,
  setFontPair,
  autoStart,
  setAutoStart: (val: boolean) => setSetting("autoStart", val),
  autoClaim,
  setAutoClaim: (val: boolean) => setSetting("autoClaim", val),
  autoSelect,
  setAutoSelect: (val: boolean) => setSetting("autoSelect", val),
  autoSwitchEnabled: autoSwitch,
  setAutoSwitchEnabled: (val: boolean) => setSetting("autoSwitch", val),
  warmupEnabled,
  setWarmupEnabled: (val: boolean) => setSetting("warmupEnabled", val),
  updateChannel,
  setUpdateChannel: (val: UpdateChannel) => setSetting("updateChannel", val),
  demoMode,
  setDemoMode: (val: boolean) => setSetting("demoMode", val),
  debugEnabled,
  setDebugEnabled: (val: boolean) => setSetting("debugEnabled", val),
  alertsEnabled,
  setAlertsEnabled: (val: boolean) => setSetting("alertsEnabled", val),
  alertsNotifyWhileFocused,
  setAlertsNotifyWhileFocused: (val: boolean) => setSetting("alertsNotifyWhileFocused", val),
  alertsDropClaimed,
  setAlertsDropClaimed: (val: boolean) => setSetting("alertsDropClaimed", val),
  alertsDropEndingSoon,
  setAlertsDropEndingSoon: (val: boolean) => setSetting("alertsDropEndingSoon", val),
  alertsDropEndingMinutes,
  setAlertsDropEndingMinutes: (val: number) => setSetting("alertsDropEndingMinutes", val),
  alertsWatchError,
  setAlertsWatchError: (val: boolean) => setSetting("alertsWatchError", val),
  alertsAutoSwitch,
  setAlertsAutoSwitch: (val: boolean) => setSetting("alertsAutoSwitch", val),
  alertsNewDrops,
  setAlertsNewDrops: (val: boolean) => setSetting("alertsNewDrops", val),
  enableBadgesEmotes,
  setEnableBadgesEmotes: (val: boolean) => setSetting("enableBadgesEmotes", val),
  allowUnlinkedGames,
  setAllowUnlinkedGames: (val: boolean) => setSetting("allowUnlinkedGames", val),
  closeToTray,
  setCloseToTray: (val: boolean) => setSetting("closeToTray", val),
  minimizeToTray,
  setMinimizeToTray: (val: boolean) => setSetting("minimizeToTray", val),
  sendTestAlert: handleTestAlert,
  refreshMinMs,
  refreshMaxMs,
  setRefreshIntervals,
  resetAutomation,
  language,
  setLanguage: (val: Language) => setSetting("language", val),
  settingsJson,
  setSettingsJson,
  exportSettings,
  importSettings,
  settingsInfo,
  settingsError,
  showUpdateCheck: isWindows,
  showAutoStart: isWindows,
  updateStatus,
  checkUpdates: actions.handleCheckUpdates,
  downloadUpdate: actions.handleDownloadUpdate,
  installUpdate: actions.handleInstallUpdate,
};
```

Import requirements for this step: `useAppModel.ts` already imports
`type { FilterKey, View }`; add the two types used by the inline handlers if not
already imported:

```ts
import type { Language } from "@renderer/shared/i18n";
import type { UpdateChannel } from "../../../../shared/updateChannels";
```

(Check the #52 file head first — if either import already exists, don't duplicate it.)

`alertsDropEndingMinutes` note: the legacy renderer `saveAlertsDropEndingMinutes`
rounded and clamped (`Math.min(60, Math.max(1, Math.round(val || 0) || 1))`) before
persisting. The schema clamps (1..60) on both the optimistic and main path but does
not round; `AlertsSection` already floors its input to an integer via
`Math.max(1, Number(e.target.value) || 1)`, so no fractional values reach the store.
This is behavior-equivalent for every reachable input.

- [ ] **Step 7: Typecheck, tests, lint sweep**

```bash
npx tsc --noEmit -p tsconfig.json
npm test
npm run lint
```

Expected: all clean. If tsc reports leftover references to deleted symbols
(`saveAutoClaim`, `handleSetX`, `useSettingsActions`), fix them per the mapping above
— do not re-introduce wrappers.

- [ ] **Step 8: Format + commit**

```bash
npx prettier --write src/renderer/shared/hooks/app/useSettingsStore.ts src/renderer/shared/hooks/app/useAppActions.ts src/renderer/shared/hooks/app/useAppModel.ts src/renderer/shared/hooks/app/index.ts src/preload/index.ts
git add -A
git commit -m "refactor(settings): schema-driven renderer store; delete useSettingsActions layer"
```

---

### Task 8: Object-shape `settingsProps` + SettingsView + sections + App.tsx

Now the flat pair list dies. `settingsProps` carries `settings` + `setSetting`; every
section reads `props.settings.X` and writes `props.setSetting("X", v)`.

**Files:**

- Modify: `src/renderer/shared/hooks/app/useAppModel.ts` (settingsProps + destructure prune)
- Modify: `src/renderer/features/settings/SettingsView.tsx`
- Modify: `src/renderer/features/settings/sections/GeneralSection.tsx`
- Modify: `src/renderer/features/settings/sections/EngineSection.tsx`
- Modify: `src/renderer/features/settings/sections/AppearanceSection.tsx`
- Modify: `src/renderer/features/settings/sections/UpdatesSection.tsx`
- Modify: `src/renderer/features/settings/sections/AlertsSection.tsx`
- Modify: `src/renderer/features/settings/sections/AccountSection.tsx`
- Modify: `src/renderer/features/settings/sections/AdvancedSection.tsx`
- Modify: `src/renderer/App.tsx` (settingsProps.refreshMinMs access)

- [ ] **Step 1: Final `settingsProps` in `useAppModel.ts`**

Replace the interim flat `const settingsProps = { ... };` from Task 7 with:

```ts
const settingsProps = {
  isLinked,
  onLogout: logout,
  onLogin: startLogin,
  settings,
  setSetting,
  theme,
  setTheme,
  accent,
  setAccent,
  fontPair,
  setFontPair,
  sendTestAlert: handleTestAlert,
  setRefreshIntervals,
  resetAutomation,
  settingsJson,
  setSettingsJson,
  exportSettings,
  importSettings,
  settingsInfo,
  settingsError,
  showUpdateCheck: isWindows,
  showAutoStart: isWindows,
  updateStatus,
  checkUpdates: actions.handleCheckUpdates,
  downloadUpdate: actions.handleDownloadUpdate,
  installUpdate: actions.handleInstallUpdate,
};
```

Then prune the `= settings` destructure from Task 7 Step 5: remove `autoStart`,
`updateChannel`, `closeToTray`, `minimizeToTray` (they were only consumed by the flat
settingsProps; `npx tsc --noEmit` flags them as unused locals if missed). Also remove
the `Language`/`UpdateChannel` type imports added for the interim handlers **if** they
are now unused (tsc will tell you).

- [ ] **Step 2: New `SettingsView.tsx` props + wiring**

Replace the `SettingsProps` type with:

```ts
import type { AppSettings, SettingsSetter } from "../../../shared/settingsSchema";

type SettingsProps = {
  isLinked: boolean;
  onLogout: () => void;
  onLogin: () => void;
  settings: AppSettings;
  setSetting: SettingsSetter;
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  accent: string | null;
  setAccent: (val: string | null) => void;
  fontPair: import("@renderer/shared/fontPairs").FontPairId;
  setFontPair: (val: import("@renderer/shared/fontPairs").FontPairId) => void;
  sendTestAlert: () => void;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => void;
  importSettings: () => void;
  settingsInfo?: string | null;
  settingsError?: string | null;
  showUpdateCheck?: boolean;
  showAutoStart?: boolean;
  checkUpdates?: () => void;
  downloadUpdate?: () => void;
  installUpdate?: () => void;
  updateStatus?: {
    state:
      | "idle"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "none"
      | "error"
      | "unsupported";
    message?: string;
    version?: string;
    progress?: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
  };
};
```

(`UpdateChannel` import becomes unused in this file — remove it. The `updateStatus`
object type is unchanged, keep it verbatim.)

Replace the section wiring inside `<main>` with:

```tsx
{
  active === "general" && (
    <GeneralSection
      settings={props.settings}
      setSetting={props.setSetting}
      sendTestAlert={props.sendTestAlert}
    />
  );
}
{
  active === "engine" && (
    <EngineSection
      settings={props.settings}
      setSetting={props.setSetting}
      showAutoStart={props.showAutoStart}
      setRefreshIntervals={props.setRefreshIntervals}
      resetAutomation={props.resetAutomation}
    />
  );
}
{
  active === "appearance" && (
    <AppearanceSection
      theme={props.theme}
      setTheme={props.setTheme}
      accent={props.accent}
      setAccent={props.setAccent}
      fontPair={props.fontPair}
      setFontPair={props.setFontPair}
      settings={props.settings}
      setSetting={props.setSetting}
    />
  );
}
{
  active === "updates" && props.showUpdateCheck && (
    <UpdatesSection
      settings={props.settings}
      setSetting={props.setSetting}
      updateStatus={props.updateStatus}
      checkUpdates={props.checkUpdates}
      downloadUpdate={props.downloadUpdate}
      installUpdate={props.installUpdate}
    />
  );
}
{
  active === "alerts" && <AlertsSection settings={props.settings} setSetting={props.setSetting} />;
}
{
  active === "account" && (
    <AccountSection
      isLinked={props.isLinked}
      onLogout={props.onLogout}
      onLogin={props.onLogin}
      settings={props.settings}
      setSetting={props.setSetting}
    />
  );
}
{
  active === "advanced" && (
    <AdvancedSection
      settings={props.settings}
      setSetting={props.setSetting}
      settingsJson={props.settingsJson}
      setSettingsJson={props.setSettingsJson}
      exportSettings={props.exportSettings}
      importSettings={props.importSettings}
      settingsInfo={props.settingsInfo}
      settingsError={props.settingsError}
    />
  );
}
```

- [ ] **Step 3: Migrate the seven sections**

Every section gets the same two imports (path from `sections/`):

```ts
import type { AppSettings, SettingsSetter } from "../../../../shared/settingsSchema";
```

**GeneralSection.tsx** — new props type:

```ts
export type GeneralSectionProps = {
  settings: AppSettings;
  setSetting: SettingsSetter;
  sendTestAlert: () => void;
};
```

Changed control lines:

```tsx
          <Select
            value={props.settings.language}
            onValueChange={(v) => props.setSetting("language", v as "de" | "en")}
          >
```

```tsx
        control={
          <SettingsToggle
            checked={props.settings.demoMode}
            onChange={(v) => props.setSetting("demoMode", v)}
          />
        }
```

**EngineSection.tsx** — new props type:

```ts
export type EngineSectionProps = {
  settings: AppSettings;
  setSetting: SettingsSetter;
  showAutoStart?: boolean;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
};
```

Changed control lines (the `!!`/optional-call guards drop — `settings` is always
present):

```tsx
<SettingsToggle
  checked={props.settings.autoStart}
  onChange={(v) => props.setSetting("autoStart", v)}
/>
```

```tsx
<SettingsToggle
  checked={props.settings.closeToTray}
  onChange={(v) => props.setSetting("closeToTray", v)}
/>
```

```tsx
<SettingsToggle
  checked={props.settings.minimizeToTray}
  onChange={(v) => props.setSetting("minimizeToTray", v)}
/>
```

```tsx
          control={
            <SettingsToggle
              checked={props.settings.autoClaim}
              onChange={(v) => props.setSetting("autoClaim", v)}
            />
          }
```

```tsx
          control={
            <SettingsToggle
              checked={props.settings.autoSelect}
              onChange={(v) => props.setSetting("autoSelect", v)}
            />
          }
```

```tsx
          control={
            <SettingsToggle
              checked={props.settings.autoSwitch}
              onChange={(v) => props.setSetting("autoSwitch", v)}
            />
          }
```

```tsx
          control={
            <SettingsToggle
              checked={props.settings.warmupEnabled}
              onChange={(v) => props.setSetting("warmupEnabled", v)}
            />
          }
```

Refresh inputs — replace **all four** `props.refreshMinMs` / `props.refreshMaxMs`
references inside the two `<Input>` blocks with `props.settings.refreshMinMs` /
`props.settings.refreshMaxMs`: the min input's `value` and its onChange's
`Math.max(min, props.refreshMaxMs)`, and the max input's `value` and its onChange's
`Math.min(max, props.refreshMinMs)`. `setRefreshIntervals` and `resetAutomation` stay
`props.setRefreshIntervals` / `props.resetAutomation`.

**AppearanceSection.tsx** — props type keeps the theme trio, swaps the badges toggle:

```ts
export type AppearanceSectionProps = {
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  accent: string | null;
  setAccent: (val: string | null) => void;
  fontPair: FontPairId;
  setFontPair: (val: FontPairId) => void;
  settings: AppSettings;
  setSetting: SettingsSetter;
};
```

(Keep the existing `ThemePreference`/`FontPairId` imports exactly as they are.)
Changed control line:

```tsx
<SettingsToggle
  checked={props.settings.enableBadgesEmotes}
  onChange={(v) => props.setSetting("enableBadgesEmotes", v)}
/>
```

**UpdatesSection.tsx** — replace `updateChannel`/`setUpdateChannel` in the props type
with `settings: AppSettings; setSetting: SettingsSetter;` (the `updateStatus`,
`checkUpdates`, `downloadUpdate`, `installUpdate` props stay). Changed control:

```tsx
          <Select
            value={props.settings.updateChannel}
            onValueChange={(v) => props.setSetting("updateChannel", v as UpdateChannel)}
          >
```

**AlertsSection.tsx** — new props type:

```ts
export type AlertsSectionProps = {
  settings: AppSettings;
  setSetting: SettingsSetter;
};
```

`const disabledByMaster = !props.settings.alertsEnabled;` — then every toggle follows
the same substitution, e.g.:

```tsx
        control={
          <SettingsToggle
            checked={props.settings.alertsEnabled}
            onChange={(v) => props.setSetting("alertsEnabled", v)}
          />
        }
```

Apply identically for `alertsNotifyWhileFocused`, `alertsDropClaimed`,
`alertsDropEndingSoon`, `alertsNewDrops`, `alertsWatchError`, `alertsAutoSwitch`
(each keeps its `disabled={disabledByMaster}` / `disabled={disabledByMaster || !props.settings.alertsDropEndingSoon}` attributes, with the `props.alertsDropEndingSoon`
references inside those attributes also becoming `props.settings.alertsDropEndingSoon`).
The minutes input:

```tsx
<Input
  tone="dp"
  type="number"
  min={1}
  value={props.settings.alertsDropEndingMinutes}
  onChange={(e) =>
    props.setSetting("alertsDropEndingMinutes", Math.max(1, Number(e.target.value) || 1))
  }
  disabled={disabledByMaster || !props.settings.alertsDropEndingSoon}
  aria-label={t("settings.aria.endingSoonMinutes")}
  className="w-24"
/>
```

**AccountSection.tsx** — props type:

```ts
export type AccountSectionProps = {
  isLinked: boolean;
  onLogout: () => void;
  onLogin: () => void;
  settings: AppSettings;
  setSetting: SettingsSetter;
};
```

Changed control:

```tsx
<SettingsToggle
  checked={props.settings.allowUnlinkedGames}
  onChange={(v) => props.setSetting("allowUnlinkedGames", v)}
/>
```

**AdvancedSection.tsx** — props type:

```ts
export type AdvancedSectionProps = {
  settings: AppSettings;
  setSetting: SettingsSetter;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => void;
  importSettings: () => void;
  settingsInfo?: string | null;
  settingsError?: string | null;
};
```

Changed control (the live-JSON-preview effect and backup textarea stay verbatim):

```tsx
        control={
          <SettingsToggle
            checked={props.settings.debugEnabled}
            onChange={(v) => props.setSetting("debugEnabled", v)}
          />
        }
```

- [ ] **Step 4: Fix `App.tsx`**

In the `overviewPropsExtended` memo, change the two value lines and the two dependency
entries:

```ts
      refreshMinMs: settingsProps.settings.refreshMinMs,
      refreshMaxMs: settingsProps.settings.refreshMaxMs,
```

```ts
      settingsProps.settings.refreshMinMs,
      settingsProps.settings.refreshMaxMs,
```

(`AppContent.tsx` needs no change — its `settingsProps: ComponentProps<typeof SettingsView>` follows the new type automatically.)

- [ ] **Step 5: Typecheck, tests, lint**

```bash
npx tsc --noEmit -p tsconfig.json
npm test
npm run lint
```

Expected: clean. tsc is the rename-driver here: any missed `props.autoClaim`-style
reference in a section surfaces as a type error — fix it with the
`props.settings.X` / `props.setSetting("X", v)` pattern, never by re-adding flat props.

- [ ] **Step 6: Format + commit**

```bash
npx prettier --write src/renderer/shared/hooks/app/useAppModel.ts src/renderer/features/settings/SettingsView.tsx src/renderer/features/settings/sections/*.tsx src/renderer/App.tsx
git add -A
git commit -m "refactor(settings): object+setSetting API through SettingsView and sections"
```

---

### Task 9: Language type derivation + dead-symbol sweep

**Files:**

- Modify: `src/renderer/shared/i18n.tsx` (one type line)

- [ ] **Step 1: Derive `Language` from the schema**

In `src/renderer/shared/i18n.tsx`, replace:

```ts
export type Language = "de" | "en";
```

with:

```ts
import type { AppSettings } from "../../shared/settingsSchema";

export type Language = AppSettings["language"];
```

(Place the import with the existing imports at the top. Every existing `Language`
consumer keeps compiling — the type is structurally identical, but the union now has
exactly one definition: the schema.)

- [ ] **Step 2: Dead-symbol sweep**

```bash
git grep -nE "useSettingsActions|handleSet(Obey|Auto|Warmup|Update|Demo|Alerts|Enable|Allow|Close|Minimize|Reset|Refresh)" src/
git grep -nE "save(PriorityGames|ObeyPriority|Language|AutoStart|AutoClaim|AutoSelect|AutoSwitchEnabled|WarmupEnabled|UpdateChannel|RefreshIntervals|DemoMode|DebugEnabled|Alerts[A-Za-z]+|EnableBadgesEmotes|AllowUnlinkedGames|CloseToTray|MinimizeToTray)" src/
git grep -n "SettingsPayload" src/
git grep -n "betaUpdates" src/renderer/
```

Expected: sweep 1 and 3 return nothing; sweep 2 returns only the `savePriorityGames`
closure + params in `useAppActions.ts` / `usePriorityActions.ts`; sweep 4 returns
nothing (the legacy flag now lives only in `src/shared/settingsSchema.ts` and
`src/main/`). Any other hit is a missed call site — migrate it.

- [ ] **Step 3: Typecheck, format, commit**

```bash
npx tsc --noEmit -p tsconfig.json
npm test
npx prettier --write src/renderer/shared/i18n.tsx
git add -A
git commit -m "refactor(settings): derive Language from the settings schema"
```

---

### Task 10: PR 2 verification + manual smoke + PR

- [ ] **Step 1: Full local gate**

```bash
npm run lint
npm run format:check
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.node.json
npm test
npm run build
```

Expected: all green (remember: CI does not run on PRs — this is the gate).

- [ ] **Step 2: Manual smoke (`npm run dev`)**

Walk every settings surface once; after each item confirm the UI state AND (for the
starred items) the persisted value in `settings.json`:

1. ★ Toggle Auto-Claim off/on (Engine) — value flips in file.
2. ★ Toggle Auto-Switch (Engine) — file key `autoSwitch` flips (NOT `autoSwitchEnabled`).
3. ★ Change language DE↔EN (General) — UI strings switch immediately, file persists.
4. Edit refresh interval min above max (Engine) — values clamp, no crash.
5. ★ Reset automation (Engine danger zone) — the nine reset keys return to defaults; language/theme survive.
6. Toggle each alert setting incl. master switch off (Alerts) — dependent rows disable.
7. ★ Switch update channel stable↔preview (Updates, Windows) — file persists.
8. ★ Advanced: Export — JSON appears + clipboard; modify `"autoClaim"` in the textarea, Import — **debugEnabled and every other key reflect immediately in the UI without reload** (this is the legacy drift bug, now fixed — flipping `"debugEnabled": true` via import must reveal the Debug nav entry right away).
9. Add/remove/reorder a priority game (Priorities) — persists across restart.
10. Theme/accent/font (Appearance) — unchanged behavior (out-of-scope hooks).
11. Restart the app — all of the above survive.

- [ ] **Step 3: Update docs + hand off**

Mark Tasks 6–10 complete in this plan file and record any discovered-but-not-fixed
oddities under a `## Findings` section at the bottom (same convention as the
watch-extraction plan: port faithfully, document, don't fix inline). Commit
(`docs(settings): check off PR 2 tasks`), then use
**superpowers:finishing-a-development-branch** for the PR:
`refactor/settings-renderer` → base per Task 6 reality (into `refactor/settings-schema`
if PR 1 is still open, else `main`). PR description: link the spec; call out the
deleted `useSettingsActions.ts`, the `settings`+`setSetting` consumer API, the
`autoSwitch` naming boundary (settings layer renamed, watch params unchanged), and the
import-drift-bug fix with the smoke step that proves it.

---

## Findings

(append discoveries here during execution — pre-existing oddities are documented, not
fixed inline)

1. **Typecheck blind spot for shared/main code** (Task 1 quality review). The CI
   typecheck (`npm run typecheck` → `tsc -p tsconfig.json`) compiles only
   `src/renderer`+imports; `tsconfig.node.json` (main/preload program) is run by
   nothing and currently exits 2 on a TS5107 deprecation error before checking any
   code. Consequence: `settingsSchema.ts` was committed with a latent 31-error
   `satisfies` violation (invariant arrow-property `normalize`) that no gate could
   see — fixed in `8d00fc7` (method signature). Mitigation in this plan: Task 4
   Step 0 adds `ignoreDeprecations` and every later gate runs both tsc programs
   (scoped — see Finding #2). Proper follow-up (out of scope here): add the node
   typecheck to `package.json`/CI.

2. **9 pre-existing type errors in the node program** (Task 4 Step 0, first
   execution). Un-gating `tsconfig.node.json` revealed errors that accumulated while
   the program was uncheckable — all in code this refactor does not touch:
   - `src/main/index.ts(296)` TS2769 — `"minimize"` not assignable in window-event
     overload
   - `src/main/twitch/client.ts(83,114)` TS2304 — `HeadersInit` not found;
     `client.ts(264)` TS2532 — possibly undefined
   - `src/main/twitch/serviceUtils.ts(647,652,654)` — type-predicate /
     `BenefitEdge` assignability
   - `src/main/twitch/tracker.ts(797)`, `src/main/twitch/userPubSub.ts(448)` —
     ws `RawData` vs `unknown` handler mismatch
     These are pinned and tolerated by this plan's scoped node-tsc gate; fixing them
     belongs to the separate CI-typecheck task, not this refactor.
