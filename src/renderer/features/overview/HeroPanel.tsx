import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { ExternalLink } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import { TimeText } from "@renderer/shared/components/TimeText";
import type { ClaimStatus, WatchingState } from "@renderer/shared/types";
import { formatEndsIn, formatReadyAt, formatRelative, resolveHeroProgress } from "./formatters";
import { narrateClaim } from "./claimNarration";
import { channelInitials, type HeroState } from "./overviewModel";
import { ChannelPicker, type ChannelPickerProps } from "./ChannelPicker";

export type HeroPanelProps = {
  state: HeroState;
  activeGame: string;
  campaignName?: string;
  campaignEndsAt?: string;
  dropTitle?: string;
  /** Live ETA of the active drop; null while paused/idle or when unpredictable. */
  dropEta: number | null;
  dropEarned: number | null;
  dropRequired: number | null;
  /** The active drop's own percent (never the game aggregate). */
  dropProgress: number | null;
  autoClaim: boolean;
  watching: WatchingState;
  watchingViewers: number | null;
  isManualPick: boolean;
  lastWatchOk: number;
  claimStatus: ClaimStatus | null;
  onToggleAutopilot: () => void;
  onOpenStream: (login: string) => void;
  picker: ChannelPickerProps;
};

const KICKER_TONE: Record<HeroState, string> = {
  earning: "text-[color:var(--dp-accent)]",
  paused: "text-[color:var(--dp-signal-warn)]",
  "watching-no-drop": "text-[color:var(--dp-signal-warn)]",
  off: "text-[color:var(--dp-text-dimmer)]",
  "idle-no-target": "text-[color:var(--dp-text-dimmer)]",
  "idle-no-channels": "text-[color:var(--dp-text-dimmer)]",
  "idle-starting": "text-[color:var(--dp-text-dimmer)]",
};

const KICKER_KEY: Record<HeroState, string> = {
  earning: "overview.hero.kicker.earning",
  paused: "overview.hero.kicker.paused",
  "watching-no-drop": "overview.hero.kicker.noDrop",
  off: "overview.hero.kicker.off",
  "idle-no-target": "overview.hero.kicker.waiting",
  "idle-no-channels": "overview.hero.kicker.waiting",
  "idle-starting": "overview.hero.kicker.waiting",
};

