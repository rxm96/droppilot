import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClaimStatus, InventoryItem, InventoryState, UserPubSubEvent } from "../types";
import { buildDemoInventory } from "../demoData";
import { getCategory } from "../utils";
import { logDebug, logError, logInfo, logWarn } from "../utils/logger";
import { errorInfoFromIpc, errorInfoFromUnknown } from "../utils/errors";
import {
  isArrayOf,
  isInventoryItem,
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
  isIpcOkFalseResponse,
  isUserPubSubEvent,
} from "../utils/ipc";
import { RENDERER_ERROR_CODES, TWITCH_ERROR_CODES } from "../../shared/errorCodes";

type InventoryHook = {
  inventory: InventoryState;
  inventoryItems: InventoryItem[];
  inventoryRefreshing: boolean;
  inventoryChanges: { added: Set<string>; updated: Set<string> };
  inventoryFetchedAt: number | null;
  fetchInventory: (opts?: { forceLoading?: boolean }) => Promise<void>;
  uniqueGames: string[];
  setInventoryChanges: (v: { added: Set<string>; updated: Set<string> }) => void;
  setInventoryFetchedAt: (ts: number | null) => void;
  claimStatus: ClaimStatus | null;
  setClaimStatus: (val: ClaimStatus | null) => void;
};

const CLAIM_RETRY_MS = 90_000;
const NOOP = () => {};
const NOOP_CLAIM = () => {};
const NOOP_AUTH = (_message?: string) => {};
const PUBSUB_PROGRESS_RECONCILE_MIN_GAP_MS = 30_000;
const PUBSUB_PROGRESS_RECONCILE_DELAY_MS = 15_000;
const PUBSUB_PROGRESS_STALE_DELAY_MS = 10_000;
type FetchInventoryOpts = { forceLoading?: boolean };

type InventoryPatchResult = {
  changed: boolean;
  items: InventoryItem[];
  updatedId?: string;
  deltaMinutes: number;
  totalMinutes: number;
  claimedItem?: InventoryItem;
};

const getTotalEarnedMinutes = (items: InventoryItem[]): number =>
  items.reduce((acc, item) => acc + Math.max(0, Number(item.earnedMinutes) || 0), 0);

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
    if (dropInstanceId && item.dropInstanceId && item.dropInstanceId === dropInstanceId) return true;
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
};

