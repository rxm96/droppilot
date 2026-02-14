import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InventoryState, WatchingState } from "@renderer/shared/types";
import {
  isArrayOf,
  isChannelEntry,
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
} from "@renderer/shared/utils/ipc";
import { logDebug } from "@renderer/shared/utils/logger";
import {
  isGameActionable,
  normalizePriorityGames,
  type WithCategory,
} from "./usePriorityOrchestration";

export type CampaignSummary = {
  id?: string;
  name?: string;
  game?: string;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
  status?: string;
  hasUnclaimedDrops?: boolean;
};

type Params = {
  allowWatching: boolean;
  demoMode: boolean;
  inventoryStatus: InventoryState["status"];
  inventoryFetchedAt: number | null;
  withCategories: WithCategory[];
  priorityGames: string[];
  watching: WatchingState;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<void>;
  forwardAuthError: (message?: string) => void;
};

export type WarmupState = {
  active: boolean;
  game: string;
  lastAttemptAt: number | null;
  lastReason: string | null;
  cooldownUntil: number | null;
  allowWatching: boolean;
  demoMode: boolean;
  attemptedCampaigns: WarmupAttempt[];
};

type WarmupAttempt = { id: string; until: number; game?: string; name?: string };
type WarmupAttemptStored = { until: number; game?: string; name?: string };

export type WarmupTargetResult = {
  game: string;
  campaignId?: string;
  campaignName?: string;
  reason:
    | "ok"
    | "no-active-campaigns"
    | "no-priority-campaigns"
    | "campaigns-known"
    | "campaigns-claimed"
    | "campaigns-attempted";
};

const WARMUP_PINGS = 3;
const WARMUP_PING_INTERVAL_MS = 60_000;
const WARMUP_COOLDOWN_MS = 5 * 60_000;
const WARMUP_CAMPAIGN_COOLDOWN_MS = 24 * 60 * 60_000;
const WARMUP_CAMPAIGN_STORAGE_KEY = "droppilot:warmup-campaign-attempts";

const loadWarmupCampaignAttempts = (): Map<string, WarmupAttemptStored> => {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(WARMUP_CAMPAIGN_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const now = Date.now();
    const map = new Map<string, WarmupAttemptStored>();
    for (const [campaignId, value] of Object.entries(parsed)) {
      if (!campaignId) continue;
      if (typeof value === "number" && Number.isFinite(value)) {
        if (value <= now) continue;
        map.set(campaignId, { until: value });
        continue;
      }
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      const until = Number(record.until);
      if (!Number.isFinite(until) || until <= now) continue;
      const game = typeof record.game === "string" ? record.game.trim() : "";
      const name = typeof record.name === "string" ? record.name.trim() : "";
      map.set(campaignId, {
        until,
        game: game || undefined,
        name: name || undefined,
      });
    }
    return map;
  } catch {
    return new Map();
  }
};

