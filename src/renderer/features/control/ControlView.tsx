import * as React from "react";
import type {
  AutoSwitchInfo,
  ChannelDiff,
  ChannelEntry,
  ChannelTrackerStatus,
  ClaimStatus,
  ErrorInfo,
  InventoryItem,
  WatchingState,
} from "@renderer/shared/types";
import { Button } from "@renderer/shared/components/ui/button";
import { Pill } from "@renderer/shared/components/ui/pill";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";
import { useI18n } from "@renderer/shared/i18n";
import { Play, Square, RotateCw } from "@renderer/shared/lib/icons";
import { useControlViewState } from "./useControlViewState";
import { EngineStatusPanel } from "./EngineStatusPanel";
import { ActiveSessionPanel } from "./ActiveSessionPanel";
import { ChannelGridPanel } from "./ChannelGridPanel";
import { CampaignsPanel, type CampaignGroup } from "./CampaignsPanel";
import type { WatchEngineDecision, WatchEngineSuppressionReason } from "./controlHelpers";

type WatchEngineSnapshot = {
  decision: WatchEngineDecision;
  targetGame: string;
  activeTargetGame: string;
  suppression: {
    game: string;
    reason: WatchEngineSuppressionReason;
    sinceAt: number | null;
    holdRemainingMs: number;
  } | null;
  activeCooldowns: Array<{ game: string; until: number; remainingMs: number }>;
  allowlistActive: boolean;
  allowlistedLiveChannels: number;
  totalLiveChannels: number;
  noProgressTracker: { recoveryCount: number; sinceProgressMs: number } | null;
};

type ControlProps = {
  targetGame: string;
  targetDrops: InventoryItem[];
  targetProgress: number;
  totalDrops: number;
  claimedDrops: number;
  inventoryRefreshing: boolean;
  inventoryFetchedAt: number | null;
  fetchInventory: () => void;
  refreshPriorityPlan: () => void;
  watching: WatchingState;
  lastWatchedChannelIdentity: { id: string; login: string } | null;
  stopWatching: () => void;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  channelDiff: ChannelDiff | null;
  channelError: ErrorInfo | null;
  startWatching: (ch: ChannelEntry) => void;
  activeDropInfo: {
    id: string;
    title: string;
    requiredMinutes: number;
    earnedMinutes: number;
    virtualEarned: number;
    remainingMinutes: number;
    eta: number | null;
    progressAnchorAt?: number;
    dropInstanceId?: string;
    campaignId?: string;
  } | null;
  claimStatus: ClaimStatus | null;
  canWatchTarget: boolean;
  showNoDropsHint: boolean;
  lastWatchOk?: number;
  watchError?: ErrorInfo | null;
  autoSwitchInfo?: AutoSwitchInfo | null;
  trackerStatus?: ChannelTrackerStatus | null;
  watchEngineSnapshot: WatchEngineSnapshot;
};