export function useInventory(isLinked: boolean, events?: InventoryEvents, opts?: InventoryOptions) {
  const onMinutesEarned = events?.onMinutesEarned ?? NOOP;
  const onClaimed = events?.onClaimed ?? NOOP_CLAIM;
  const onAuthError = events?.onAuthError ?? NOOP_AUTH;
  const autoClaimEnabled = opts?.autoClaim !== false;
  const demoMode = opts?.demoMode === true;
  const [inventory, setInventory] = useState<InventoryState>({ status: "idle" });
  const [inventoryRefreshing, setInventoryRefreshing] = useState(false);
  const [inventoryChanges, setInventoryChanges] = useState<{
    added: Set<string>;
    updated: Set<string>;
  }>({
    added: new Set(),
    updated: new Set(),
  });
  const [inventoryFetchedAt, setInventoryFetchedAt] = useState<number | null>(null);
  const [claimStatus, setClaimStatus] = useState<ClaimStatus | null>(null);
  const totalMinutesRef = useRef<number | null>(null);
  const claimAttemptsRef = useRef<Map<string, number>>(new Map());
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
      totalMinutesRef.current = null;
      claimAttemptsRef.current.clear();
      progressByDropIdRef.current.clear();
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
        if (!hadItems || opts?.forceLoading) {
          setInventory({ status: "loading" });
        } else {
          setInventoryRefreshing(true);
        }
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
          setInventoryChanges({ added, updated });
          setInventoryRefreshing(false);
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
            return;
          }
          if (!isArrayOf(res, isInventoryItem)) {
            setInventory({
              status: "error",
              code: RENDERER_ERROR_CODES.INVENTORY_INVALID_RESPONSE,
              message: "Inventory response was invalid",
              items: hadItems ? prevItems : undefined,
            });
            return;
          }
          const nextItems = res;
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
          setInventoryFetchedAt(Date.now());
          setInventoryChanges({ added, updated });

          const maybeAutoClaim = async (items: InventoryItem[]) => {
            if (!autoClaimEnabled) return;
            const now = Date.now();
            let scheduledRefresh = false;
            const claimable = items.filter((item) => {
              if (item.status === "claimed") return false;
              if (!item.dropInstanceId && !item.campaignId) return false;
              const req = Math.max(0, Number(item.requiredMinutes) || 0);
              const earned = Math.max(0, Number(item.earnedMinutes) || 0);
              const progressDone = req === 0 || earned >= req;
              return progressDone;
            });

            for (const drop of claimable) {
              const last = claimAttemptsRef.current.get(drop.id) ?? 0;
              if (now - last < CLAIM_RETRY_MS) continue;
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
                if (!scheduledRefresh) {
                  scheduledRefresh = true;
                  window.setTimeout(
                    () => fetchInventoryRef.current?.({ forceLoading: true }),
                    1200,
                  );
                }
              } catch (err) {
                logWarn("inventory: claim error", { title: drop.title, err });
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
    [inventory, onClaimed, onMinutesEarned, onAuthError, autoClaimEnabled, demoMode],
  );

  fetchInventoryRef.current = fetchInventory;

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
      pubSubReconcileTimerRef.current = window.setTimeout(() => {
        pubSubReconcileTimerRef.current = null;
        pubSubLastReconcileAtRef.current = Date.now();
        const force = pubSubReconcilePendingForceRef.current;
        pubSubReconcilePendingForceRef.current = false;
        void fetchInventoryRef.current({ forceLoading: force });
      }, Math.max(0, nextAt - now));
    };

    const applyPatch = (event: UserPubSubEvent): boolean => {
      let patched = false;
      let updatedId: string | undefined;
      let deltaMinutes = 0;
      let nextTotal = totalMinutesRef.current ?? 0;
      let claimedItem: InventoryItem | undefined;

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
        deltaMinutes = patch.deltaMinutes;
        nextTotal = patch.totalMinutes;
        claimedItem = patch.claimedItem;
        if (prev.status === "ready") {
          return { status: "ready", items: patch.items };
        }
        return { ...prev, items: patch.items };
      });

      if (!patched) return false;
      totalMinutesRef.current = nextTotal;
      if (deltaMinutes > 0) {
        onMinutesEarned(deltaMinutes);
      }
      if (claimedItem && autoClaimEnabled) {
        onClaimed({ title: claimedItem.title, game: claimedItem.game });
      }
      if (updatedId) {
        setInventoryChanges((prev) => {
          const updated = new Set(prev.updated);
          updated.add(updatedId);
          return { added: prev.added, updated };
        });
      }
      return true;
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
          typeof payload.currentProgressMin === "number" && Number.isFinite(payload.currentProgressMin)
            ? Math.max(0, payload.currentProgressMin)
            : null;
        if (dropId && progress !== null) {
          const lastProgress = progressByDropIdRef.current.get(dropId) ?? -1;
          if (progress <= lastProgress) {
            scheduleReconcile({
              forceLoading: false,
              minGapMs: PUBSUB_PROGRESS_RECONCILE_MIN_GAP_MS,
              baseDelayMs: PUBSUB_PROGRESS_STALE_DELAY_MS,
            });
            return;
          }
          progressByDropIdRef.current.set(dropId, progress);
        }
        const patched = applyPatch(payload);
        scheduleReconcile(
          patched
            ? {
                forceLoading: false,
                minGapMs: PUBSUB_PROGRESS_RECONCILE_MIN_GAP_MS,
                baseDelayMs: PUBSUB_PROGRESS_RECONCILE_DELAY_MS,
              }
            : {
                forceLoading: false,
                minGapMs: 10_000,
                baseDelayMs: 1_500,
              },
        );
        return;
      }

      if (payload.kind === "drop-claim") {
        applyPatch(payload);
        scheduleReconcile({
          forceLoading: true,
          minGapMs: 2_000,
          baseDelayMs: 450,
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
  }, [demoMode, isLinked, onClaimed, onMinutesEarned, autoClaimEnabled]);

  useEffect(() => {
    if (inventoryChanges.added.size === 0 && inventoryChanges.updated.size === 0) return;
    const timer = window.setTimeout(() => {
      setInventoryChanges({ added: new Set(), updated: new Set() });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [inventoryChanges]);

  const inventoryItems: InventoryItem[] =
    inventory.status === "ready"
      ? inventory.items
      : inventory.status === "error" && inventory.items
        ? inventory.items
        : [];

  const uniqueGames = useMemo(
    () => Array.from(new Set(inventoryItems.map((i) => i.game))).sort(),
    [inventoryItems],
  );

  const withCategories = useMemo(
    () =>
      inventoryItems.map((item) => ({
        item,
        category: getCategory(item, isLinked),
      })),
    [inventoryItems, isLinked],
  );

  return {
    inventory,
    inventoryItems,
    inventoryRefreshing,
    inventoryChanges,
    inventoryFetchedAt,
    fetchInventory,
    uniqueGames,
    setInventoryChanges,
    setInventoryFetchedAt,
    withCategories,
    claimStatus,
    setClaimStatus,
  };
}