const persistWarmupCampaignAttempts = (attempts: Map<string, WarmupAttemptStored>) => {
  if (typeof window === "undefined") return;
  try {
    const payload: Record<string, WarmupAttemptStored> = {};
    for (const [campaignId, entry] of attempts) {
      if (!campaignId || !entry || typeof entry !== "object") continue;
      const until = Number(entry.until);
      if (!Number.isFinite(until)) continue;
      payload[campaignId] = {
        until,
        game: entry.game,
        name: entry.name,
      };
    }
    window.localStorage.setItem(WARMUP_CAMPAIGN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
};

const parseIsoMs = (value?: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const buildAttemptedCampaigns = (
  attempts: Map<string, WarmupAttemptStored>,
  now = Date.now(),
): WarmupAttempt[] => {
  const entries: WarmupAttempt[] = [];
  for (const [id, entry] of attempts) {
    if (!id || !entry || typeof entry !== "object") continue;
    const until = Number(entry.until);
    if (!Number.isFinite(until) || until <= now) continue;
    entries.push({ id, until, game: entry.game, name: entry.name });
  }
  entries.sort((a, b) => a.until - b.until);
  return entries;
};

const sameAttempts = (a: WarmupAttempt[], b: WarmupAttempt[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id || a[i]?.until !== b[i]?.until) return false;
    if (a[i]?.game !== b[i]?.game || a[i]?.name !== b[i]?.name) return false;
  }
  return true;
};

const isActiveCampaign = (campaign: CampaignSummary, now = Date.now()): boolean => {
  if (typeof campaign.isActive === "boolean") return campaign.isActive;
  const startMs = parseIsoMs(campaign.startsAt);
  if (startMs !== null && now < startMs) return false;
  const endMs = parseIsoMs(campaign.endsAt);
  if (endMs !== null && now > endMs) return false;
  return true;
};

export const selectWarmupTarget = ({
  campaigns,
  priorityGames,
  knownCampaignIds,
  knownActiveGames,
  attemptedCampaignIds,
  now = Date.now(),
}: {
  campaigns: CampaignSummary[];
  priorityGames: string[];
  knownCampaignIds: Set<string>;
  knownActiveGames: Set<string>;
  attemptedCampaignIds: Set<string>;
  now?: number;
}): WarmupTargetResult => {
  const normalizedPriority = normalizePriorityGames(priorityGames);
  const activeGames = new Map<
    string,
    { game: string; campaignId: string; campaignName?: string }
  >();
  let activeCount = 0;
  let skippedKnown = 0;
  let skippedClaimed = 0;
  let skippedAttempted = 0;

  for (const campaign of campaigns) {
    if (!campaign || typeof campaign !== "object") continue;
    const game = typeof campaign.game === "string" ? campaign.game.trim() : "";
    if (!game) continue;
    if (!isActiveCampaign(campaign, now)) continue;
    activeCount += 1;
    if (campaign.hasUnclaimedDrops === false) {
      skippedClaimed += 1;
      continue;
    }
    const campaignId = typeof campaign.id === "string" ? campaign.id.trim() : "";
    const campaignName = typeof campaign.name === "string" ? campaign.name.trim() : "";
    const gameKey = game.toLowerCase();
    if (campaignId && attemptedCampaignIds.has(campaignId)) {
      skippedAttempted += 1;
      continue;
    }
    if (
      (campaignId && knownCampaignIds.has(campaignId)) ||
      knownActiveGames.has(gameKey)
    ) {
      skippedKnown += 1;
      continue;
    }
    if (!activeGames.has(gameKey)) {
      activeGames.set(gameKey, {
        game,
        campaignId,
        campaignName: campaignName || undefined,
      });
    }
  }

  if (activeGames.size === 0) {
    return {
      game: "",
      reason:
        activeCount > 0 && skippedKnown + skippedClaimed + skippedAttempted === activeCount
          ? skippedAttempted > 0 && skippedKnown + skippedClaimed === 0
            ? "campaigns-attempted"
            : skippedClaimed > 0 && skippedKnown + skippedAttempted === 0
              ? "campaigns-claimed"
              : "campaigns-known"
          : "no-active-campaigns",
    };
  }

  const targetGame = normalizedPriority.find((game) =>
    activeGames.has(game.toLowerCase()),
  );
  if (!targetGame) {
    return { game: "", reason: "no-priority-campaigns" };
  }
  const entry = activeGames.get(targetGame.toLowerCase());
  const resolvedGame = entry?.game ?? targetGame;
  const result: WarmupTargetResult = {
    game: resolvedGame,
    reason: "ok",
  };
  if (entry?.campaignId) result.campaignId = entry.campaignId;
  if (entry?.campaignName) result.campaignName = entry.campaignName;
  return result;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

export function useCampaignWarmup({
  allowWatching,
  demoMode,
  inventoryStatus,
  inventoryFetchedAt,
  withCategories,
  priorityGames,
  watching,
  fetchInventory,
  forwardAuthError,
}: Params) {
  const warmupRef = useRef<{ inFlight: boolean; lastAt: number }>({
    inFlight: false,
    lastAt: 0,
  });
  const warmupAttemptedRef = useRef<Map<string, WarmupAttemptStored>>(
    loadWarmupCampaignAttempts(),
  );
  const mountedRef = useRef(true);
  const [warmupState, setWarmupState] = useState<WarmupState>({
    active: false,
    game: "",
    lastAttemptAt: null,
    lastReason: null,
    cooldownUntil: null,
    allowWatching,
    demoMode,
    attemptedCampaigns: buildAttemptedCampaigns(warmupAttemptedRef.current),
  });

  const normalizedPriority = useMemo(() => normalizePriorityGames(priorityGames), [priorityGames]);
  const hasPriorityMatch = useMemo(
    () => normalizedPriority.some((game) => isGameActionable(game, withCategories)),
    [normalizedPriority, withCategories],
  );
  const knownCampaignIds = useMemo(() => {
    const ids = new Set<string>();
    for (const { item } of withCategories) {
      if (typeof item.campaignId === "string" && item.campaignId.trim()) {
        ids.add(item.campaignId.trim());
      }
    }
    return ids;
  }, [withCategories]);
  const knownActiveGames = useMemo(() => {
    const now = Date.now();
    const games = new Set<string>();
    for (const { item } of withCategories) {
      const game = typeof item.game === "string" ? item.game.trim() : "";
      if (!game) continue;
      const status = (item.campaignStatus ?? "").toUpperCase();
      if (status === "EXPIRED") continue;
      const endsAt = parseIsoMs(item.endsAt);
      if (endsAt !== null && endsAt < now) continue;
      games.add(game.toLowerCase());
    }
    return games;
  }, [withCategories]);
  const watchingPriority = Boolean(
    watching && normalizedPriority.some((game) => game === watching.game),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updateWarmupState = useCallback((patch: Partial<WarmupState>) => {
    if (!mountedRef.current) return;
    setWarmupState((prev) => {
      const next = { ...prev, ...patch };
      const same =
        prev.active === next.active &&
        prev.game === next.game &&
        prev.lastAttemptAt === next.lastAttemptAt &&
        prev.lastReason === next.lastReason &&
        prev.cooldownUntil === next.cooldownUntil &&
        prev.allowWatching === next.allowWatching &&
        prev.demoMode === next.demoMode &&
        sameAttempts(prev.attemptedCampaigns, next.attemptedCampaigns);
      return same ? prev : next;
    });
  }, []);

  useEffect(() => {
    if (!inventoryFetchedAt) return;
    const attempts = warmupAttemptedRef.current;
    let changed = false;
    for (const id of knownCampaignIds) {
      if (attempts.delete(id)) {
        changed = true;
      }
    }
    if (changed) {
      persistWarmupCampaignAttempts(attempts);
      updateWarmupState({ attemptedCampaigns: buildAttemptedCampaigns(attempts) });
    }
  }, [inventoryFetchedAt, knownCampaignIds, updateWarmupState]);

  useEffect(() => {
    const now = Date.now();
    updateWarmupState({ allowWatching, demoMode });
    const cooldownUntil =
      warmupRef.current.lastAt > 0
        ? warmupRef.current.lastAt + WARMUP_COOLDOWN_MS
        : null;
    const skipReason = (() => {
      if (!allowWatching || demoMode) return "disabled";
      if (inventoryStatus !== "ready") return `inventory:${inventoryStatus}`;
      if (normalizedPriority.length === 0) return "no-priority";
      if (hasPriorityMatch) return "priority-match";
      if (watchingPriority) return "watching-priority";
      if (warmupRef.current.inFlight) return "in-flight";
      if (cooldownUntil && now < cooldownUntil) return "cooldown";
      return null;
    })();
    if (skipReason) {
      updateWarmupState({
        active: false,
        game: "",
        lastReason: skipReason,
        cooldownUntil: cooldownUntil && now < cooldownUntil ? cooldownUntil : null,
      });
      return;
    }

    let cancelled = false;
    warmupRef.current.inFlight = true;
    warmupRef.current.lastAt = now;
    updateWarmupState({
      lastAttemptAt: now,
      lastReason: "starting",
      cooldownUntil: warmupRef.current.lastAt + WARMUP_COOLDOWN_MS,
    });

    const run = async () => {
      try {
        const res: unknown = await window.electronAPI.twitch.campaigns();
        logDebug("warmup: campaigns response", res);
        if (cancelled) return;
        if (isIpcErrorResponse(res)) {
          if (isIpcAuthErrorResponse(res)) {
            forwardAuthError(res.message);
          }
          updateWarmupState({
            lastReason: isIpcAuthErrorResponse(res) ? "auth-error" : "campaigns-error",
          });
          return;
        }
        const campaigns = Array.isArray(res) ? (res as CampaignSummary[]) : [];
        const attempts = warmupAttemptedRef.current;
        let attemptsChanged = false;
        const now = Date.now();
        for (const [campaignId, entry] of attempts) {
          if (!entry || typeof entry !== "object") continue;
          if (entry.until <= now) {
            attempts.delete(campaignId);
            attemptsChanged = true;
          }
        }
        if (attemptsChanged) {
          persistWarmupCampaignAttempts(attempts);
          updateWarmupState({ attemptedCampaigns: buildAttemptedCampaigns(attempts) });
        }
        const selection = selectWarmupTarget({
          campaigns,
          priorityGames: normalizedPriority,
          knownCampaignIds,
          knownActiveGames,
          attemptedCampaignIds: new Set(attempts.keys()),
        });
        if (!selection.game) {
          updateWarmupState({ lastReason: selection.reason });
          return;
        }
        const resolvedGame = selection.game;
        const resolvedCampaignId = selection.campaignId?.trim() ?? "";

        const channelsRes: unknown = await window.electronAPI.twitch.channels({
          game: resolvedGame,
        });
        if (cancelled) return;
        if (isIpcErrorResponse(channelsRes)) {
          if (isIpcAuthErrorResponse(channelsRes)) {
            forwardAuthError(channelsRes.message);
          }
          updateWarmupState({
            lastReason: isIpcAuthErrorResponse(channelsRes) ? "auth-error" : "channels-error",
          });
          return;
        }
        if (!isArrayOf(channelsRes, isChannelEntry)) {
          updateWarmupState({ lastReason: "channels-invalid" });
          return;
        }
        const channel = channelsRes[0];
        if (!channel) {
          updateWarmupState({ lastReason: "channels-empty" });
          return;
        }
        if (resolvedCampaignId) {
          const expiresAt = Date.now() + WARMUP_CAMPAIGN_COOLDOWN_MS;
          const current = attempts.get(resolvedCampaignId);
          if (!current || current.until < expiresAt) {
            attempts.set(resolvedCampaignId, {
              until: expiresAt,
              game: resolvedGame,
              name: selection.campaignName,
            });
            persistWarmupCampaignAttempts(attempts);
            updateWarmupState({ attemptedCampaigns: buildAttemptedCampaigns(attempts) });
          }
        }
        if (!cancelled && mountedRef.current) {
          updateWarmupState({ active: true, game: resolvedGame, lastReason: "running" });
        }

        for (let i = 0; i < WARMUP_PINGS; i += 1) {
          if (cancelled) return;
          const pingRes: unknown = await window.electronAPI.twitch.watch({
            channelId: channel.id,
            login: channel.login,
            streamId: channel.streamId,
          });
          if (cancelled) return;
          if (isIpcErrorResponse(pingRes)) {
            if (isIpcAuthErrorResponse(pingRes)) {
              forwardAuthError(pingRes.message);
            }
            updateWarmupState({
              lastReason: isIpcAuthErrorResponse(pingRes) ? "auth-error" : "ping-error",
            });
            return;
          }
          if (i < WARMUP_PINGS - 1) {
            await sleep(WARMUP_PING_INTERVAL_MS);
          }
        }
        if (!cancelled) {
          void fetchInventory({ forceLoading: true });
          updateWarmupState({ lastReason: "complete" });
        }
      } catch (err) {
        if (!cancelled) {
          updateWarmupState({ lastReason: "campaigns-throw" });
        }
      } finally {
        warmupRef.current.inFlight = false;
        if (mountedRef.current) {
          updateWarmupState({ active: false, game: "" });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    allowWatching,
    demoMode,
    fetchInventory,
    forwardAuthError,
    inventoryStatus,
    hasPriorityMatch,
    knownCampaignIds,
    knownActiveGames,
    normalizedPriority,
    updateWarmupState,
    watchingPriority,
  ]);

  return warmupState;
}
