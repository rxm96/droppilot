# UI Polish Redesign ("Heute, poliert") — Design

**Date:** 2026-11-06
**Branch:** to be created fresh off `main` (e.g. `feat/ui-polish-redesign`)
**Status:** Direction approved (mockup review) — plan pending
**Mockups:** design canvas https://claude.ai/artifact/MLCZdWdfzmDtw1ctn2h5TY — boards `Polished`, `PolDrops`, `PolGames`, `PolStats`, `PolSettings` (top row). The rest of the canvas holds rejected directions, kept for the record.

## Goal

Keep DropPilot's Pro Console identity (dark, violet `#a78bfa`, mono for data) and fix what makes v4.0.0 hard to use:

1. **Numbers disagree.** Overview hero shows "62 % complete", the queue under it shows 34 % for the same drop, and Control shows 34 % with `eta 23:14:11` (a clock time next to a countdown elsewhere). Root cause: `HeroPanel` falls back to the aggregate `targetProgress` when `activeDropInfo` is missing (`useAppModel.ts` `activeDropProgress`) but still labels it as the drop's own percentage. The demo data hits this fallback.
2. **Two screens answer one question.** Overview and Control both show "currently watching", with different verbs (`pause` vs `stop`). Settings exists as a tab and as a titlebar gear, and the statusbar repeats overview data.
3. **No plan.** Users can't see when each drop will be ready or when the game switches; they have to do the math themselves.
4. **Engine vocabulary.** `watch_cycle`, `cadence`, `tracker disconnected`, `strict priority order`, raw campaign ids (`Campaign camp-v…rant`).
5. **Mono everywhere.** Prose, buttons and descriptions are set in mono, which hurts readability.
6. **Flat hierarchy.** Every block is an equal-weight card, a disabled `claim now` is the largest button, and the bottom half of Overview is empty.

## Decisions (locked during mockup review)

| Question          | Decision                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual direction  | **"Heute, poliert"** (style #6 in the style test). Same palette and identity, polished. Rejected: navy/sans redesign, Fluent, flight strips, loot launcher, download queue, Discord layout, battle-pass track.                                                             |
| Typography        | **Mono only for data and labels** (numbers, times, status pills, nav, kickers). **Sans for prose** (titles, sentences, descriptions, setting labels). Default pair stays Plex Sans + Plex Mono (`pro-console`).                                                            |
| Navigation        | Top tabs stay (mono, lowercase): `overview · drops · games · stats`. `control` is **merged into overview**. `inventory` → `drops`, `priorities` → `games`. Settings moves to the gear in the nav bar's right slot; the duplicate titlebar gear goes. `debug` stays opt-in. |
| Autopilot control | One **autopilot chip** (`● autopilot · running`) in the nav's right slot on every screen. Click toggles pause/resume. When paused, overview and the statusbar turn amber.                                                                                                  |
| Progress truth    | **One number per drop, from one source.** The hero always shows the active drop's own progress. With no active drop, it shows a different state (no aggregate % labelled as the drop's). ETA is always a **clock time plus relative** (`14:34` / `ready in 20 min`).       |
| Plan              | New **`plan · today`** table on overview: ready time, drop, watched, status, with a game-switch row between games and blocked drops listed with their reason. Replaces `QueuePanel`.                                                                                       |
| Needs-you         | Shown **only when something needs the user** (account link, manual claim, re-login). Amber panel on overview plus an amber count badge on the `drops` tab. The always-visible, disabled `claim now` goes away.                                                             |
| Priority rule     | `obeyPriority` is shown as a choice with two plain options: **Wait** / **Farm other games meanwhile**. No checkbox.                                                                                                                                                        |
| Statusbar         | Stays, slimmed to `engine state · claimed today · last sync · version`.                                                                                                                                                                                                    |

## Screens

### overview (merges Overview + Control)

- **Hero panel**:
  - kicker `● live · earning drop` (paused: `❚❚ paused`, amber), with game, campaign name and "ends in Xd" on the right
  - drop title (sans, 28px) and a one-line sans explanation
  - big mono ready time with `ready in N min` under it
  - 4px progress bar with `40 / 60 min watched` and the %
  - footer row: channel avatar, name, viewers, last ping, then `pause`, `switch channel`, `open stream`. These replace `ActiveSessionPanel` and `EngineStatusPanel`'s action duplicates.
- **needs you** (conditional, right column).
- **engine** (right column): user-facing facts only. Next drop check (clock time), live channels with drops, running for. The "why / next" narration from `EngineStatusPanel` (Engine Voice) stays reachable as an expandable row. Its content is unchanged; only its placement moves.
- **plan · today** (left, full table) and **activity** (right, existing feed restyled: tinted square icon, sans sentence, mono meta).
- **Channel switching** moves into a **popover** behind `switch channel`, replacing the permanent `ChannelGridPanel`. The mockup lives in the `Polished` board.
  - The popover lists the live channels of the current game with drops on, sorted by viewers. Each row shows the avatar, name, viewer count and "drops on", and the current channel is marked `● watching`. There is a filter field at the top.
  - Channels whose drops are off are still listed, disabled, with "would not count".
  - Picking a channel switches immediately, closes the popover, and marks the channel `your pick` in the hero. The pick sticks until the channel goes offline or stops counting progress; then auto-select takes over again.
  - The `auto` button in the popover footer returns to auto-select right away.
  - No thumbnails: the job is a quick pick, not browsing.
  - Picking reuses the existing `onStartWatching(channel)` path from `ChannelGridPanel`. Before implementing, verify against `docs/watch-engine.md` and the suppression reducer how long a manual pick survives auto-select and stall recovery today. The `your pick` label and the `auto` button must describe what the engine actually does; this redesign does not change engine behavior.

