/** The sections of the one-page settings view, in index order. */
export type SettingsSectionKey =
  | "autopilot"
  | "notifications"
  | "appearance"
  | "app"
  | "account"
  | "advanced";

export type SettingsSection = { key: SettingsSectionKey; id: string };

const ORDER: SettingsSectionKey[] = [
  "autopilot",
  "notifications",
  "appearance",
  "app",
  "account",
  "advanced",
];

/**
 * The sections shown on this platform. `app` (start at login, tray) only has
 * options on Windows, so it is left out elsewhere — as it was before.
 */
export function settingsSections({ showApp }: { showApp: boolean }): SettingsSection[] {
  return ORDER.filter((key) => showApp || key !== "app").map((key) => ({
    key,
    id: `settings-${key}`,
  }));
}

/**
 * The section the index highlights: the last one whose heading has scrolled to
 * `offset` (px from the scroll container's top) or above, the first one before
 * any has, and the last one once the page is scrolled to the bottom (a short
 * last section never reaches the top).
 */
export function pickActiveSection(
  positions: Array<{ key: SettingsSectionKey; top: number }>,
  { offset, atBottom }: { offset: number; atBottom: boolean },
): SettingsSectionKey | null {
  if (positions.length === 0) return null;
  if (atBottom) return positions[positions.length - 1].key;
  let active = positions[0].key;
  for (const p of positions) {
    if (p.top <= offset) active = p.key;
  }
  return active;
}
