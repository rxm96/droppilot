import { useCallback, useEffect, useRef } from "react";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry, InventoryItem, WatchingState } from "@renderer/shared/types";
import type { ActiveDropInfo } from "@renderer/shared/hooks/inventory";
import { isGameActionable, type WithCategory } from "@renderer/shared/hooks/priority";
import { logInfo } from "@renderer/shared/utils/logger";
import type { CooldownReason } from "./gameCooldowns";
import { rotateToNextPriorityTarget } from "./retargetPolicy";
import type { WatchEngineEvent, WatchEngineState } from "./watchEngine";
import {
  decideIdleNoFarmable,
  decideNoProgressRecovery,
  decideWatchingNoFarmable,
  type NoFarmableMarker,
  type StallRecoveryAction,
  type WatchConfirmationProbe,
  type WatchStallTracker,
} from "./watchStallRecovery";

type Params = {
  allowWatching: boolean;
  autoSelectEnabled: boolean;
  watching: WatchingState;
  targetGame: string;
  activeTargetGame: string;
  setActiveTargetGame: (game: string) => void;
  setAutoSelectEnabled: (enabled: boolean) => void;
  priorityOrder: string[];
  orchestrationCategories: WithCategory[];
  allowUnlinkedGames: boolean;
  isInCooldown: (game: string, now?: number) => boolean;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  channelAllowlist: ChannelAllowlist | null;
  targetDrops: InventoryItem[];
  activeDropInfo: ActiveDropInfo | null;
  /** Unused in the effect body, deliberately in the deps: re-evaluates the stall when watchability flips. */
  canWatchTarget: boolean;
  lastWatchOk: number;
  /** watchStats.nextAt — clocks one stall evaluation per watch ping. */
  stallCheckHeartbeat: number;
  watchEngineState: WatchEngineState;
  dispatchWatchEngineEvent: (event: WatchEngineEvent, context: string) => void;
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
  setCooldown: (game: string, durationMs: number, reason: CooldownReason) => void;
  fetchChannels: (game: string, opts?: { force?: boolean }) => Promise<unknown>;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<unknown>;
};

/**
 * Executor for the stall-recovery decisions (see watchStallRecovery.ts). Owns
 * the tracker/probe/grace-marker refs; each evaluation feeds their values into
 * the pure decide* functions and applies the returned actions 1:1.
 */
