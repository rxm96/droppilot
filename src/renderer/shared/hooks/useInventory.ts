import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CampaignSummary,
  ClaimStatus,
  InventoryItem,
  InventoryState,
  UserPubSubEvent,
} from "@renderer/shared/types";
import { buildDemoInventory } from "@renderer/shared/demoData";
import { getCategory } from "@renderer/shared/utils";
import { logDebug, logError, logInfo, logWarn } from "@renderer/shared/utils/logger";
import { errorInfoFromIpc, errorInfoFromUnknown } from "@renderer/shared/utils/errors";
import {
  isArrayOf,
  isInventoryItem,
  isInventoryBundle,
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
  isIpcOkFalseResponse,
  isUserPubSubEvent,
} from "@renderer/shared/utils/ipc";
import { RENDERER_ERROR_CODES, TWITCH_ERROR_CODES } from "../../../shared/errorCodes";

const CLAIM_RETRY_MS = 90_000;
const CLAIM_RETRY_MAX_MS = 30 * 60_000;
const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;
const NOOP = () => {};
const NOOP_CLAIM = () => {};
const NOOP_AUTH = (_message?: string) => {};
type FetchInventoryOpts = { forceLoading?: boolean };
type ClaimRetryState = { attempts: number; nextAllowedAt: number; signature: string };

type InventoryPatchResult = {
  changed: boolean;
  items: InventoryItem[];
  updatedId?: string;
  updatedIds?: string[];
  deltaMinutes: number;
  totalMinutes: number;
  claimedItem?: InventoryItem;
};

const getTotalEarnedMinutes = (items: InventoryItem[]): number =>
  items.reduce((acc, item) => acc + Math.max(0, Number(item.earnedMinutes) || 0), 0);

const buildProgressAnchorByDropId = (
  items: InventoryItem[],
  at: number,
): Record<string, number> => {
  const next: Record<string, number> = {};
  for (const item of items) {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) continue;
    next[id] = at;
  }
  return next;
};

const parseIsoMs = (value?: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const isWithinClaimWindow = (item: InventoryItem, now = Date.now()): boolean => {
  if (!item.endsAt) return true;
  const endMs = Date.parse(item.endsAt);
  if (!Number.isFinite(endMs)) return true;
  return now < endMs + CLAIM_WINDOW_MS;
};

const getClaimRetryDelay = (attempts: number): number =>
  Math.min(CLAIM_RETRY_MAX_MS, CLAIM_RETRY_MS * 2 ** Math.max(0, attempts - 1));

const buildClaimRetrySignature = (item: InventoryItem): string =>
  [
    item.status,
    String(Math.max(0, Number(item.earnedMinutes) || 0)),
    String(Math.max(0, Number(item.requiredMinutes) || 0)),
    item.dropInstanceId ?? "",
    item.campaignId ?? "",
    typeof item.isClaimable === "boolean" ? String(item.isClaimable) : "",
    (item.blockingReasonHints ?? []).join("|"),
  ].join("#");

const isCampaignActive = (startsAt?: string, endsAt?: string, now = Date.now()): boolean => {
  const startMs = parseIsoMs(startsAt);
  if (startMs !== null && now < startMs) return false;
  const endMs = parseIsoMs(endsAt);
  if (endMs !== null && now > endMs) return false;
  return true;
};

const buildCampaignsFromInventory = (
  items: InventoryItem[],
  now = Date.now(),
): CampaignSummary[] => {
  type CampaignRecord = CampaignSummary & { startMs?: number; endMs?: number };
  const map = new Map<string, CampaignRecord>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const game = typeof item.game === "string" ? item.game.trim() : "";
    if (!game) continue;
    const campaignName = typeof item.campaignName === "string" ? item.campaignName.trim() : "";
    const rawId = typeof item.campaignId === "string" ? item.campaignId.trim() : "";
    const fallbackId = campaignName || game;
    const id = rawId || (fallbackId ? `campaign:${fallbackId.toLowerCase()}` : item.id);
    if (!id) continue;
    const entry = map.get(id) ?? {
      id,
      name: campaignName || `${game} Drops`,
      game,
      hasUnclaimedDrops: undefined,
    };
    if (!entry.name && campaignName) entry.name = campaignName;
    if (!entry.game) entry.game = game;
    const startMs = parseIsoMs(item.startsAt);
    if (startMs !== null && (entry.startMs === undefined || startMs < entry.startMs)) {
      entry.startMs = startMs;
      entry.startsAt = item.startsAt;
    }
    const endMs = parseIsoMs(item.endsAt);
    if (endMs !== null && (entry.endMs === undefined || endMs > entry.endMs)) {
      entry.endMs = endMs;
      entry.endsAt = item.endsAt;
    }
    if (typeof item.campaignStatus === "string" && item.campaignStatus.trim()) {
      entry.status = item.campaignStatus.trim();
    }
    if (item.linked === false) {
      entry.isAccountConnected = false;
    } else if (item.linked === true && entry.isAccountConnected !== false) {
      entry.isAccountConnected = true;
    }
    const campaignImage =
      typeof item.campaignImageUrl === "string" ? item.campaignImageUrl.trim() : "";
    const dropImage = typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
    if (!entry.imageUrl && (campaignImage || dropImage)) {
      entry.imageUrl = campaignImage || dropImage;
    }
    if (item.status !== "claimed") {
      entry.hasUnclaimedDrops = true;
    } else if (entry.hasUnclaimedDrops === undefined) {
      entry.hasUnclaimedDrops = false;
    }
    map.set(id, entry);
  }
  const result: CampaignSummary[] = [];
  for (const entry of map.values()) {
    result.push({
      id: entry.id,
      name: entry.name,
      game: entry.game,
      imageUrl: entry.imageUrl,
      isAccountConnected: entry.isAccountConnected,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      status: entry.status,
      hasUnclaimedDrops: entry.hasUnclaimedDrops,
      isActive: isCampaignActive(entry.startsAt, entry.endsAt, now),
    });
  }
  return result;
};

