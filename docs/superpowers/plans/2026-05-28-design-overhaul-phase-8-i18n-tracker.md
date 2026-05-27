# Design Overhaul — Phase 8: Settings i18n + Tracker Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two focused improvements:
1. Pull every hardcoded English string out of the new Settings section components and SettingsView, push them through the existing `useI18n` translation system with EN + DE values.
2. Restore the Control "tracker status" diagnostic section that was dropped in the Phase 5 ControlView rewrite. Display it inside the EngineStatusPanel expanded area so users can see channel-tracker liveness without a separate Diagnostics panel.

**Architecture:** Two small surgical changes. No new primitives, no rewrites. Use existing `useI18n()` hook + existing key conventions (`settings.section.*`, `settings.row.*.label|description`, `settings.button.*`, `settings.status.*`, `control.tracker*`).

**Tech Stack:** React 19, Tailwind 4, no new dependencies. Existing i18n is `src/renderer/shared/i18n.tsx` (1322 lines, EN + DE blocks).

**Spec reference:** [`../specs/2026-05-27-design-overhaul-design.md`](../specs/2026-05-27-design-overhaul-design.md) §7.5 + §11.

**Branch:** `feat/design-overhaul-phase-8-i18n-wirings` (stacked on `feat/design-overhaul-phase-7-cleanup`)

**PR target:** `feat/design-overhaul-phase-7-cleanup` — GitHub auto-retargets up the chain.

### Locked decisions

1. **Reuse existing keys where possible.** Lots of `settings.*` keys already exist (`settings.language`, `settings.autoClaim`, `settings.autoClaimHint`, etc.) from the old Settings view. Reuse them. Only add new keys where genuinely needed (section labels, sub-section labels, descriptions Phase 6 introduced).
2. **Two new key namespaces:**
   - `settings.section.*` for the 7 sidebar section names
   - `settings.subsection.*` for sub-section labels (e.g. "automation", "refresh cadence")
3. **Description style:** mono-dim copy in the row's description slot is normal prose. Keep the existing tone — no abbreviation, terminal-friendly.
4. **HeroPanel claim-now is OUT of scope.** Needs claim engine surfacing through useAppModel — bigger architectural task. Stays a placeholder (the existing "use inventory" hint).
5. **Phase 2-5 components (HeroPanel, QueuePanel, etc.) are OUT of scope.** They have their own hardcoded strings; a separate Phase 9 can sweep them. This PR is focused on Settings.
6. **Tracker status placement:** add as a new DetailRow inside the EngineStatusPanel expanded area, between `allowlist` and `no-progress`. Don't add a separate Diagnostics panel.

### Pre-flight inventory

- **i18n.tsx structure:** EN block at line 9, DE block at line 644. New keys must be added to BOTH.
- **Section components requiring `useI18n`:** 7 files in `src/renderer/features/settings/sections/` + 1 file `SettingsView.tsx`.
- **EngineStatusPanel:** already imports `useI18n` (Phase 5). Adding tracker status is purely additive.
- **trackerStatus already on props** (`ControlView.tsx` line 73, passed to `EngineStatusPanel` indirectly via `useControlViewState`). We'll route a small subset of fields into EngineStatusPanel as a new optional prop. The shape (`ChannelTrackerStatus`) is `{ fallbackActive: boolean; fallbackUntil: number | null; ... }` per `shared/types`.

---

## File Structure

**Modified files:**
- `src/renderer/shared/i18n.tsx` — add ~50 new keys (EN+DE)
- `src/renderer/features/settings/sections/GeneralSection.tsx`
- `src/renderer/features/settings/sections/EngineSection.tsx`
- `src/renderer/features/settings/sections/AppearanceSection.tsx`
- `src/renderer/features/settings/sections/UpdatesSection.tsx`
- `src/renderer/features/settings/sections/AlertsSection.tsx`
- `src/renderer/features/settings/sections/AccountSection.tsx`
- `src/renderer/features/settings/sections/AdvancedSection.tsx`
- `src/renderer/features/settings/SettingsView.tsx` — replace section-title map + page H2 with i18n
- `src/renderer/features/settings/SettingsSidebar.tsx` — items receive labels via t() from SettingsView; sidebar itself is layout-only
- `src/renderer/features/control/EngineStatusPanel.tsx` — accept + render tracker status fields

