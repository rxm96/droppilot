import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClaimStatus, InventoryItem, InventoryState } from "../types";
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
type FetchInventoryOpts = { forceLoading?: boolean };

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
        const queuedForce = Boolean(pendingFetchOptsRef.current?.forceLoading || opts?.forceLoading);
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
              (item) =>
                item.status === "claimed" && prevMap.get(item.id)?.status !== "claimed",
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
                  window.setTimeout(() => fetchInventoryRef.current?.({ forceLoading: true }), 1200);
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
          logDebug("inventory: running queued fetch", { forceLoading: queued.forceLoading === true });
          void fetchInventoryRef.current(queued);
        }
      }
    },
    [inventory, onClaimed, onMinutesEarned, onAuthError, autoClaimEnabled, demoMode],
  );

  fetchInventoryRef.current = fetchInventory;

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
