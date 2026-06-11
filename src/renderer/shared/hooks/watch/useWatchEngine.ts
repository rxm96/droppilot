import { useCallback, useEffect, useReducer, useRef } from "react";
import { logDebug, logInfo } from "@renderer/shared/utils/logger";
import {
  selectVisibleTargetGame,
  stampWatchEngineEvent,
  watchEngineReducer,
  WATCH_ENGINE_INITIAL_STATE,
  type WatchEngineEvent,
} from "./watchEngine";

/**
 * Owns the suppression reducer plus the logging dispatch wrapper. The wrapper
 * pre-computes prev/next purely for structured logging — the reducer is pure,
 * so running it twice (here and in React's dispatch) is safe.
 */
export function useWatchEngine() {
  const [state, dispatch] = useReducer(watchEngineReducer, WATCH_ENGINE_INITIAL_STATE);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dispatchEvent = useCallback(
    (event: WatchEngineEvent, context: string) => {
      const stampedEvent = stampWatchEngineEvent(event, Date.now());
      const prev = stateRef.current;
      const next = watchEngineReducer(prev, stampedEvent);
      const changed =
        prev.suppressedTargetGame !== next.suppressedTargetGame ||
        prev.suppressionReason !== next.suppressionReason ||
        prev.suppressedAt !== next.suppressedAt;
      const eventTargetGame =
        "activeTargetGame" in stampedEvent
          ? stampedEvent.activeTargetGame
          : stampedEvent.type === "target/manual_set"
            ? stampedEvent.nextTargetGame
            : "";
      const prevVisibleTarget = selectVisibleTargetGame(prev, eventTargetGame);
      const nextVisibleTarget = selectVisibleTargetGame(next, eventTargetGame);
      if (stampedEvent.type !== "sync" || changed) {
        logDebug("watch-engine: event", { context, event: stampedEvent, prev, next, changed });
      }
      if (changed) {
        logInfo("watch-engine: suppression", {
          context,
          event: stampedEvent.type,
          suppressionFrom: prev.suppressedTargetGame || null,
          suppressionTo: next.suppressedTargetGame || null,
          reasonFrom: prev.suppressionReason ?? null,
          reasonTo: next.suppressionReason ?? null,
          suppressedAtFrom: prev.suppressedAt ?? null,
          suppressedAtTo: next.suppressedAt ?? null,
          visibleTargetFrom: prevVisibleTarget || null,
          visibleTargetTo: nextVisibleTarget || null,
        });
      }
      dispatch(stampedEvent);
    },
    [dispatch],
  );

  return { state, dispatchEvent };
}