**Untouched:**
- All Phase 1 primitives
- Phase 2-5 components (HeroPanel, ChannelGridPanel, etc.) — separate phase
- ControlView itself (just passes trackerStatus deeper)

---

## Task 1: Add new i18n keys for Settings (EN + DE)

**File:** `src/renderer/shared/i18n.tsx`

Add the following keys to BOTH the `en:` block (around line 600, right before `de:`) and the `de:` block (just before the closing `}`).

### EN additions (~50 keys)

```ts
// Section sidebar labels (also used as page H2 subtitle)
"settings.section.general": "General",
"settings.section.engine": "Engine",
"settings.section.appearance": "Appearance",
"settings.section.updates": "Updates",
"settings.section.alerts": "Alerts",
"settings.section.account": "Account",
"settings.section.advanced": "Advanced",
"settings.section.general.sidebar": "general",
"settings.section.engine.sidebar": "engine",
"settings.section.appearance.sidebar": "appearance",
"settings.section.updates.sidebar": "updates",
"settings.section.alerts.sidebar": "alerts",
"settings.section.account.sidebar": "account",
"settings.section.advanced.sidebar": "advanced",

// Page heading
"settings.pageTitle": "Settings",

// Sub-section labels (mono uppercase block headings)
"settings.subsection.languageMode": "language & mode",
"settings.subsection.diagnostics": "diagnostics",
"settings.subsection.appLifecycle": "app lifecycle",
"settings.subsection.automation": "automation",
"settings.subsection.refreshCadence": "refresh cadence",
"settings.subsection.dangerZone": "danger zone",
"settings.subsection.theme": "theme",
"settings.subsection.content": "content",
"settings.subsection.releaseChannel": "release channel",
"settings.subsection.currentState": "current state",
"settings.subsection.masterSwitch": "master switch",
"settings.subsection.drops": "drops",
"settings.subsection.engine": "engine",
"settings.subsection.twitchAccount": "twitch account",
"settings.subsection.gameLinking": "game linking",
"settings.subsection.backup": "settings export & import",

// Row labels (those NOT already in legacy settings.* keys)
"settings.row.language.description": "Interface language for labels, alerts, and onboarding text.",
"settings.row.demoMode.description": "Use synthetic data so you can preview the UI without a Twitch login.",
"settings.row.sendTestAlert.label": "Send test alert",
"settings.row.sendTestAlert.description": "Triggers a desktop notification to verify alerts work on this OS.",
"settings.row.autoStart.label": "Launch at login",
"settings.row.autoStart.description": "Starts Droppilot automatically when you log into your OS.",
"settings.row.refreshInterval.label": "Channels refresh interval",
"settings.row.refreshInterval.description": "How often the channel tracker re-queries Twitch (random jitter between min and max).",
"settings.row.resetAutomation.label": "Reset automation flags",
"settings.row.resetAutomation.description": "Clears auto-claim, auto-switch, warmup, etc. back to defaults. Does not log you out.",
"settings.row.theme.label": "Color scheme",
"settings.row.theme.description": "Light or dark interface.",
"settings.row.theme.dark": "Dark",
"settings.row.theme.light": "Light",
"settings.row.badgesEmotes.description": "Display Twitch badges and emotes in chat-like elements.",
"settings.row.updateChannel.description": "Switch between stable and pre-release releases.",
"settings.row.updateStatus.label": "Status",
"settings.row.updateStatus.description": "Last known update status reported by the auto-updater.",
"settings.row.updateActions.label": "Actions",
"settings.row.updateActions.description": "Manually trigger a check, download, or install.",
"settings.row.alertsEnabled.label": "Desktop alerts",
"settings.row.alertsEnabled.description": "Master toggle. When off, no notifications are sent regardless of the per-event settings below.",
"settings.row.alertsNotifyWhileFocused.label": "Notify while the app is focused",
"settings.row.alertsNotifyWhileFocused.description": "Show notifications even when Droppilot is the active window.",
"settings.row.alertsDropClaimed.label": "Drop claimed",
"settings.row.alertsDropClaimed.description": "A drop you were watching for has been claimed.",
"settings.row.alertsDropEndingSoon.label": "Drop ending soon",
"settings.row.alertsDropEndingSoon.description": "A drop is close to expiring. Warn you N minutes before.",
"settings.row.alertsDropEndingMinutes.label": "Ending-soon threshold",
"settings.row.alertsDropEndingMinutes.description": "How many minutes before expiry the warning fires.",
"settings.row.alertsNewDrops.label": "New drops available",
"settings.row.alertsNewDrops.description": "A new campaign or drop just dropped (pun intended).",
"settings.row.alertsWatchError.label": "Watch errors",
"settings.row.alertsWatchError.description": "Watcher failed (auth expired, network issue, etc.).",
"settings.row.alertsAutoSwitch.label": "Auto-switch happened",
"settings.row.alertsAutoSwitch.description": "The watch engine moved to a different channel automatically.",
"settings.row.connectionStatus.label": "Connection status",
"settings.row.connectionStatus.description": "Logout and re-login from the top-right of the title bar.",
"settings.row.allowUnlinked.description": "Show drops for games where you haven't linked the Twitch account to the game account yet. They won't progress without linking.",
"settings.row.debugView.label": "Show Debug view",
"settings.row.debugView.description": "Adds a 'debug' tab to the top nav with logs, perf snapshots, and a state dump.",
"settings.row.settingsJson.label": "Settings JSON",
"settings.row.settingsJson.description": "Paste a JSON blob and click Import, or click Export to copy your current settings.",

// Buttons
"settings.button.sendTest": "send test",
"settings.button.reset": "reset",
"settings.button.check": "check",
"settings.button.download": "download",
"settings.button.installRestart": "install & restart",
"settings.button.export": "export",
"settings.button.import": "import",

// Inline labels / connectors
"settings.unit.to": "to",
"settings.unit.sec": "sec",
"settings.unit.min": "min",
"settings.aria.minIntervalSeconds": "Minimum interval seconds",
"settings.aria.maxIntervalSeconds": "Maximum interval seconds",
"settings.aria.endingSoonMinutes": "Ending-soon minutes",
"settings.aria.theme": "Theme",
"settings.aria.language": "Language",
"settings.aria.updateChannel": "Update channel",

// Status pills (Updates section)
"settings.status.idle": "idle",
"settings.status.checking": "checking…",
"settings.status.available": "update available",
"settings.status.downloading": "downloading",
"settings.status.downloaded": "downloaded",
"settings.status.error": "update error",
"settings.status.upToDate": "up to date",
"settings.status.unsupported": "updates unsupported",

// Account pills
"settings.account.linked": "linked",
"settings.account.notLinked": "not linked",

// Tracker status (Control / EngineStatusPanel)
"control.tracker.label": "tracker",
"control.tracker.healthy": "Healthy (primary)",
"control.tracker.fallback": "Fallback active",
"control.tracker.unknown": "Unknown",
"control.tracker.fallbackUntil": "fallback {time} remaining",
```

