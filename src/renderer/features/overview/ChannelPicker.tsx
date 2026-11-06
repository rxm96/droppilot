import * as React from "react";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { ChannelEntry } from "@renderer/shared/types";
import { Button } from "@renderer/shared/components/ui/button";
import { ChevronDown, Search } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import { buildChannelPickerRows } from "./channelPickerRows";
import { channelInitials } from "./overviewModel";

export type ChannelPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetGame: string;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelAllowlist: ChannelAllowlist | null;
  watchingId: string | null;
  /** The watched channel is the user's own pick (enables "auto"). */
  isManualPick: boolean;
  /** Same manual start path the old channel grid used (onStartWatching). */
  onPick: (channel: ChannelEntry) => void;
  onBackToAuto: () => void;
};

/**
 * `switch channel ▾` plus its popover: live channels of the target game, most
 * viewers first, with a filter. Channels outside the drop allowlist are listed
 * but disabled ("would not count").
 */
export function ChannelPicker({
  open,
  onOpenChange,
  targetGame,
  channels,
  channelsLoading,
  channelAllowlist,
  watchingId,
  isManualPick,
  onPick,
  onBackToAuto,
}: ChannelPickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dialogId = React.useId();

  const close = React.useCallback(
    (restoreFocus: boolean) => {
      onOpenChange(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [onOpenChange],
  );

  // Close on outside click and on Escape.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  // Leaving the overview while open must not keep the channel list tracked.
  // (onOpenChange is a state setter, so this cleanup only runs on unmount.)
  React.useEffect(() => () => onOpenChange(false), [onOpenChange]);

  const rows = React.useMemo(
    () =>
      open
        ? buildChannelPickerRows({ channels, allowlist: channelAllowlist, watchingId, query })
        : [],
    [open, channels, channelAllowlist, watchingId, query],
  );

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        variant="dp-outline"
        size="dp-lg"
        onClick={() => {
          setQuery("");
          onOpenChange(!open);
        }}
        disabled={!targetGame}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        className={cn(open && "border-[color:var(--dp-accent)] bg-[color:var(--dp-bg-elevated-2)]")}
      >
        {t("overview.picker.trigger")}
        <ChevronDown size={14} strokeWidth={1.7} />
      </Button>
      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label={t("overview.picker.aria")}
          className="absolute right-0 top-[calc(100%+8px)] z-20 w-[360px] max-w-[calc(100vw-32px)] rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center justify-between px-2 pt-1.5 pb-2.5 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            <span className="truncate">{t("overview.picker.header", { game: targetGame })}</span>
            <span className="flex-none">{t("overview.picker.sorted")}</span>
          </div>
          <label className="mx-0.5 mb-1.5 flex min-h-[34px] items-center gap-2 rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-app)] px-2.5 font-mono text-[12px] text-[color:var(--dp-text-dimmer)]">
            <Search size={14} strokeWidth={1.7} aria-hidden="true" />
            <span className="sr-only">{t("overview.picker.filterLabel")}</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("overview.picker.filterPlaceholder")}
              className="min-w-0 flex-1 border-0 bg-transparent text-[color:var(--dp-text)] outline-none"
            />
          </label>
          <div className="flex max-h-[320px] flex-col gap-px overflow-y-auto">
            {rows.length === 0 ? (
              <div className="px-2.5 py-4 text-center text-[12px] text-[color:var(--dp-text-dimmer)]">
                {channelsLoading
                  ? t("overview.picker.loading")
                  : query.trim()
                    ? t("overview.picker.noMatch")
                    : t("overview.picker.empty", { game: targetGame })}
              </div>
            ) : (
              rows.map(({ channel, countsDrops, isCurrent }) => (
                <button
                  key={channel.id}
                  type="button"
                  disabled={!countsDrops}
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => (isCurrent ? close(true) : onPick(channel))}
                  className={cn(
                    "flex min-h-[44px] w-full items-center gap-2.5 rounded-[var(--dp-radius-md)] px-2.5 py-1.5 text-left transition-colors",
                    isCurrent
                      ? "bg-[color:var(--dp-accent-soft)]"
                      : "hover:bg-[color:var(--dp-bg-elevated-2)]",
                    "disabled:cursor-default disabled:bg-transparent disabled:opacity-50",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="relative grid h-7 w-7 flex-none place-items-center rounded-full bg-[color:var(--dp-bg-elevated-2)] text-[11px] font-semibold text-[color:var(--dp-text)]"
                  >
                    {channelInitials(channel.displayName)}
                    <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[color:var(--dp-bg-elevated)] bg-[color:var(--dp-signal-err)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[color:var(--dp-text)]">
                      {channel.displayName}
                    </span>
                    <span className="block font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
                      {t("overview.hero.viewers", { count: channel.viewers.toLocaleString() })} ·{" "}
                      {countsDrops ? t("overview.picker.dropsOn") : t("overview.picker.dropsOff")}
                    </span>
                  </span>
                  {isCurrent && (
                    <span className="flex-none rounded-[var(--dp-radius-xs)] bg-[color:var(--dp-accent-soft)] px-2 py-[3px] font-mono text-[10px] text-[color:var(--dp-accent)]">
                      {t("dropStatus.watching")}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-[color:var(--dp-border)] px-2 pt-2.5 pb-1">
            <span className="text-[12px] leading-snug text-[color:var(--dp-text-dim)]">
              {t("overview.picker.footer")}
            </span>
            <Button
              variant="dp-outline"
              size="dp-md"
              onClick={onBackToAuto}
              disabled={!isManualPick}
              title={t("overview.picker.autoTitle")}
              className="flex-none"
            >
              {t("overview.picker.auto")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
