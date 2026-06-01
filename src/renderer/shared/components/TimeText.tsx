import * as React from "react";
import { useVisibleTick } from "@renderer/shared/hooks/useVisibleTick";

export type TimeTextProps = {
  /** Tick cadence in milliseconds. */
  intervalMs?: number;
  /** When false, the ticker is paused (holds the last value, runs no interval). */
  active?: boolean;
  /** Renders the output from the ticking `now`. Keep it cheap — it runs per tick. */
  render: (now: number) => React.ReactNode;
};

/**
 * A leaf that owns its own ticking clock and re-renders only itself. Use it to
 * show relative/elapsed time without forcing the surrounding component (or its
 * whole view) to re-render every tick. Pauses while the tab is hidden.
 */
export function TimeText({ intervalMs = 1000, active = true, render }: TimeTextProps) {
  const now = useVisibleTick(intervalMs, active);
  return <>{render(now)}</>;
}
