import { useEffect, useState } from "react";
import type { AutoSwitchInfo, ChannelEntry, ErrorInfo, View, WatchingState } from "../../types";
import { getDemoChannels } from "../../demoData";
import { logDebug, logInfo, logWarn } from "../../shared/utils/logger";
import { errorInfoFromIpc, errorInfoFromUnknown } from "../../shared/utils/errors";

type Params = {
  targetGame: string;
  view: View;
  watching: WatchingState;
  setWatching: (next: WatchingState) => void;
  fetchInventory: () => void;
  autoSelectEnabled: boolean;
  autoSwitchEnabled: boolean;
  allowWatching: boolean;
  demoMode?: boolean;
  onAuthError?: (message?: string) => void;
};

export function useChannels({
  targetGame,
  view,
  watching,
  setWatching,
  fetchInventory,
  autoSelectEnabled,
  autoSwitchEnabled,
  allowWatching,
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
      const res = await window.electronAPI.twitch.channels({ game: gameName });
      if ((res as any)?.error) {
        if ((res as any).error === "auth") {
          onAuthError?.((res as any).message);
          setChannels([]);
          setChannelError(null);
          logWarn("channels: auth error", res);
          return;
        }
        setChannelError(errorInfoFromIpc(res as any, "Channel-Fehler"));
        setChannels([]);
        logWarn("channels: fetch error", res);
        return;
      }
      const list = (res as ChannelEntry[]) ?? [];
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
      setChannelError(errorInfoFromUnknown(err, "Channel-Fehler"));
      setChannels([]);
    } finally {
      setChannelsLoading(false);
    }
  };

  // Fetch when entering control view or target changes (respect cache)
  useEffect(() => {
    if (demoMode === undefined) return;
    setChannels([]);
    setChannelError(null);
    setChannelsLoading(false);
    setFetchedAt(null);
    setFetchedGame("");
    setAutoSwitch(null);
  }, [demoMode]);

  useEffect(() => {
    if (!allowWatching) return;
    if (view !== "control") return;
    if (!targetGame) return;
    if (!isFresh(targetGame)) {
      fetchChannels(targetGame, { force: true });
    }
  }, [view, targetGame, allowWatching, demoMode]);

  // Auto-refresh every 5m in control view (cache-aware)
  useEffect(() => {
    if (!allowWatching) return;
    if (view !== "control") return;
    const id = window.setInterval(() => {
      if (!targetGame) return;
      if (!isFresh(targetGame)) {
        fetchChannels(targetGame, { force: true });
      }
    }, 5 * 60_000);
    return () => window.clearInterval(id);
  }, [view, targetGame, fetchedAt, fetchedGame, channels.length, allowWatching, demoMode]);

  // Auto-select first channel if none selected
  useEffect(() => {
    if (!allowWatching) return;
    if (view !== "control") return;
    if (!autoSelectEnabled) return;
    if (channels.length && !watching) {
      const first = channels[0];
      setWatching({
        id: first.id,
        name: first.displayName,
        game: first.game,
        login: first.login,
        channelId: first.id,
        streamId: first.streamId,
      });
      fetchInventory();
    }
  }, [channels, watching, view, targetGame, autoSelectEnabled, allowWatching]);

  // Auto-switch if current channel disappears
  useEffect(() => {
    if (!allowWatching) return;
    if (!watching) return;
    if (!channels.length) return;
    if (!autoSwitchEnabled) return;
    const stillThere = channels.some((c) => c.id === watching.id);
    if (!stillThere) {
      const first = channels[0];
      setWatching({
        id: first.id,
        name: first.displayName,
        game: first.game,
        login: first.login,
        channelId: first.id,
        streamId: first.streamId,
      });
      setAutoSwitch({
        at: Date.now(),
        reason: "offline",
        from: { id: watching.id, name: watching.name },
        to: { id: first.id, name: first.displayName },
      });
      fetchInventory();
    }
  }, [channels, watching, autoSelectEnabled, allowWatching, autoSwitchEnabled]);

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
