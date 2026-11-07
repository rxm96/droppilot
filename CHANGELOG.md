# Changelog

What changed in DropPilot, for the people who use it. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

Every change users notice gets a short line under `## [Unreleased]`, in the pull request that
makes it, under `### Added`, `### Changed`, `### Fixed` or `### Removed`. Write what users see,
not how the code changed. `npm run release:*` moves the lines under the next version, and the
GitHub Release (which the app's update history shows) is built from that section.

## [Unreleased]

### Fixed

- The demo mode hint and the debug tools section in Settings are now shown in German when
  the app is set to German.

## [4.1.0] - 2026-11-07

### Added

- A "plan · today" table on the overview shows when each drop will be ready, in the order
  they get farmed, when the app switches to the next game, and which drops are blocked and why.
- An autopilot button in the top bar shows whether DropPilot is running or paused, on every
  screen. Click it to pause or resume.
- "Switch channel" on the overview lists the live channels for the current game. Pick one to
  watch it, or press "auto" to let DropPilot choose again.
- A "needs you" panel on the overview appears only when you have to do something: claim
  finished drops, link a game account, or sign in again. The drops tab shows how many.

### Changed

- The overview shows when a drop will be ready as a clock time with the minutes left.
- The Control screen is merged into the overview. Tabs are now overview, drops, games and stats.
  Settings opens from the gear in the top bar.
- The overview's engine panel uses plain words: next drop check, channels with drops, and how
  long it has been running. The "why / next" explanation opens from the same panel.
- The drops screen groups drops by game, in the order DropPilot farms them, and shows when
  each drop will be ready. Each game shows its place in your games list, its campaign and when
  it ends. Games you have not added get an "add to games" button.
- The drops filter is now all, farming, needs you, claimed and not farmed, with a count for
  each. Expired campaigns are collected in a folded section at the bottom.
- Drops use the same status words everywhere: watching, next, queued, needs link, ready to
  claim, claimed and not farmed. "Live" now only ever means a live channel.
- The games screen shows your order next to the other games that have drops. Each of your
  games shows how many drops are left, when its campaign ends, and whether it is being farmed
  right now or needs an account link. Reorder with the up and down buttons or by dragging, and
  add a game with drops in one click instead of picking it from a list.
- "Strict priority order" is now a plain choice for when none of your games can be farmed:
  wait, or farm other games meanwhile.
- The stats screen shows watch time per day as bars, for the last 7, 30 or 90 days, with the
  total and the daily average. Your best streak sits next to the current one, and the activity
  calendar shows the last 26 weeks, one row per weekday.
- "Reset stats" moved from the stats screen to Settings, under advanced. It still asks before
  deleting anything.
- Settings is one page with an index on the left (autopilot, notifications, appearance, app,
  account & updates, advanced) instead of seven tabs. Every option has a plain name and a short
  description.
- The option for unlinked campaigns with badge or emote rewards is now under autopilot and says
  what it does: farm those campaigns without a linked game account.
- Sentences, descriptions and messages are set in the regular typeface across the app,
  including the debug view and the update window. The monospace font stays for numbers, times,
  status words, tabs and buttons, and button labels are lowercase everywhere ("sign in",
  "sign in again", "cancel").

### Removed

- The always-visible "claim now" button. Claiming now happens in the "needs you" panel when
  there is something to claim.
- The drops screen's game picker, column sorting and pages. Search covers drop, game and
  campaign names, and all drops are on one page.
- The current target, live in queue and top slot numbers on the games screen. The overview
  shows what is being farmed.

### Fixed

- Drops that became ready to claim are no longer shown as claimed before the claim actually
  went through. If a claim fails, or auto-claim is off, the drop stays available to claim.
- Finished drops can still be claimed during the 24 hours after their campaign ends.
- Logging out and back in with a different Twitch account no longer keeps using the previous
  account. Logging out also signs the login window out of Twitch.
- A damaged settings or stats file is now restored from its backup instead of being reset to
  defaults.
- "Check for updates" no longer offers an older or skipped version.
- Moving a game up the priority list now switches to it right away.
- Priority games now match regardless of upper/lower case.
- The overview's progress now shows the drop you are watching, instead of the whole game's
  progress, so it matches the queue below it.
- The drop details panel now shows the watched and required time, instead of only the
  words "watched · required".
- Exporting or importing settings shows a readable message instead of an internal text key.
- In demo mode, Settings shows the demo account, as the top bar does, instead of "Not signed
  in".
- In light mode, the count on the drops tab, the knob of the on/off switches, the check on the
  selected accent color and the empty days in the stats calendar are easy to see.
- DropPilot no longer logs you out at random while it is busy talking to Twitch, and a token
  refresh can no longer be lost.
- A drop is no longer claimed and counted twice when auto-claim and "Claim now" run at the
  same time.
- When Twitch rejects the live drop connection, DropPilot retries with increasing pauses instead
  of every two seconds.
- After you stop a game and then edit the priority list, DropPilot no longer rapidly starts and
  stops that game.
- When a stream stalls, DropPilot no longer switches back to the channel that just stalled, and
  gives the new channel a few minutes to start counting.
- A brief error while refreshing the channel list no longer stops the stream you are watching.

## [4.0.0] - 2026-11-06

### Fixed

- Drop progress counts again. Twitch changed how it credits watch time: DropPilot's watch pings
  were still accepted, but no minutes were added, so drops stopped progressing. DropPilot now
  watches streams the way the Twitch player does, and progress goes up every minute again.
- Update recommended: version 3.4.9 and older no longer earn drop progress.

### Changed

- The engine now checks in with the watched stream about every 20 seconds instead of once a
  minute. Watch-time stats still count one minute per minute watched.
