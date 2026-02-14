import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChannelDiff,
  ChannelEntry,
  ChannelTrackerStatus,
  InventoryItem,
  WatchingState,
} from "@renderer/shared/types";

type ActiveDropInfo = {
  id: string;
  title: string;
  requiredMinutes: number;
  earnedMinutes: number;
  virtualEarned: number;
  remainingMinutes: number;
  eta: number | null;
  dropInstanceId?: string;
  campaignId?: string;
} | null;

type CampaignGroup = {
  key: string;
  title: string;
  tooltip?: string;
  items: InventoryItem[];
  active: boolean;
};

type ChannelDensity = "comfortable" | "balanced" | "compact";

const resolveChannelDensity = (count: number, current: ChannelDensity): ChannelDensity => {
  if (count <= 5) {
    return current === "comfortable" ? "comfortable" : "balanced";
  }
  return "compact";
};

const VIEWER_ANIM_DURATION_MS = 400;

type Params = {
  channels: ChannelEntry[];
  channelDiff: ChannelDiff | null;
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  targetGame: string;
  watching: WatchingState;
  targetDrops: InventoryItem[];
  activeDropInfo: ActiveDropInfo;
  inventoryFetchedAt: number | null;
  trackerStatus?: ChannelTrackerStatus | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export function useControlViewState({
  channels,
  channelDiff,
  channelsLoading,
  channelsRefreshing,
  targetGame,
  watching,
  targetDrops,
  activeDropInfo,
  inventoryFetchedAt,
  trackerStatus,
  t,
}: Params) {
  const prevDropsRef = useRef<Map<string, { earned: number; status: string }>>(new Map());
  const prevChannelsRef = useRef<Map<string, ChannelEntry>>(new Map());
  const firstRenderRef = useRef(true);
  const wasSwitchingRef = useRef(false);
  const didInitDensityRef = useRef(false);
  const densityApplyTimerRef = useRef<number | null>(null);
  const densitySettleTimerRef = useRef<number | null>(null);
  const viewerAnimFrameRef = useRef<number | null>(null);
  const viewerAnimLastRef = useRef<number | null>(null);
  const viewerTargetsRef = useRef<Record<string, number>>({});
  const animatedViewersRef = useRef<Record<string, number>>({});
  const [exitingChannels, setExitingChannels] = useState<ChannelEntry[]>([]);
  const [animatedViewersById, setAnimatedViewersById] = useState<Record<string, number>>({});
  const [channelDensityClass, setChannelDensityClass] = useState<ChannelDensity>(() =>
    resolveChannelDensity(channels.length, "balanced"),
  );
  const [isDensityTransitioning, setIsDensityTransitioning] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );

  const dropChangedIds = useMemo(() => {
    const prev = prevDropsRef.current;
    if (prev.size === 0) return new Set<string>();
    const changed = new Set<string>();
    for (const d of targetDrops) {
      if (!prev.has(d.id)) {
        changed.add(d.id);
      }
    }
    return changed;
  }, [targetDrops]);

  const channelChangedIds = useMemo(() => {
    if (!channelDiff) return new Set<string>();
    const changed = new Set<string>(channelDiff.addedIds);
    const viewerOnlyIds = new Set(Object.keys(channelDiff.viewerDeltaById));
    const titleChanged = new Set(channelDiff.titleChangedIds);
    for (const id of channelDiff.updatedIds) {
      if (titleChanged.has(id) || !viewerOnlyIds.has(id)) {
        changed.add(id);
      }
    }
    for (const id of titleChanged) {
      changed.add(id);
    }
    return changed;
  }, [channelDiff]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    setAnimatedViewersById((prev) => {
      const next: Record<string, number> = {};
      for (const channel of channels) {
        next[channel.id] = prev[channel.id] ?? channel.viewers;
      }
      animatedViewersRef.current = next;
      return next;
    });
  }, [channels]);

  useEffect(() => {
    if (!channelDiff) return;
    const entries = Object.entries(channelDiff.viewerDeltaById).filter(([, delta]) =>
      Boolean(delta),
    );
    if (entries.length === 0) return;
    const channelById = new Map(channels.map((channel) => [channel.id, channel]));
    for (const [id] of entries) {
      const channel = channelById.get(id);
      if (!channel) continue;
      viewerTargetsRef.current[id] = Math.max(0, channel.viewers);
    }
    if (!isPageVisible) {
      const targets = viewerTargetsRef.current;
      if (Object.keys(targets).length === 0) return;
      setAnimatedViewersById((prev) => {
        const next = { ...prev };
        for (const [id, target] of Object.entries(targets)) {
          next[id] = Math.round(target);
        }
        animatedViewersRef.current = {
          ...animatedViewersRef.current,
          ...targets,
        };
        return next;
      });
      viewerTargetsRef.current = {};
      if (viewerAnimFrameRef.current !== null) {
        window.cancelAnimationFrame(viewerAnimFrameRef.current);
        viewerAnimFrameRef.current = null;
        viewerAnimLastRef.current = null;
      }
      return;
    }
    if (viewerAnimFrameRef.current === null) {
      viewerAnimLastRef.current = performance.now();
      const tick = (now: number) => {
        const last = viewerAnimLastRef.current ?? now;
        const dt = Math.min(100, Math.max(1, now - last));
        viewerAnimLastRef.current = now;
        const alpha = 1 - Math.exp(-dt / VIEWER_ANIM_DURATION_MS);
        const targets = viewerTargetsRef.current;
        const current = animatedViewersRef.current;
        const targetEntries = Object.entries(targets);
        if (targetEntries.length === 0) {
          viewerAnimFrameRef.current = null;
          viewerAnimLastRef.current = null;
          return;
        }
        let nextValues: Record<string, number> | null = null;
        setAnimatedViewersById((prev) => {
          let nextInt: Record<string, number> | null = null;
          let changed = false;
          for (const [id, target] of targetEntries) {
            const start = current[id] ?? target;
            const updated = start + (target - start) * alpha;
            if (!nextValues) {
              nextValues = { ...current };
            }
            nextValues[id] = updated;
            if (Math.abs(target - updated) < 0.5) {
              nextValues[id] = target;
              delete targets[id];
            }
            const rounded = Math.round(nextValues[id]);
            if (!nextInt) {
              nextInt = { ...prev };
            }
            if (nextInt[id] !== rounded) {
              nextInt[id] = rounded;
              changed = true;
            }
          }
          if (nextValues) {
            animatedViewersRef.current = nextValues;
          }
          if (nextInt && changed) return nextInt;
          return prev;
        });
        viewerAnimFrameRef.current = window.requestAnimationFrame(tick);
      };
      viewerAnimFrameRef.current = window.requestAnimationFrame(tick);
    }
  }, [channelDiff, channels, isPageVisible]);

  useEffect(() => {
    const next = new Map<string, { earned: number; status: string }>();
    for (const d of targetDrops) {
      next.set(d.id, { earned: Number(d.earnedMinutes) || 0, status: d.status });
    }
    prevDropsRef.current = next;
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
    }
  }, [targetDrops]);

  useEffect(() => {
    const next = new Map<string, ChannelEntry>();
    for (const c of channels) {
      next.set(c.id, c);
    }
    const prevFirst = prevChannelsRef.current.values().next().value as ChannelEntry | undefined;
    const nextFirst = channels[0];
    const gameSwitched =
      Boolean(prevFirst?.game) && Boolean(nextFirst?.game) && prevFirst?.game !== nextFirst?.game;
    if (gameSwitched) {
      // Hard game switches should not animate all previous channels as "exiting".
      setExitingChannels([]);
      prevChannelsRef.current = next;
      if (firstRenderRef.current) {
        firstRenderRef.current = false;
      }
      return;
    }
    // detect removed channels
    const removedIds: string[] = [];
    for (const [id] of prevChannelsRef.current) {
      if (!next.has(id)) removedIds.push(id);
    }
    if (removedIds.length > 0) {
      const removedChannels: ChannelEntry[] = [];
      for (const id of removedIds) {
        const prev = prevChannelsRef.current.get(id);
        if (prev) removedChannels.push(prev);
      }
      setExitingChannels((prev) => {
        const existing = new Set(prev.map((c) => c.id));
        const toAdd = removedChannels.filter((c) => !existing.has(c.id));
        return [...prev, ...toAdd];
      });
      // cleanup after animation
      window.setTimeout(() => {
        setExitingChannels((prev) => prev.filter((c) => !removedIds.includes(c.id)));
      }, 240);
    }
    prevChannelsRef.current = next;
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
    }
  }, [channels]);

  const combinedChannels: Array<ChannelEntry & { exiting?: boolean }> = useMemo(() => {
    const exitingMap = new Map(exitingChannels.map((c) => [c.id, c]));
    const merged: Array<ChannelEntry & { exiting?: boolean }> = [];
    for (const c of channels) {
      merged.push({ ...c, exiting: false });
      exitingMap.delete(c.id);
    }
    for (const c of exitingMap.values()) {
      merged.push({ ...c, exiting: true });
    }
    return merged;
  }, [channels, exitingChannels]);

  const [progressNow, setProgressNow] = useState(() => Date.now());
  const shouldTickProgress = Boolean(
    isPageVisible &&
    watching &&
    inventoryFetchedAt &&
    activeDropInfo &&
    activeDropInfo.requiredMinutes > activeDropInfo.earnedMinutes,
  );
  useEffect(() => {
    if (!shouldTickProgress) return;
    setProgressNow(Date.now());
    const timer = window.setInterval(() => setProgressNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [shouldTickProgress, activeDropInfo?.id, inventoryFetchedAt]);
  const liveProgress = useMemo(() => {
    if (!activeDropInfo || !watching || !inventoryFetchedAt) {
      return {
        activeRemainingMinutes: activeDropInfo?.remainingMinutes ?? 0,
        activeEta: activeDropInfo?.eta ?? null,
      };
    }
    const activeRemainingBase = Math.max(
      0,
      activeDropInfo.requiredMinutes - activeDropInfo.earnedMinutes,
    );
    const elapsedMinutesRaw = Math.max(0, (progressNow - inventoryFetchedAt) / 60_000);
    const elapsedApplied = Math.min(elapsedMinutesRaw, activeRemainingBase);
    const activeRemainingMinutes = Math.max(0, activeRemainingBase - elapsedApplied);
    const activeEta =
      activeRemainingMinutes > 0 ? progressNow + activeRemainingMinutes * 60_000 : null;
    return { activeRemainingMinutes, activeEta };
  }, [activeDropInfo, inventoryFetchedAt, progressNow, watching]);

  const formatCampaignId = (value?: string) => {
    const normalized = value?.trim();
    if (!normalized) return null;
    if (normalized.length <= 12) return normalized;
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
  };
  const campaignGroups = useMemo(() => {
    const groups: CampaignGroup[] = [];
    const indexByKey = new Map<string, number>();
    for (const drop of targetDrops) {
      const campaignName = drop.campaignName?.trim();
      const campaignId = drop.campaignId?.trim();
      const key = campaignId
        ? `id:${campaignId}`
        : campaignName
          ? `name:${campaignName.toLowerCase()}`
          : `drop:${drop.id}`;
      const isActiveInGroup = activeDropInfo?.campaignId
        ? campaignId === activeDropInfo.campaignId
        : activeDropInfo?.id === drop.id;
      const existingIndex = indexByKey.get(key);
      if (existingIndex !== undefined) {
        groups[existingIndex].items.push(drop);
        if (isActiveInGroup) groups[existingIndex].active = true;
        continue;
      }
      const fallbackId = formatCampaignId(campaignId);
      const title = campaignName
        ? campaignName
        : fallbackId
          ? t("control.campaignFallback", { id: fallbackId })
          : t("control.campaignUnknown");
      const tooltip =
        campaignName && campaignId
          ? `${campaignName} (${campaignId})`
          : campaignName || campaignId || undefined;
      indexByKey.set(key, groups.length);
      groups.push({
        key,
        title,
        tooltip,
        items: [drop],
        active: Boolean(isActiveInGroup),
      });
    }
    return groups;
  }, [activeDropInfo?.campaignId, activeDropInfo?.id, targetDrops, t]);

  const activeEtaText = liveProgress.activeEta
    ? new Date(liveProgress.activeEta).toLocaleTimeString()
    : null;
  const activeChannel =
    watching && channels.length
      ? channels.find((c) => c.id === watching.id || c.login === watching.login)
      : null;
  const activeThumb = activeChannel?.thumbnail
    ? activeChannel.thumbnail.replace("{width}", "640").replace("{height}", "360")
    : null;
  const activeViewerCount = activeChannel
    ? (animatedViewersById[activeChannel.id] ?? activeChannel.viewers)
    : null;
  const activeLoginMismatch =
    activeChannel?.login &&
    watching?.name &&
    activeChannel.login.toLowerCase() !== watching.name.toLowerCase()
      ? activeChannel.login
      : null;
  const visibleGame = channels[0]?.game ?? "";
  const isGameSwitchLoading =
    Boolean(targetGame) && channelsLoading && channels.length > 0 && visibleGame !== targetGame;
  const channelGridStateClass = isGameSwitchLoading
    ? "switching"
    : channelsLoading
      ? "loading"
      : channelsRefreshing
        ? "refreshing"
        : "";
  const showChannelSkeleton = Boolean(targetGame) && channelsLoading && channels.length === 0;
  const visibleChannelCount = Math.max(channels.length, combinedChannels.length);

  useEffect(() => {
    const clearTimers = () => {
      if (densityApplyTimerRef.current !== null) {
        window.clearTimeout(densityApplyTimerRef.current);
        densityApplyTimerRef.current = null;
      }
      if (densitySettleTimerRef.current !== null) {
        window.clearTimeout(densitySettleTimerRef.current);
        densitySettleTimerRef.current = null;
      }
    };
    if (isGameSwitchLoading) {
      wasSwitchingRef.current = true;
      clearTimers();
      setIsDensityTransitioning(false);
      return clearTimers;
    }
    const nextDensity = resolveChannelDensity(visibleChannelCount, channelDensityClass);
    if (!didInitDensityRef.current) {
      didInitDensityRef.current = true;
      clearTimers();
      if (nextDensity !== channelDensityClass) {
        setChannelDensityClass(nextDensity);
      }
      setIsDensityTransitioning(false);
      wasSwitchingRef.current = false;
      return clearTimers;
    }
    if (nextDensity === channelDensityClass) {
      if (wasSwitchingRef.current) {
        wasSwitchingRef.current = false;
      }
      return clearTimers;
    }
    if (wasSwitchingRef.current) {
      clearTimers();
      setChannelDensityClass(nextDensity);
      setIsDensityTransitioning(false);
      wasSwitchingRef.current = false;
      return clearTimers;
    }
    clearTimers();
    setIsDensityTransitioning(true);
    densityApplyTimerRef.current = window.setTimeout(() => {
      setChannelDensityClass(nextDensity);
      densityApplyTimerRef.current = null;
    }, 70);
    densitySettleTimerRef.current = window.setTimeout(() => {
      setIsDensityTransitioning(false);
      densitySettleTimerRef.current = null;
    }, 230);
    return clearTimers;
  }, [visibleChannelCount, channelDensityClass, isGameSwitchLoading]);

  useEffect(() => {
    return () => {
      if (viewerAnimFrameRef.current !== null) {
        window.cancelAnimationFrame(viewerAnimFrameRef.current);
        viewerAnimFrameRef.current = null;
      }
      if (densityApplyTimerRef.current !== null) {
        window.clearTimeout(densityApplyTimerRef.current);
        densityApplyTimerRef.current = null;
      }
      if (densitySettleTimerRef.current !== null) {
        window.clearTimeout(densitySettleTimerRef.current);
        densitySettleTimerRef.current = null;
      }
    };
  }, []);

  const channelGridClass = `channel-grid channel-grid-${channelDensityClass}${
    isDensityTransitioning && !isGameSwitchLoading ? " is-density-transitioning" : ""
  }`;
  const trackerFallbackRemainingMs =
    trackerStatus?.fallbackActive && trackerStatus.fallbackUntil
      ? Math.max(0, trackerStatus.fallbackUntil - Date.now())
      : null;

  return {
    firstRenderRef,
    dropChangedIds,
    channelChangedIds,
    combinedChannels,
    animatedViewersById,
    channelGridClass,
    channelGridStateClass,
    showChannelSkeleton,
    liveProgress,
    activeEtaText,
    activeChannel,
    activeThumb,
    activeViewerCount,
    activeLoginMismatch,
    campaignGroups,
    trackerFallbackRemainingMs,
  };
}
