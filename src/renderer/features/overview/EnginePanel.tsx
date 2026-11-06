import * as React from "react";
import { ChevronDown } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";
import { TimeText } from "@renderer/shared/components/TimeText";
import type { ErrorInfo } from "@renderer/shared/types";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";
import { formatReadyAt, formatUptime } from "./formatters";
import {
  mapWatchEngineDecisionDetails,
  mapWatchEngineDecisionLabel,
  narrateEngineCountdown,
  watchEngineTone,
  type WatchEngineDecision,
  type WatchEngineSuppressionReason,
} from "./engineVoice";

export type EnginePanelProps = {
  /** When the next inventory refresh ("drop check") is scheduled; null when none. */
  nextDropCheckAt: number | null;
  /** Live channels of the target game that count for its drops. */
  channelsWithDrops: number;
  /** Timestamp the engine started watching, or null when stopped. */
  watchingSince: number | null;
  decision: WatchEngineDecision;
  suppression: {
    game: string;
    reason: WatchEngineSuppressionReason;
    sinceAt: number | null;
    holdUntil: number | null;
  } | null;
  activeCooldowns: Array<{ game: string; until: number; remainingMs: number }>;
  watchError: ErrorInfo | null;
};

const TONE_DOT: Record<ReturnType<typeof watchEngineTone>, string> = {
  ok: "var(--dp-signal-ok)",
  warn: "var(--dp-signal-warn)",
  hold: "var(--dp-signal-warn)",
  neutral: "var(--dp-text-dimmer)",
};

/**
 * Plain engine facts plus the Engine Voice "why / next" narration (moved from
 * the removed Control view, content unchanged) as an expandable row.
 */
export const EnginePanel = React.memo(function EnginePanel({
  nextDropCheckAt,
  channelsWithDrops,
  watchingSince,
  decision,
  suppression,
  activeCooldowns,
  watchError,
}: EnginePanelProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const detailsId = React.useId();
  const tone = watchEngineTone(decision);
  const suppressionReason = suppression?.reason ?? null;
  const label = mapWatchEngineDecisionLabel(decision, suppressionReason, t);
  const details = mapWatchEngineDecisionDetails(decision, suppressionReason, t);
  const errorText = watchError ? resolveErrorMessage(t, watchError) : null;

  return (
    <section
      aria-labelledby="engine-title"
      className="rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-[18px]"
    >
      <h2
        id="engine-title"
        className="m-0 mb-3 font-mono text-[11px] font-normal text-[color:var(--dp-text-dimmer)]"
      >
        {t("engine.header")}
      </h2>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-y-2 font-mono text-[12px]">
        <dt className="text-[color:var(--dp-text-dimmer)]">{t("overview.engine.nextDropCheck")}</dt>
        <dd className="m-0 text-[color:var(--dp-text)]">
          {formatReadyAt(nextDropCheckAt, Date.now())?.clock ?? "—"}
        </dd>
        <dt className="text-[color:var(--dp-text-dimmer)]">
          {t("overview.engine.channelsWithDrops")}
        </dt>
        <dd className="m-0 text-[color:var(--dp-text)]">
          {t("overview.engine.channelsLive", { count: channelsWithDrops })}
        </dd>
        <dt className="text-[color:var(--dp-text-dimmer)]">{t("overview.engine.runningFor")}</dt>
        <dd className="m-0 text-[color:var(--dp-text)]">
          {typeof watchingSince === "number" ? (
            <TimeText intervalMs={30_000} render={(now) => formatUptime(watchingSince, now)} />
          ) : (
            "—"
          )}
        </dd>
        {errorText && (
          <>
            <dt className="text-[color:var(--dp-text-dimmer)]">{t("overview.engine.lastError")}</dt>
            <dd
              className="m-0 max-w-[180px] truncate text-right text-[color:var(--dp-signal-warn)]"
              title={errorText}
            >
              {errorText}
            </dd>
          </>
        )}
      </dl>

      <div className="mt-3.5 border-t border-[color:var(--dp-border)] pt-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={detailsId}
          className="flex w-full items-center gap-2.5 text-left"
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 flex-none rounded-full"
            style={{ background: TONE_DOT[tone] }}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--dp-text)]">
            {label}
          </span>
          <span className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {t("overview.engine.why")}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.7}
            className={cn(
              "flex-none text-[color:var(--dp-text-dimmer)] transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
        {expanded && (
          <div id={detailsId} className="mt-2.5 grid gap-1.5 pl-4 text-[12px] leading-snug">
            <div className="flex gap-3">
              <span className="w-10 flex-none font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
                {t("control.engineStatus.why")}
              </span>
              <span className="flex-1 text-[color:var(--dp-text-dim)]">{details.why}</span>
            </div>
            <div className="flex gap-3">
              <span className="w-10 flex-none font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
                {t("control.engineStatus.next")}
              </span>
              <span className="flex-1 text-[color:var(--dp-text-dim)]">
                <TimeText
                  active={
                    tone === "hold" &&
                    (decision === "cooldown" || suppressionReason === "stall-stop")
                  }
                  render={(now) => {
                    const remainingMs =
                      decision === "suppressed" && suppression?.holdUntil
                        ? Math.max(0, suppression.holdUntil - now)
                        : decision === "cooldown" && activeCooldowns[0]
                          ? Math.max(0, activeCooldowns[0].until - now)
                          : 0;
                    return (
                      narrateEngineCountdown(decision, suppressionReason, remainingMs, t) ||
                      details.next
                    );
                  }}
                />
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
});
