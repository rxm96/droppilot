import * as React from "react";
import { Stat } from "@renderer/shared/components/ui/stat";
import { Button } from "@renderer/shared/components/ui/button";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Check, Pause, RotateCw } from "@renderer/shared/lib/icons";
import { formatRemainingFromEta } from "./formatters";

export type HeroPanelProps = {
  activeGame?: string;
  activeDropTitle?: string;
  activeDropEta?: number | null;
  activeDropRemainingMinutes?: number;
  targetProgress: number;
  claimableDrops: number;
  channelsCount: number;
  totalDrops: number;
  claimedDrops: number;
  isLive: boolean;
};

export function HeroPanel({
  activeGame,
  activeDropTitle,
  activeDropEta,
  activeDropRemainingMinutes,
  targetProgress,
  claimableDrops,
  channelsCount,
  totalDrops,
  claimedDrops,
  isLive,
}: HeroPanelProps) {
  const [now, setNow] = React.useState<number>(() => Date.now());
  React.useEffect(() => {
    const hasEta = typeof activeDropEta === "number" && Number.isFinite(activeDropEta);
    if (!hasEta) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeDropEta]);

  const etaText = formatRemainingFromEta(activeDropEta, activeDropRemainingMinutes, now);
  const progressPct = Math.max(0, Math.min(100, Math.round(targetProgress)));
  const openDrops = Math.max(0, totalDrops - claimedDrops);
  const hasClaimable = claimableDrops > 0;
  const title = activeDropTitle?.trim() || activeGame || "No active target";
  const channel = activeGame || "—";

  return (
    <div>
      <SectionLabel>currently watching</SectionLabel>
      <div className="mt-3 relative overflow-hidden rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-6">
        {/* Top-right radial glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 h-[220px] w-[320px]"
          style={{
            background:
              "radial-gradient(ellipse at top right, rgba(167,139,250,0.10), transparent 65%)",
          }}
        />

        {/* Eyebrow + meta */}
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--dp-accent)]">
            <span
              aria-hidden="true"
              className={`inline-block h-[6px] w-[6px] rounded-full bg-[color:var(--dp-accent)] ${isLive ? "animate-pulse" : "opacity-40"}`}
              style={{ boxShadow: "0 0 10px var(--dp-accent-glow)" }}
            />
            {isLive ? "LIVE · earning drop" : "IDLE"}
          </div>
        </div>

        {/* Title */}
        <h1 className="text-[26px] font-medium tracking-[-0.02em] leading-[1.1] mt-1.5 mb-0.5 text-[color:var(--dp-text)]">
          {title}
        </h1>
        <div className="font-mono text-[12px] text-[color:var(--dp-text-dim)] mb-[22px]">
          {channel}
        </div>

        {/* Stat grid */}
        <div
          className="grid gap-0 border-t border-[color:var(--dp-border-soft)] pt-[18px]"
          style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}
        >
          <div className="pr-4">
            <Stat label="eta" value={etaText} sub={`${progressPct}% complete`} accent />
            <div className="mt-2.5 h-[3px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
              <div
                className="h-full rounded-[2px]"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg, var(--dp-accent), #c4b5fd)",
                  boxShadow: "0 0 12px var(--dp-accent-glow)",
                }}
              />
            </div>
          </div>
          <div className="px-[18px] border-l border-[color:var(--dp-border-soft)]">
            <Stat label="channels" value={String(channelsCount)} />
          </div>
          <div className="px-[18px] border-l border-[color:var(--dp-border-soft)]">
            <Stat
              label="claims ready"
              value={String(claimableDrops)}
              sub={hasClaimable ? "use inventory" : undefined}
              subTone={hasClaimable ? "ok" : "default"}
            />
          </div>
          <div className="px-[18px] border-l border-[color:var(--dp-border-soft)]">
            <Stat label="open drops" value={String(openDrops)} />
          </div>
        </div>

        {/* Quick actions row */}
        <div className="flex gap-2 mt-4">
          <Button
            variant="dp-primary"
            size="dp-md"
            disabled={!hasClaimable}
            title="Use Inventory view to claim"
          >
            <Check size={11} strokeWidth={2.2} /> claim now
          </Button>
          <Button variant="dp-secondary" size="dp-md" disabled title="Phase 4 will wire this">
            <Pause size={11} strokeWidth={1.8} /> pause
          </Button>
          <Button variant="dp-outline" size="dp-md" disabled title="Phase 4 will wire this">
            <RotateCw size={11} strokeWidth={1.8} /> switch target
          </Button>
        </div>
      </div>
    </div>
  );
}
