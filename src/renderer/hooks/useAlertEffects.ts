import { useEffect, useRef, useState } from "react";
import { translate } from "../i18n";
import type { AutoSwitchInfo, InventoryItem, InventoryState, WatchingState } from "../types";
import type { ActiveDropInfo } from "./useTargetDrops";
import type { WatchStats } from "./useWatchPing";

type NotifyFn = (payload: {
  key: string;
  title: string;
  body?: string;
  dedupeMs?: number;
  force?: boolean;
}) => void;

type InventoryChanges = {
  added: Set<string>;
  updated: Set<string>;
};

type Params = {
  language: string;
  notify: NotifyFn;
  alertsNewDrops: boolean;
  alertsWatchError: boolean;
  alertsAutoSwitch: boolean;
  alertsDropEndingSoon: boolean;
  alertsDropEndingMinutes: number;
  inventory: InventoryState;
  inventoryItems: InventoryItem[];
  inventoryChanges: InventoryChanges;
  watchStats: WatchStats;
  autoSwitch: AutoSwitchInfo | null;
  activeDropInfo: ActiveDropInfo | null;
  watching: WatchingState;
};

export function useAlertEffects({
  language,
  notify,
  alertsNewDrops,
  alertsWatchError,
  alertsAutoSwitch,
  alertsDropEndingSoon,
  alertsDropEndingMinutes,
  inventory,
  inventoryItems,
  inventoryChanges,
  watchStats,
  autoSwitch,
  activeDropInfo,
  watching,
}: Params) {
  const [autoSwitchInfo, setAutoSwitchInfo] = useState<AutoSwitchInfo | null>(null);
  const inventoryAlertReadyRef = useRef(false);

  useEffect(() => {
    if (!autoSwitch) return;
    setAutoSwitchInfo(autoSwitch);
    const id = window.setTimeout(() => setAutoSwitchInfo(null), 12000);
    return () => window.clearTimeout(id);
  }, [autoSwitch]);

  useEffect(() => {
    if (!alertsNewDrops) return;
    if (inventory.status !== "ready") return;
    if (!inventoryAlertReadyRef.current) {
      inventoryAlertReadyRef.current = true;
      return;
    }
    if (inventoryChanges.added.size === 0) return;
    const addedItems = inventoryItems.filter((item) => inventoryChanges.added.has(item.id));
    if (addedItems.length === 0) return;
    const games = Array.from(new Set(addedItems.map((item) => item.game).filter(Boolean)));
    const gameLabel = (() => {
      if (!games.length) return translate(language, "alerts.misc.multipleGames");
      const main = games.slice(0, 2).join(", ");
      const extra = games.length - 2;
      return extra > 0 ? `${main} +${extra}` : main;
    })();
    notify({
      key: `new-drops:${games.join("|")}:${addedItems.length}`,
      title: translate(language, "alerts.title.newDrops"),
      body: translate(language, "alerts.body.newDrops", {
        count: addedItems.length,
        games: gameLabel,
      }),
      dedupeMs: 30_000,
    });
  }, [alertsNewDrops, inventory.status, inventoryChanges.added, inventoryItems, language, notify]);

  useEffect(() => {
    if (!alertsWatchError) return;
    if (!watchStats.lastError) return;
    const message = watchStats.lastError.message ?? translate(language, "error.unknown");
    notify({
      key: `watch-error:${watchStats.lastError.code ?? message}`,
      title: translate(language, "alerts.title.watchError"),
      body: translate(language, "alerts.body.watchError", { message }),
      dedupeMs: 10 * 60_000,
    });
  }, [alertsWatchError, language, notify, watchStats.lastError]);

  useEffect(() => {
    if (!alertsAutoSwitch) return;
    if (!autoSwitchInfo) return;
    const from = autoSwitchInfo.from?.name ?? translate(language, "alerts.misc.unknownChannel");
    const to = autoSwitchInfo.to?.name ?? translate(language, "alerts.misc.unknownChannel");
    notify({
      key: `auto-switch:${autoSwitchInfo.at}`,
      title: translate(language, "alerts.title.autoSwitch"),
      body: translate(language, "alerts.body.autoSwitch", { from, to }),
      dedupeMs: 30_000,
    });
  }, [alertsAutoSwitch, autoSwitchInfo, language, notify]);

  useEffect(() => {
    if (!alertsDropEndingSoon) return;
    if (!watching) return;
    if (!activeDropInfo) return;
    const threshold = Math.max(1, Math.min(60, Math.round(alertsDropEndingMinutes || 1)));
    if (activeDropInfo.remainingMinutes <= 0) return;
    if (activeDropInfo.remainingMinutes > threshold) return;
    const minutes = Math.max(1, Math.round(activeDropInfo.remainingMinutes));
    notify({
      key: `drop-ending:${activeDropInfo.id}`,
      title: translate(language, "alerts.title.dropEndingSoon"),
      body: translate(language, "alerts.body.dropEndingSoon", {
        title: activeDropInfo.title,
        minutes,
      }),
      dedupeMs: 24 * 60 * 60 * 1000,
    });
  }, [activeDropInfo, alertsDropEndingMinutes, alertsDropEndingSoon, language, notify, watching]);

  return { autoSwitchInfo };
}
