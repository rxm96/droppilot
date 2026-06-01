import * as React from "react";

/**
 * Returns a `now` timestamp that advances every `intervalMs` while the tab is
 * visible and `active` is true. The interval is owned by whichever component
 * calls this hook, so isolating the tick inside a small leaf keeps time-based
 * re-renders off the rest of the tree.
 *
 * Pauses while `document.hidden` (no wasted ticks/re-renders when the window is
 * in the background) and resyncs immediately when the tab becomes visible again.
 * When `active` is false, no interval runs and the last value is held.
 */
export function useVisibleTick(intervalMs: number, active = true): number {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!active || typeof window === "undefined") return;

    let intervalId: number | null = null;
    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    const start = () => {
      if (intervalId !== null) return;
      setNow(Date.now());
      intervalId = window.setInterval(() => setNow(Date.now()), intervalMs);
    };

    const hidden = () => typeof document !== "undefined" && document.hidden;
    const onVisibility = () => {
      if (hidden()) stop();
      else start();
    };

    if (!hidden()) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, active]);

  return now;
}
