# Settings Pipeline Refactor — Design

**Date:** 2026-06-12
**Branches:** `refactor/settings-schema` (PR 1) → `refactor/settings-renderer` (PR 2), stacked on `refactor/useappmodel-watch-extraction` (PR #52)
**Status:** Approved (brainstorming) — pending implementation plan

## Goal

A single setting currently flows through nine hand-written stations: type, defaults,
and double normalization in `src/main/core/settings.ts`; a second (divergent) type with
`useState`, triple normalization, and a dedicated `saveX` function in
`useSettingsStore.ts`; parameter threading through `useAppModel.ts` →
`useAppActions.ts` → `useSettingsActions.ts` (235 lines of pure `void`-wrapping
ceremony); a `settingsProps` pair list; and finally `SettingsView` props. Adding one
boolean means touching ~7 files; the duplication has already produced a real drift bug
(`importSettings` forgets `setDebugEnabled`, so an import never applies `debugEnabled`
to renderer state) and three divergent encodings of the defaults.

Replace this with **one schema in `src/shared/settingsSchema.ts`** as the single source
of truth (key → default → normalization), consumed by both processes. After the
refactor, adding a setting = one schema entry + one UI control.

This is a **structural refactor with byte-compatible persistence**: `settings.json`
format, IPC contract, and observable app behavior stay identical (two deliberate,
strictly-better deltas listed under Behavior). Success is measured by characterization
tests proving old→new normalization equivalence, the existing suites staying green, and
a clean `tsc`.

## Decisions (locked during brainstorming)

| Question                        | Decision                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                           | **Full vertical** — shared schema + main `settings.ts` + renderer stack. Cut into 2 stacked PRs.                                                                       |
| Consumer API                    | **`settings` object + typed `setSetting(key, value)`** (mapped-type enforced). SettingsView sections are migrated; flat value+setter props are removed.                |
| Schema mechanism                | **Hand-rolled descriptor schema** (`{ default, normalize(raw, fallback) }` per key). No zod/runtime dep — the fallback-to-_current_ save semantics don't fit zod.      |
| Key naming                      | **Code adopts persisted names** — renderer alias `autoSwitchEnabled` becomes `autoSwitch` everywhere (tsc-driven mechanical rename). File format unchanged.            |
| `theme` / `accent` / `fontPair` | In the schema (they are part of the file + normalization), but `useTheme`/`useAccent`/`useFontPair` hooks with their localStorage fast-paint logic stay **untouched**. |
| `selectedGame` / `newGame`      | Move out of the settings store (transient priority-view UI state, never persisted) into plain `useState` in `useAppModel`. The store then only does settings.          |
| `excludeGames`                  | Stays in schema/file (format compat) although nothing reads it — documented as a finding, **not** removed.                                                             |
| Save-error handling             | Unchanged: set `settingsError`, optimistic value stays. Rollback would be a behavior feature → out of scope, noted as potential follow-up.                             |
| `useSettingsActions.ts`         | **Deleted entirely** — `setSetting` already is the fire-and-forget handler the wrappers simulate.                                                                      |

## Architecture

### `src/shared/settingsSchema.ts` (new, single source of truth)

```ts
type SettingDescriptor<T> = {
  default: T;
  /** Returns parsed `raw` if acceptable, otherwise `fallback`. */
  normalize: (raw: unknown, fallback: T) => T;
};
```

Descriptors are built from small helpers — `bool(def)`, `clampedInt(def, min, max)`,
`enumOf(values, def)`, `nullableEnumOf(values)`, `nullableString()`, `stringWithDefault(def)`,
`stringArray()`, plus a bespoke `windowBounds()` descriptor (absorbing today's
`normalizeWindowBounds`, default `undefined`).

```ts
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
  refreshMinMs: finiteNumber(3_600_000), // cross-field pass clamps the pair, see below
  refreshMaxMs: finiteNumber(4_200_000),
  demoMode: bool(false),
  debugEnabled: bool(false),
  alertsEnabled: bool(true),
  alertsNotifyWhileFocused: bool(false),
  alertsDropClaimed: bool(true),
  alertsDropEndingSoon: bool(true),
  alertsDropEndingMinutes: clampedInt(5, 1, 60),
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
  windowBounds: windowBounds(),
} satisfies Record<string, SettingDescriptor<unknown>>;
```

Derived via mapped types (no hand-written duplication):

- `AppSettings` — `{ [K in keyof typeof SETTINGS_SCHEMA]: <inferred T> }`
- `SettingKey`, `SETTINGS_DEFAULTS`
- `AUTOMATION_RESET_KEYS` — the key list behind `resetAutomation` (values come from
  `SETTINGS_DEFAULTS`, no second copy of the defaults)

Exported pure functions (both used by **both** processes):

- `normalizeSettings(raw: unknown): AppSettings` — load path; per-key normalize with
  **fallback = default**.
- `applySettingsPatch(current: AppSettings, patch: unknown): AppSettings` — save path;
  iterates only keys _present_ in the patch, per-key normalize with
  **fallback = current[key]**. Unknown keys are dropped.

Both run two shared passes around the per-key step:

1. **Legacy pre-pass** — resolves the (`updateChannel`, `betaUpdates`) input pair via
   the existing `normalizeUpdateChannel` from `src/shared/updateChannels.ts`. Faithful
   to today's conditions: on **load** it always runs; on the **patch path** it runs iff
   `typeof patch.updateChannel === "string" || typeof patch.betaUpdates === "boolean"`
   (today's `||` condition). Note the preserved quirk: an _invalid_ `updateChannel`
   string in a patch resolves to the **default** ("stable"), not to the current value.
2. **Cross-field pass** (after merge) — the refresh-interval pair clamping exactly as
   today's `normalizeRefreshIntervals` (`min ≥ 1h`, `min ≤ max`, `max ≥ min`), which a
   per-key normalize cannot see.

Two descriptors deliberately deviate from the fallback pattern, matching today:

- **`windowBounds`** ignores `fallback` — an invalid value (degenerate bounds,
  wrong shape) normalizes to `undefined` on _both_ paths, i.e. an invalid patch value
  **clears** the persisted bounds rather than keeping the current ones (today's
  `persistSettings` behavior, arguably intentional: never restore degenerate bounds).
- **`stringArray`** validates `Array.isArray` only — **no element filtering** (today's
  checks don't validate elements either; equivalence over strictness).

The `fallback` parameter is the load/save unifier: today's code implements "invalid on
load → default" and "invalid in patch → keep current" as two separate hand-written
blocks; the schema expresses both with one function.

The schema defines the `"de" | "en"` language union in shared; `renderer/i18n` derives
its `Language` type from it. This removes today's layering smell of `src/main/core/settings.ts`
importing from `src/renderer/i18n`.

### Main process — `src/main/core/settings.ts` (~390 → ~120 lines)

**Unchanged** (load-bearing, stays verbatim): `atomicWrite`, backup mirror,
corrupt-primary recovery, the serialized write queue.

- `loadSettings()` — file/backup reading as today; the ~85-line hand-written
  normalization block becomes `return normalizeSettings(parsed)`.
- `persistSettings(patch)` — the ~100-line merge block becomes
  `const next = applySettingsPatch(current, patch)`.
- `SettingsData` becomes a re-export of `AppSettings`;
  `SettingsSaveData = Partial<AppSettings> & { betaUpdates?: boolean }` stays for the
  import path (pasted legacy JSON).

**IPC handlers and preload: zero changes.** They are already generic
(`settings/get|save|export|import`), and the side effects (`applyAutoStartSetting`,
`autoUpdater.allowPrerelease`) stay where they are.

### Renderer — `useSettingsStore.ts` (~520 → ~150 lines)

One `useState<AppSettings>(SETTINGS_DEFAULTS)` replaces 25 `useState`s. API:

- `settings: AppSettings`
- `saveSettings(patch: Partial<AppSettings>): Promise<void>` — optimistic local apply
  via the shared `applySettingsPatch`, then IPC; the main response (canonical) replaces
  state via a defensive `normalizeSettings`.
- `setSetting<K extends SettingKey>(key: K, value: AppSettings[K]): void` — typed sugar
  over `saveSettings` (fire-and-forget, replaces every `handleSetX`).
- `setRefreshIntervals(minMs, maxMs)` → `saveSettings({ refreshMinMs, refreshMaxMs })`;
  `resetAutomation()` → `saveSettings(pick(SETTINGS_DEFAULTS, AUTOMATION_RESET_KEYS))`.
- `exportSettings` / `importSettings` / `settingsJson` / `settingsInfo` /
  `settingsError` keep their behavior. The import drift bug disappears by construction:
  the response is applied generically to the whole state object, so no per-key apply
  list exists to forget an entry. The three hand-written response-apply blocks
  (load/persist/import) collapse into one.
- The duplicated `normalizeRefreshIntervals` + `MIN_REFRESH_MS` constants and the
  renderer-local `SettingsData` type (with its stale `betaUpdates` field) are deleted.

### Action layers

- `useSettingsActions.ts` — **deleted** (235 lines).
- `useAppActions.ts` — loses its 25 settings parameters; keeps priority/watching/update
  actions. `usePriorityActions` receives a `savePriorityGames(list)` closure built on
  `setSetting("priorityGames", list)` (the historical quirk of co-sending
  `obeyPriority` with every priority-list save is dropped — the patch merge keeps
  untouched keys by definition).

### `useAppModel.ts`

- The ~60-identifier destructure becomes
  `const { settings, setSetting, saveSettings, … } = useSettingsStore()`, plus one
  destructure line for the values its own logic reads (`demoMode`, `autoClaim`, …) —
  consumers and sub-hook params keep receiving plain values, so memo/effect dependency
  granularity is unchanged.
- `settingsProps` shrinks ~70 → ~25 lines: `{ settings, setSetting }` + the non-schema
  props (login/logout, theme trio, `sendTestAlert`, update status/actions,
  `settingsJson`/export/import, `showUpdateCheck`/`showAutoStart`).
- `selectedGame`/`newGame` become local `useState` here.

### `SettingsView` + sections

Props become `settings: AppSettings` + `setSetting` + the non-schema props. Sections
migrate mechanically: `props.autoClaim` → `props.settings.autoClaim`,
`props.setAutoClaim(v)` → `props.setSetting("autoClaim", v)`.

### Save data flow (one toggle)

`setSetting("autoClaim", false)` → optimistic state via shared `applySettingsPatch` →
IPC `settings/save` → main merges against file state, atomic write + backup, runs side
effects → response replaces renderer state. Identical to today, minus 25 copies.

## Behavior preservation

- `settings.json` stays **byte-compatible**: same keys, same merge semantics, same
  legacy `betaUpdates` acceptance (never written, as today).
- Two deliberate, strictly-better deltas:
  1. **Unknown keys in a save patch are dropped immediately.** Today the
     `...restData` spread persists them into the JSON until the next load drops them.
  2. **Import applies `debugEnabled` to renderer state** (today's drift bug — the
     value was persisted but not reflected until reload).
- Save-error behavior unchanged (optimistic value stays, `settingsError` set).
- IPC response ordering unchanged (writes serialize through the main-side queue exactly
  as today), so optimistic-update/response races behave identically.

## Testing

Per the repo convention (pure functions, no rendered hooks):

- **`src/shared/settingsSchema.test.ts`** — each descriptor helper; `normalizeSettings`
  against corrupt shapes (non-object, wrong types, extreme values, missing keys);
  legacy `betaUpdates` migration; cross-field refresh clamping; `applySettingsPatch`
  fallback-to-current, partial patches, unknown-key dropping; `AUTOMATION_RESET_KEYS`
  picks the right defaults.
- **Characterization fixtures as the equivalence proof:** a set of realistic
  `settings.json` variants (empty file, legacy `betaUpdates` payload, wrong-typed
  fields, out-of-range refresh values, full modern file) with expected outputs derived
  from the **old** code's behavior; `normalizeSettings`/`applySettingsPatch` must map
  them identically. Written in PR 1 _before_ the old blocks are deleted.
- Existing suites stay green; `npx tsc --noEmit` clean; `npm run build` passes.
- Manual smoke (PR 2): toggle several settings across sections, restart-persistence,
  export → modify → import, language switch, reset automation, refresh-interval edit.

## PR cut

- **PR 1 (`refactor/settings-schema`):** schema module + tests + characterization
  fixtures + main `settings.ts` migration. Renderer untouched — IPC contract identical,
  everything keeps compiling. Small, low-risk, independently mergeable.
- **PR 2 (`refactor/settings-renderer`):** store rewrite, delete `useSettingsActions`,
  `useAppActions` diet, `useAppModel` consumption, `SettingsView` + sections,
  `autoSwitch` rename, `selectedGame`/`newGame` relocation.
- **Stacking:** both sit on top of `refactor/useappmodel-watch-extraction` (PR #52),
  since PR 2 touches `useAppModel`. Observe the existing merge order
  (usechannels-split → #52 → these).

## Out of scope / findings

- `useTheme`/`useAccent`/`useFontPair` internals (own fast-paint + migration logic).
- `excludeGames` is persisted but read by nothing — candidate for removal in a future
  format-compat-aware cleanup.
- Save-error rollback (restore pre-optimistic value on failed persist) — potential
  behavior follow-up, not part of this refactor.
- `windowBounds` writes from the window manager keep using `saveSettings` on the main
  side directly (unchanged path).
