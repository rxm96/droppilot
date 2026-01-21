import { useEffect, useMemo, useRef, useState } from "react";
import type { ChannelEntry } from "../../types";

type PrevChannel = { viewers: number; title: string };

const channelsFromMap = (source: Map<string, PrevChannel>): ChannelEntry[] => {
  const entries: ChannelEntry[] = [];
  for (const [id, data] of source) {
    entries.push({
      id,
      login: "",
      displayName: "",
      streamId: undefined,
      title: data.title,
      viewers: data.viewers,
      game: "",
    });
  }
  return entries;
};

export function useAnimatedChannels(channels: ChannelEntry[]) {
  const prevChannelsRef = useRef<Map<string, PrevChannel>>(new Map());
  const [exitingChannels, setExitingChannels] = useState<ChannelEntry[]>([]);

  const changedIds = useMemo(() => {
    const prev = prevChannelsRef.current;
    if (prev.size === 0) return new Set<string>();
    const changed = new Set<string>();
    for (const channel of channels) {
      if (!prev.has(channel.id)) {
        changed.add(channel.id);
      }
    }
    return changed;
  }, [channels]);

  useEffect(() => {
    const next = new Map<string, PrevChannel>();
    for (const channel of channels) {
      next.set(channel.id, { viewers: channel.viewers, title: channel.title || "" });
    }
    const removedIds: string[] = [];
    for (const [id] of prevChannelsRef.current) {
      if (!next.has(id)) removedIds.push(id);
    }
    if (removedIds.length > 0) {
      setExitingChannels((prev) => {
        const existing = new Set(prev.map((c) => c.id));
        const toAdd = channelsFromMap(prevChannelsRef.current).filter(
          (channel) => removedIds.includes(channel.id) && !existing.has(channel.id),
        );
        return [...prev, ...toAdd];
      });
      window.setTimeout(() => {
        setExitingChannels((prev) => prev.filter((c) => !removedIds.includes(c.id)));
      }, 240);
    }
    prevChannelsRef.current = next;
  }, [channels]);

  const combinedChannels: Array<ChannelEntry & { exiting?: boolean }> = useMemo(() => {
    const exitingMap = new Map(exitingChannels.map((c) => [c.id, c]));
    const merged: Array<ChannelEntry & { exiting?: boolean }> = [];
    for (const channel of channels) {
      merged.push({ ...channel, exiting: false });
      exitingMap.delete(channel.id);
    }
    for (const channel of exitingMap.values()) {
      merged.push({ ...channel, exiting: true });
    }
    return merged;
  }, [channels, exitingChannels]);

  return { combinedChannels, changedIds };
}
