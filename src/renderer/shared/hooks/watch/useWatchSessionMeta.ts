import { useEffect, useRef, useState } from "react";
import type { WatchingState } from "@renderer/shared/types";

export type WatchedChannelIdentity = { id: string; login: string };

export function useWatchSessionMeta(watching: WatchingState) {
  const [lastWatchedChannelIdentity, setLastWatchedChannelIdentity] =
    useState<WatchedChannelIdentity | null>(null);
  useEffect(() => {
    if (!watching) return;
    const normalizedLogin = (watching.login ?? watching.name ?? "").trim().toLowerCase();
    setLastWatchedChannelIdentity((prev) => {
      if (prev?.id === watching.id && prev.login === normalizedLogin) {
        return prev;
      }
      return {
        id: watching.id,
        login: normalizedLogin,
      };
    });
  }, [watching]);

  // Stamp when the current watch session (channel+stream) began so useTargetDrops
  // can clamp its live-progress anchor to it — we must not credit elapsed time
  // from before the user started watching (e.g. a stale inventory snapshot).
  // Same session-key semantics ControlView uses, so both views agree.
  const watchSessionKeyRef = useRef<string | null>(null);
  const [watchStartedAt, setWatchStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!watching) {
      watchSessionKeyRef.current = null;
      setWatchStartedAt(null);
      return;
    }
    const sessionKey = `${watching.id}:${watching.streamId ?? ""}`;
    if (watchSessionKeyRef.current === sessionKey) return;
    watchSessionKeyRef.current = sessionKey;
    setWatchStartedAt(Date.now());
  }, [watching]);

  return { lastWatchedChannelIdentity, watchStartedAt };
}
