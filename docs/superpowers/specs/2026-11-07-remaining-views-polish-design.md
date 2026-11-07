# Remaining Views Polish: drop details, debug, update — Design

**Date:** 2026-11-07
**Branch:** `feat/remaining-views-polish` (fresh off `main` @ ebd4a69)
**Status:** Direction approved (mockup review, "Passt, bauen")
**Mockups:** design canvas https://claude.ai/artifact/MLCZdWdfzmDtw1ctn2h5TY, bottom row "Restliche Views". The boards are `PolDropDetail`, `PolDebug` and `PolUpdate`.
**Parent:** `2026-11-06-ui-polish-redesign-design.md` ("Heute, poliert"). Its decisions still apply:

- Use `--dp-*` tokens.
- Mono is for data and labels, sans is for prose.
- Labels and buttons are lowercase. Status words are never uppercase.
- Pills use the shared vocabulary.

## Why

Three surfaces were left out of the redesign and still use the v4.0 look.

1. **Drop details (`InventoryDrawer`):** a blurred, full-height side drawer.
   - It repeats the row: title, pill, a progress bar with a different unit (`1h 30m watched · 2h 00m required` against the row's `90 / 120 min`). It never says _why_ a drop has its status. It ends in a dead "no actions available" line.
   - Its campaign dates show "ends 0s ago" for every running campaign. `formatRelative` clamps future timestamps to 0.
   - The user: "der passt null rein".
2. **Debug view:**
   - Six equal cards that wrap into a lonely sixth card.
   - Eight large shard cards with uppercase `DISCONNECTED` pills.
   - A log made of large pill-tagged cards.
   - Old outline buttons.
3. **Update overlay:**
   - A full-screen blurred overlay with a decorative orb. It blocks the whole app while the update _downloads_. Once downloaded, the only way out is `install update`.
   - Its release notes are empty for every release since #77. The body now has `### Added` / `### Changed` sub-headings, and `extractUserFacingSection` (main) stops at the first heading after "What's new for users".

## Decisions

### 1. Drop details open inline in the drops list (the drawer goes away)

- **Opening and closing:**
  - Clicking a drop row, or its title button, expands a details strip directly under the row. Clicking it again collapses it.
  - One drop is open at a time.
  - The title button gets `aria-expanded` and `aria-controls` (no more `aria-haspopup="dialog"`).
  - There is no backdrop, no Escape handling and no focus trap.
- **Strip layout** (board `PolDropDetail`), three columns:
  1. **The reward image**, larger (88px, from `row.imageUrl`), or the game tile when there is none.
  2. **A "why" sentence plus four facts.**
     - The "why" sentence is in sans, at most about 2 lines, and depends on status.
     - The facts are a mono `dl` with a label, a value and a sub-line:
       - `watched`: `w / r min` and `%`. The same unit as the row.
       - `ready`: clock and `in X` for farming rows; `—` plus a short reason otherwise.
       - `campaign`: name and `N drops` when the campaign summary has drops.
       - `campaign ends`: an absolute date like `Sat 9 Nov, 18:00`, with `in 2d` or `ended`. Use `Intl.DateTimeFormat` with the UI language.
  3. **Actions**, stacked buttons. Only the ones that apply:
     - `link account` (primary): when the drop needs an account link. It opens `campaign.accountLinkUrl`, or the connections page as the fallback (the existing `onOpenAccountLink`).
     - `+ add to games` (primary): when the game is not ranked and the drop is not expired.
     - `twitch inventory` (outline): for claimed drops. It opens `https://www.twitch.tv/drops/inventory`.
     - `campaign on twitch` (outline): when there is a `campaignId`. It opens `https://www.twitch.tv/drops/campaigns?dropID=<campaignId>`.
     - Never a "no actions" line. An empty column is fine.
- **The "why" sentence, by status and note.** It reuses `DropsRow.status`, `note` and `bucket`:
  - `watching`: "DropPilot is watching {channel} for this drop. It will be ready at {clock} and is claimed automatically." Without a channel: "DropPilot is farming this drop right now."
  - `next` / `queued`:
    - with an `after-switch` note: "DropPilot switches to {game} at {clock} and farms this drop then."
    - with an `ends-first` note: "The campaign ends before this drop can finish, so DropPilot will probably not get it."
    - otherwise: "Twitch counts watched minutes for every drop of a game at once, so this one fills up while {game} is farmed."
  - `waiting-claim` note: "Fully watched. DropPilot claims it as soon as Twitch allows it."
  - `claim`: "Finished and waiting to be claimed. The needs you panel on the overview can claim it."
  - `needs-link`: "Twitch only gives this reward once your {game} account is linked to Twitch. DropPilot skips it until then and picks it up after you link."
  - `blocked`: "DropPilot can't farm this drop right now: {reason}." Use the existing `formatBlockingReason`.
  - `not-farmed`:
    - game not ranked: "{game} is not in your games, so DropPilot does not farm it."
    - ranked: "Not farmed right now."
    - Append "The minutes here come from watching on Twitch yourself." when `watched > 0`.
    - The `no-watch` note gives: "This drop is not earned by watching."
    - If the campaign has not started yet, append "The campaign starts {date}."
  - `claimed`: "Claimed. It is in your Twitch drops inventory."
  - `expired`: "The campaign has ended."
- **Copy and code:**
  - German copy says the same, just as plain.
  - The selection logic and sentence choice live in a pure function: `buildDropDetails(row, ctx)` in `features/inventory/dropDetails.ts`. It returns keys and values, not translated strings, and has tests.
  - The component renders a `<tr><td colSpan=5>` under the row.
- **Removed:** `InventoryDrawer.tsx` and the `inventory.drawer.*` i18n keys.

### 2. Debug view (board `PolDebug`)

Same data, same behaviour, new layout.

- **Header:**
  - Title "Debug". Subline: "What the engine sees right now. Attach the report to a bug issue; nothing here changes how DropPilot farms."
  - On the right, a `copy report` button. It copies a plain-text report:
    - app version and timestamp
    - the state snapshot JSON
    - the last 200 log lines, formatted as `time level message` (+ args JSON)
  - The report text comes from a pure `buildDebugReport()` in `debugHelpers.ts`, with tests.
  - The `TOTAL: n` pill goes away.
  - The app version comes into the snapshot as `appVersion` (`useDebugSnapshot` input).
- **Status strip:**
  - One panel with six cells divided by 1px lines, replacing `DebugSummary`'s card grid. Grid columns: 6 on wide windows, 3 below about 1100px.
  - Each cell has a tone dot, a mono label, a mono value (15px) and a sub-line.
  - The value is coloured only for warn and error. Ok values stay `--dp-text`. That replaces the green "JumpMaster".
- **Left column:**
  - `runtime`: a definition list, one row per fact (label left, value + sub right).
  - `live tracker`:
    - The header summary is "x of y shards connected", red when 0 connected and amber when partially connected.
    - One short help sentence (merged from the two old ones).
    - A compact table: shard, state (dot + lowercase word), subs `a / d`, reconnects.
- **Right column, `event log`:**
  - Header:
    - the title
    - the count `n kept`
    - a `● live` / `❚❚ paused` toggle button (green or amber)
    - an auto-scroll toggle labelled `follow`, `aria-pressed`
    - `clear`
  - Toolbar:
    - a search field
    - a segmented level filter: toggle buttons `debug n · info n · warn n · error n`, with `aria-pressed` and the multi-select behaviour kept
  - Rows are dense, one line each, in a grid: time (dim) · level (coloured lowercase word) · source (dim) · headline (sans 13px) · `×n` repeat.
    - The meta and details lines stay below the headline, small.
    - Args expand with a chevron toggle.
    - An error row keeps a red left accent.
  - `show older` and `jump to latest` stay.
- **`advanced`:**
  - One `<details>`, collapsed by default.
  - Inside: the PubSub simulator (labelled inputs `drop id`, `minutes`) and the snapshot viewer with `copy state snapshot`.
- **Removed:** `Pill` uses in debug (no uppercase status) and the `SectionLabel` kickers. Panels use the sans 13px semibold panel titles from the other screens.

### 3. Update flow (board `PolUpdate`)

- **Downloading no longer blocks the app.**
  - The titlebar chip shows `downloading 62 %` with a 56px mini progress bar.
  - The chip states: `update x.y.z · download`, `downloading n %`, `restart to update`.
  - The chips are lowercase and not uppercase-tracked.
- **When the download finishes, a dialog opens:**
  - Normal modal: `role="dialog"` and `aria-modal`, with a dim backdrop and no blur.
  - Kicker `update ready · v{current} → v{next}`, title "DropPilot {version} is ready", one sentence: "Restart to install it. Farming continues after the restart. If you choose later, it installs the next time DropPilot quits."
  - The release notes are grouped by their headings (added / changed / fixed / removed, lowercase mono labels) and scroll inside the dialog.
  - Buttons `later` (outline) and `restart now` (primary). `restart now` gets focus. Escape means later.
- **`later`** closes the dialog for that version. The chip then reads `restart to update`, and clicking it reopens the dialog.
  - electron-updater's default `autoInstallOnAppQuit` already installs on a full quit, so the sentence is true.
- **The main process remembers a downloaded update** (`src/main/updateState.ts`). The hourly check stops once one is downloaded. A manual check reports `downloaded` instead of `available`, because electron-updater would otherwise announce the same version as available again and undo "later". This was found in review.
- **`restart now`:** the dialog switches to "Restarting DropPilot…" with an indeterminate bar, then calls the existing install action.
- **The logic:** whether the dialog shows (hidden / ready / installing) comes from a pure `resolveUpdateDialog()` with tests. The component is `shared/components/UpdateDialog.tsx`, and it replaces `UpdateOverlay.tsx`.
  - The old overlay CSS (`.update-overlay*`, `.update-splash*`, the indeterminate keyframes if unused) and the fake-download preview code are removed.
- **Release notes fix (root cause):**
  - `extractReleaseNoteText`, `extractUserFacingSection` and `normalizeReleaseNotes` are duplicated in `src/main/index.ts` and `src/main/ipc/index.ts`. They move to `src/shared/updateNotes.ts`.
  - The user section ends only at a "full changelog / what's changed" heading, or at a heading of the same or a higher level than "What's new for users". `### Added` stays inside.
  - HTML headings (`</h1-6>`) become line breaks before tags are stripped.
  - A renderer parser `parseUpdateNoteSections(text)` returns `{ heading: string | null; items: string[] }[]`:
    - markdown `### X` or a bare non-bullet line starts a section
    - `- ` lines are items
  - Tests use the real v4.1.0 body.

## Non-goals

- Engine and update-check behaviour. The check cadence, channels and the settings update section stay.
- The settings `account & updates` section.
- macOS auto-update, which stays Windows-only.
- Drag-and-drop, new debug data, and a log export file.

## Done when

- typecheck, tests, lint (`--max-warnings 0`), `format:check` and build are clean.
- New pure functions have Vitest tests.
- EN and DE keys exist for all new copy. Removed keys are gone from both.
- Screenshots in dark and light:
  - the drops list with an expanded watching, needs-link and not-farmed drop
  - the debug view
  - the update dialog (ready, installing) and the downloading chip
- CHANGELOG `Unreleased` gets user-facing lines:
  - Changed: drop details inline, debug view, non-blocking update download with a ready dialog
  - Fixed: release notes in the update window are empty, "ends 0s ago"
