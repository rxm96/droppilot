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