export const applyDropProgressToInventoryItems = (
  items: InventoryItem[],
  payload: UserPubSubEvent,
): InventoryPatchResult => {
  if (payload.kind !== "drop-progress") {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }
  const dropId = payload.dropId?.trim();
  const currentProgressMin =
    typeof payload.currentProgressMin === "number" && Number.isFinite(payload.currentProgressMin)
      ? Math.max(0, payload.currentProgressMin)
      : null;
  if (!dropId || currentProgressMin === null) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }
  const index = items.findIndex((item) => item.id === dropId);
  if (index < 0) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }

  const target = items[index];
  const targetCampaignId = target.campaignId?.trim();
  const candidateIndexes =
    targetCampaignId && targetCampaignId.length > 0
      ? items
          .map((item, idx) => ({ item, idx }))
          .filter(
            ({ item }) =>
              item.campaignId?.trim() === targetCampaignId &&
              (item.id === target.id || item.status === "progress"),
          )
          .map(({ idx }) => idx)
      : [index];

  let changed = false;
  let deltaMinutes = 0;
  const nextItems = [...items];
  let updatedId: string | undefined;
  const updatedIds = new Set<string>();

  for (const idx of candidateIndexes) {
    const current = nextItems[idx];
    const required = Math.max(0, Number(current.requiredMinutes) || 0);
    const prevEarned = Math.max(0, Number(current.earnedMinutes) || 0);
    const nextEarnedRaw = Math.max(prevEarned, currentProgressMin);
    const nextEarned = required > 0 ? Math.min(required, nextEarnedRaw) : nextEarnedRaw;
    let nextStatus = current.status;
    if (nextStatus !== "claimed") {
      if (required > 0 && nextEarned >= required) {
        nextStatus = "progress";
      } else if (nextEarned > 0 && nextStatus === "locked") {
        nextStatus = "progress";
      }
    }
    if (nextEarned === prevEarned && nextStatus === current.status) {
      continue;
    }
    changed = true;
    deltaMinutes += Math.max(0, nextEarned - prevEarned);
    updatedIds.add(current.id);
    if (!updatedId || current.id === target.id) {
      updatedId = current.id;
    }
    nextItems[idx] = {
      ...current,
      earnedMinutes: nextEarned,
      status: nextStatus,
    };
  }

  if (!changed) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }

  return {
    changed: true,
    items: nextItems,
    updatedId,
    updatedIds: Array.from(updatedIds),
    deltaMinutes,
    totalMinutes: getTotalEarnedMinutes(nextItems),
  };
};

