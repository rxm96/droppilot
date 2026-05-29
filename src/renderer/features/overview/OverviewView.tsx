import type { ChannelTrackerStatus, ErrorInfo, InventoryState } from "@renderer/shared/types";
import { HeroPanel } from "./HeroPanel";
import { QueuePanel } from "./QueuePanel";
import { ActivityPanel } from "./ActivityPanel";
import { EnginePanel } from "./EnginePanel";
import { AttentionStrip } from "./AttentionStrip";

type OverviewProps = {
  inventory: InventoryState;
  activeGame: string;
  activeDropTitle?: string;
  activeDropRemainingMinutes?: number;
  activeDropEta?: number | null;
  /** Currently-watched drop snapshot (id + live-ticking earnedMinutes). Passed through to QueuePanel so its active row reflects live progress. */
  activeDrop?: { id: string; earnedMinutes: number } | null;
  targetProgress: number;
  totalDrops: number;
  claimedDrops: number;
  claimableDrops: number;
  blockedDrops: number;
  channelsCount: number;
  canWatchTarget: boolean;
  watchDecision:
    | "no-target"
    | "suppressed"
    | "cooldown"
    | "watching-progress"
    | "watching-recover"
    | "watching-no-farmable"
    | "watching-no-watchable"
    | "idle-loading-channels"
    | "idle-no-channels"
    | "idle-ready"
    | "idle-no-watchable-drops";
  watchSuppressionReason: "manual-stop" | "stall-stop" | null;
  lastWatchOk?: number | null;
  inventoryFetchedAt?: number | null;
  trackerStatus?: ChannelTrackerStatus | null;
  watchError?: ErrorInfo | null;
  onPause?: () => void;
  onSwitchTarget?: () => void;
  onClaimNow?: () => void | Promise<void>;
  claimStatus?: { kind: "success" | "error"; message?: string; code?: string } | null;
  refreshMinMs?: number;
  refreshMaxMs?: number;
};

export function OverviewView({
  inventory,
  activeGame,
  activeDropTitle,
  activeDropRemainingMinutes,
  activeDropEta,
  activeDrop,
  targetProgress,
  totalDrops,
  claimedDrops,
  claimableDrops,
  channelsCount,
  watchDecision,
  lastWatchOk,
  trackerStatus,
  watchError,
  onPause,
  onSwitchTarget,
  onClaimNow,
  claimStatus,
  refreshMinMs,
  refreshMaxMs,
}: OverviewProps) {
  const items =
    inventory.status === "ready"
      ? inventory.items
      : inventory.status === "error"
        ? (inventory.items ?? [])
        : [];

  const isLive = watchDecision === "watching-progress" || watchDecision === "watching-recover";

  return (
    <div className="grid gap-7" style={{ gridTemplateColumns: "1fr 320px" }}>
      <div className="flex flex-col gap-6">
        <AttentionStrip
          claimableDrops={claimableDrops}
          watchError={watchError}
          activeGame={activeGame}
          channelsCount={channelsCount}
          trackerStatus={trackerStatus}
        />
        <HeroPanel
          activeGame={activeGame}
          activeDropTitle={activeDropTitle}
          activeDropEta={activeDropEta}
          activeDropRemainingMinutes={activeDropRemainingMinutes}
          targetProgress={targetProgress}
          claimableDrops={claimableDrops}
          channelsCount={channelsCount}
          totalDrops={totalDrops}
          claimedDrops={claimedDrops}
          isLive={isLive}
          onPause={onPause}
          onSwitchTarget={onSwitchTarget}
          onClaimNow={onClaimNow}
          claimStatus={claimStatus}
        />
        <QueuePanel items={items} activeDrop={activeDrop ?? null} targetGame={activeGame} />
      </div>
      <div className="flex flex-col gap-4">
        <ActivityPanel />
        <EnginePanel
          lastWatchOk={lastWatchOk}
          cycleSeconds={
            typeof refreshMinMs === "number" ? Math.round(refreshMinMs / 1000) : undefined
          }
          cadenceSeconds={
            typeof refreshMaxMs === "number" ? Math.round(refreshMaxMs / 1000) : undefined
          }
        />
      </div>
    </div>
  );
}
