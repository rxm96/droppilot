# Changelog

What changed in DropPilot, for the people who use it. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

Every change users notice gets a short line under `## [Unreleased]`, in the pull request that
makes it, under `### Added`, `### Changed`, `### Fixed` or `### Removed`. Write what users see,
not how the code changed. `npm run release:*` moves the lines under the next version, and the
GitHub Release (which the app's update history shows) is built from that section.

## [Unreleased]

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

### Removed

- The always-visible "claim now" button. Claiming now happens in the "needs you" panel when
  there is something to claim.
- The drops screen's game picker, column sorting and pages. Search covers drop, game and
  campaign names, and all drops are on one page.

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

## [4.0.0] - 2026-11-06

### Fixed

- Drop progress counts again. Twitch changed how it credits watch time: DropPilot's watch pings
  were still accepted, but no minutes were added, so drops stopped progressing. DropPilot now
  watches streams the way the Twitch player does, and progress goes up every minute again.
- Update recommended: version 3.4.9 and older no longer earn drop progress.

### Changed

- The engine now checks in with the watched stream about every 20 seconds instead of once a
  minute. Watch-time stats still count one minute per minute watched.
