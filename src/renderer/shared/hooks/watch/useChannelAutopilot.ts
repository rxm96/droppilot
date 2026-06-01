import { useEffect } from "react";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import { normalizeAllowlist } from "./channelAllowlist";
import {
  computeAutoSwitchAction,
  isManualPriorityOverrideActive,
  shouldAutoSelectChannel,
} from "./channelEngine";
import type { ChannelStore } from "./useChannelStore";

type AutopilotParams = {
  store: ChannelStore;
  allowWatching: boolean;
  autoSelectEnabled: boolean;
  autoSwitchEnabled: boolean;
  canWatchTarget: boolean;
  channelAllowlist?: ChannelAllowlist | null;
  forcePrioritySwitch: boolean;
  manualWatchOverride?: { at: number; game: string } | null;
  targetGame: string;
  watching: WatchingState;
  setWatchingFromChannel: (channel: ChannelEntry) => void;
  clearWatching: () => void;
};

// No demoMode guard: autopilot (auto-select + auto-switch) applies in both demo and live modes, matching the original behavior.
export function useChannelAutopilot({
  store,
  allowWatching,
  autoSelectEnabled,
  autoSwitchEnabled,
  canWatchTarget,
  channelAllowlist,
  forcePrioritySwitch,
  manualWatchOverride,
  targetGame,
  watching,
  setWatchingFromChannel,
  clearWatching,
}: AutopilotParams) {
  const { channels, setAutoSwitch } = store;

  // Auto-select first channel if none selected
  useEffect(() => {
    if (
      !shouldAutoSelectChannel({
        allowWatching,
        autoSelectEnabled,
        canWatchTarget,
        channels,
        watching,
        channelAllowlist,
      })
    )
      return;
    const normalizedAllowlist = normalizeAllowlist(channelAllowlist);
    const first = normalizedAllowlist
      ? channels.find((channel) => normalizedAllowlist.allowsChannel(channel))
      : channels[0];
    if (!first) return;
    setWatchingFromChannel(first);
  }, [
    channels,
    watching,
    targetGame, // intentional dep (not read in body): re-evaluates auto-select on game change. Do not drop in the Task 8 lint pass.
    autoSelectEnabled,
    allowWatching,
    canWatchTarget,
    channelAllowlist,
    setWatchingFromChannel,
  ]);

  // Auto-switch if current channel disappears
  useEffect(() => {
    const now = Date.now();
    const manualPriorityOverrideActive = isManualPriorityOverrideActive({
      manualWatchOverride,
      targetGame,
      now,
    });
    const action = computeAutoSwitchAction({
      allowWatching,
      watching,
      channels,
      autoSwitchEnabled,
      forcePrioritySwitch: forcePrioritySwitch && !manualPriorityOverrideActive,
      canWatchTarget,
      channelAllowlist,
    });
    if (action.action === "none") return;
    if (action.action === "clear") {
      clearWatching();
      return;
    }
    // computeAutoSwitchAction only returns a "switch" when `watching` is set,
    // so this never returns at runtime — it just makes the invariant explicit.
    if (!watching) return;
    setWatchingFromChannel(action.nextChannel);
    setAutoSwitch({
      at: Date.now(),
      reason: action.reason,
      from: { id: watching.id, name: watching.name },
      to: { id: action.nextChannel.id, name: action.nextChannel.displayName },
    });
  }, [
    channels,
    watching,
    targetGame,
    manualWatchOverride,
    allowWatching,
    autoSwitchEnabled,
    forcePrioritySwitch,
    canWatchTarget,
    channelAllowlist,
    clearWatching,
    setWatchingFromChannel,
  ]);
}