export function useStallRecovery({
  allowWatching,
  autoSelectEnabled,
  watching,
  targetGame,
  activeTargetGame,
  setActiveTargetGame,
  setAutoSelectEnabled,
  priorityOrder,
  orchestrationCategories,
  allowUnlinkedGames,
  isInCooldown,
  channels,
  channelsLoading,
  channelsRefreshing,
  channelAllowlist,
  targetDrops,
  activeDropInfo,
  canWatchTarget,
  lastWatchOk,
  stallCheckHeartbeat,
  watchEngineState,
  dispatchWatchEngineEvent,
  setWatchingFromChannel,
  clearWatching,
  setCooldown,
  fetchChannels,
  fetchInventory,
}: Params) {
  const watchStallTrackerRef = useRef<WatchStallTracker | null>(null);
  const watchConfirmationProbeRef = useRef<WatchConfirmationProbe | null>(null);
  const noFarmableDropRef = useRef<NoFarmableMarker | null>(null);

  const getNextTargetGame = useCallback(
    (currentGame: string): string =>
      rotateToNextPriorityTarget({
        priorityOrder,
        currentGame,
        isGameBlocked: (game) => isInCooldown(game),
        isGameActionable: (game) =>
          isGameActionable(game, orchestrationCategories, { allowUpcoming: allowUnlinkedGames }),
      }),
    [allowUnlinkedGames, isInCooldown, orchestrationCategories, priorityOrder],
  );

  const runActions = useCallback(
    (actions: StallRecoveryAction[]) => {
      for (const action of actions) {
        switch (action.kind) {
          case "log":
            logInfo(action.message, action.data);
            break;
          case "switch-channel":
            setWatchingFromChannel(action.channel);
            break;
          case "set-cooldown":
            setCooldown(action.game, action.durationMs, action.reason);
            break;
          case "retarget":
            setActiveTargetGame(action.to);
            break;
          case "enable-auto-select":
            setAutoSelectEnabled(true);
            break;
          case "stop-watching":
            clearWatching();
            break;
          case "dispatch-stall-stop":
            dispatchWatchEngineEvent(
              { type: "watch/stall_stop", activeTargetGame: action.game },
              action.context,
            );
            break;
          case "refresh-channels":
            void fetchChannels(action.game, { force: true });
            break;
          case "refresh-inventory":
            void fetchInventory({ forceLoading: true });
            break;
          default: {
            // Compile-time exhaustiveness: a new StallRecoveryAction kind must be handled here.
            const unhandled: never = action;
            void unhandled;
            break;
          }
        }
      }
    },
    [
      clearWatching,
      dispatchWatchEngineEvent,
      fetchChannels,
      fetchInventory,
      setActiveTargetGame,
      setAutoSelectEnabled,
      setCooldown,
      setWatchingFromChannel,
    ],
  );

  // After a stall-stop suppression, move the target on to the next priority
  // game (the suppressed game stays hidden until its hold expires).
  useEffect(() => {
    if (watchEngineState.suppressionReason !== "stall-stop") return;
    const suppressedGame = watchEngineState.suppressedTargetGame;
    if (!suppressedGame || activeTargetGame !== suppressedGame) return;
    const nextGame = getNextTargetGame(suppressedGame);
    if (!nextGame) return;
    logInfo("watch-engine: retarget", {
      reason: "stall-stop",
      from: suppressedGame,
      to: nextGame,
    });
    setAutoSelectEnabled(true);
    setActiveTargetGame(nextGame);
  }, [
    activeTargetGame,
    getNextTargetGame,
    setAutoSelectEnabled,
    setActiveTargetGame,
    watchEngineState.suppressedTargetGame,
    watchEngineState.suppressionReason,
  ]);

  // The stall evaluation proper. Top-level branching mirrors the original
  // effect; each branch is a pure decision plus ref bookkeeping.
  //
  // Dep array: the original inline effect's deps are preserved item-for-item
  // (with renames getNextPriorityTargetGame→getNextTargetGame, setStalledGameCooldown
  // →setCooldown, watchStats.lastOk→lastWatchOk). `runActions` is additionally
  // listed; it is memoized on the same setters the original listed individually,
  // so it introduces no new firing.
  useEffect(() => {
    if (!watching) {
      watchStallTrackerRef.current = null;
      watchConfirmationProbeRef.current = null;
      const decision = decideIdleNoFarmable({
        allowWatching,
        autoSelectEnabled,
        targetGame,
        activeTargetGame,
        channelAllowlist,
        channels,
        channelsLoading,
        channelsRefreshing,
        noFarmable: noFarmableDropRef.current,
        getNextTargetGame,
      });
      noFarmableDropRef.current = decision.noFarmable;
      runActions(decision.actions);
      return;
    }
    if (!activeDropInfo && targetGame) {
      const decision = decideWatchingNoFarmable({
        watching,
        targetGame,
        activeTargetGame,
        channelAllowlist,
        channels,
        channelsLoading,
        targetDrops,
        noFarmable: noFarmableDropRef.current,
        now: Date.now(),
        getNextTargetGame,
      });
      noFarmableDropRef.current = decision.noFarmable;
      if (decision.resetStallTracking) {
        watchStallTrackerRef.current = null;
        watchConfirmationProbeRef.current = null;
      }
      runActions(decision.actions);
      return;
    }
    noFarmableDropRef.current = null;
    if (!activeDropInfo) {
      watchStallTrackerRef.current = null;
      watchConfirmationProbeRef.current = null;
      return;
    }
    const decision = decideNoProgressRecovery({
      watching,
      activeDropInfo,
      targetGame,
      activeTargetGame,
      channels,
      lastWatchOk,
      now: Date.now(),
      tracker: watchStallTrackerRef.current,
      confirmationProbe: watchConfirmationProbeRef.current,
      getNextTargetGame,
    });
    watchStallTrackerRef.current = decision.tracker;
    watchConfirmationProbeRef.current = decision.confirmationProbe;
    runActions(decision.actions);
  }, [
    allowWatching,
    activeTargetGame,
    activeDropInfo,
    autoSelectEnabled,
    canWatchTarget,
    channels,
    channelAllowlist,
    channelsLoading,
    channelsRefreshing,
    clearWatching,
    dispatchWatchEngineEvent,
    getNextTargetGame,
    fetchChannels,
    fetchInventory,
    runActions,
    setAutoSelectEnabled,
    setActiveTargetGame,
    setCooldown,
    setWatchingFromChannel,
    stallCheckHeartbeat,
    targetDrops,
    targetGame,
    watching,
    lastWatchOk,
  ]);

  return { watchStallTrackerRef };
}
