import * as React from "react";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Pill } from "@renderer/shared/components/ui/pill";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import { formatBlockingReason, pickDisplayBlockingReason } from "./controlHelpers";
import { formatHourMinute, formatPercent } from "@renderer/features/overview/formatters";

export type CampaignGroupDrop = {
  id: string;
  title: string;
  requiredMinutes: number;
  earnedMinutes: number;
  status: "locked" | "progress" | "claimed";
  blocked?: boolean;
  blockingReasonHints?: string[];
};

export type CampaignGroup = {
  id: string;
  name: string;
  drops: CampaignGroupDrop[];
  totalRequired: number;
  totalEarned: number;
  hasActiveDrop: boolean;
};

export type CampaignsPanelProps = {
  groups: CampaignGroup[];
  selectedCampaignId: string | null;
  onSelectCampaign: (id: string) => void;
};

export function CampaignsPanel({
  groups,
  selectedCampaignId,
  onSelectCampaign,
}: CampaignsPanelProps) {
  const { t } = useI18n();

  if (groups.length === 0) {
    return (
      <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-8 text-center">
        <p className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          no active campaigns
        </p>
      </div>
    );
  }

  const activeGroup = groups.find((g) => g.id === selectedCampaignId) ?? groups[0];

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[color:var(--dp-border-soft)]">
        <SectionLabel inline>campaigns</SectionLabel>
        <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
          · {groups.length}
        </span>
      </div>

      {/* Campaign tabs */}
      <div className="px-5 py-3 border-b border-[color:var(--dp-border-soft)] flex flex-wrap gap-1.5">
        {groups.map((g) => {
          const isActive = g.id === activeGroup.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelectCampaign(g.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[var(--dp-radius-sm)] border px-2.5 py-1",
                "font-mono text-[11px] tracking-[0.02em] transition-colors",
                isActive
                  ? "border-[color:var(--dp-accent-soft)] bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]"
                  : "border-[color:var(--dp-border)] bg-transparent text-[color:var(--dp-text-dim)] hover:bg-[color:var(--dp-bg-elevated-2)] hover:text-[color:var(--dp-text)]",
              )}
            >
              {g.hasActiveDrop && (
                <span
                  aria-hidden="true"
                  className="inline-block h-[5px] w-[5px] rounded-full bg-[color:var(--dp-accent)] flex-shrink-0"
                  style={{ boxShadow: "0 0 6px var(--dp-accent-glow)" }}
                />
              )}
              <span className="truncate max-w-[200px]">{g.name}</span>
            </button>
          );
        })}
      </div>

      {/* Drops list */}
      <ul className="list-none p-0 m-0">
        {activeGroup.drops.map((drop) => {
          const pct =
            drop.requiredMinutes > 0
              ? Math.round((drop.earnedMinutes / drop.requiredMinutes) * 100)
              : 0;
          const isClaimed = drop.status === "claimed";
          const blockingReason = drop.blocked
            ? pickDisplayBlockingReason(drop.blockingReasonHints ?? [])
            : undefined;
          const blockingLabel = blockingReason ? formatBlockingReason(blockingReason, t) : null;
          const tone: "ok" | "accent" | "warn" | "dim" = isClaimed
            ? "ok"
            : drop.status === "progress"
              ? drop.blocked
                ? "warn"
                : "accent"
              : "dim";
          const statusText = isClaimed
            ? "claimed"
            : drop.status === "progress"
              ? drop.blocked
                ? "blocked"
                : "live"
              : "queued";

          return (
            <li
              key={drop.id}
              className="grid items-center gap-3 px-5 h-[52px] border-b border-[color:var(--dp-border-soft)] last:border-b-0"
              style={{ gridTemplateColumns: "1fr 160px 100px" }}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] text-[color:var(--dp-text)]">{drop.title}</div>
                {blockingLabel && (
                  <div className="font-mono text-[10px] text-[color:var(--dp-signal-warn)] truncate mt-0.5">
                    {blockingLabel}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-[3px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${pct}%`,
                      background: isClaimed
                        ? "var(--dp-signal-ok)"
                        : drop.status === "progress"
                          ? "var(--dp-accent)"
                          : "var(--dp-text-dimmer)",
                    }}
                  />
                </div>
                <span className="font-mono text-[11px] text-[color:var(--dp-text-dim)] tabular-nums w-[34px] text-right">
                  {formatPercent(pct)}
                </span>
              </div>
              <Pill tone={tone} dot={drop.status === "progress" && !drop.blocked}>
                {statusText}
              </Pill>
            </li>
          );
        })}
      </ul>

      <div className="px-5 py-3 border-t border-[color:var(--dp-border-soft)] flex items-center justify-between font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
        <span>
          {formatHourMinute(activeGroup.totalEarned)} /{" "}
          {formatHourMinute(activeGroup.totalRequired)} total
        </span>
        <span>
          {activeGroup.drops.length} drop{activeGroup.drops.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