### DE additions (~50 keys)

```ts
"settings.section.general": "Allgemein",
"settings.section.engine": "Engine",
"settings.section.appearance": "Erscheinungsbild",
"settings.section.updates": "Updates",
"settings.section.alerts": "Benachrichtigungen",
"settings.section.account": "Account",
"settings.section.advanced": "Erweitert",
"settings.section.general.sidebar": "allgemein",
"settings.section.engine.sidebar": "engine",
"settings.section.appearance.sidebar": "erscheinungsbild",
"settings.section.updates.sidebar": "updates",
"settings.section.alerts.sidebar": "alerts",
"settings.section.account.sidebar": "account",
"settings.section.advanced.sidebar": "erweitert",

"settings.pageTitle": "Einstellungen",

"settings.subsection.languageMode": "sprache & modus",
"settings.subsection.diagnostics": "diagnose",
"settings.subsection.appLifecycle": "app-lebenszyklus",
"settings.subsection.automation": "automatisierung",
"settings.subsection.refreshCadence": "refresh-rhythmus",
"settings.subsection.dangerZone": "achtung",
"settings.subsection.theme": "theme",
"settings.subsection.content": "inhalt",
"settings.subsection.releaseChannel": "release-kanal",
"settings.subsection.currentState": "aktueller status",
"settings.subsection.masterSwitch": "hauptschalter",
"settings.subsection.drops": "drops",
"settings.subsection.engine": "engine",
"settings.subsection.twitchAccount": "twitch-account",
"settings.subsection.gameLinking": "spiel-verknüpfung",
"settings.subsection.backup": "einstellungen export & import",

"settings.row.language.description": "Sprache für Labels, Benachrichtigungen und Onboarding-Texte.",
"settings.row.demoMode.description": "Verwendet synthetische Daten, damit du die UI ohne Twitch-Login ausprobieren kannst.",
"settings.row.sendTestAlert.label": "Test-Benachrichtigung senden",
"settings.row.sendTestAlert.description": "Triggert eine Desktop-Benachrichtigung, um Alerts auf diesem OS zu prüfen.",
"settings.row.autoStart.label": "Beim Login starten",
"settings.row.autoStart.description": "Startet Droppilot automatisch beim OS-Login.",
"settings.row.refreshInterval.label": "Channel-Refresh-Intervall",
"settings.row.refreshInterval.description": "Wie oft der Channel-Tracker Twitch neu abfragt (zufälliger Jitter zwischen Min und Max).",
"settings.row.resetAutomation.label": "Automatisierung zurücksetzen",
"settings.row.resetAutomation.description": "Setzt auto-claim, auto-switch, warmup etc. auf die Defaults zurück. Loggt dich nicht aus.",
"settings.row.theme.label": "Farbschema",
"settings.row.theme.description": "Helles oder dunkles Interface.",
"settings.row.theme.dark": "Dunkel",
"settings.row.theme.light": "Hell",
"settings.row.badgesEmotes.description": "Twitch-Badges und Emotes in Chat-ähnlichen Elementen anzeigen.",
"settings.row.updateChannel.description": "Zwischen stabilen und Pre-Release-Versionen wechseln.",
"settings.row.updateStatus.label": "Status",
"settings.row.updateStatus.description": "Letzter bekannter Update-Status vom Auto-Updater.",
"settings.row.updateActions.label": "Aktionen",
"settings.row.updateActions.description": "Manuell Check, Download oder Installation auslösen.",
"settings.row.alertsEnabled.label": "Desktop-Benachrichtigungen",
"settings.row.alertsEnabled.description": "Hauptschalter. Wenn aus, werden keine Benachrichtigungen gesendet — unabhängig von den Einzeleinstellungen unten.",
"settings.row.alertsNotifyWhileFocused.label": "Auch bei fokussierter App benachrichtigen",
"settings.row.alertsNotifyWhileFocused.description": "Zeigt Benachrichtigungen auch, wenn Droppilot das aktive Fenster ist.",
"settings.row.alertsDropClaimed.label": "Drop eingesammelt",
"settings.row.alertsDropClaimed.description": "Ein Drop, auf den du gewartet hast, wurde eingesammelt.",
"settings.row.alertsDropEndingSoon.label": "Drop endet bald",
"settings.row.alertsDropEndingSoon.description": "Ein Drop läuft bald ab. Warnung N Minuten vorher.",
"settings.row.alertsDropEndingMinutes.label": "Endet-bald-Schwelle",
"settings.row.alertsDropEndingMinutes.description": "Wie viele Minuten vor Ablauf die Warnung kommt.",
"settings.row.alertsNewDrops.label": "Neue Drops verfügbar",
"settings.row.alertsNewDrops.description": "Eine neue Kampagne oder ein neuer Drop ist gerade gedroppt.",
"settings.row.alertsWatchError.label": "Watch-Fehler",
"settings.row.alertsWatchError.description": "Der Watcher ist fehlgeschlagen (Auth abgelaufen, Netzwerk, etc.).",
"settings.row.alertsAutoSwitch.label": "Auto-Switch ausgelöst",
"settings.row.alertsAutoSwitch.description": "Die Watch-Engine ist automatisch auf einen anderen Channel gewechselt.",
"settings.row.connectionStatus.label": "Verbindungsstatus",
"settings.row.connectionStatus.description": "Logout und Re-Login oben rechts in der Titelleiste.",
"settings.row.allowUnlinked.description": "Zeigt Drops für Spiele, deren Account du noch nicht mit Twitch verknüpft hast. Diese Drops machen ohne Verknüpfung keinen Fortschritt.",
"settings.row.debugView.label": "Debug-Ansicht zeigen",
"settings.row.debugView.description": "Fügt einen 'debug'-Tab oben hinzu mit Logs, Perf-Snapshots und State-Dump.",
"settings.row.settingsJson.label": "Settings-JSON",
"settings.row.settingsJson.description": "Füge einen JSON-Block ein und klicke Import, oder klicke Export, um deine aktuellen Einstellungen zu kopieren.",

"settings.button.sendTest": "test senden",
"settings.button.reset": "zurücksetzen",
"settings.button.check": "prüfen",
"settings.button.download": "herunterladen",
"settings.button.installRestart": "installieren & neu starten",
"settings.button.export": "exportieren",
"settings.button.import": "importieren",

"settings.unit.to": "bis",
"settings.unit.sec": "sek",
"settings.unit.min": "min",
"settings.aria.minIntervalSeconds": "Minimum-Intervall in Sekunden",
"settings.aria.maxIntervalSeconds": "Maximum-Intervall in Sekunden",
"settings.aria.endingSoonMinutes": "Endet-bald-Minuten",
"settings.aria.theme": "Theme",
"settings.aria.language": "Sprache",
"settings.aria.updateChannel": "Update-Kanal",

"settings.status.idle": "leerlauf",
"settings.status.checking": "prüfe…",
"settings.status.available": "update verfügbar",
"settings.status.downloading": "lade herunter",
"settings.status.downloaded": "heruntergeladen",
"settings.status.error": "update-fehler",
"settings.status.upToDate": "aktuell",
"settings.status.unsupported": "updates nicht unterstützt",

"settings.account.linked": "verknüpft",
"settings.account.notLinked": "nicht verknüpft",

"control.tracker.label": "tracker",
"control.tracker.healthy": "Gesund (primär)",
"control.tracker.fallback": "Fallback aktiv",
"control.tracker.unknown": "Unbekannt",
"control.tracker.fallbackUntil": "fallback noch {time}",
```