export const applyDropClaimToInventoryItems = (
  items: InventoryItem[],
  payload: UserPubSubEvent,
): InventoryPatchResult => {
  if (payload.kind !== "drop-claim") {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }
  const dropId = payload.dropId?.trim();
  const dropInstanceId = payload.dropInstanceId?.trim();
  if (!dropId && !dropInstanceId) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }
  const index = items.findIndex((item) => {
    if (dropId && item.id === dropId) return true;
    if (dropInstanceId && item.dropInstanceId && item.dropInstanceId === dropInstanceId)
      return true;
    return false;
  });
  if (index < 0) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }

  const target = items[index];
  const required = Math.max(0, Number(target.requiredMinutes) || 0);
  const prevEarned = Math.max(0, Number(target.earnedMinutes) || 0);
  const nextEarned = required > 0 ? Math.max(required, prevEarned) : prevEarned;
  const nextItem: InventoryItem = {
    ...target,
    earnedMinutes: nextEarned,
    status: "claimed",
  };
  if (target.status === "claimed" && nextEarned === prevEarned) {
    return { changed: false, items, deltaMinutes: 0, totalMinutes: getTotalEarnedMinutes(items) };
  }

  const nextItems = [...items];
  nextItems[index] = nextItem;
  return {
    changed: true,
    items: nextItems,
    updatedId: nextItem.id,
    updatedIds: [nextItem.id],
    deltaMinutes: Math.max(0, nextEarned - prevEarned),
    totalMinutes: getTotalEarnedMinutes(nextItems),
    claimedItem: nextItem,
  };
};

type InventoryEvents = {
  onMinutesEarned?: (minutes: number) => void;
  onClaimed?: (payload: { title: string; game: string }) => void;
  onAuthError?: (message?: string) => void;
};

type InventoryOptions = {
  autoClaim?: boolean;
  demoMode?: boolean;
  allowUnlinkedBadgeEmotes?: boolean;
  allowUnlinkedGames?: boolean;
};

