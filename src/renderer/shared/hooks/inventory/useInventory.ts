import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CampaignSummary,
  ClaimStatus,
  InventoryItem,
  InventoryState,
  UserPubSubEvent,
} from "@renderer/shared/types";
import { buildDemoInventory } from "@renderer/shared/demoData";
import {
  advanceDemoInventoryItems,
  applyDropClaimToInventoryItems,
  applyDropProgressToInventoryItems,
  applyPubSubEventToInventoryState,
  buildCampaignsFromInventory,
  buildProgressAnchorByDropId,
  deriveInventoryChanges,
  deriveMinutesUpdate,
  deriveNewlyClaimedItems,
  getPatchedAnchorIds,
  getElapsedWholeMinutes,
  InventoryClaimEngine,
  InventoryPubSubReconciler,
  markUpdatedInventoryChange,
  mergeProgressAnchors,
  reconcileFetchedInventoryItems,
  resolvePubSubEventAt,
  shouldDeduplicateInFlightForceFetch,
} from "@renderer/shared/domain/inventory";
import { getCategory } from "@renderer/shared/utils";
import { logDebug, logError, logInfo, logWarn } from "@renderer/shared/utils/logger";
import { errorInfoFromIpc, errorInfoFromUnknown } from "@renderer/shared/utils/errors";
import {
  isArrayOf,
  isInventoryItem,
  isInventoryBundle,
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
  isUserPubSubEvent,
} from "@renderer/shared/utils/ipc";
import { RENDERER_ERROR_CODES } from "../../../../shared/errorCodes";

const NOOP = () => {};
const NOOP_CLAIM = () => {};
const NOOP_AUTH = (_message?: string) => {};
type FetchInventoryOpts = { forceLoading?: boolean };
const CLAIM_RECONCILE_POLICY = {
  forceLoading: true,
  minGapMs: 2_000,
  baseDelayMs: 4_000,
} as const;
const GENERIC_RECONCILE_POLICY = {
  forceLoading: true,
  minGapMs: 2_000,
  baseDelayMs: 450,
} as const;

type InventoryReconcileRunner = (forceLoading: boolean) => void;

