import * as React from "react";
import { Pill } from "@renderer/shared/components/ui/pill";
import type { ChannelTrackerStatus, ErrorInfo } from "@renderer/shared/types";
import { useI18n } from "@renderer/shared/i18n";

export type AttentionStripProps = {
  claimableDrops: number;
  watchError: ErrorInfo | null | undefined;
  activeGame: string;
  channelsCount: number;
  trackerStatus: ChannelTrackerStatus | null | undefined;
};

// Memoized: its props (counts, game name, error/tracker refs) are all stable
// across the per-second watch tick, so it bails out of the Overview's 1Hz
// re-render instead of rebuilding its pills every second while watching.
export const AttentionStrip = React.memo(function AttentionStrip({
  claimableDrops,
  watchError,
  activeGame,
  channelsCount,
  trackerStatus,
}: AttentionStripProps) {
  const { t } = useI18n();
  const pills: React.ReactNode[] = [];

  if (claimableDrops > 0) {
    const claimText =
      claimableDrops === 1
        ? t("attention.claimReady", { count: claimableDrops })
        : t("attention.claimsReady", { count: claimableDrops });
    pills.push(
      <Pill key="claim-ready" tone="warn" dot>
        {claimText}
      </Pill>,
    );
  }
  if (watchError) {
    const tooltip = watchError.message ?? watchError.code ?? t("attention.watchError");
    pills.push(
      <Pill key="watch-err" tone="err" dot title={tooltip}>
        {t("attention.watchError")}
      </Pill>,
    );
  }
  if (activeGame && channelsCount === 0) {
    pills.push(
      <Pill key="no-channels" tone="warn">
        {t("attention.noChannels")}
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
        {t("attention.trackerLabel", { state: trackerStatus.connectionState })}
      </Pill>,
    );
  }

  if (pills.length === 0) return null;

  return <div className="flex flex-wrap gap-2 mb-4">{pills}</div>;
});