### Steps

- [ ] **Step 1:** Locate the EN block (starts ~line 9, ends just before `de:` ~line 644). Find a sensible insertion point — likely right after the last `settings.*` key in the EN block. Add all ~50 new keys there.
- [ ] **Step 2:** Locate the DE block (starts ~line 644, ends with `}` for the `translations` const). Find the matching insertion point. Add all ~50 keys with German translations.
- [ ] **Step 3:** Verify both blocks have the same set of new keys: a quick grep `grep -c "settings.section." src/renderer/shared/i18n.tsx` should be 14 (7 keys × 2 langs). Similar for `settings.subsection.` (16 × 2 = 32).
- [ ] **Step 4:** TSC + tests:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep i18n | head -5
# expected: empty
npm test 2>&1 | tail -5
# expected: 214/214
```
- [ ] **Step 5:** Branch check + commit:
```bash
git branch --show-current
# expected: feat/design-overhaul-phase-8-i18n-wirings

git add src/renderer/shared/i18n.tsx
git commit -m "feat(i18n): add settings section keys (EN + DE)

Adds ~50 new keys covering:
- settings.section.* + settings.section.*.sidebar (7 sections)
- settings.subsection.* (16 sub-section labels)
- settings.row.*.label/.description (Phase 6 row copy not already in legacy keys)
- settings.button.*, settings.unit.*, settings.aria.* (button text + units + aria labels)
- settings.status.* (update status pills)
- settings.account.* (linked/not linked pills)
- control.tracker.* (Phase 8 T03 prep)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Wire `useI18n()` into all 7 section components + SettingsView

