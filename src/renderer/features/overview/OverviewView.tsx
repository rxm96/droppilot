import type {
  ChannelTrackerStatus,
  ErrorInfo,
  InventoryState,
  StatsState,
} from "@renderer/shared/types";
import { HeroPanel } from "./HeroPanel";
import { QueuePanel } from "./QueuePanel";
import { ActivityPanel } from "./ActivityPanel";
import { EnginePanel } from "./EnginePanel";
import { AttentionStrip } from "./AttentionStrip";

type OverviewProps = {
  inventory: InventoryState;
  stats: StatsState;
  resetStats: () => void;
  activeGame: string;
  activeDropTitle?: string;
  activeDropRemainingMinutes?: number;
  activeDropEta?: number | null;
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
};

export function OverviewView({
  inventory,
  activeGame,
  activeDropTitle,
  activeDropRemainingMinutes,
  activeDropEta,
  targetProgress,
  totalDrops,
  claimedDrops,
  claimableDrops,
  channelsCount,
  watchDecision,
  lastWatchOk,
  trackerStatus,
  watchError,
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
        />
        <QueuePanel items={items} />
      </div>
      <div className="flex flex-col gap-4">
        <ActivityPanel items={items} />
        <EnginePanel lastWatchOk={lastWatchOk} />
      </div>
    </div>
  );
}
