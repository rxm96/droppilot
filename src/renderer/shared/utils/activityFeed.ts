/**
 * Module-level activity feed store. Captures user-relevant lifecycle events
 * (drop claimed, channel auto-switched, new drops, watch errors, watch start)
 * and exposes them to the Overview ActivityPanel.
 *
 * Singleton pattern (similar to logStore): module-level state + subscriber
 * Set. Consumers use `useActivityFeed()` for React integration.
 *
 * The buffer is a fixed ring (MAX_EVENTS). Newest events come first, so the
 * panel can render a chronological "most recent first" view.
 */

import { useSyncExternalStore } from "react";

export type ActivityEvent =
  | {
      id: string;
      kind: "drop-claimed";
      at: number;
      title: string;
      game: string;
    }
  | {
      id: string;
      kind: "auto-switch";
      at: number;
      fromName: string;
      toName: string;
      reason: string;
    }
  | {
      id: string;
      kind: "new-drops";
      at: number;
      count: number;
      sampleTitle?: string;
    }
  | {
      id: string;
      kind: "watch-error";
      at: number;
      message?: string;
      code?: string;
    }
  | {
      id: string;
      kind: "watch-started";
      at: number;
      channelName: string;
      game?: string;
    };

const MAX_EVENTS = 30;

let events: ActivityEvent[] = [];
let nextId = 0;
const subscribers = new Set<() => void>();

function notify() {
  // Notify in a microtask so subscribers can safely call into React state
  // setters without re-entering the same render cycle.
  for (const cb of subscribers) {
    try {
      cb();
    } catch (err) {
      // Swallow subscriber errors so a misbehaving one can't block others.
      console.warn("activityFeed: subscriber error", err);
    }
  }
}

/**
 * Push a new event onto the feed. The caller supplies everything except `id`
 * (auto-generated) — `at` is required so the caller controls the timestamp
 * (allows back-dating from incoming PubSub events with their own timestamps).
 */
export function recordActivity(event: Omit<ActivityEvent, "id">): void {
  const next: ActivityEvent = { ...event, id: `${++nextId}` } as ActivityEvent;
  events = [next, ...events].slice(0, MAX_EVENTS);
  notify();
}

export function getActivityEvents(): ActivityEvent[] {
  return events;
}

export function subscribeActivity(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function clearActivity(): void {
  if (events.length === 0) return;
  events = [];
  notify();
}

/**
 * React hook that subscribes to the activity feed and re-renders on every
 * push. Returns the current event list (newest first, capped at MAX_EVENTS).
 */
export function useActivityFeed(): ActivityEvent[] {
  return useSyncExternalStore(subscribeActivity, getActivityEvents, getActivityEvents);
}