export function useInventory(isLinked: boolean, events?: InventoryEvents, opts?: InventoryOptions) {
  const onMinutesEarned = events?.onMinutesEarned ?? NOOP;
  const onClaimed = events?.onClaimed ?? NOOP_CLAIM;
  const onAuthError = events?.onAuthError ?? NOOP_AUTH;
  const autoClaimEnabled = opts?.autoClaim !== false;
  const demoMode = opts?.demoMode === true;
  const allowUnlinkedBadgeEmotes = opts?.allowUnlinkedBadgeEmotes === true;
  const allowUnlinkedGames = opts?.allowUnlinkedGames === true;
  const [inventory, setInventory] = useState<InventoryState>({ status: "idle" });
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [inventoryRefreshing, setInventoryRefreshing] = useState(false);
  const [inventoryChanges, setInventoryChanges] = useState<{
    added: Set<string>;
    updated: Set<string>;
  }>({
    added: new Set(),
    updated: new Set(),
  });
  const [inventoryFetchedAt, setInventoryFetchedAt] = useState<number | null>(null);
  const [progressAnchorByDropId, setProgressAnchorByDropId] = useState<Record<string, number>>({});
  const [claimStatus, setClaimStatus] = useState<ClaimStatus | null>(null);
  const totalMinutesRef = useRef<number | null>(null);
  const claimAttemptsRef = useRef<Map<string, number>>(new Map());
  const claimRetryByDropRef = useRef<Map<string, ClaimRetryState>>(new Map());
  const fetchInFlightRef = useRef(false);
  const pendingFetchOptsRef = useRef<FetchInventoryOpts | null>(null);
  const fetchInventoryRef = useRef<(opts?: FetchInventoryOpts) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const progressByDropIdRef = useRef<Map<string, number>>(new Map());
  const pubSubReconcileTimerRef = useRef<number | null>(null);
  const pubSubReconcilePendingForceRef = useRef(false);
  const pubSubReconcileScheduledAtRef = useRef(0);
  const pubSubLastReconcileAtRef = useRef(0);
  const demoItemsRef = useRef<InventoryItem[] | null>(null);
  const demoLastAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!demoMode && !isLinked) {
      setInventory({ status: "idle" });
      setInventoryRefreshing(false);
      setInventoryChanges({ added: new Set(), updated: new Set() });
      setInventoryFetchedAt(null);
      setClaimStatus(null);
      setCampaigns([]);
      setCampaignsLoading(false);
      totalMinutesRef.current = null;
      claimAttemptsRef.current.clear();
      claimRetryByDropRef.current.clear();
      progressByDropIdRef.current.clear();
      setProgressAnchorByDropId({});
      pendingFetchOptsRef.current = null;
    }
  }, [demoMode, isLinked]);

  useEffect(() => {
    if (!demoMode) {
      demoItemsRef.current = null;
      demoLastAtRef.current = null;
      return;
    }
    const now = Date.now();
    demoItemsRef.current = buildDemoInventory(now);
    demoLastAtRef.current = now;
  }, [demoMode]);

  const fetchInventory = useCallback(
    async (opts?: FetchInventoryOpts) => {
      if (fetchInFlightRef.current) {
        const queuedForce = Boolean(
          pendingFetchOptsRef.current?.forceLoading || opts?.forceLoading,
        );
        pendingFetchOptsRef.current = queuedForce ? { forceLoading: true } : {};
        logDebug("inventory: fetch queued (in flight)", { forceLoading: queuedForce });
        return;
      }
      fetchInFlightRef.current = true;
      try {
        const prevItems =
          inventory.status === "ready"
            ? inventory.items
            : inventory.status === "error" && inventory.items
              ? inventory.items
              : [];
        const hadItems = prevItems.length > 0;
        logInfo("inventory: fetch start", { forceLoading: opts?.forceLoading, hadItems });
        if (!hadItems) {
          setInventory({ status: "loading" });
        } else {
          setInventoryRefreshing(true);
        }
        setCampaignsLoading(!demoMode && isLinked);
        if (demoMode) {
          const now = Date.now();
          let nextItems = demoItemsRef.current ?? buildDemoInventory(now);
          const lastAt = demoLastAtRef.current ?? now;
          const deltaMinutes = Math.max(0, Math.floor((now - lastAt) / 60_000));
          if (deltaMinutes > 0) {
            demoLastAtRef.current = now;
            nextItems = nextItems.map((item) => {
              if (item.status !== "progress") return item;
              const req = Math.max(0, Number(item.requiredMinutes) || 0);
              const earned = Math.min(
                req,
                Math.max(0, Number(item.earnedMinutes) || 0) + deltaMinutes,
              );
              const progressDone = req === 0 || earned >= req;
              const nextStatus = progressDone && autoClaimEnabled ? "claimed" : item.status;
              if (earned === item.earnedMinutes && nextStatus === item.status) return item;
              return { ...item, earnedMinutes: earned, status: nextStatus };
            });
          }
          demoItemsRef.current = nextItems;
          const nextTotalMinutes = nextItems.reduce(
            (acc: number, item) => acc + Math.max(0, Number(item.earnedMinutes) || 0),
            0,
          );
          if (totalMinutesRef.current !== null) {
            const deltaMinutes = Math.max(0, nextTotalMinutes - totalMinutesRef.current);
            if (deltaMinutes > 0) {
              onMinutesEarned(deltaMinutes);
            }
          }
          totalMinutesRef.current = nextTotalMinutes;
          const prevMap = new Map(prevItems.map((i: InventoryItem) => [i.id, i]));
          const added = new Set<string>();
          const updated = new Set<string>();
          for (const item of nextItems) {
            const prev = prevMap.get(item.id);
            if (!prev) {
              added.add(item.id);
            } else if (prev.earnedMinutes !== item.earnedMinutes || prev.status !== item.status) {
              updated.add(item.id);
            }
          }
          if (autoClaimEnabled) {
            const claimedNow = nextItems.filter(
              (item) => item.status === "claimed" && prevMap.get(item.id)?.status !== "claimed",
            );
            for (const claimed of claimedNow) {
              onClaimed({ title: claimed.title, game: claimed.game });
              setClaimStatus({
                kind: "success",
                message: `Auto-claimed: ${claimed.title}`,
                at: now,
              });
            }
          }
          setInventory({ status: "ready", items: nextItems });
          setInventoryFetchedAt(now);
          setProgressAnchorByDropId(buildProgressAnchorByDropId(nextItems, now));
          setInventoryChanges({ added, updated });
          setInventoryRefreshing(false);
          setCampaigns(buildCampaignsFromInventory(nextItems, now));
          setCampaignsLoading(false);
          return;
        }
        try {
          const res: unknown = await window.electronAPI.twitch.inventory();
          logDebug("inventory: fetch response", res);
          if (isIpcErrorResponse(res)) {
            if (isIpcAuthErrorResponse(res)) {
              logWarn("inventory: auth error", res);
              onAuthError(res.message);
              setInventory({ status: "idle" });
              setCampaignsLoading(false);
              return;
            }
            const errInfo = errorInfoFromIpc(res, {
              code: RENDERER_ERROR_CODES.INVENTORY_FETCH_FAILED,
              message: "Unable to load inventory",
            });
            setInventory({
              status: "error",
              message: errInfo.message ?? "Unable to load inventory",
              code: errInfo.code,
              items: hadItems ? prevItems : undefined,
            });
            logWarn("inventory: fetch error", res);
            setCampaignsLoading(false);
            return;
          }
          const bundle = isInventoryBundle(res)
            ? res
            : isArrayOf(res, isInventoryItem)
              ? { items: res, campaigns: [] }
              : null;
          if (!bundle) {
            setInventory({
              status: "error",
              code: RENDERER_ERROR_CODES.INVENTORY_INVALID_RESPONSE,
              message: "Inventory response was invalid",
              items: hadItems ? prevItems : undefined,
            });
            setCampaignsLoading(false);
            return;
          }
          const nextItems = bundle.items;
          setCampaigns(bundle.campaigns);
          const nextTotalMinutes = nextItems.reduce(
            (acc: number, item) => acc + Math.max(0, Number(item.earnedMinutes) || 0),
            0,
          );
          logInfo("inventory: fetch success", {
            items: nextItems.length,
            totalMinutes: nextTotalMinutes,
          });
          if (totalMinutesRef.current !== null) {
            const deltaMinutes = Math.max(0, nextTotalMinutes - totalMinutesRef.current);
            if (deltaMinutes > 0) {
              onMinutesEarned(deltaMinutes);
            }
          }
          totalMinutesRef.current = nextTotalMinutes;
          const prevMap = new Map(prevItems.map((i: InventoryItem) => [i.id, i]));
          const added = new Set<string>();
          const updated = new Set<string>();
          for (const item of nextItems) {
            const prev = prevMap.get(item.id);
            if (!prev) {
              added.add(item.id);
            } else if (prev.earnedMinutes !== item.earnedMinutes || prev.status !== item.status) {
              updated.add(item.id);
            }
          }
          setInventory({ status: "ready", items: nextItems });
          const fetchedAt = Date.now();
          setInventoryFetchedAt(fetchedAt);
          setProgressAnchorByDropId(buildProgressAnchorByDropId(nextItems, fetchedAt));
          setInventoryChanges({ added, updated });
          setCampaignsLoading(false);

          const maybeAutoClaim = async (items: InventoryItem[]) => {
            if (!autoClaimEnabled) return;
            const now = Date.now();
            const claimable = items.filter((item) => {
              if (item.status === "claimed") return false;
              if (!isWithinClaimWindow(item, now)) return false;
              const blockingHints = item.blockingReasonHints ?? [];
              const req = Math.max(0, Number(item.requiredMinutes) || 0);
              const earned = Math.max(0, Number(item.earnedMinutes) || 0);
              const progressDone = req === 0 || earned >= req;
              if (!progressDone) return false;

              const hasClaimIdCandidate = Boolean(
                item.dropInstanceId || (item.campaignId && item.id),
              );
              if (!hasClaimIdCandidate) return false;

              if (item.isClaimable === true) return true;
              if (item.isClaimable === false) {
                const hardBlockingHints = blockingHints.filter(
                  (reason) =>
                    reason !== "missing_drop_instance_id" &&
                    reason !== "account_not_linked" &&
                    reason !== "campaign_allow_disabled",
                );
                if (hardBlockingHints.length > 0) return false;
              }

              // Accept fallback claim path when Twitch has progress but no explicit claimable flag yet.
              return true;
            });

            for (const drop of claimable) {
              const retrySignature = buildClaimRetrySignature(drop);
              const retryState = claimRetryByDropRef.current.get(drop.id);
              if (
                retryState &&
                retryState.signature === retrySignature &&
                now < retryState.nextAllowedAt
              ) {
                continue;
              }
              claimAttemptsRef.current.set(drop.id, now);
              try {
                const claimRes: unknown = await window.electronAPI.twitch.claimDrop({
                  dropInstanceId: drop.dropInstanceId,
                  dropId: drop.id,
                  campaignId: drop.campaignId,
                });
                if (isIpcErrorResponse(claimRes)) {
                  if (isIpcAuthErrorResponse(claimRes)) {
                    logWarn("inventory: claim auth error", claimRes);
                    onAuthError(claimRes.message);
                    return;
                  }
                  throw errorInfoFromIpc(claimRes, {
                    code: TWITCH_ERROR_CODES.CLAIM_FAILED,
                    message: "Drop claim failed",
                  });
                }
                if (isIpcOkFalseResponse(claimRes)) {
                  throw errorInfoFromIpc(claimRes, {
                    code: TWITCH_ERROR_CODES.CLAIM_FAILED,
                    message: "Drop claim failed",
                  });
                }
                onClaimed({ title: drop.title, game: drop.game });
                claimRetryByDropRef.current.delete(drop.id);
                claimAttemptsRef.current.delete(drop.id);
                logInfo("inventory: auto-claimed", {
                  title: drop.title,
                  game: drop.game,
                  id: drop.id,
                });
                setClaimStatus({
                  kind: "success",
                  message: `Auto-claimed: ${drop.title}`,
                  at: Date.now(),
                });
              } catch (err) {
                logWarn("inventory: claim error", { title: drop.title, err });
                const prevRetryState = claimRetryByDropRef.current.get(drop.id);
                const attempts =
                  prevRetryState && prevRetryState.signature === retrySignature
                    ? prevRetryState.attempts + 1
                    : 1;
                claimRetryByDropRef.current.set(drop.id, {
                  attempts,
                  nextAllowedAt: now + getClaimRetryDelay(attempts),
                  signature: retrySignature,
                });
                const errInfo = errorInfoFromUnknown(err, {
                  code: TWITCH_ERROR_CODES.CLAIM_FAILED,
                  message: "Drop claim failed",
                });
                setClaimStatus({
                  kind: "error",
                  message: errInfo.message,
                  code: errInfo.code,
                  title: drop.title,
                  at: Date.now(),
                });
              }
            }
          };

          void maybeAutoClaim(nextItems);
        } catch (err) {
          logError("inventory: fetch failed", err);
          const errInfo = errorInfoFromUnknown(err, {
            code: RENDERER_ERROR_CODES.INVENTORY_FETCH_FAILED,
            message: "Inventory request failed",
          });
          setInventory({
            status: "error",
            message: errInfo.message ?? "Inventory request failed",
            code: errInfo.code,
            items: hadItems ? prevItems : undefined,
          });
          setCampaignsLoading(false);
        } finally {
          setInventoryRefreshing(false);
        }
      } finally {
        fetchInFlightRef.current = false;
        const queued = pendingFetchOptsRef.current;
        if (queued) {
          pendingFetchOptsRef.current = null;
          logDebug("inventory: running queued fetch", {
            forceLoading: queued.forceLoading === true,
          });
          void fetchInventoryRef.current(queued);
        }
      }
    },
    [inventory, onClaimed, onMinutesEarned, onAuthError, autoClaimEnabled, demoMode, isLinked],
  );

  fetchInventoryRef.current = fetchInventory;

  useEffect(() => {
    if (!demoMode) return;
    const now = Date.now();
    const items = demoItemsRef.current ?? buildDemoInventory(now);
    setCampaigns(buildCampaignsFromInventory(items, now));
    setCampaignsLoading(false);
  }, [demoMode]);

  useEffect(() => {
    if (demoMode || !isLinked) return;

    const clearReconcileTimer = () => {
      if (pubSubReconcileTimerRef.current !== null) {
        window.clearTimeout(pubSubReconcileTimerRef.current);
        pubSubReconcileTimerRef.current = null;
      }
    };

    const scheduleReconcile = ({
      forceLoading,
      minGapMs,
      baseDelayMs,
    }: {
      forceLoading: boolean;
      minGapMs: number;
      baseDelayMs: number;
    }) => {
      pubSubReconcilePendingForceRef.current =
        pubSubReconcilePendingForceRef.current || forceLoading;
      const now = Date.now();
      const nextAt = Math.max(now + baseDelayMs, pubSubLastReconcileAtRef.current + minGapMs);
      if (
        pubSubReconcileTimerRef.current !== null &&
        nextAt >= pubSubReconcileScheduledAtRef.current
      ) {
        return;
      }
      clearReconcileTimer();
      pubSubReconcileScheduledAtRef.current = nextAt;
      pubSubReconcileTimerRef.current = window.setTimeout(
        () => {
          pubSubReconcileTimerRef.current = null;
          pubSubLastReconcileAtRef.current = Date.now();
          const force = pubSubReconcilePendingForceRef.current;
          pubSubReconcilePendingForceRef.current = false;
          void fetchInventoryRef.current({ forceLoading: force });
        },
        Math.max(0, nextAt - now),
      );
    };

    const applyPatch = (
      event: UserPubSubEvent,
    ): {
      patched: boolean;
      hasUnclaimedInCampaign?: boolean;
      claimedItem?: InventoryItem;
    } => {
      let patched = false;
      let updatedId: string | undefined;
      let updatedIds: string[] | undefined;
      let deltaMinutes = 0;
      let nextTotal = totalMinutesRef.current ?? 0;
      let claimedItem: InventoryItem | undefined;
      let hasUnclaimedInCampaign: boolean | undefined;

      setInventory((prev) => {
        const items =
          prev.status === "ready"
            ? prev.items
            : prev.status === "error" && prev.items
              ? prev.items
              : null;
        if (!items?.length) return prev;
        const patch =
          event.kind === "drop-progress"
            ? applyDropProgressToInventoryItems(items, event)
            : event.kind === "drop-claim"
              ? applyDropClaimToInventoryItems(items, event)
              : null;
        if (!patch || !patch.changed) return prev;
        patched = true;
        updatedId = patch.updatedId;
        updatedIds = patch.updatedIds;
        deltaMinutes = patch.deltaMinutes;
        nextTotal = patch.totalMinutes;
        claimedItem = patch.claimedItem;
        if (event.kind === "drop-claim" && patch.updatedId) {
          const updated = patch.items.find((item) => item.id === patch.updatedId);
          const campaignId = updated?.campaignId?.trim();
          if (campaignId) {
            hasUnclaimedInCampaign = patch.items.some(
              (item) => item.campaignId?.trim() === campaignId && item.status !== "claimed",
            );
          }
        }
        if (prev.status === "ready") {
          return { status: "ready", items: patch.items };
        }
        return { ...prev, items: patch.items };
      });

      if (!patched) return { patched: false };
      totalMinutesRef.current = nextTotal;
      if (deltaMinutes > 0) {
        onMinutesEarned(deltaMinutes);
      }
      if (claimedItem && autoClaimEnabled) {
        onClaimed({ title: claimedItem.title, game: claimedItem.game });
      }
      const eventAt =
        typeof event.at === "number" && Number.isFinite(event.at) ? event.at : Date.now();
      const idsToAnchor =
        updatedIds && updatedIds.length > 0 ? updatedIds : updatedId ? [updatedId] : [];
      if (idsToAnchor.length > 0) {
        setProgressAnchorByDropId((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const rawId of idsToAnchor) {
            const id = rawId.trim();
            if (!id) continue;
            const prevAt = next[id] ?? 0;
            if (eventAt > prevAt) {
              next[id] = eventAt;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
      if (updatedId) {
        const id = updatedId;
        setInventoryChanges((prev) => {
          const updated = new Set(prev.updated);
          updated.add(id);
          return { added: prev.added, updated };
        });
      }
      return { patched: true, hasUnclaimedInCampaign, claimedItem };
    };

    const unsubscribe = window.electronAPI.twitch.onUserPubSubEvent((payload: unknown) => {
      if (!isUserPubSubEvent(payload)) return;
      logDebug("inventory: userPubSub event", {
        kind: payload.kind,
        messageType: payload.messageType,
      });

      if (payload.kind === "drop-progress") {
        const dropId = payload.dropId?.trim();
        const progress =
          typeof payload.currentProgressMin === "number" &&
          Number.isFinite(payload.currentProgressMin)
            ? Math.max(0, payload.currentProgressMin)
            : null;
        if (dropId && progress !== null) {
          const lastProgress = progressByDropIdRef.current.get(dropId) ?? -1;
          if (progress <= lastProgress) {
            return;
          }
          progressByDropIdRef.current.set(dropId, progress);
        }
        applyPatch(payload);
        return;
      }

      if (payload.kind === "drop-claim") {
        const result = applyPatch(payload);
        if (!result.patched) return;
        if (autoClaimEnabled) {
          const dropInstanceIdFromEvent = payload.dropInstanceId?.trim();
          const dropIdFromEvent = payload.dropId?.trim();
          const claimedItem = result.claimedItem;
          const claimId = dropIdFromEvent || claimedItem?.id || dropInstanceIdFromEvent;
          const claimPayload = {
            dropInstanceId: dropInstanceIdFromEvent || claimedItem?.dropInstanceId,
            dropId: dropIdFromEvent || claimedItem?.id,
            campaignId: claimedItem?.campaignId,
          };
          if (claimId) {
            const now = Date.now();
            const last = claimAttemptsRef.current.get(claimId) ?? 0;
            if (now - last >= CLAIM_RETRY_MS) {
              claimAttemptsRef.current.set(claimId, now);
              void (async () => {
                try {
                  const claimRes: unknown = await window.electronAPI.twitch.claimDrop(claimPayload);
                  if (isIpcErrorResponse(claimRes)) {
                    if (isIpcAuthErrorResponse(claimRes)) {
                      logWarn("inventory: claim auth error", claimRes);
                      onAuthError(claimRes.message);
                      return;
                    }
                    throw errorInfoFromIpc(claimRes, {
                      code: TWITCH_ERROR_CODES.CLAIM_FAILED,
                      message: "Drop claim failed",
                    });
                  }
                  if (isIpcOkFalseResponse(claimRes)) {
                    throw errorInfoFromIpc(claimRes, {
                      code: TWITCH_ERROR_CODES.CLAIM_FAILED,
                      message: "Drop claim failed",
                    });
                  }
                  if (claimedItem) {
                    setClaimStatus({
                      kind: "success",
                      message: `Auto-claimed: ${claimedItem.title}`,
                      at: Date.now(),
                    });
                  }
                } catch (err) {
                  const errInfo = errorInfoFromUnknown(err, {
                    code: TWITCH_ERROR_CODES.CLAIM_FAILED,
                    message: "Drop claim failed",
                  });
                  setClaimStatus({
                    kind: "error",
                    message: errInfo.message,
                    code: errInfo.code,
                    title: claimedItem?.title ?? dropIdFromEvent,
                    at: Date.now(),
                  });
                }
              })();
            }
          }
        }
        // Claim availability and prerequisite unlocks can lag for a few seconds after the event.
        // Reconcile after a short delay so next-drop state becomes visible quickly.
        scheduleReconcile({
          forceLoading: true,
          minGapMs: 2_000,
          baseDelayMs: 4_000,
        });
        return;
      }

      scheduleReconcile({
        forceLoading: true,
        minGapMs: 2_000,
        baseDelayMs: 450,
      });
    });

    return () => {
      clearReconcileTimer();
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [demoMode, isLinked, onClaimed, onMinutesEarned, onAuthError, autoClaimEnabled]);

  useEffect(() => {
    if (inventoryChanges.added.size === 0 && inventoryChanges.updated.size === 0) return;
    const timer = window.setTimeout(() => {
      setInventoryChanges({ added: new Set(), updated: new Set() });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [inventoryChanges]);

  const inventoryItems = useMemo<InventoryItem[]>(() => {
    if (inventory.status === "ready") return inventory.items;
    if (inventory.status === "error" && inventory.items) return inventory.items;
    return [];
  }, [inventory.items, inventory.status]);

  const uniqueGames = useMemo(
    () => Array.from(new Set(inventoryItems.map((i) => i.game))).sort(),
    [inventoryItems],
  );

  const withCategories = useMemo(
    () =>
      inventoryItems.map((item) => ({
        item,
        category: getCategory(item, isLinked, allowUnlinkedBadgeEmotes, allowUnlinkedGames),
      })),
    [inventoryItems, isLinked, allowUnlinkedBadgeEmotes, allowUnlinkedGames],
  );

  return {
    inventory,
    inventoryItems,
    campaigns,
    campaignsLoading,
    inventoryRefreshing,
    inventoryChanges,
    inventoryFetchedAt,
    fetchInventory,
    uniqueGames,
    setInventoryChanges,
    setInventoryFetchedAt,
    progressAnchorByDropId,
    withCategories,
    claimStatus,
    setClaimStatus,
  };
}
