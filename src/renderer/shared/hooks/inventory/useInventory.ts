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

// Synthetic drop-claim event so a successful auto-claim flows through the same
// reconciler path the PubSub handler uses — flips the drop to status "claimed"
// in local state immediately (no waiting for the next inventory reload).
const buildLocalClaimEvent = (drop: InventoryItem): UserPubSubEvent => ({
  kind: "drop-claim",
  at: Date.now(),
  topic: "auto-claim-local",
  messageType: "drop-claim",
  dropId: drop.id,
  dropInstanceId: drop.dropInstanceId,
});
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
  // Timestamp of the last time the watched drop's progress was confirmed by the
  // server — either via a PubSub drop-progress event or a successful GQL poll.
  // Drives TDM-style reactive poll gating: while this stays fresh (events are
  // flowing, or a poll just ran), we skip polling entirely. 0 = never confirmed.
  const lastProgressUpdateAtRef = useRef<number>(0);
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
            void claimEngineRef.current.autoClaimFromInventory(nextItems, {
              claimDrop: (payload) => window.electronAPI.twitch.claimDrop(payload),
              onAuthError,
              onClaimed,
              setClaimStatus,
              markClaimed: (drop) =>
                setInventory((prev) => {
                  const result = applyPubSubEventToInventoryState(prev, buildLocalClaimEvent(drop));
                  return result.patched ? result.nextInventory : prev;
                }),
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
    if (demoMode || !isLinked) {
      // Silent kill #1: if the account isn't linked yet, the renderer never
      // subscribes to drop-progress events, and earnedMinutes never advances
      // mid-session. Log it so DevView shows why we're not seeing live data.
      logDebug("inventory: pubsub subscription skipped", { demoMode, isLinked });
      return;
    }
    const pubSubReconciler = pubSubReconcilerRef.current;
    if (!pubSubReconciler) {
      // Silent kill #2: reconciler ref not yet initialized. This is normally
      // a brief startup window, but if it persists, no events are applied.
      logDebug("inventory: pubsub reconciler not ready");
      return;
    }
    logDebug("inventory: pubsub subscription attached");

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

      const result = patchResult as ReturnType<typeof applyPubSubEventToInventoryState> | null;
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
        const updatedId = result.updatedId;
        setInventoryChanges((prev) => markUpdatedInventoryChange(prev, updatedId));
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
        // A push arrived — the live event channel is alive right now, so reset
        // the stall clock. This keeps the reactive poll gate quiet while events
        // flow (mirrors TDM: GQL is only a fallback for when push stalls).
        lastProgressUpdateAtRef.current = Date.now();
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
        pubSubReconciler.schedule(
          {
            forceLoading: true,
            minGapMs: 2_000,
            baseDelayMs: 4_000,
          },
          (forceLoading) => {
            void fetchInventoryRef.current({ forceLoading });
          },
        );
        return;
      }

      pubSubReconciler.schedule(
        {
          forceLoading: true,
          minGapMs: 2_000,
          baseDelayMs: 450,
        },
        (forceLoading) => {
          void fetchInventoryRef.current({ forceLoading });
        },
      );
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
  }, [inventory]);

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

  const claimNowAll = useCallback(async () => {
    if (inventory.status !== "ready") return;
    await claimEngineRef.current.autoClaimFromInventory(inventory.items, {
      claimDrop: (payload) => window.electronAPI.twitch.claimDrop(payload),
      onAuthError,
      onClaimed,
      setClaimStatus,
      markClaimed: (drop) =>
        setInventory((prev) => {
          const result = applyPubSubEventToInventoryState(prev, buildLocalClaimEvent(drop));
          return result.patched ? result.nextInventory : prev;
        }),
    });
  }, [inventory, onAuthError, onClaimed, setClaimStatus]);

  /**
   * Polls the live drop progress (DropCurrentSessionContext GQL) and patches
   * it into inventory state — the replacement for the dead `user-drop-events`
   * PubSub topic. Synthesizes a drop-progress event so it flows through the
   * exact same applyPubSubEventToInventoryState path the PubSub handler used.
   *
   * Called on an interval while watching (see useDropProgressPoll). Safe to
   * call when idle — it no-ops if not linked or inventory isn't ready.
   */
  const pollDropProgressOnce = useCallback(
    async (channelId: string) => {
      if (demoMode || !isLinked) return;
      const watchedChannelId = String(channelId ?? "").trim();
      // DropCurrentSessionContext keys off the watched channel id — without it the
      // server always returns a null session, so there's nothing to poll for.
      if (!watchedChannelId) return;
      let res: Awaited<ReturnType<typeof window.electronAPI.twitch.dropProgress>>;
      try {
        res = await window.electronAPI.twitch.dropProgress({ channelId: watchedChannelId });
      } catch {
        return;
      }
      if (isIpcAuthErrorResponse(res)) {
        onAuthError(res.message);
        return;
      }
      if (!res || typeof res !== "object" || !("ok" in res) || !res.ok) return;
      // We got a definitive server answer — either live progress or a clean
      // "no active session". Both reset the stall clock so the reactive gate
      // waits a full window before polling again (a null session shouldn't make
      // us re-poll every tick).
      lastProgressUpdateAtRef.current = Date.now();
      const progress = res.progress;
      if (!progress) return; // no active session on the watched channel
      // Twitch's dropCurrentSession returns the user's GLOBALLY-active drop
      // session, which can still point at a previously-watched channel (frozen
      // at its last value) right after a channel switch or app restart — it does
      // NOT scope to the channelID we pass. If the session is for a different
      // channel than the one we're watching, it's stale for us: applying it would
      // freeze the active drop on another channel's old minutes (the "stuck at 8,
      // ETA always ~51" symptom). Ignore it and let the watch-start-anchored
      // virtualEarned estimate drive the UI until Twitch credits this channel.
      if (progress.channelId && progress.channelId !== watchedChannelId) {
        logDebug("inventory: dropProgress ignored — session is for another channel", {
          watching: watchedChannelId,
          session: progress.channelId,
          dropId: progress.dropId,
          currentMin: progress.currentMinutesWatched,
        });
        return;
      }
      const dropId = progress.dropId?.trim();
      if (!dropId) return;
      const currentMin = Math.max(0, Number(progress.currentMinutesWatched) || 0);
      const reconciler = pubSubReconcilerRef.current;
      // Dedupe: skip if the reconciler says this exact progress was already applied.
      if (reconciler && !reconciler.shouldApplyProgress(dropId, currentMin)) return;

      const synthetic: UserPubSubEvent = {
        kind: "drop-progress",
        at: Date.now(),
        topic: "drop-progress-poll",
        messageType: "drop-progress",
        dropId,
        currentProgressMin: currentMin,
        requiredProgressMin: Math.max(0, Number(progress.requiredMinutesWatched) || 0),
      };

      let patchResult: ReturnType<typeof applyPubSubEventToInventoryState> | null = null;
      setInventory((prev) => {
        const result = applyPubSubEventToInventoryState(prev, synthetic);
        if (!result.patched) return prev;
        patchResult = result;
        return result.nextInventory;
      });
      const applied = patchResult as ReturnType<typeof applyPubSubEventToInventoryState> | null;
      if (!applied?.patched) return;
      totalMinutesRef.current = applied.nextTotalMinutes ?? totalMinutesRef.current ?? 0;
      if (applied.deltaMinutes > 0) onMinutesEarned(applied.deltaMinutes);
      const anchorIds = getPatchedAnchorIds(applied);
      if (anchorIds.length > 0) {
        setProgressAnchorByDropId((prev) => mergeProgressAnchors(prev, anchorIds, synthetic.at));
      }
      const updatedId = applied.updatedId;
      if (updatedId) {
        setInventoryChanges((prev) => markUpdatedInventoryChange(prev, updatedId));
      }
      logDebug("inventory: dropProgress poll applied", {
        dropId,
        currentMin,
        delta: applied.deltaMinutes,
      });
    },
    [demoMode, isLinked, onAuthError, onMinutesEarned],
  );

  // TDM-style reactive gate: only spend a GQL poll when the live data has gone
  // stale — i.e. neither a PubSub drop-progress event nor a previous poll has
  // confirmed the watched drop within `stallMs`. While push events flow (or
  // right after a poll), this no-ops and makes zero extra requests; when the
  // event channel is silent it degrades to ~one poll per stall window.
  const pollDropProgressIfStale = useCallback(
    async (channelId: string, stallMs: number) => {
      const lastAt = lastProgressUpdateAtRef.current;
      if (lastAt > 0 && Date.now() - lastAt < stallMs) return;
      await pollDropProgressOnce(channelId);
    },
    [pollDropProgressOnce],
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
    claimNowAll,
    pollDropProgressOnce,
    pollDropProgressIfStale,
  };
}