### drops (was inventory)

- Title, then a mono subline (`10 drops · 5 games · sorted in farm order`), search and refresh.
- Segmented filter with counts: `all · farming · needs you · claimed · not farmed`. These replace `All / priority / live / Upcoming / claimed / Not linked / Expired`, which mixed letter case and meaning. Expired campaigns move to a collapsed section at the bottom.
- **Grouped by game in farm order.** The group header shows: code tile, name, rank in your games, campaign, "ends in". Games not in the list get a `+ add to games` action.
- Row: reward image, name, mono note, progress bar with `w / r min`, ready time, status pill.
- One pill vocabulary across the app: `● watching` (violet), `next` / `queued` (outline), `needs link` (amber), `✓ claimed` (green), `not farmed` (dim). Pill text is never `LIVE`, because that word means a live channel.

### games (was priorities)

- List and adding are in one place:
  - Left: "your order", with ranks `01 02 03`, ▲ ▼ ✕ per row (keyboard-accessible; drag can come later), a `● farming` marker on the first farmable game, `needs link` on blocked ones, and an inline "add any game by name" field.
  - Right: "other games with drops · not farmed", each with `+ add`.
- The fallback rule fieldset (Wait / Farm other games meanwhile) maps to `obeyPriority`.

### stats

- KPI strip: drops claimed, watch time (accent), games, streak with best streak.
- Watch-time bar chart (7d / 30d / 90d) instead of the zig-zag line.
- Top games as bars.
- Heatmap as a real 7-row calendar with small cells and a legend, instead of the oversized blocks.
- "Reset stats" leaves this screen and goes to Settings › advanced (still behind the existing confirmation).

### settings

- One scrolling page with a left index: `autopilot · notifications · appearance · app · account & updates · advanced`. This replaces the 7-tab sidebar; the content is the same, regrouped.
- Every setting gets a plain-language label and description. Examples: "Check for new drops: every 60–70 min" instead of "Inventory refresh interval"; "Move on from stuck streams" for auto-switch.
- `Demo mode` and `Show debug view` go to advanced. Accent picker and font pair stay under appearance.

## Implementation notes

- **Pure, tested core.** Add a pure function to `shared/domain/` (e.g. `farmPlan.ts`): `buildFarmPlan({ priorityGames, inventory, activeDrop, obeyPriority, now })` → ordered rows `{ dropId, game, readyAt, watched, required, status, blockedReason? }` plus game-switch markers. It feeds both `plan · today` and the ready times in `drops`. Unit-test it with Vitest, following the repo's convention.
- **Progress source.** Remove the `targetProgress` fallback from the hero's "% complete" path. Hero and plan both read `activeDropInfo`. Add a test for the no-active-drop case.
- **Nav.** `App.tsx` nav items and `AppNavView`: drop `control`, rename the keys or labels (`inventory`→`drops`, `priorities`→`games`), and move settings to the right slot. Persisted `view` values need a small migration (`control` → `overview`).
- **Tokens.** Reuse `--dp-*`. Add `--dp-warn-soft` if it's missing. The prose font comes from `--dp-font-sans`, and the mono class is applied only to data.
- **i18n.** New and renamed keys in **both** EN and DE blocks of `shared/i18n.tsx`. Keep German copy just as plain.
- **Engine Voice.** The narration strings and countdowns are reused as they are. Only their container moves.
- **CHANGELOG.** Each PR adds user-facing lines under `## [Unreleased]`.

## Suggested phasing (one PR each)

1. `farmPlan` domain function + tests, and the progress-source fix (hero %, ETA format). No layout change.
2. Overview merge: hero rework, plan table, needs-you, engine panel, Control removed, channel grid moved behind `switch channel`, nav changes + view migration.
3. drops: grouping, new filters, unified status pills.
4. games: unified list, fallback rule as a choice.
5. stats + settings: regrouping and copy.
6. Typography sweep: mono → sans for prose across the remaining components; light-mode check.

## Out of scope

- Watch-engine behavior and refresh cadence (the "stay under the radar" constraint is unchanged).
- Real drag-and-drop reordering (▲ ▼ is enough for v1).
- Tray menu redesign.
- Planner / Engine Voice feature work beyond moving existing UI.

## Open questions

- Should `drops` keep the side drawer (`InventoryDrawer`) for row details, or is the row enough?
- Light mode: the mockups are dark only. Confirm the light variant during phase 6.