Each component gets a `const { t } = useI18n();` near the top and every hardcoded English literal becomes a `t("key.path")` call.

**Reuse table** (for fields where legacy `settings.*` keys exist):

| Hardcoded current | Reuse key |
| --- | --- |
| "Language" | `settings.language` |
| "Demo mode" | `settings.demoMode` |
| "Auto-claim" | `settings.autoClaim` |
| "Automatically claim earned drops..." | `settings.autoClaimHint` |
| "Auto-select target game" | `settings.autoSelect` |
| "Pick the next watchable game..." | `settings.autoSelectHint` |
| "Auto-switch on stall" | `settings.autoSwitch` |
| "If no progress is detected..." | `settings.autoSwitchHint` |
| "Warm up watcher" | `settings.warmup` |
| "Send a probe before binding..." | `settings.warmupHint` |
| "Show badges & emotes" | `settings.badgesEmotes` |
| "Display Twitch badges and emotes..." | (use new `settings.row.badgesEmotes.description` because the existing `settings.badgesEmotesHint` is more verbose) |
| "Allow unlinked games" | `settings.allowUnlinked` |
| Update channel option "Stable" | `settings.updateChannel.stable` |
| Update channel option "Preview" | `settings.updateChannel.preview` |

For everything else, use the new keys added in T01.

