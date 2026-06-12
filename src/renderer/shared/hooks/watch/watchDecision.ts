export type WatchDecision =
  | "no-target"
  | "suppressed"
  | "cooldown"
  | "watching-progress"
  | "watching-recover"
  | "watching-no-farmable"
  | "watching-no-watchable"
  | "idle-loading-channels"
  | "idle-no-channels"
  | "idle-ready"
  | "idle-no-watchable-drops";

/**
 * Classify the engine's current posture for the UI/debug snapshot. Pure
 * precedence chain — inputs are pre-computed booleans so the order of checks
 * is the single source of truth.
 */
export const deriveWatchDecision = (input: {
  /** Trimmed suppressed game ("" when none). */
  suppressionGame: string;
  activeTargetGame: string;
  targetGame: string;
  isTargetInCooldown: boolean;
  isWatching: boolean;
  canWatchTarget: boolean;
  isRecoveringNoProgress: boolean;
  hasPredictiveProgress: boolean;
  hasFarmableActiveDrop: boolean;
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  allowlistedLiveChannels: number;
}): WatchDecision => {
  const activeTarget = input.activeTargetGame.trim();
  if (input.suppressionGame && activeTarget && input.suppressionGame === activeTarget) {
    return "suppressed";
  }
  if (input.targetGame && input.isTargetInCooldown) {
    return "cooldown";
  }
  if (!input.targetGame) {
    return "no-target";
  }
  if (input.isWatching) {
    if (!input.canWatchTarget) return "watching-no-watchable";
    if (input.isRecoveringNoProgress) return "watching-recover";
    if (input.hasPredictiveProgress || input.hasFarmableActiveDrop) return "watching-progress";
    return "watching-no-farmable";
  }
  if (input.channelsLoading || input.channelsRefreshing) {
    return "idle-loading-channels";
  }
  if (input.allowlistedLiveChannels === 0) {
    return "idle-no-channels";
  }
  if (input.canWatchTarget) {
    return "idle-ready";
  }
  return "idle-no-watchable-drops";
};
