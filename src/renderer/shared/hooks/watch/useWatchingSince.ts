import { useRef } from "react";

/**
 * Engine-watch uptime tracking.
 *
 * The "uptime" shown in the Overview EnginePanel is the wall-clock time the
 * watch engine has been *actively watching*. It must:
 *  - start when watching transitions from inactive -> active,
 *  - survive a channel switch (active -> active keeps the original start), and
 *  - reset to null when watching stops (active -> inactive, i.e. pause/stop).
 *
 * Previously this was a `useRef(Date.now())` inside EnginePanel, which reset on
 * every component remount — so switching away from the Overview tab and back
 * silently restarted the counter. The start time is derived here from the
 * watching active-flag instead, so it is stable across remounts.
 */
export type WatchingSinceState = { active: boolean; since: number | null };

export const INITIAL_WATCHING_SINCE: WatchingSinceState = { active: false, since: null };

/**
 * Pure transition: given the current `active` flag, the previous state and the
 * current time, return the next state. Stamps `since` only on the
 * inactive -> active edge; keeps it while active; clears it once inactive.
 */
export function nextWatchingSince(
  active: boolean,
  prev: WatchingSinceState,
  now: number,
): WatchingSinceState {
  if (!active) {
    return prev.active || prev.since !== null ? INITIAL_WATCHING_SINCE : prev;
  }
  if (!prev.active) {
    return { active: true, since: now };
  }
  return prev;
}

/**
 * Thin hook wrapper around {@link nextWatchingSince}. Returns the timestamp the
 * engine started watching, or null when not watching. Updating the ref during
 * render is intentional and idempotent (re-running with the same `active`
 * returns the same state), so React strict-mode double renders are safe.
 */
export function useWatchingSince(active: boolean): number | null {
  const ref = useRef<WatchingSinceState>(INITIAL_WATCHING_SINCE);
  ref.current = nextWatchingSince(active, ref.current, Date.now());
  return ref.current.since;
}