### File 1: `GeneralSection.tsx`

Add `const { t } = useI18n();` to body and replace strings:
- Section labels `language & mode` → `t("settings.subsection.languageMode")`, `diagnostics` → `t("settings.subsection.diagnostics")`
- Row 1: label `t("settings.language")`, description `t("settings.row.language.description")`, aria-label on SelectTrigger `t("settings.aria.language")`
- Row 2: label `t("settings.demoMode")`, description `t("settings.row.demoMode.description")`
- Row 3: label `t("settings.row.sendTestAlert.label")`, description `t("settings.row.sendTestAlert.description")`, button text `t("settings.button.sendTest")`
- Add import: `import { useI18n } from "@renderer/shared/i18n";`

### File 2: `EngineSection.tsx`

- All 4 SectionLabel headings → `t("settings.subsection.appLifecycle")`, `automation`, `refreshCadence`, `dangerZone`
- Row "Launch at login" → `t("settings.row.autoStart.label")` / `t("settings.row.autoStart.description")`
- Row "Auto-claim" → `t("settings.autoClaim")` / `t("settings.autoClaimHint")`
- Row "Auto-select target game" → `t("settings.autoSelect")` / `t("settings.autoSelectHint")`
- Row "Auto-switch on stall" → `t("settings.autoSwitch")` / `t("settings.autoSwitchHint")`
- Row "Warm up watcher" → `t("settings.warmup")` / `t("settings.warmupHint")`
- Row "Channels refresh interval" → `t("settings.row.refreshInterval.label")` / `t("settings.row.refreshInterval.description")`
- "to" connector → `t("settings.unit.to")`, "sec" → `t("settings.unit.sec")`
- aria-label "Minimum interval seconds" → `t("settings.aria.minIntervalSeconds")`, "Maximum..." → `t("settings.aria.maxIntervalSeconds")`
- Row "Reset automation flags" → `t("settings.row.resetAutomation.label")` / `t("settings.row.resetAutomation.description")`, button "reset" → `t("settings.button.reset")`
- Add import

### File 3: `AppearanceSection.tsx`

- Section labels: `t("settings.subsection.theme")`, `t("settings.subsection.content")`
- Row 1 (Color scheme): label `t("settings.row.theme.label")`, description `t("settings.row.theme.description")`, aria-label `t("settings.aria.theme")`, options `t("settings.row.theme.dark")` / `t("settings.row.theme.light")`
- Row 2: label `t("settings.badgesEmotes")`, description `t("settings.row.badgesEmotes.description")`
- Add import

### File 4: `UpdatesSection.tsx`

- Section labels: `t("settings.subsection.releaseChannel")`, `t("settings.subsection.currentState")`
- Row "Update channel": label `t("settings.updateChannel")`, description `t("settings.row.updateChannel.description")`, aria-label `t("settings.aria.updateChannel")`, options `t("settings.updateChannel.stable")` / `t("settings.updateChannel.preview")`
- Row "Status" → `t("settings.row.updateStatus.label")` / `t("settings.row.updateStatus.description")`
- Status pill helper: replace each switch arm's text with the matching `settings.status.*` key. Keep the `· v${version}` and `· ${progress}%` suffixes; they're not translatable copy. Example:
  ```tsx
  case "available":
    return <Pill tone="accent" dot>{t("settings.status.available")}{version ? ` · v${version}` : ""}</Pill>;
  ```
- Row "Actions" → `t("settings.row.updateActions.label")` / `t("settings.row.updateActions.description")`
- Buttons: `t("settings.button.check")`, `t("settings.button.download")`, `t("settings.button.installRestart")`
- Add import

### File 5: `AlertsSection.tsx`

