import { useEffect } from "react";
import {
  MANUAL_STOP_SUPPRESSION_HOLD_MS,
  STALL_STOP_SUPPRESSION_HOLD_MS,
  type WatchEngineEvent,
  type WatchEngineState,
} from "./watchEngine";

type Params = {
  watchEngineState: WatchEngineState;
  dispatchWatchEngineEvent: (event: WatchEngineEvent, context: string) => void;
  activeTargetGame: string;
  /** `watching?.game ?? ""` — empty string when not watching. */
  watchingGame: string;
  shouldClearSuppressedWatching: boolean;
  clearWatching: () => void;
};

/**
 * Keeps the suppression reducer reconciled with the live target/watching pair:
 * a periodic `sync` (or a force-clear of a suppressed watch), plus a timer
 * that fires one extra `sync` exactly when a hold window expires so the
 * reducer can release the suppression without waiting for unrelated renders.
 */
export function useWatchSuppressionSync({
  watchEngineState,
  dispatchWatchEngineEvent,
  activeTargetGame,
  watchingGame,
  shouldClearSuppressedWatching,
  clearWatching,
}: Params) {
  useEffect(() => {
    if (shouldClearSuppressedWatching) {
      clearWatching();
      return;
    }
    dispatchWatchEngineEvent(
      {
        type: "sync",
        activeTargetGame,
        watchingGame,
      },
      "sync",
    );
  }, [
    activeTargetGame,
    clearWatching,
    dispatchWatchEngineEvent,
    shouldClearSuppressedWatching,
    watchingGame,
  ]);

  useEffect(() => {
    const reason = watchEngineState.suppressionReason;
    if (reason !== "stall-stop" && reason !== "manual-stop") return;
    const suppressedGame = watchEngineState.suppressedTargetGame.trim();
    const suppressedAt = watchEngineState.suppressedAt;
    if (!suppressedGame) return;
    if (typeof suppressedAt !== "number" || !Number.isFinite(suppressedAt)) return;
    const holdMs =
      reason === "stall-stop" ? STALL_STOP_SUPPRESSION_HOLD_MS : MANUAL_STOP_SUPPRESSION_HOLD_MS;
    const trimmedWatchingGame = watchingGame.trim();
    const runSync = () => {
      dispatchWatchEngineEvent(
        {
          type: "sync",
          activeTargetGame,
          watchingGame: trimmedWatchingGame,
          now: Date.now(),
        },
        `${reason}-hold-expire-sync`,
      );
    };
    const dueAt = suppressedAt + holdMs;
    const remainingMs = dueAt - Date.now();
    if (remainingMs <= 0) {
      runSync();
      return;
    }
    const timer = window.setTimeout(runSync, remainingMs);
    return () => window.clearTimeout(timer);
  }, [
    activeTargetGame,
    dispatchWatchEngineEvent,
    watchEngineState.suppressedAt,
    watchEngineState.suppressedTargetGame,
    watchEngineState.suppressionReason,
    watchingGame,
  ]);
}
