# UI Polish Phase 5 — Stats and Settings Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Executed inline (autonomous run).

**Goal:** Rebuild the stats view (KPI strip with best streak, watch-time bars with a
7d / 30d / 90d toggle, summary and y-axis ticks, top games as bars, a 7-row calendar heatmap
with a legend over the last 26 weeks; "Reset stats" leaves this view) and the settings view
(one scrolling page with a left index `autopilot · notifications · appearance · app · account &
updates · advanced` instead of the 7-tab sidebar; every setting kept, regrouped, with
plain-language labels and descriptions; "Reset stats" lands in advanced behind the existing
confirmation).

**Spec:** `docs/superpowers/specs/2026-11-06-ui-polish-redesign-design.md` (stats, settings).
**Mockups:** `PolStats`, `PolSettings` boards.

## Global constraints

Same as phases 1–4: pure-function tests only, EN + DE keys, CHANGELOG lines, prettier,
Conventional Commits with the `Co-Authored-By` trailer, no watch-engine behavior change.
No window launches this run (no visual check).

## Facts the copy must match

- **auto-switch** (`autoSwitchEnabled`, `computeAutoSwitchAction`): only acts when the watched
  channel leaves the channel list (offline / no drops). Stall recovery ("stops counting") is not
  gated by it. So the description says "goes offline or stops offering drops", not the mockup's
  "stops counting for 10 min".
- **auto-select** (`autoSelectEnabled`): starts a channel when nothing is watched.
- **refresh interval:** random time between min and max, hard floor 60 min
  (`refreshIntervalField.ts`); the two minute fields stay (the mockup's select would drop
  custom values).
- **`enableBadgesEmotes`** is not a display option: `getCategory` treats unlinked campaigns that
  have a badge or emote reward as farmable. It moves from appearance to autopilot with
  corrected copy.
- **`allowUnlinkedGames`:** unlinked drops count as farmable. Autopilot.
- Tray toggles and start-at-login were only shown on Windows (`showAutoStart`); the app section
  keeps that gate. Update status/actions/channel keep the `showUpdateCheck` gate; the version
  row and the changelog are shown everywhere (the release-history IPC is not platform-gated).

## Stats model (`features/stats/statsDerive.ts`)

- `buildWatchChart(daily, rangeDays, now)` → `{ bars: { date, minutes, pct, today }[],
totalMinutes, avgMinutes, scaleMinutes, ticks: [top, mid, 0] }`. Scale = smallest of
  1/2/4/6/8/12/16/20/24 h that fits the max day (1 h when empty; larger days round up to 4 h
  steps). Bars with minutes get at least 2 % so they stay visible.
- `formatHoursShort(minutes)` → `0`, `40m`, `1.5h`, `12h` (summary and ticks).
- `buildCalendar(daily, weeks, now)` → `{ weeks: (CalendarCell | null)[][] }`, columns are
  Monday-first weeks, the last column holds today, days after today are `null`.
  `level` 0–3 relative to the busiest day in the window (`calendarLevel`).
- `computeStreaks` (exists) gives current + best.

## Settings model (`features/settings/settingsSections.ts`)

- `settingsSections({ showApp })` → ordered `{ key, id }` list (app only when shown).
- `pickActiveSection(positions, { offset, atBottom })` → key of the last section whose top is
  at or above `offset`, the first one before any passes, the last one at the bottom of the page.
  The view feeds it heading positions on scroll of the app's scroll container.

## File map

| File                                                                                                                                | Change                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `features/stats/statsDerive.ts` (+test)                                                                                             | `buildWatchChart`, `formatHoursShort`, `buildCalendar`, `calendarLevel`.                          |
| `features/stats/StatsView.tsx`, `StatsHeader.tsx`, `KpiCards.tsx`, `WatchTimeTrend.tsx`, `TopGamesPanel.tsx`, `ActivityHeatmap.tsx` | Rewritten to the mockup; header loses the reset dialog.                                           |
| `features/settings/settingsSections.ts` (+test)                                                                                     | New: section list + active-section pick.                                                          |
| `features/settings/SettingsView.tsx`                                                                                                | Rewritten: index + six sections on one page.                                                      |
| `features/settings/SettingsIndex.tsx`                                                                                               | New: sticky anchor index (replaces `SettingsSidebar.tsx`).                                        |
| `features/settings/SettingRow.tsx`, `SettingsPanel.tsx`                                                                             | Row restyled (sans label, muted sans description, control right); panel + kicker.                 |
| `features/settings/sections/*`                                                                                                      | Regrouped: Autopilot, Notifications, Appearance, App, AccountUpdates, Advanced.                   |
| `features/settings/ResetStatsButton.tsx`                                                                                            | The existing AlertDialog, moved from `StatsHeader`.                                               |
| `features/settings/SettingsSidebar.tsx`, `useSettingsViewState.ts`, `sections/General/Engine/Alerts/Account/Updates`                | Deleted.                                                                                          |
| `shared/hooks/app/useAppModel.ts`                                                                                                   | `statsProps` without reset; `settingsProps` + `resetStats`, `profile`, `appVersion`, `openGames`. |
| `shared/i18n.tsx`, `CHANGELOG.md`                                                                                                   | New/rewritten keys (EN + DE), dead keys removed, changelog lines.                                 |

## Tasks

- [ ] 1. Stats model (TDD): `formatHoursShort`, `buildWatchChart`, `calendarLevel`, `buildCalendar`.
- [ ] 2. Stats components + view; reset moves out.
- [ ] 3. Settings model (TDD): `settingsSections`, `pickActiveSection`.
- [ ] 4. Settings page: index, row/panel, six sections, reset stats in advanced, useAppModel wiring.
- [ ] 5. Delete dead code and keys; CHANGELOG.
- [ ] 6. Verification (lint, format, typecheck, test, build). No visual check (no windows this run).

## Tests (names)

`statsDerive.test.ts` (new blocks; existing ones stay):

- `formatHoursShort`: "minutes under an hour", "one decimal under ten hours", "whole hours from
  ten hours", "zero and bad input".
- `buildWatchChart`: "one bar per day of the range, oldest first, today last", "totals and the
  daily average over the whole range", "scales to the smallest step that fits the busiest day",
  "uses a one-hour scale when nothing was watched", "keeps small days visible", "ticks are top,
  half and zero".
- `calendarLevel`: "zero is level 0", "splits the busiest day into thirds".
- `buildCalendar`: "26 Monday-first weeks ending with the current week", "leaves days after today
  empty", "fills minutes, claims and levels from the daily map".

`settingsSections.test.ts`:

- "lists the six sections in order", "leaves out app when the platform has no app options",
  "picks the last section whose heading passed the offset", "picks the first section before any
  heading passed", "picks the last section at the bottom of the page", "returns null without
  sections".