- Section labels: `t("settings.subsection.masterSwitch")`, `t("settings.subsection.drops")`, `t("settings.subsection.engine")`
- Row "Desktop alerts" → `t("settings.row.alertsEnabled.label")` / `t("settings.row.alertsEnabled.description")`
- Row "Notify while the app is focused" → `t("settings.row.alertsNotifyWhileFocused.label")` / `.description`
- Row "Drop claimed" → `t("settings.row.alertsDropClaimed.label")` / `.description`
- Row "Drop ending soon" → `t("settings.row.alertsDropEndingSoon.label")` / `.description`
- Row "Ending-soon threshold" → `t("settings.row.alertsDropEndingMinutes.label")` / `.description`, aria-label `t("settings.aria.endingSoonMinutes")`, "min" → `t("settings.unit.min")`
- Row "New drops available" → `t("settings.row.alertsNewDrops.label")` / `.description`
- Row "Watch errors" → `t("settings.row.alertsWatchError.label")` / `.description`
- Row "Auto-switch happened" → `t("settings.row.alertsAutoSwitch.label")` / `.description`
- Add import

### File 6: `AccountSection.tsx`

- Section labels: `t("settings.subsection.twitchAccount")`, `t("settings.subsection.gameLinking")`
- Row "Connection status" → `t("settings.row.connectionStatus.label")` / `.description`, pill text `t("settings.account.linked")` / `t("settings.account.notLinked")`
- Row "Allow unlinked games" → `t("settings.allowUnlinked")` (existing key) / `t("settings.row.allowUnlinked.description")` (new — the existing `settings.allowUnlinkedHint` is too curt for this row)
- Add import

### File 7: `AdvancedSection.tsx`

- Section labels: `t("settings.subsection.diagnostics")`, `t("settings.subsection.backup")`
- Row "Show Debug view" → `t("settings.row.debugView.label")` / `.description`
- Textarea heading "Settings JSON" → `t("settings.row.settingsJson.label")`
- Textarea sub-description "Paste a JSON blob..." → `t("settings.row.settingsJson.description")`
- Buttons: `t("settings.button.export")`, `t("settings.button.import")`
- Add import

### File 8: `SettingsView.tsx`

- `<h2>Settings</h2>` → `t("settings.pageTitle")`
- The `sectionTitle` Record map's values become `t("settings.section.general")`, `t("settings.section.engine")`, etc.
- The `items` array's `label` values become `t("settings.section.general.sidebar")`, etc.
- Move the `items` build into the render body (after `const { t } = useI18n();`) so the translations live-update on language switch.
- Add import for `useI18n`

### Steps

- [ ] **Step 1: Edit each file** in the order listed above. For each file:
  - Add `import { useI18n } from "@renderer/shared/i18n";` to the imports
  - Add `const { t } = useI18n();` as the first line inside the function body
  - Replace every hardcoded English literal listed above with the matching `t(...)` call
  - Be careful with JSX text nodes vs prop values — both need wrapping
- [ ] **Step 2: Verify the changes don't break TS:**
  ```bash
  npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "settings/sections|SettingsView" | head -10
  # expected: empty (no new errors)
  ```
- [ ] **Step 3: Tests + lint:**
  ```bash
  npm test 2>&1 | tail -5
  # expected: 214/214
  npm run lint 2>&1 | tail -10
  # expected: 0 errors
  ```
- [ ] **Step 4: Branch check + commit:**
  ```bash
  git add src/renderer/features/settings/
  git commit -m "feat(settings): wire useI18n into all section components + SettingsView

  Replaces every hardcoded English string in the 7 section components
  and SettingsView with t() calls. Reuses existing settings.* keys
  where they fit (e.g. settings.autoClaim, settings.autoClaimHint);
  uses new settings.section.*, settings.subsection.*, settings.row.*,
  settings.button.*, settings.unit.*, settings.aria.*, settings.status.*,
  settings.account.* keys added in T01.

  Switching the language in General now flips the entire Settings UI.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
  ```

---

## Task 3: Restore tracker status display in EngineStatusPanel

The Phase 5 final-review noted `trackerStatus` wasn't surfaced anywhere visible. Restore it as an additional DetailRow inside the expanded area of EngineStatusPanel.

### Plumbing

`useControlViewState` already destructures `trackerStatus` (line 74) and uses `trackerStatus.fallbackActive` + `trackerStatus.fallbackUntil` to compute fallback timing internally. It is NOT currently passed back to ControlView's render layer. We need to expose it via `useControlViewState` return value.

### Steps

- [ ] **Step 1: Read `src/renderer/features/control/useControlViewState.ts`** around line 70-90 and around line 510-530 to understand current shape and verify return value structure.

