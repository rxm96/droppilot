import { useCallback, useReducer } from "react";
import type { ChannelEntry, WatchingState } from "../types";

type WatchingAction =
  | { type: "set"; next: WatchingState }
  | { type: "set_from_channel"; channel: ChannelEntry }
  | { type: "clear" };

const toWatchingState = (channel: ChannelEntry): Exclude<WatchingState, null> => ({
  id: channel.id,
  name: channel.displayName,
  game: channel.game,
  login: channel.login,
  channelId: channel.id,
  streamId: channel.streamId,
});

const isSameWatching = (a: WatchingState, b: WatchingState) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.game === b.game &&
    a.login === b.login &&
    a.channelId === b.channelId &&
    a.streamId === b.streamId
  );
};

const watchingReducer = (state: WatchingState, action: WatchingAction): WatchingState => {
  if (action.type === "clear") {
    return state === null ? state : null;
  }
  if (action.type === "set") {
    return isSameWatching(state, action.next) ? state : action.next;
  }
  const next = toWatchingState(action.channel);
  return isSameWatching(state, next) ? state : next;
};

export function useWatchingController(initial: WatchingState = null) {
  const [watching, dispatch] = useReducer(watchingReducer, initial);

  const setWatching = useCallback((next: WatchingState) => {
    dispatch({ type: "set", next });
  }, []);

  const setWatchingFromChannel = useCallback((channel: ChannelEntry) => {
    dispatch({ type: "set_from_channel", channel });
  }, []);

  const clearWatching = useCallback(() => {
    dispatch({ type: "clear" });
  }, []);

  return {
    watching,
    setWatching,
    setWatchingFromChannel,
    clearWatching,
  };
}
