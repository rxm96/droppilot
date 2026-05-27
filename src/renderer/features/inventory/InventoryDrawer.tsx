import * as React from "react";
import type { CampaignSummary, InventoryItem } from "@renderer/shared/types";
import { Pill } from "@renderer/shared/components/ui/pill";
import { Button } from "@renderer/shared/components/ui/button";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { X, ExternalLink, Trophy } from "@renderer/shared/lib/icons";
import {
  dropStatusLabel,
  dropStatusTone,
  dropTitleFallback,
  formatBlockingReason,
  pickDisplayBlockingReason,
} from "./inventoryFormatters";
import { formatHourMinute, formatPercent, formatRelative } from "@renderer/features/overview/formatters";

export type InventoryDrawerProps = {
  drop: InventoryItem | null;
  campaign: CampaignSummary | null;
  isPriorityGame: boolean;
  onClose: () => void;
  onOpenAccountLink: (url?: string) => void;
  onAddPriorityGame: (game: string) => void;
};

export function InventoryDrawer({
  drop,
  campaign,
  isPriorityGame,
  onClose,
  onOpenAccountLink,
  onAddPriorityGame,
}: InventoryDrawerProps) {
  React.useEffect(() => {
    if (!drop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drop, onClose]);

  if (!drop) return null;

  const progressPct =
    drop.requiredMinutes > 0
      ? Math.round((drop.earnedMinutes / drop.requiredMinutes) * 100)
      : 0;
  const thumbUrl = drop.imageUrl?.trim() || drop.campaignImageUrl?.trim() || "";
  const accountUnlinked = drop.linked === false;
  const blockingReason = pickDisplayBlockingReason(drop.blockingReasonHints, accountUnlinked);
  const blockingLabel = drop.blocked && blockingReason ? formatBlockingReason(blockingReason) : null;
  const showAddPriority = Boolean(drop.game?.trim()) && !isPriorityGame;
  const showLinkAction = accountUnlinked || (drop.blockingReasonHints ?? []).includes("account_not_linked");

  return (
    <>
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] cursor-default"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Drop details"
        className="fixed right-0 top-0 bottom-0 z-50 w-[400px] max-w-full bg-[color:var(--dp-bg-elevated)] border-l border-[color:var(--dp-border)] shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--dp-border-soft)]">
          <SectionLabel inline>drop details</SectionLabel>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] hover:bg-[color:var(--dp-bg-elevated-2)] hover:text-[color:var(--dp-text)] transition-colors"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex gap-3 items-start mb-4">
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt=""
                loading="lazy"
                className="block w-16 h-16 rounded-[var(--dp-radius-md)] object-cover border border-[color:var(--dp-border)] flex-shrink-0"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex items-center justify-center w-16 h-16 rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-accent-soft)] flex-shrink-0"
              >
                <Trophy size={20} strokeWidth={1.5} className="text-[color:var(--dp-accent)]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium text-[color:var(--dp-text)] mb-0.5">
                {dropTitleFallback(drop)}
              </div>
              <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mb-2">
                {drop.game || "—"}
              </div>
              <Pill tone={dropStatusTone(drop)} dot={drop.status === "progress"}>
                {dropStatusLabel(drop)}
              </Pill>
            </div>
          </div>

          <div className="mb-5">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mb-1.5">
              progress
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-[4px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, progressPct))}%`,
                    background:
                      drop.status === "claimed"
                        ? "var(--dp-signal-ok)"
                        : "var(--dp-accent)",
                  }}
                />
              </div>
              <span className="font-mono text-[11px] text-[color:var(--dp-text)] tabular-nums">
                {formatPercent(progressPct)}
              </span>
            </div>
            <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
              {formatHourMinute(drop.earnedMinutes)} watched · {drop.requiredMinutes > 0 ? formatHourMinute(drop.requiredMinutes) : "—"} required
            </div>
          </div>

          {blockingLabel && (
            <div className="mb-5 rounded-[var(--dp-radius-md)] border border-[rgba(248,113,113,0.20)] bg-[rgba(248,113,113,0.08)] px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--dp-signal-err)] mb-1">
                blocked
              </div>
              <div className="text-[12px] text-[color:var(--dp-text)]">{blockingLabel}</div>
            </div>
          )}

          {campaign && (
            <div className="mb-5">
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mb-1.5">
                campaign
              </div>
              <div className="text-[13px] text-[color:var(--dp-text)] mb-0.5">{campaign.name}</div>
              {campaign.startsAt && (
                <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                  starts {formatRelative(Date.parse(campaign.startsAt))}
                </div>
              )}
              {campaign.endsAt && (
                <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                  ends {formatRelative(Date.parse(campaign.endsAt))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 mt-6">
            {showLinkAction && (
              <Button
                variant="dp-primary"
                size="dp-md"
                onClick={() => onOpenAccountLink(campaign?.accountLinkUrl)}
                title={campaign?.accountLinkUrl}
              >
                <ExternalLink size={11} strokeWidth={1.8} /> link account
              </Button>
            )}
            {showAddPriority && drop.game && (
              <Button
                variant="dp-outline"
                size="dp-md"
                onClick={() => onAddPriorityGame(drop.game.trim())}
              >
                add {drop.game} to priorities
              </Button>
            )}
            {!showLinkAction && !showAddPriority && (
              <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] text-center py-2">
                no actions available
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
