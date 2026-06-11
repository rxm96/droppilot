import { useMemo } from "react";
import type { MutableRefObject } from "react";
import { DropChannelRestriction, type ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import type { ActiveDropInfo } from "@renderer/shared/hooks/inventory";
import type { GameCooldownMap } from "./gameCooldowns";
import { deriveWatchDecision } from "./watchDecision";
import {
  MANUAL_STOP_SUPPRESSION_HOLD_MS,
  STALL_STOP_SUPPRESSION_HOLD_MS,
  type WatchEngineState,
} from "./watchEngine";
import type { WatchStallTracker } from "./watchStallRecovery";

type Params = {
  watchEngineState: WatchEngineState;
  stalledGameCooldownUntil: GameCooldownMap;
  isInCooldown: (game: string, now?: number) => boolean;
  channelAllowlist: ChannelAllowlist | null;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  targetGame: string;
  activeTargetGame: string;
  activeDropInfo: ActiveDropInfo | null;
  canWatchTarget: boolean;
  watching: WatchingState;
  /** Non-reactive read by design — ref identity is stable; .current is read fresh per recompute. */
  stallTrackerRef: MutableRefObject<WatchStallTracker | null>;
};

export function useWatchEngineSnapshot({
  watchEngineState,
  stalledGameCooldownUntil,
  isInCooldown,
  channelAllowlist,
  channels,
  channelsLoading,
  channelsRefreshing,
  targetGame,
  activeTargetGame,
  activeDropInfo,
  canWatchTarget,
  watching,
  stallTrackerRef,
}: Params) {
  return useMemo(() => {
    const now = Date.now();
    const suppressionGame = watchEngineState.suppressedTargetGame.trim();
    const suppressionReason = watchEngineState.suppressionReason;
    const suppressionAt = watchEngineState.suppressedAt;
    const holdMs =
      suppressionReason === "stall-stop"
        ? STALL_STOP_SUPPRESSION_HOLD_MS
        : suppressionReason === "manual-stop"
          ? MANUAL_STOP_SUPPRESSION_HOLD_MS
          : 0;
    const suppressionHoldRemainingMs =
      holdMs && typeof suppressionAt === "number" && Number.isFinite(suppressionAt)
        ? Math.max(0, suppressionAt + holdMs - now)
        : 0;
    const activeCooldowns = Object.entries(stalledGameCooldownUntil)
      .map(([rawGame, until]) => ({ game: rawGame.trim(), until }))
      .filter(
        ({ game, until }) =>
          game.length > 0 && typeof until === "number" && Number.isFinite(until) && until > now,
      )
      .sort((a, b) => a.until - b.until)
      .map(({ game, until }) => ({
        game,
        until,
        remainingMs: Math.max(0, until - now),
      }));
    const allowlistRestriction = DropChannelRestriction.fromAllowlist(channelAllowlist);
    const allowlistedLiveChannels = allowlistRestriction.hasConstraints
      ? channels.filter((channel) => allowlistRestriction.allowsChannel(channel)).length
      : channels.length;
    const stallTracker = stallTrackerRef.current;
    const noProgressTracker =
      stallTracker && watching
        ? {
            recoveryCount: stallTracker.recoveryCount,
            sinceProgressMs: Math.max(0, now - stallTracker.lastProgressAt),
          }
        : null;
    const hasPredictiveProgress = Boolean(
      activeDropInfo &&
      typeof activeDropInfo.eta === "number" &&
      Number.isFinite(activeDropInfo.eta),
    );
    const hasFarmableActiveDrop = Boolean(activeDropInfo);
    const isRecoveringNoProgress = Boolean(
      noProgressTracker && noProgressTracker.recoveryCount > 0,
    );

    const decision = deriveWatchDecision({
      suppressionGame,
      activeTargetGame,
      targetGame,
      isTargetInCooldown: Boolean(targetGame) && isInCooldown(targetGame, now),
      isWatching: Boolean(watching),
      canWatchTarget,
      isRecoveringNoProgress,
      hasPredictiveProgress,
      hasFarmableActiveDrop,
      channelsLoading,
      channelsRefreshing,
      allowlistedLiveChannels,
    });

    return {
      decision,
      targetGame,
      activeTargetGame,
      suppression:
        suppressionGame && suppressionReason
          ? {
              game: suppressionGame,
              reason: suppressionReason,
              sinceAt: suppressionAt,
              holdRemainingMs: suppressionHoldRemainingMs,
            }
          : null,
      activeCooldowns,
      allowlistActive: allowlistRestriction.hasConstraints,
      allowlistedLiveChannels,
      totalLiveChannels: channels.length,
      noProgressTracker,
    };
  }, [
    activeDropInfo,
    activeTargetGame,
    canWatchTarget,
    channelAllowlist,
    channels,
    channelsLoading,
    channelsRefreshing,
    isInCooldown,
    stalledGameCooldownUntil,
    stallTrackerRef,
    targetGame,
    watchEngineState.suppressedAt,
    watchEngineState.suppressedTargetGame,
    watchEngineState.suppressionReason,
    watching,
  ]);
}