- [ ] **Step 2: Edit `useControlViewState.ts`** — add the following to the returned object (likely a `useMemo` near the bottom):
  ```ts
  trackerStatus: trackerStatus ?? null,
  ```
  (Replace `trackerStatus` in the hook params with the destructured prop from earlier. If it's already returned, skip.)

- [ ] **Step 3: Edit `ControlView.tsx`** — destructure `trackerStatus` from `useControlViewState`'s return and pass to `<EngineStatusPanel ... trackerStatus={trackerStatus} />`.

- [ ] **Step 4: Edit `EngineStatusPanel.tsx`**:
  - Add `trackerStatus?: ChannelTrackerStatus | null;` to `EngineStatusPanelProps`
  - Destructure it in the function signature
  - Compute a `trackerText` similar to existing `cooldownText`:
    ```ts
    const trackerText = (() => {
      if (!trackerStatus) return t("control.tracker.unknown");
      if (trackerStatus.fallbackActive) {
        const remaining = trackerStatus.fallbackUntil ? Math.max(0, trackerStatus.fallbackUntil - Date.now()) : 0;
        return remaining > 0
          ? `${t("control.tracker.fallback")} · ${t("control.tracker.fallbackUntil", { time: formatDurationMs(remaining) })}`
          : t("control.tracker.fallback");
      }
      return t("control.tracker.healthy");
    })();
    ```
  - In the expanded JSX block (the `{expanded && (...)}` part), add a new `DetailRow` between `allowlist` and `no-progress`:
    ```tsx
    <DetailRow label={t("control.tracker.label")} value={trackerText} tone={trackerStatus?.fallbackActive ? "warn" : undefined} />
    ```
  - Import `ChannelTrackerStatus` from `@renderer/shared/types` if not already imported.

- [ ] **Step 5: TSC + tests:**
  ```bash
  npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "EngineStatusPanel|useControlViewState|ControlView" | head -10
  # expected: empty
  npm test 2>&1 | tail -5
  # expected: 214/214
  ```

- [ ] **Step 6: Commit:**
  ```bash
  git add src/renderer/features/control/
  git commit -m "feat(control): restore tracker status in EngineStatusPanel

  Surfaces the previously-internal trackerStatus from useControlViewState
  out to EngineStatusPanel's expanded detail area. Adds a 'tracker' row
  between 'allowlist' and 'no-progress' showing one of:

  - Healthy (primary) — when fallbackActive is false
  - Fallback active · fallback {time} remaining — when fallback is on
    with a fallbackUntil timestamp
  - Unknown — when trackerStatus is null

  Uses warn tone when fallback is active. Resolves the Phase 5
  final-review note about the missing tracker status section.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
  ```

---

## Task 4: Verify end-to-end

- [ ] **Step 1: Full check suite**
  ```bash
  npm run lint 2>&1 | tail -10  # 0 errors expected
  npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l  # ~baseline (~18-21)
  npm test 2>&1 | tail -5  # 214/214
  npm run build 2>&1 | tail -10  # clean
  ```

- [ ] **Step 2: Branch summary**
  ```bash
  git log --oneline feat/design-overhaul-phase-7-cleanup..HEAD
  # Expected: ~4 commits (plan + T01 + T02 + T03)
  ```

- [ ] **Step 3: i18n sanity grep**
  ```bash
  # Confirm hardcoded English literals are gone from Settings:
  grep -nE 'label=("|`)[A-Z]' src/renderer/features/settings/sections/*.tsx | head -10
  # Expected: empty or only icon names (e.g. label={t(...)}) — no raw "Language" etc.
  ```

## Report

Per phase task: SHA. Final: full branch log, lint/tsc/test/build results.

---

## Out of Scope

- HeroPanel claim-now button wiring — needs claim engine surfacing through useAppModel (separate phase)
- Phase 2-5 components hardcoded strings (HeroPanel, ChannelGridPanel, etc.) — separate phase
- Light-mode visual polish — separate phase
- `--dp-*` token rename — separate phase

## Open items

- Settings JSON textarea has no syntax highlighting; acceptable as-is.
- Tracker fallbackUntil time relies on local Date.now() rerendering. The EngineStatusPanel doesn't currently force a re-render on a tick interval. The fallback time will be stale until parent rerenders. Acceptable for v1 — users can collapse/expand or switch views to refresh. If we want live ticking later, add a `setInterval` similar to EnginePanel.
