import * as React from "react";
import type { ChannelEntry, ErrorInfo } from "@renderer/shared/types";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Button } from "@renderer/shared/components/ui/button";
import { Pill } from "@renderer/shared/components/ui/pill";
import { RotateCw } from "@renderer/shared/lib/icons";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";

type CombinedChannel = ChannelEntry & { exiting?: boolean };

export type ChannelGridPanelProps = {
  channels: CombinedChannel[];
  animatedViewersById: Record<string, number>;
  channelChangedIds: Set<string>;
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  channelError: ErrorInfo | null;
  showChannelSkeleton: boolean;
  targetGame: string;
  onStartWatching: (ch: ChannelEntry) => void;
  watchingChannelId?: string;
  onRefresh: () => void;
};

const SKELETON_TILES = Array.from({ length: 6 }, (_, i) => i);

export function ChannelGridPanel({
  channels,
  animatedViewersById,
  channelChangedIds,
  channelsLoading,
  channelsRefreshing,
  channelError,
  showChannelSkeleton,
  targetGame,
  onStartWatching,
  watchingChannelId,
  onRefresh,
}: ChannelGridPanelProps) {
  const { t } = useI18n();
  const errorText = channelError ? resolveErrorMessage(t, channelError) : null;
  const refreshDisabled = channelsLoading || channelsRefreshing;

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--dp-border-soft)]">
        <div className="flex items-center gap-3">
          <SectionLabel inline>live channels</SectionLabel>
          <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
            · {channels.filter((c) => !c.exiting).length}
          </span>
        </div>
        <Button
          variant="dp-ghost"
          size="dp-sm"
          onClick={onRefresh}
          disabled={refreshDisabled}
          title="Refresh channel list"
        >
          <RotateCw
            size={11}
            strokeWidth={1.8}
            className={channelsRefreshing ? "animate-spin" : undefined}
          />
          refresh
        </Button>
      </div>

      <div className="p-4">
        {errorText && (
          <div className="rounded-[var(--dp-radius-md)] border border-[rgba(248,113,113,0.30)] bg-[rgba(248,113,113,0.08)] px-3 py-2 text-[11px] text-[color:var(--dp-signal-err)] mb-3">
            {errorText}
          </div>
        )}

        {showChannelSkeleton ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
            aria-hidden="true"
          >
            {SKELETON_TILES.map((i) => (
              <div
                key={i}
                className="h-[140px] rounded-[var(--dp-radius-md)] bg-[color:var(--dp-bg-elevated-2)] animate-pulse"
              />
            ))}
          </div>
        ) : channels.length === 0 && !channelsLoading ? (
          <div className="text-center py-8 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {targetGame
              ? t("control.channelsEmpty")
              : "select a target game in Priorities to see live channels"}
          </div>
        ) : (
          <ul
            className="grid gap-3 list-none p-0 m-0"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
          >
            {channels.map((channel) => {
              const isWatching = channel.id === watchingChannelId;
              const isExiting = !!channel.exiting;
              const animated = animatedViewersById[channel.id] ?? channel.viewers;
              const changed = channelChangedIds.has(channel.id);
              return (
                <li key={channel.id}>
                  <button
                    type="button"
                    onClick={() => !isExiting && onStartWatching(channel)}
                    disabled={isExiting || isWatching}
                    className={cn(
                      "block w-full text-left rounded-[var(--dp-radius-md)] border overflow-hidden transition-all",
                      "border-[color:var(--dp-border-soft)]",
                      // Non-watching default: transparent — blends with panel, no false elevation
                      !isWatching && "bg-transparent",
                      !isWatching &&
                        !isExiting &&
                        "hover:border-[color:var(--dp-accent-soft)] hover:bg-[color:var(--dp-bg-elevated-2)]",
                      // Watching: soft violet wash
                      isWatching &&
                        "border-[color:var(--dp-accent)] bg-[color:var(--dp-accent-soft)] cursor-default",
                      isExiting && "opacity-30 pointer-events-none",
                      changed && "ring-1 ring-[color:var(--dp-accent-soft)]",
                    )}
                  >
                    <div className="relative aspect-[16/9] w-full bg-[color:var(--dp-bg-app)]">
                      {channel.thumbnail && (
                        <img
                          src={channel.thumbnail}
                          alt=""
                          loading="lazy"
                          className="block w-full h-full object-cover"
                        />
                      )}
                      <span className="absolute bottom-1 right-1">
                        <Pill tone="dim">{Math.round(animated).toLocaleString()}</Pill>
                      </span>
                      {isWatching && (
                        <span className="absolute top-1 left-1">
                          <Pill tone="accent" dot>
                            watching
                          </Pill>
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] uppercase tracking-[0.08em] truncate">
                        {channel.game}
                      </div>
                      <div className="text-[13px] font-medium text-[color:var(--dp-text-dim)] truncate mt-0.5">
                        {channel.displayName}
                      </div>
                      {channel.title && (
                        <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] truncate mt-1">
                          {channel.title}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