export function ControlView(props: ControlProps) {
  const { t } = useI18n();
  const {
    targetGame,
    targetDrops,
    inventoryRefreshing,
    inventoryFetchedAt,
    fetchInventory,
    watching,
    lastWatchedChannelIdentity,
    stopWatching,
    channels,
    channelsLoading,
    channelsRefreshing,
    channelDiff,
    channelError,
    startWatching,
    activeDropInfo,
    claimStatus,
    lastWatchOk,
    watchError,
    trackerStatus,
    watchEngineSnapshot,
  } = props;

  const state = useControlViewState({
    channels,
    channelDiff,
    channelsLoading,
    channelsRefreshing,
    targetGame,
    watching,
    lastWatchedChannelIdentity,
    targetDrops,
    activeDropInfo,
    inventoryFetchedAt,
    trackerStatus,
    t,
  });

  const watchErrorText = watchError ? resolveErrorMessage(t, watchError) : null;
  const claimErrorText =
    claimStatus?.kind === "error"
      ? resolveErrorMessage(t, { code: claimStatus.code, message: claimStatus.message })
      : null;
  const claimSuccessText = claimStatus?.kind === "success" ? (claimStatus.message ?? null) : null;

  const isWatching = !!watching;
  const handleToggleWatch = React.useCallback(() => {
    if (isWatching) {
      stopWatching();
    } else if (state.resumeChannel) {
      startWatching(state.resumeChannel);
    }
  }, [isWatching, state.resumeChannel, startWatching, stopWatching]);
  const toggleLabel = isWatching
    ? t("control.stop")
    : state.resumeChannel
      ? t("control.resume")
      : null;

  // Adapt useControlViewState's campaignGroups (key/title/items/active) to CampaignsPanel shape (id/name/drops/hasActiveDrop).
  // The hook's local CampaignGroup uses: key (not id), title (not name), items[] (not drops[]), active (not hasActiveDrop).
  // InventoryItem drop fields (id, title, requiredMinutes, earnedMinutes, status, blocked, blockingReasonHints) match exactly.
  const campaignGroups: CampaignGroup[] = React.useMemo(() => {
    return state.campaignGroups.map((group) => ({
      id: group.key,
      name: group.title,
      hasActiveDrop: group.active,
      totalRequired: group.items.reduce(
        (sum, d) => sum + Math.max(0, Number(d.requiredMinutes) || 0),
        0,
      ),
      totalEarned: group.items.reduce(
        (sum, d) => sum + Math.max(0, Number(d.earnedMinutes) || 0),
        0,
      ),
      drops: group.items.map((d) => ({
        id: d.id,
        title: d.title,
        requiredMinutes: d.requiredMinutes,
        earnedMinutes: d.earnedMinutes,
        status: d.status ?? "locked",
        blocked: d.blocked,
        blockingReasonHints: d.blockingReasonHints,
      })),
    }));
  }, [state.campaignGroups]);

  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (selectedCampaignId && campaignGroups.some((g) => g.id === selectedCampaignId)) return;
    const activeGroup = campaignGroups.find((g) => g.hasActiveDrop);
    setSelectedCampaignId(activeGroup?.id ?? campaignGroups[0]?.id ?? null);
  }, [campaignGroups, selectedCampaignId]);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[color:var(--dp-text)] leading-tight">
            Control
          </h2>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mt-1">
            watch engine · channels · campaigns
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {claimSuccessText && (
            <Pill tone="ok" dot>
              {claimSuccessText}
            </Pill>
          )}
          {claimErrorText && (
            <Pill tone="err" dot title={claimErrorText}>
              claim error
            </Pill>
          )}
          {watchErrorText && (
            <Pill tone="err" dot title={watchErrorText}>
              watch error
            </Pill>
          )}
          {toggleLabel && (
            <Button
              variant={isWatching ? "dp-secondary" : "dp-primary"}
              size="dp-md"
              onClick={handleToggleWatch}
            >
              {isWatching ? (
                <Square size={11} strokeWidth={1.8} />
              ) : (
                <Play size={11} strokeWidth={1.8} />
              )}
              {toggleLabel}
            </Button>
          )}
          <Button
            variant="dp-ghost"
            size="dp-md"
            onClick={fetchInventory}
            disabled={inventoryRefreshing}
          >
            <RotateCw
              size={11}
              strokeWidth={1.8}
              className={inventoryRefreshing ? "animate-spin" : undefined}
            />
            refresh
          </Button>
        </div>
      </div>

      {/* Engine status */}
      <EngineStatusPanel
        decision={watchEngineSnapshot.decision}
        targetGame={watchEngineSnapshot.targetGame}
        activeTargetGame={watchEngineSnapshot.activeTargetGame}
        suppression={watchEngineSnapshot.suppression}
        activeCooldowns={watchEngineSnapshot.activeCooldowns}
        allowlistActive={watchEngineSnapshot.allowlistActive}
        allowlistedLiveChannels={watchEngineSnapshot.allowlistedLiveChannels}
        totalLiveChannels={watchEngineSnapshot.totalLiveChannels}
        noProgressTracker={watchEngineSnapshot.noProgressTracker}
      />

      {/* Active session */}
      <ActiveSessionPanel
        watching={watching}
        activeChannel={state.activeChannel ?? null}
        activeThumb={state.activeThumb}
        activeLoginMismatch={state.activeLoginMismatch}
        activeDropTitle={activeDropInfo?.title ?? null}
        activeDropEarnedMinutes={
          activeDropInfo
            ? activeDropInfo.virtualEarned + state.liveProgress.activeElapsedMinutesRaw
            : 0
        }
        activeDropRequiredMinutes={activeDropInfo?.requiredMinutes ?? 0}
        activeEtaText={state.activeEtaText}
        lastWatchOk={lastWatchOk}
      />

      {/* Campaigns */}
      <CampaignsPanel
        groups={campaignGroups}
        selectedCampaignId={selectedCampaignId}
        onSelectCampaign={setSelectedCampaignId}
      />

      {/* Live channels */}
      <ChannelGridPanel
        channels={state.combinedChannels}
        animatedViewersById={state.animatedViewersById}
        channelChangedIds={state.channelChangedIds}
        channelsLoading={channelsLoading}
        channelsRefreshing={channelsRefreshing}
        channelError={channelError}
        showChannelSkeleton={state.showChannelSkeleton}
        targetGame={targetGame}
        onStartWatching={startWatching}
        watchingChannelId={state.activeChannel?.id}
        onRefresh={fetchInventory}
      />
    </div>
  );
}
