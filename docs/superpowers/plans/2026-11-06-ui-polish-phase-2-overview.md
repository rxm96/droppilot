# UI Polish Phase 2 — Overview Merge Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Executed inline (autonomous run).

**Goal:** Merge Control into Overview. New hero, `switch channel` popover, needs-you panel, user-facing engine panel, `plan · today` table, restyled activity feed. Nav becomes `overview · drops · games · stats` with the autopilot chip and a settings gear in the right slot. Control view is deleted.

**Spec:** `docs/superpowers/specs/2026-11-06-ui-polish-redesign-design.md` (phase 2). **Mockup:** `Polished` board.

## Global constraints

Same as phase 1: pure-function tests only, EN + DE keys, CHANGELOG lines, prettier, Conventional Commits with the `Co-Authored-By` trailer, and **no watch-engine behavior change**.

## What a manual channel pick does today (verified before coding)

- `handleStartWatching(channel)` (useAppModel) clears the game's stall cooldown, dispatches `watch/manual_start`, enables auto-select, records `manualWatchOverride = { at, game }` and sets `watching`.
- Auto-select (`useChannelAutopilot`) only runs while nothing is watched, so it never replaces a pick.
- Auto-switch (`computeAutoSwitchAction`) leaves a channel alone while it is live and allowed. It moves on when the channel goes offline, or (forced priority switch) when the channel does not count for the drop. `manualWatchOverride` suppresses the forced switch for 2 min (`MANUAL_PRIORITY_OVERRIDE_MS`).
- Stall recovery switches channel after 15 min (3 min near the end) without progress.
- Priority orchestration can move the target to another game; the pick then ends with the old game.
- There is no "back to auto" action. The closest existing mechanism is auto-select's own choice: the first channel the allowlist allows, in list order.

So: `your pick` = "the channel being watched is the one the user picked" (tracked in UI state by channel id, so it disappears the moment the engine switches away). The `auto` button switches to the channel auto-select would pick (`pickAutoSelectChannel`, extracted from `useChannelAutopilot` with no behavior change) and clears `manualWatchOverride`, which is the engine's existing input for "manual pick active".

## File map

| File                                                                           | Change                                                                                                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/navigation.ts` (+test)                                                 | `resolveView(raw, { debugEnabled })`: `control`/unknown → `overview`, `debug` without debug → `overview`.                                       |
| `shared/types.ts`, `chrome/AppNav.tsx`                                         | `View` loses `control`. AppNav: text tabs (no icons), optional badge, right slot.                                                               |
| `chrome/AutopilotChip.tsx`                                                     | New: `● autopilot · running/paused`, click toggles.                                                                                             |
| `chrome/Titlebar.tsx`                                                          | Settings gear removed.                                                                                                                          |
| `chrome/SessionExpiredBanner.tsx`                                              | Moved from `features/control`; hidden on overview (needs-you shows it there).                                                                   |
| `App.tsx`, `AppContent.tsx`                                                    | New nav items, chip + gear + account in right slot, no Control route, statusbar "paused" from autopilot state.                                  |
| `hooks/watch/channelEngine.ts` (+test)                                         | `pickAutoSelectChannel(channels, allowlist)`; used by `useChannelAutopilot` (refactor only).                                                    |
| `hooks/watch/useChannels.ts`                                                   | `view === "control"` gate → `channelPickerOpen` (channels are tracked while the picker is open, as they were while Control was open).           |
| `hooks/app/useAppModel.ts`                                                     | Autopilot pause/resume, manual-pick tracking, back-to-auto, picker open state, farm plan, needs-you inputs; `controlProps`/`heroProps` removed. |
| `features/overview/overviewModel.ts` (+test)                                   | `resolveAutopilotState`, `resolveHeroState`, `buildNeedsYouItems`, `channelInitials`.                                                           |
| `features/overview/channelPicker.ts` (+test)                                   | `buildChannelPickerRows({ channels, allowlist, watchingId, query })`.                                                                           |
| `features/overview/planTable.ts` (+test)                                       | `buildPlanTable(plan, { items, gameOrder, activeDrop, now, limit })`, `formatPlanClock(ts, now)`.                                               |
| `features/overview/engineVoice.ts` (+test)                                     | Moved from `control/controlHelpers.ts` (only the narration helpers still used).                                                                 |
| `features/overview/HeroPanel.tsx`                                              | Rewritten per mockup.                                                                                                                           |
| `features/overview/ChannelPicker.tsx`                                          | New popover.                                                                                                                                    |
| `features/overview/NeedsYouPanel.tsx`                                          | New.                                                                                                                                            |
| `features/overview/EnginePanel.tsx`                                            | Plain rows + expandable Engine Voice row.                                                                                                       |
| `features/overview/PlanPanel.tsx`                                              | New, replaces `QueuePanel.tsx`.                                                                                                                 |
| `features/overview/ActivityPanel.tsx`, `ui/feed-item.tsx`                      | Light restyle.                                                                                                                                  |
| `features/control/*`, `overview/QueuePanel.tsx`, `overview/AttentionStrip.tsx` | Deleted.                                                                                                                                        |
| `shared/i18n.tsx`, `app.css`, `CHANGELOG.md`                                   | Keys (EN + DE), `--dp-warn-soft`, changelog lines.                                                                                              |

## Tasks

- [ ] 1. `resolveView` + nav: tabs, labels `drops`/`games`, gear, chip, titlebar gear removed, banner moved. (TDD `resolveView`, `resolveAutopilotState`.)
- [ ] 2. `pickAutoSelectChannel` refactor (TDD), `channelPickerOpen` gate.
- [ ] 3. Overview view-models (TDD): hero state, needs-you, channel picker rows, plan table, plan clock.
- [ ] 4. Hero + channel picker + needs-you + engine panel + plan panel + activity restyle; OverviewView layout.
- [ ] 5. useAppModel wiring; delete Control and unused components/keys.
- [ ] 6. CHANGELOG; verification (lint, format, typecheck, test, build); screenshots.

## Review focus

- Paused: hero amber, no ETA, no "live" kicker; chip says paused; statusbar says paused.
- Manual pick: `your pick` disappears as soon as the engine switches channel; `auto` is disabled without a pick.
- Plan with nothing watched: `activeDrop: null` (no "watching" row).
- Needs-you only renders when it has items; claim keeps `narrateClaim` feedback.
