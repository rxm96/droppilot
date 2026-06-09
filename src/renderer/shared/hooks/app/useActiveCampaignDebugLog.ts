import { useEffect, useRef } from "react";
import type { CampaignSummary, InventoryItem, WatchingState } from "@renderer/shared/types";
import type { ActiveDropInfo } from "@renderer/shared/hooks/inventory";

const toConsoleSnapshot = <T>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

type Params = {
  activeDropInfo: ActiveDropInfo | null;
  campaigns: CampaignSummary[];
  inventoryFetchedAt: number | null;
  inventoryItems: InventoryItem[];
  targetGame: string;
  watching: WatchingState;
};

export function useActiveCampaignDebugLog({
  activeDropInfo,
  campaigns,
  inventoryFetchedAt,
  inventoryItems,
  targetGame,
  watching,
}: Params) {
  const activeCampaignDebugSignatureRef = useRef<string>("");
  useEffect(() => {
    const activeDropId = activeDropInfo?.id?.trim() ?? "";
    const activeCampaignId = activeDropInfo?.campaignId?.trim() ?? "";
    const watchingId = watching?.channelId ?? watching?.id ?? "";
    const signature = [
      activeDropId,
      activeCampaignId,
      targetGame,
      watchingId,
      inventoryFetchedAt ?? "",
    ].join("|");
    if (activeCampaignDebugSignatureRef.current === signature) return;
    activeCampaignDebugSignatureRef.current = signature;

    const activeDropRaw =
      (activeDropId ? inventoryItems.find((item) => item.id === activeDropId) : null) ?? null;
    const activeCampaignSummary =
      (activeCampaignId ? campaigns.find((campaign) => campaign.id === activeCampaignId) : null) ??
      null;
    const activeCampaignDropsFromInventory = activeCampaignId
      ? inventoryItems.filter((item) => item.campaignId === activeCampaignId)
      : activeDropRaw?.campaignId
        ? inventoryItems.filter((item) => item.campaignId === activeDropRaw.campaignId)
        : [];

    console.log(
      "[DropPilot] active-campaign-debug",
      toConsoleSnapshot({
        at: new Date().toISOString(),
        targetGame,
        watching,
        inventoryFetchedAt,
        activeDropInfo,
        activeDropRaw,
        activeCampaignSummary,
        activeCampaignDropsFromSummary: activeCampaignSummary?.drops ?? null,
        activeCampaignDropsFromInventory,
        inventoryItemsCount: inventoryItems.length,
        campaignsCount: campaigns.length,
      }),
    );
  }, [activeDropInfo, campaigns, inventoryFetchedAt, inventoryItems, targetGame, watching]);
}
