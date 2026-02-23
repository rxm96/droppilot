/**
 * Reducer state for target suppression.
 * - `suppressedTargetGame`: game hidden from automation/UI target selection.
 * - `suppressionReason`: why it is suppressed.
 * - `suppressedAt`: timestamp used for stall-stop hold behavior.
 */
export type WatchEngineState = {
  suppressedTargetGame: string;
  suppressionReason: "manual-stop" | "stall-stop" | null;
  suppressedAt: number | null;
};

/**
 * Events emitted by `useAppModel` to keep suppression in sync with user actions
 * and runtime watch state.
 */
export type WatchEngineEvent =
  | { type: "target/manual_set"; nextTargetGame: string }
  | { type: "watch/manual_start"; watchingGame: string }
  | { type: "watch/stop"; activeTargetGame: string; at?: number }
  | { type: "watch/stall_stop"; activeTargetGame: string; at?: number }
  | { type: "sync"; activeTargetGame: string; watchingGame: string; now?: number };

/**
 * Minimum hold window for stall suppression.
 * During this window the stalled game cannot be reintroduced.
 */
export const STALL_STOP_SUPPRESSION_HOLD_MS = 60_000;

export const WATCH_ENGINE_INITIAL_STATE: WatchEngineState = {
  suppressedTargetGame: "",
  suppressionReason: null,
  suppressedAt: null,
};

const normalize = (value: string | null | undefined): string => String(value ?? "").trim();

const clearSuppression = (state: WatchEngineState): WatchEngineState => {
  if (!state.suppressedTargetGame && !state.suppressionReason && state.suppressedAt === null) {
    return state;
  }
  return { ...state, suppressedTargetGame: "", suppressionReason: null, suppressedAt: null };
};

const setSuppression = (
  state: WatchEngineState,
  game: string,
  reason: "manual-stop" | "stall-stop",
  at?: number,
): WatchEngineState => {
  if (!game) return state;
  const suppressedAt = typeof at === "number" && Number.isFinite(at) ? at : Date.now();
  if (
    state.suppressedTargetGame === game &&
    state.suppressionReason === reason &&
    state.suppressedAt === suppressedAt
  ) {
    return state;
  }
  return { ...state, suppressedTargetGame: game, suppressionReason: reason, suppressedAt };
};

export const watchEngineReducer = (
  state: WatchEngineState,
  event: WatchEngineEvent,
): WatchEngineState => {
  switch (event.type) {
    case "target/manual_set":
      return clearSuppression(state);
    case "watch/manual_start": {
      const watchingGame = normalize(event.watchingGame);
      if (!watchingGame || watchingGame !== state.suppressedTargetGame) return state;
      return clearSuppression(state);
    }
    case "watch/stop":
      return setSuppression(state, normalize(event.activeTargetGame), "manual-stop", event.at);
    case "watch/stall_stop":
      return setSuppression(state, normalize(event.activeTargetGame), "stall-stop", event.at);
    case "sync": {
      if (!state.suppressedTargetGame) return state;
      const watchingGame = normalize(event.watchingGame);
      if (state.suppressionReason === "stall-stop") {
        const now =
          typeof event.now === "number" && Number.isFinite(event.now) ? event.now : Date.now();
        const suppressedAt = state.suppressedAt ?? now;
        // Keep suppression fixed during the hold window to prevent immediate bounce-back.
        if (now - suppressedAt < STALL_STOP_SUPPRESSION_HOLD_MS) {
          return state;
        }
        // After hold expiry keep suppression only if we are still on the same stalled game.
        if (watchingGame && watchingGame === state.suppressedTargetGame) {
          return state;
        }
        return clearSuppression(state);
      }
      if (!watchingGame || watchingGame === state.suppressedTargetGame) {
        return state;
      }
      return clearSuppression(state);
    }
    default:
      return state;
  }
};

export const selectIsTargetSuppressed = (
  state: WatchEngineState,
  activeTargetGame: string,
): boolean => {
  const target = normalize(activeTargetGame);
  return Boolean(state.suppressedTargetGame && target && state.suppressedTargetGame === target);
};

export const selectVisibleTargetGame = (
  state: WatchEngineState,
  activeTargetGame: string,
): string => {
  // Hidden target is represented as an empty string for downstream hooks/components.
  return selectIsTargetSuppressed(state, activeTargetGame) ? "" : normalize(activeTargetGame);
};

export const shouldForceClearWatchingOnSuppressedTarget = (
  state: WatchEngineState,
  watchingGame: string,
): boolean => {
  const watching = normalize(watchingGame);
  return Boolean(state.suppressedTargetGame && watching && watching === state.suppressedTargetGame);
};
