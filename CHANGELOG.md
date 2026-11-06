# Changelog

What changed in DropPilot, for the people who use it. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

Every change users notice gets a short line under `## [Unreleased]`, in the pull request that
makes it, under `### Added`, `### Changed`, `### Fixed` or `### Removed`. Write what users see,
not how the code changed. `npm run release:*` moves the lines under the next version, and the
GitHub Release (which the app's update history shows) is built from that section.

## [Unreleased]

### Changed

- The overview shows when a drop will be ready as a clock time with the minutes left, and the
  Control view shows the same clock time without seconds.

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

## [4.0.0] - 2026-11-06

### Fixed

- Drop progress counts again. Twitch changed how it credits watch time: DropPilot's watch pings
  were still accepted, but no minutes were added, so drops stopped progressing. DropPilot now
  watches streams the way the Twitch player does, and progress goes up every minute again.
- Update recommended: version 3.4.9 and older no longer earn drop progress.

### Changed

- The engine now checks in with the watched stream about every 20 seconds instead of once a
  minute. Watch-time stats still count one minute per minute watched.
