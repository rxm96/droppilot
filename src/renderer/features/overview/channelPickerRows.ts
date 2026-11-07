// Pure rows for the overview's "switch channel" popover. No React imports.

import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry } from "@renderer/shared/types";
import { normalizeAllowlist } from "@renderer/shared/hooks/watch/channelAllowlist";
import { sortChannelsByViewers } from "@renderer/shared/hooks/watch/channelEngine";

export type ChannelPickerRow = {
  channel: ChannelEntry;
  /** False when the drop allowlist excludes the channel: watching it earns nothing. */
  countsDrops: boolean;
  isCurrent: boolean;
};

/** Live channels of the target game, most viewers first, filtered by name or login. */
export function buildChannelPickerRows(input: {
  channels: ChannelEntry[];
  allowlist: ChannelAllowlist | null;
  watchingId: string | null;
  query: string;
}): ChannelPickerRow[] {
  const allowlist = normalizeAllowlist(input.allowlist);
  const needle = input.query.trim().toLowerCase();
  return sortChannelsByViewers(input.channels)
    .filter(
      (c) =>
        !needle ||
        c.displayName.toLowerCase().includes(needle) ||
        c.login.toLowerCase().includes(needle),
    )
    .map((channel) => ({
      channel,
      countsDrops: allowlist ? allowlist.allowsChannel(channel) : true,
      isCurrent: channel.id === input.watchingId,
    }));
}
