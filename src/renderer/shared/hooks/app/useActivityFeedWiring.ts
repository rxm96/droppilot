import { useEffect, useRef } from "react";
import type {
  AutoSwitchInfo,
  ErrorInfo,
  InventoryItem,
  WatchingState,
} from "@renderer/shared/types";
import { recordActivity } from "@renderer/shared/utils/activityFeed";
import type { ActivityEvent } from "@renderer/shared/utils/activityFeed";

type Params = {
  autoSwitchInfo: AutoSwitchInfo | null;
  inventoryChanges: { added: Set<string> };
  inventoryItems: InventoryItem[];
  lastWatchError: ErrorInfo | null;
  watching: WatchingState;
};

// Activity feed wiring (Sources 2-5). Source 1 (drop-claimed) is recorded by
// useDropClaimAlerts.
export function useActivityFeedWiring({
  autoSwitchInfo,
  inventoryChanges,
  inventoryItems,
  lastWatchError,
  watching,
}: Params) {
  // Source 2: Auto-switch — rising-edge detect (null → truthy with new `at`)
  const prevAutoSwitchRef = useRef<AutoSwitchInfo | null>(null);
  useEffect(() => {
    const prev = prevAutoSwitchRef.current;
    prevAutoSwitchRef.current = autoSwitchInfo;
    if (!autoSwitchInfo) return;
    if (prev && prev.at === autoSwitchInfo.at) return;
    recordActivity({
      kind: "auto-switch",
      at: autoSwitchInfo.at ?? Date.now(),
      fromName: autoSwitchInfo.from?.name ?? "",
      toName: autoSwitchInfo.to?.name ?? "",
      reason: autoSwitchInfo.reason ?? "",
    } as Omit<Extract<ActivityEvent, { kind: "auto-switch" }>, "id">);
  }, [autoSwitchInfo]);

  // Source 3: New drops added — rising-edge detect on added set size
  const prevAddedRef = useRef<Set<string> | undefined>(undefined);
  useEffect(() => {
    const prevSize = prevAddedRef.current?.size ?? 0;
    const currSize = inventoryChanges?.added?.size ?? 0;
    prevAddedRef.current = inventoryChanges?.added;
    if (currSize > prevSize && currSize > 0) {
      const firstAddedId = inventoryChanges.added.values().next().value;
      const sample = firstAddedId ? inventoryItems.find((it) => it.id === firstAddedId) : undefined;
      recordActivity({
        kind: "new-drops",
        at: Date.now(),
        count: currSize,
        sampleTitle: sample?.title,
      } as Omit<Extract<ActivityEvent, { kind: "new-drops" }>, "id">);
    }
  }, [inventoryChanges, inventoryItems]);

  // Source 4: Watch error — rising-edge detect (new or changed error)
  const prevWatchErrorRef = useRef<ErrorInfo | null>(null);
  useEffect(() => {
    const prev = prevWatchErrorRef.current;
    const curr = lastWatchError;
    prevWatchErrorRef.current = curr;
    if (!curr) return;
    if (prev && prev.code === curr.code && prev.message === curr.message) return;
    recordActivity({
      kind: "watch-error",
      at: Date.now(),
      message: curr.message,
      code: curr.code,
    } as Omit<Extract<ActivityEvent, { kind: "watch-error" }>, "id">);
  }, [lastWatchError]);

  // Source 5: Watch started — null → truthy transition
  const prevWatchingRef = useRef<WatchingState>(null);
  useEffect(() => {
    const prev = prevWatchingRef.current;
    prevWatchingRef.current = watching;
    if (!prev && watching) {
      recordActivity({
        kind: "watch-started",
        at: Date.now(),
        channelName: watching.name ?? watching.login ?? "",
        game: watching.game,
      } as Omit<Extract<ActivityEvent, { kind: "watch-started" }>, "id">);
    }
  }, [watching]);
}
