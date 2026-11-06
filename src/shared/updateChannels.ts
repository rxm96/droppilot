export const UPDATE_CHANNELS = ["stable", "preview"] as const;

export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

export const DEFAULT_UPDATE_CHANNEL: UpdateChannel = "stable";

export const normalizeUpdateChannel = (
  value: unknown,
  legacyBetaUpdates?: unknown,
): UpdateChannel => {
  if (value === "stable" || value === "preview") return value;
  return legacyBetaUpdates === true ? "preview" : DEFAULT_UPDATE_CHANNEL;
};

export const allowsPrereleaseBuilds = (channel: UpdateChannel): boolean => channel === "preview";

/**
 * The version a manual update check should offer, or null. Trusts the
 * updater's own `isUpdateAvailable` verdict: a merely different version (an
 * older stable while on an rc, a rejected prerelease) is not an update.
 */
export const getAvailableUpdateVersion = (
  result: { isUpdateAvailable?: boolean; updateInfo?: { version?: string } } | null | undefined,
): string | null => {
  const version = result?.updateInfo?.version;
  return result?.isUpdateAvailable === true && version ? version : null;
};