export const scheduleClaimReconcile = (
  reconciler: Pick<InventoryPubSubReconciler, "schedule"> | null | undefined,
  run: InventoryReconcileRunner,
): void => {
  if (!reconciler) return;
  reconciler.schedule(CLAIM_RECONCILE_POLICY, run);
};
export {
  applyDropClaimToInventoryItems,
  applyDropProgressToInventoryItems,
  shouldDeduplicateInFlightForceFetch,
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
  const claimEngineRef = useRef<InventoryClaimEngine>(new InventoryClaimEngine());
  const pubSubReconcilerRef = useRef<InventoryPubSubReconciler | null>(null);
  const fetchInFlightRef = useRef(false);
  const fetchInFlightStartedAtRef = useRef(0);
  const fetchInFlightForceRef = useRef(false);
  const pendingFetchOptsRef = useRef<FetchInventoryOpts | null>(null);
  const fetchInventoryRef = useRef<(opts?: FetchInventoryOpts) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const demoItemsRef = useRef<InventoryItem[] | null>(null);
  const demoLastAtRef = useRef<number | null>(null);

  if (pubSubReconcilerRef.current === null) {
    pubSubReconcilerRef.current = new InventoryPubSubReconciler({
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (timerId) => window.clearTimeout(timerId),
      now: () => Date.now(),
    });
  }

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
      claimEngineRef.current.reset();
      pubSubReconcilerRef.current?.reset();
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
        const now = Date.now();
        const queuedForce = Boolean(
          pendingFetchOptsRef.current?.forceLoading || opts?.forceLoading,
        );
        if (
          shouldDeduplicateInFlightForceFetch({
            now,
            inFlightStartedAt: fetchInFlightStartedAtRef.current,
            inFlightForceLoading: fetchInFlightForceRef.current,
            nextForceLoading: queuedForce,
          })
        ) {
          logDebug("inventory: fetch deduped (in flight forced fetch)", {
            forceLoading: queuedForce,
            inFlightMs: now - fetchInFlightStartedAtRef.current,
          });
          return;
        }
        pendingFetchOptsRef.current = queuedForce ? { forceLoading: true } : {};
        logDebug("inventory: fetch queued (in flight)", { forceLoading: queuedForce });
        return;
      }
      fetchInFlightRef.current = true;
      fetchInFlightStartedAtRef.current = Date.now();
      fetchInFlightForceRef.current = Boolean(opts?.forceLoading);
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
          const currentItems = demoItemsRef.current ?? buildDemoInventory(now);
          const lastAt = demoLastAtRef.current ?? now;
          const elapsedMinutes = getElapsedWholeMinutes(lastAt, now);
          if (elapsedMinutes > 0) {
            demoLastAtRef.current = now;
          }
          const nextItems = advanceDemoInventoryItems({
            items: currentItems,
            elapsedMinutes,
            autoClaimEnabled,
          });
          demoItemsRef.current = nextItems;
          const minutesUpdate = deriveMinutesUpdate(totalMinutesRef.current, nextItems);
          if (minutesUpdate.deltaMinutes > 0) {
            onMinutesEarned(minutesUpdate.deltaMinutes);
          }
          totalMinutesRef.current = minutesUpdate.nextTotalMinutes;
          const changes = deriveInventoryChanges(prevItems, nextItems);
          if (autoClaimEnabled) {
            const claimedNow = deriveNewlyClaimedItems(prevItems, nextItems);
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
          setInventoryChanges(changes);
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
          const nextItems = reconcileFetchedInventoryItems(prevItems, bundle.items);
          setCampaigns(bundle.campaigns);
          const minutesUpdate = deriveMinutesUpdate(totalMinutesRef.current, nextItems);
          logInfo("inventory: fetch success", {
            items: nextItems.length,
            totalMinutes: minutesUpdate.nextTotalMinutes,
          });
          if (minutesUpdate.deltaMinutes > 0) {
            onMinutesEarned(minutesUpdate.deltaMinutes);
          }
          totalMinutesRef.current = minutesUpdate.nextTotalMinutes;
          const changes = deriveInventoryChanges(prevItems, nextItems);
          setInventory({ status: "ready", items: nextItems });
          const fetchedAt = Date.now();
          setInventoryFetchedAt(fetchedAt);
          setProgressAnchorByDropId(buildProgressAnchorByDropId(nextItems, fetchedAt));
          setInventoryChanges(changes);
          setCampaignsLoading(false);

          if (autoClaimEnabled) {
            void claimEngineRef.current
              .autoClaimFromInventory(nextItems, {
                claimDrop: (payload) => window.electronAPI.twitch.claimDrop(payload),
                onAuthError,
                onClaimed,
                setClaimStatus,
              })
              .then((result) => {
                if (result.claimedCount <= 0) return;
                scheduleClaimReconcile(pubSubReconcilerRef.current, (forceLoading) => {
                  void fetchInventoryRef.current({ forceLoading });
                });
              });
          }
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
        fetchInFlightStartedAtRef.current = 0;
        fetchInFlightForceRef.current = false;
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
    const pubSubReconciler = pubSubReconcilerRef.current;
    if (!pubSubReconciler) return;

    const applyPatch = (
      event: UserPubSubEvent,
    ): {
      patched: boolean;
      hasUnclaimedInCampaign?: boolean;
      claimedItem?: InventoryItem;
    } => {
      let patchResult: ReturnType<typeof applyPubSubEventToInventoryState> | null = null;

      setInventory((prev) => {
        const result = applyPubSubEventToInventoryState(prev, event);
        if (!result.patched) return prev;
        patchResult = result;
        return result.nextInventory;
      });

      const result = patchResult;
      if (!result?.patched) return { patched: false };
      totalMinutesRef.current = result.nextTotalMinutes ?? totalMinutesRef.current ?? 0;
      if (result.deltaMinutes > 0) {
        onMinutesEarned(result.deltaMinutes);
      }
      if (result.claimedItem && autoClaimEnabled) {
        onClaimed({ title: result.claimedItem.title, game: result.claimedItem.game });
      }
      const eventAt = resolvePubSubEventAt(event, Date.now());
      const anchorIds = getPatchedAnchorIds(result);
      if (anchorIds.length > 0) {
        setProgressAnchorByDropId((prev) => mergeProgressAnchors(prev, anchorIds, eventAt));
      }
      if (result.updatedId) {
        setInventoryChanges((prev) => markUpdatedInventoryChange(prev, result.updatedId));
      }
      return {
        patched: true,
        hasUnclaimedInCampaign: result.hasUnclaimedInCampaign,
        claimedItem: result.claimedItem,
      };
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
        if (
          dropId &&
          progress !== null &&
          !pubSubReconciler.shouldApplyProgress(dropId, progress)
        ) {
          return;
        }
        applyPatch(payload);
        return;
      }

      if (payload.kind === "drop-claim") {
        const result = applyPatch(payload);
        if (!result.patched) return;
        if (autoClaimEnabled) {
          void claimEngineRef.current.claimFromPubSubDropClaim({
            claimDrop: (claimPayload) => window.electronAPI.twitch.claimDrop(claimPayload),
            onAuthError,
            setClaimStatus,
            event: payload,
            claimedItem: result.claimedItem,
          });
        }
        // Claim availability and prerequisite unlocks can lag for a few seconds after the event.
        // Reconcile after a short delay so next-drop state becomes visible quickly.
        scheduleClaimReconcile(pubSubReconciler, (forceLoading) => {
          void fetchInventoryRef.current({ forceLoading });
        });
        return;
      }

      pubSubReconciler.schedule(GENERIC_RECONCILE_POLICY, (forceLoading) => {
        void fetchInventoryRef.current({ forceLoading });
      });
    });

    return () => {
      pubSubReconciler.clearScheduledReconcile();
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
