import { useEffect, useRef } from "react";
import type { WatchingState } from "@renderer/shared/types";

// Live drop-progress reconciliation while watching. The `user-drop-events`
// PubSub topic delivers drop-progress only intermittently (goes silent for
// long stretches), so we back it with the DropCurrentSessionContext GQL query
// — the same query the Twitch web player + TwitchDropsMiner use. Mirroring
// TDM, the poll is REACTIVE, not a blind timer: a cheap tick checks whether
// the watched drop has been confirmed (by a push event OR a previous poll)
// within STALL_MS; only if it's gone stale do we spend a request. So while
// events flow we make zero extra calls, and when they're silent we degrade to
// ~one poll per stall window. Stays under the radar by construction.
const DROP_PROGRESS_TICK_MS = 15_000; // how often we *check* (no request)
const DROP_PROGRESS_STALL_MS = 60_000; // poll only after this much silence

type Params = {
  watching: WatchingState;
  demoMode: boolean;
  pollDropProgressOnce: (channelId: string) => Promise<unknown>;
  pollDropProgressIfStale: (channelId: string, staleMs: number) => Promise<unknown>;
};

export function useDropProgressPoll({
  watching,
  demoMode,
  pollDropProgressOnce,
  pollDropProgressIfStale,
}: Params) {
  const isWatchingForPoll = Boolean(watching) && !demoMode;
  // The DropCurrentSessionContext query needs the watched channel id. Track it
  // in a ref so the poll always uses the current channel without restarting the
  // interval (and resetting its timer) every time the user switches channels.
  const watchingChannelIdRef = useRef<string>("");
  watchingChannelIdRef.current = String(watching?.channelId ?? watching?.id ?? "");
  useEffect(() => {
    if (!isWatchingForPoll) return;
    // One unconditional baseline poll on watch start so the user sees progress
    // shortly after starting (also seeds the stall clock). After that the gate
    // takes over and only polls when the live data has actually gone stale.
    void pollDropProgressOnce(watchingChannelIdRef.current);
    const id = window.setInterval(() => {
      void pollDropProgressIfStale(watchingChannelIdRef.current, DROP_PROGRESS_STALL_MS);
    }, DROP_PROGRESS_TICK_MS);
    return () => window.clearInterval(id);
  }, [isWatchingForPoll, pollDropProgressOnce, pollDropProgressIfStale]);
}
