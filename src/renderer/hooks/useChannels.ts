import { useEffect, useState } from "react";
import type { AutoSwitchInfo, ChannelEntry, ErrorInfo, View, WatchingState } from "../types";
import { getDemoChannels } from "../demoData";
import { errorInfoFromIpc, errorInfoFromUnknown } from "../utils/errors";
import {
  isArrayOf,
  isChannelEntry,
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
} from "../utils/ipc";
import { logDebug, logInfo, logWarn } from "../utils/logger";

type Params = {
  targetGame: string;
  view: View;
  watching: WatchingState;
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  fetchInventory: () => void;
  autoSelectEnabled: boolean;
  autoSwitchEnabled: boolean;
  allowWatching: boolean;
  canWatchTarget: boolean;
  demoMode?: boolean;
  onAuthError?: (message?: string) => void;
};

export function useChannels({
  targetGame,
  view,
  watching,
  setWatchingFromChannel,
  fetchInventory,
  autoSelectEnabled,
  autoSwitchEnabled,
  allowWatching,
  canWatchTarget,
  demoMode,
  onAuthError,
}: Params) {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const [channelError, setChannelError] = useState<ErrorInfo | null>(null);
  const [channelsLoading, setChannelsLoading] = useState<boolean>(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [fetchedGame, setFetchedGame] = useState<string>("");
  const [autoSwitch, setAutoSwitch] = useState<AutoSwitchInfo | null>(null);

  const isFresh = (game: string, now = Date.now()) =>
    fetchedAt !== null &&
    fetchedGame === game &&
    now - fetchedAt < 5 * 60_000 &&
    channels.length > 0;

  const fetchChannels = async (gameName: string, { force }: { force?: boolean } = {}) => {
    if (!allowWatching) return;
    if (!gameName) return;
    const now = Date.now();
    if (!force && isFresh(gameName, now)) {
      logDebug("channels: skip (fresh cache)", { game: gameName });
      return;
    }

    setChannelsLoading(true);
    setChannelError(null);
    try {
      if (demoMode) {
        const list = getDemoChannels(gameName);
        setChannels(list);
        setFetchedAt(now);
        setFetchedGame(gameName);
        const shouldSkipInventory = autoSelectEnabled && !watching;
        if (shouldSkipInventory) {
          logDebug("channels: skip inventory fetch (auto-select will fetch after watching is set)");
        } else {
          fetchInventory();
        }
        return;
      }
      logInfo("channels: fetch start", { game: gameName, force });
      const res: unknown = await window.electronAPI.twitch.channels({ game: gameName });
      if (isIpcErrorResponse(res)) {
        if (isIpcAuthErrorResponse(res)) {
          onAuthError?.(res.message);
          setChannels([]);
          setChannelError(null);
          logWarn("channels: auth error", res);
          return;
        }
        setChannelError(
          errorInfoFromIpc(res, {
            code: "channels.fetch_failed",
            message: "Unable to load channels",
          }),
        );
        setChannels([]);
        logWarn("channels: fetch error", res);
        return;
      }
      if (!isArrayOf(res, isChannelEntry)) {
        setChannelError({
          code: "channels.invalid_response",
          message: "Invalid channels response",
        });
        setChannels([]);
        logWarn("channels: invalid response", res);
        return;
      }
      const list = res;
      logInfo("channels: fetch success", { game: gameName, count: list.length });
      logDebug("channels: sample", list.slice(0, 3));
      setChannels(list);
      setFetchedAt(now);
      setFetchedGame(gameName);
      const shouldSkipInventory = autoSelectEnabled && !watching;
      if (shouldSkipInventory) {
        logDebug("channels: skip inventory fetch (auto-select will fetch after watching is set)");
      } else {
        // Nach Channel-Fetch auch Inventar neu laden, damit Drop-Progress aktuell bleibt.
        fetchInventory();
      }
    } catch (err) {
      setChannelError(
        errorInfoFromUnknown(err, {
          code: "channels.fetch_failed",
          message: "Unable to load channels",
        }),
      );
      setChannels([]);
    } finally {
      setChannelsLoading(false);
    }
  };

  const shouldTrackChannels =
    allowWatching && (view === "control" || autoSelectEnabled || watching || autoSwitchEnabled);

  // Reset when switching demo mode
  useEffect(() => {
    if (demoMode === undefined) return;
    setChannels([]);
    setChannelError(null);
    setChannelsLoading(false);
    setFetchedAt(null);
    setFetchedGame("");
    setAutoSwitch(null);
  }, [demoMode]);

  // Fetch when control view is active or auto-watch needs channel data (respect cache)
  useEffect(() => {
    if (!shouldTrackChannels) return;
    if (!targetGame) return;
    if (!isFresh(targetGame)) {
      fetchChannels(targetGame, { force: true });
    }
  }, [
    view,
    targetGame,
    allowWatching,
    demoMode,
    autoSelectEnabled,
    autoSwitchEnabled,
    watching,
    shouldTrackChannels,
  ]);

  // Auto-refresh every 5m while control is active or auto-watching in background (cache-aware)
  useEffect(() => {
    if (!shouldTrackChannels) return;
    const id = window.setInterval(() => {
      if (!targetGame) return;
      if (!isFresh(targetGame)) {
        fetchChannels(targetGame, { force: true });
      }
    }, 5 * 60_000);
    return () => window.clearInterval(id);
  }, [
    view,
    targetGame,
    fetchedAt,
    fetchedGame,
    channels.length,
    allowWatching,
    demoMode,
    autoSelectEnabled,
    autoSwitchEnabled,
    watching,
    shouldTrackChannels,
  ]);

  // Auto-select first channel if none selected
  useEffect(() => {
    if (!allowWatching) return;
    if (!autoSelectEnabled) return;
    if (!canWatchTarget) return;
    if (channels.length && !watching) {
      const first = channels[0];
      setWatchingFromChannel(first);
      fetchInventory();
    }
  }, [
    channels,
    watching,
    targetGame,
    autoSelectEnabled,
    allowWatching,
    canWatchTarget,
    setWatchingFromChannel,
    fetchInventory,
  ]);

  // Auto-switch if current channel disappears
  useEffect(() => {
    if (!allowWatching) return;
    if (!watching) return;
    if (!channels.length) return;
    if (!autoSwitchEnabled) return;
    const stillThere = channels.some((c) => c.id === watching.id);
    if (!stillThere) {
      const first = channels[0];
      setWatchingFromChannel(first);
      setAutoSwitch({
        at: Date.now(),
        reason: "offline",
        from: { id: watching.id, name: watching.name },
        to: { id: first.id, name: first.displayName },
      });
      fetchInventory();
    }
  }, [
    channels,
    watching,
    autoSelectEnabled,
    allowWatching,
    autoSwitchEnabled,
    setWatchingFromChannel,
    fetchInventory,
  ]);

  useEffect(() => {
    if (allowWatching) return;
    setChannels([]);
    setChannelError(null);
    setChannelsLoading(false);
    setFetchedAt(null);
    setFetchedGame("");
    setAutoSwitch(null);
  }, [allowWatching]);

  return {
    channels,
    channelError,
    channelsLoading,
    autoSwitch,
    fetchChannels,
  };
}
