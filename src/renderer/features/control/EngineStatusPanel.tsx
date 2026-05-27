import * as React from "react";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { ChevronDown } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import {
  formatDurationMs,
  mapWatchEngineDecisionDetails,
  mapWatchEngineDecisionLabel,
  mapWatchEngineSuppressionReasonLabel,
  watchEngineTone,
  type WatchEngineDecision,
  type WatchEngineSuppressionReason,
} from "./controlHelpers";

export type EngineStatusPanelProps = {
  decision: WatchEngineDecision;
  targetGame: string;
  activeTargetGame: string;
  suppression: {
    game: string;
    reason: WatchEngineSuppressionReason;
    sinceAt: number | null;
    holdRemainingMs: number;
  } | null;
  activeCooldowns: Array<{ game: string; until: number; remainingMs: number }>;
  allowlistActive: boolean;
  allowlistedLiveChannels: number;
  totalLiveChannels: number;
  noProgressTracker: { recoveryCount: number; sinceProgressMs: number } | null;
};

const TONE_DOT: Record<ReturnType<typeof watchEngineTone>, string> = {
  ok: "var(--dp-signal-ok)",
  warn: "var(--dp-signal-warn)",
  hold: "var(--dp-signal-warn)",
  neutral: "var(--dp-text-dimmer)",
};

const TONE_TEXT: Record<ReturnType<typeof watchEngineTone>, string> = {
  ok: "text-[color:var(--dp-signal-ok)]",
  warn: "text-[color:var(--dp-signal-warn)]",
  hold: "text-[color:var(--dp-signal-warn)]",
  neutral: "text-[color:var(--dp-text-dim)]",
};

export function EngineStatusPanel(props: EngineStatusPanelProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const detailsId = React.useId();
  const tone = watchEngineTone(props.decision);
  const suppressionReason = props.suppression?.reason ?? null;
  const label = mapWatchEngineDecisionLabel(props.decision, suppressionReason, t);
  const details = mapWatchEngineDecisionDetails(props.decision, suppressionReason, t);

  const targetText =
    props.targetGame ||
    (props.suppression && props.activeTargetGame && !props.targetGame
      ? `${props.activeTargetGame} (${t("control.watchEngineTargetSuppressed")})`
      : props.activeTargetGame) ||
    t("control.noTarget");

  const suppressionText = props.suppression
    ? `${props.suppression.game} (${mapWatchEngineSuppressionReasonLabel(props.suppression.reason, t)})${
        props.suppression.holdRemainingMs > 0
          ? `, ${t("control.watchEngineHold", { time: formatDurationMs(props.suppression.holdRemainingMs) })}`
          : ""
      }`
    : t("control.watchEngineNoSuppression");

  const cooldownText =
    props.activeCooldowns.length > 0
      ? props.activeCooldowns
          .slice(0, 3)
          .map((c) => `${c.game} (${formatDurationMs(c.remainingMs)})`)
          .join(" | ")
      : t("control.watchEngineNoCooldowns");

  const allowlistText = props.allowlistActive
    ? t("control.watchEngineAllowlistOn")
    : t("control.watchEngineAllowlistOff");

  const channelsText = t("control.watchEngineChannelsHint", {
    eligible: props.allowlistedLiveChannels,
    total: props.totalLiveChannels,
  });

  const noProgressText = props.noProgressTracker
    ? t("control.watchEngineNoProgressValue", {
        attempts: props.noProgressTracker.recoveryCount,
        time: formatDurationMs(props.noProgressTracker.sinceProgressMs),
      })
    : null;

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-[color:var(--dp-bg-elevated-2)] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-full flex-shrink-0"
            style={{
              background: TONE_DOT[tone],
              boxShadow:
                tone === "ok"
                  ? "0 0 8px var(--dp-accent-glow)"
                  : tone === "warn" || tone === "hold"
                    ? "0 0 6px rgba(251,191,36,0.5)"
                    : undefined,
            }}
          />
          <div className="flex flex-col items-start min-w-0">
            <SectionLabel inline>engine status</SectionLabel>
            <div className={cn("text-[15px] font-medium mt-1 truncate", TONE_TEXT[tone])}>
              {label}
            </div>
          </div>
        </div>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={cn(
            "text-[color:var(--dp-text-dimmer)] transition-transform flex-shrink-0",
            expanded && "rotate-180",
          )}
        />
      </button>

      <div className="px-5 pb-4">
        <div className="grid gap-1.5">
          <div className="flex gap-3 font-mono text-[11px]">
            <span className="text-[color:var(--dp-text-dimmer)] w-12 flex-shrink-0">why</span>
            <span className="text-[color:var(--dp-text-dim)] flex-1">{details.why}</span>
          </div>
          <div className="flex gap-3 font-mono text-[11px]">
            <span className="text-[color:var(--dp-text-dimmer)] w-12 flex-shrink-0">next</span>
            <span className="text-[color:var(--dp-text-dim)] flex-1">{details.next}</span>
          </div>
        </div>
      </div>

      {expanded && (
        <div id={detailsId} className="border-t border-[color:var(--dp-border-soft)] px-5 py-4 grid gap-2">
          <DetailRow label="target" value={targetText} />
          <DetailRow label="suppression" value={suppressionText} />
          <DetailRow label="cooldowns" value={cooldownText} />
          <DetailRow label="allowlist" value={allowlistText} sub={channelsText} />
          {noProgressText && <DetailRow label="no-progress" value={noProgressText} tone="warn" />}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "120px 1fr" }}>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] pt-0.5">
        {label}
      </span>
      <div className="min-w-0">
        <div
          className={cn(
            "font-mono text-[11px]",
            tone === "warn" ? "text-[color:var(--dp-signal-warn)]" : "text-[color:var(--dp-text)]",
          )}
        >
          {value}
        </div>
        {sub && (
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-0.5">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
