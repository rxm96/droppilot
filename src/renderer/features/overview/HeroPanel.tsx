import * as React from "react";
import { Stat } from "@renderer/shared/components/ui/stat";
import { Button } from "@renderer/shared/components/ui/button";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Check, Pause, RotateCw } from "@renderer/shared/lib/icons";
import { formatRemainingFromEta } from "./formatters";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";

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
  /** Pause the watch engine (Phase 5 wiring). When null/undefined, pause button stays disabled. */
  onPause?: () => void;
  /** Navigate to Priorities (Phase 5 wiring). When null/undefined, switch button stays disabled. */
  onSwitchTarget?: () => void;
  onClaimNow?: () => void | Promise<void>;
  claimStatus?: { kind: "success" | "error"; message?: string; code?: string } | null;
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
  onPause,
  onSwitchTarget,
  onClaimNow,
  claimStatus,
}: HeroPanelProps) {
  const { t } = useI18n();
  const [now, setNow] = React.useState<number>(() => Date.now());
  const [claiming, setClaiming] = React.useState(false);

  const handleClaim = React.useCallback(async () => {
    if (!onClaimNow || claiming) return;
    setClaiming(true);
    try {
      await onClaimNow();
    } finally {
      setClaiming(false);
    }
  }, [onClaimNow, claiming]);
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
  const title = activeDropTitle?.trim() || activeGame || t("hero.noActiveTarget");
  const channel = activeGame || "—";

  return (
    <div>
      <SectionLabel>{t("hero.nowWatching")}</SectionLabel>
      <div className="mt-3 relative overflow-hidden rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] p-6">
        {/* Top-right radial glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 h-[220px] w-[320px]"
          style={{
            background:
              "radial-gradient(ellipse at top right, var(--dp-accent-soft), transparent 65%)",
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
            {isLive ? t("hero.statusLive") : t("hero.statusIdle")}
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
            <Stat label={t("hero.stat.eta")} value={etaText} sub={t("hero.stat.percentComplete", { pct: progressPct })} accent />
            <div className="mt-2.5 h-[3px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
              <div
                className="h-full rounded-[2px]"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg, var(--dp-accent), color-mix(in srgb, var(--dp-accent) 60%, white))",
                  boxShadow: "0 0 12px var(--dp-accent-glow)",
                }}
              />
            </div>
          </div>
          <div className="px-[18px] border-l border-[color:var(--dp-border-soft)]">
            <Stat label={t("hero.stat.channels")} value={String(channelsCount)} />
          </div>
          <div className="px-[18px] border-l border-[color:var(--dp-border-soft)]">
            <Stat
              label={t("hero.stat.claimsReady")}
              value={String(claimableDrops)}
              sub={hasClaimable ? t("hero.stat.useInventory") : undefined}
              subTone={hasClaimable ? "ok" : "default"}
            />
          </div>
          <div className="px-[18px] border-l border-[color:var(--dp-border-soft)]">
            <Stat label={t("hero.stat.openDrops")} value={String(openDrops)} />
          </div>
        </div>

        {/* Quick actions row */}
        <div className="flex gap-2 mt-4">
          <Button
            variant="dp-primary"
            size="dp-md"
            onClick={handleClaim}
            disabled={!hasClaimable || !onClaimNow || claiming}
            title={
              !onClaimNow
                ? t("hero.title.useInventoryToClaim")
                : !hasClaimable
                  ? t("hero.title.noClaimableDrops")
                  : claiming
                    ? t("hero.title.claiming")
                    : t("hero.title.claimNowReady")
            }
          >
            <Check size={11} strokeWidth={2.2} /> {claiming ? t("hero.button.claiming") : t("hero.button.claimNow")}
          </Button>
          <Button
            variant="dp-secondary"
            size="dp-md"
            onClick={onPause}
            disabled={!onPause || !isLive}
            title={
              !onPause
                ? t("hero.title.wireLater")
                : !isLive
                  ? t("hero.title.engineNotRunning")
                  : t("hero.title.pauseEngine")
            }
          >
            <Pause size={11} strokeWidth={1.8} /> {t("hero.button.pause")}
          </Button>
          <Button
            variant="dp-outline"
            size="dp-md"
            onClick={onSwitchTarget}
            disabled={!onSwitchTarget}
            title={
              onSwitchTarget ? t("hero.title.openPrioritiesToSwitch") : t("hero.title.wireLater")
            }
          >
            <RotateCw size={11} strokeWidth={1.8} /> {t("hero.button.switchTarget")}
          </Button>
        </div>
        {claimStatus && (
          <div
            className={cn(
              "mt-2 font-mono text-[10px]",
              claimStatus.kind === "success"
                ? "text-[color:var(--dp-signal-ok)]"
                : "text-[color:var(--dp-signal-err)]",
            )}
          >
            {claimStatus.kind === "success" && claimStatus.message
              ? claimStatus.message
              : claimStatus.kind === "error"
                ? claimStatus.message ?? t("hero.claimFeedback.errorFallback")
                : null}
          </div>
        )}
      </div>
    </div>
  );
}
