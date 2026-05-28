import * as React from "react";
import { Pill } from "@renderer/shared/components/ui/pill";
import type { ChannelTrackerStatus, ErrorInfo } from "@renderer/shared/types";

export type AttentionStripProps = {
  claimableDrops: number;
  watchError: ErrorInfo | null | undefined;
  activeGame: string;
  channelsCount: number;
  trackerStatus: ChannelTrackerStatus | null | undefined;
};

export function AttentionStrip({
  claimableDrops,
  watchError,
  activeGame,
  channelsCount,
  trackerStatus,
}: AttentionStripProps) {
  const pills: React.ReactNode[] = [];

  if (claimableDrops > 0) {
    pills.push(
      <Pill key="claim-ready" tone="warn" dot>
        {claimableDrops} claim ready
      </Pill>,
    );
  }
  if (watchError) {
    const tooltip = watchError.message ?? watchError.code ?? "watch error";
    pills.push(
      <Pill key="watch-err" tone="err" dot title={tooltip}>
        watch error
      </Pill>,
    );
  }
  if (activeGame && channelsCount === 0) {
    pills.push(
      <Pill key="no-channels" tone="warn">
        no channels
      </Pill>,
    );
  }
  if (
    trackerStatus?.connectionState &&
    trackerStatus.connectionState !== "connected" &&
    trackerStatus.connectionState !== "connecting"
  ) {
    pills.push(
      <Pill key="tracker" tone="err" dot>
        tracker {trackerStatus.connectionState}
      </Pill>,
    );
  }

  if (pills.length === 0) return null;

  return <div className="flex flex-wrap gap-2 mb-4">{pills}</div>;
}