export function HeroPanel({
  state,
  activeGame,
  campaignName,
  campaignEndsAt,
  dropTitle,
  dropEta,
  dropEarned,
  dropRequired,
  dropProgress,
  autoClaim,
  watching,
  watchingViewers,
  isManualPick,
  lastWatchOk,
  claimStatus,
  onToggleAutopilot,
  onOpenStream,
  picker,
}: HeroPanelProps) {
  const { t } = useI18n();
  const paused = state === "paused";
  const channelName = watching?.name || watching?.login || "";
  const progressPct = resolveHeroProgress(dropProgress);
  const hasDrop = dropRequired !== null && dropEarned !== null && dropRequired > 0;
  const hasEta = typeof dropEta === "number" && Number.isFinite(dropEta);
  const title = dropTitle?.trim() || activeGame || t("overview.hero.title.nothing");

  const sentence = (() => {
    switch (state) {
      case "earning":
        return autoClaim
          ? t("overview.hero.sub.earningAutoClaim", { channel: channelName })
          : t("overview.hero.sub.earningManualClaim", { channel: channelName });
      case "paused":
        return t("overview.hero.sub.paused");
      case "off":
        return t("overview.hero.sub.off");
      case "watching-no-drop":
        return t("overview.hero.sub.noDrop", { channel: channelName });
      case "idle-no-target":
        return t("overview.hero.sub.noTarget");
      case "idle-no-channels":
        return t("overview.hero.sub.noChannels", { game: activeGame });
      case "idle-starting":
        return t("overview.hero.sub.starting", { game: activeGame });
    }
  })();

  const meta = [activeGame, campaignName?.trim()].filter(Boolean).join(" · ");

  return (
    <section
      aria-labelledby="hero-title"
      className={cn(
        "flex flex-col gap-4 rounded-[var(--dp-radius-xl)] border bg-[color:var(--dp-bg-elevated)] px-[26px] pt-6 pb-[22px]",
        paused
          ? "border-[color-mix(in_srgb,var(--dp-signal-warn)_25%,transparent)]"
          : "border-[color:var(--dp-border)]",
      )}
    >
      <div className="flex justify-between gap-4 font-mono text-[11px]">
        <span className={KICKER_TONE[state]}>{t(KICKER_KEY[state])}</span>
        {meta && (
          <span className="truncate text-[color:var(--dp-text-dimmer)]">
            {meta}
            <TimeText
              intervalMs={60_000}
              render={(now) => {
                const endsIn = formatEndsIn(campaignEndsAt, now);
                return endsIn ? ` · ${t("overview.hero.endsIn", { time: endsIn })}` : null;
              }}
            />
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1
            id="hero-title"
            className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.01em] text-[color:var(--dp-text)]"
          >
            {title}
          </h1>
          <p className="mt-1.5 mb-0 text-[14px] text-[color:var(--dp-text-dim)]">{sentence}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[30px] font-medium leading-none tabular-nums text-[color:var(--dp-text)]">
            {formatReadyAt(dropEta, Date.now())?.clock ?? "—"}
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            <TimeText
              active={hasEta}
              render={(now) => {
                const readyAt = formatReadyAt(dropEta, now);
                if (readyAt) return t("overview.hero.readyIn", { min: readyAt.minutesLeft });
                if (paused) return t("overview.hero.readyPaused");
                return t("overview.hero.readyUnknown");
              }}
            />
          </div>
        </div>
      </div>

      <div>
        <div
          role="progressbar"
          aria-label={t("overview.hero.progressAria", { title })}
          aria-valuemin={0}
          aria-valuemax={hasDrop ? dropRequired : 100}
          aria-valuenow={hasDrop ? Math.floor(dropEarned) : 0}
          className="h-1 overflow-hidden rounded-[2px] bg-[color:var(--dp-border)]"
        >
          <div
            className="h-full rounded-[2px]"
            style={{
              width: `${progressPct ?? 0}%`,
              background: paused
                ? "var(--dp-text-dimmer)"
                : "linear-gradient(90deg, color-mix(in srgb, var(--dp-accent) 80%, black), var(--dp-accent))",
            }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          <span>
            {hasDrop
              ? t("overview.hero.watched", {
                  watched: Math.floor(dropEarned),
                  required: dropRequired,
                })
              : t("hero.stat.noActiveDrop")}
          </span>
          <span>{progressPct === null ? "" : `${progressPct}%`}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--dp-border)] pt-3.5">
        {watching ? (
          <>
            <span
              aria-hidden="true"
              className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[color:var(--dp-accent-soft)] text-[11px] font-semibold text-[color:var(--dp-accent)]"
            >
              {channelInitials(channelName)}
            </span>
            <div className="min-w-[200px] flex-1">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--dp-text)]">
                {channelName}
                {isManualPick && (
                  <span
                    title={t("overview.picker.footer")}
                    className="rounded-[var(--dp-radius-xs)] border border-[color:var(--dp-border)] px-1.5 py-px font-mono text-[10px] font-normal text-[color:var(--dp-text-dim)]"
                  >
                    {t("overview.hero.yourPick")}
                  </span>
                )}
              </div>
              <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
                {watchingViewers !== null &&
                  `${t("overview.hero.viewers", { count: watchingViewers.toLocaleString() })} · `}
                <TimeText
                  render={(now) =>
                    t("overview.hero.lastPing", { time: formatRelative(lastWatchOk, now) })
                  }
                />
              </div>
            </div>
          </>
        ) : (
          <div className="min-w-[200px] flex-1 text-[13px] text-[color:var(--dp-text-dim)]">
            {t("overview.hero.noChannel")}
          </div>
        )}
        <Button
          variant="dp-outline"
          size="dp-lg"
          onClick={onToggleAutopilot}
          disabled={state === "off"}
        >
          {paused ? t("overview.hero.resume") : t("overview.hero.pause")}
        </Button>
        <ChannelPicker {...picker} />
        {watching?.login && (
          <Button
            variant="dp-outline"
            size="dp-lg"
            onClick={() => onOpenStream(watching.login as string)}
            aria-label={t("overview.hero.openStream")}
            title={t("overview.hero.openStream")}
          >
            <ExternalLink size={14} strokeWidth={1.7} />
          </Button>
        )}
      </div>

      {claimStatus && (
        <div className="-mt-1 font-mono text-[11px]">
          <TimeText
            active={claimStatus.kind === "error" && typeof claimStatus.nextRetryAt === "number"}
            render={(now) => {
              const narration = narrateClaim(claimStatus, now, t);
              if (!narration) return null;
              const toneClass =
                narration.tone === "ok"
                  ? "text-[color:var(--dp-signal-ok)]"
                  : narration.tone === "warn"
                    ? "text-[color:var(--dp-signal-warn)]"
                    : "text-[color:var(--dp-signal-err)]";
              return <span className={toneClass}>{narration.text}</span>;
            }}
          />
        </div>
      )}
    </section>
  );
}
