import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import type { ChannelTrackerShardStatus } from "@renderer/shared/types";
import { summarizeTrackerShards, type TrackerSummaryTone } from "./debugHelpers";

export type DebugFact = {
  key: string;
  label: string;
  value: string;
  meta?: string;
};

export type DebugRuntimePanelProps = {
  facts: DebugFact[];
  trackerShards: ChannelTrackerShardStatus[];
  formatNumber: (val: number) => string;
};

const PANEL =
  "min-w-0 overflow-hidden rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]";
const PANEL_HEAD = "flex items-center gap-2.5 border-b border-[color:var(--dp-border)] px-4 py-3";
const PANEL_TITLE = "m-0 text-[13px] font-semibold text-[color:var(--dp-text)]";

const SUMMARY_TONE: Record<TrackerSummaryTone, string> = {
  none: "text-[color:var(--dp-text-dimmer)]",
  ok: "text-[color:var(--dp-text-dim)]",
  partial: "text-[color:var(--dp-signal-warn)]",
  down: "text-[color:var(--dp-signal-err)]",
};

const SHARD_STATE: Record<ChannelTrackerShardStatus["connectionState"], string> = {
  connected: "text-[color:var(--dp-signal-ok)]",
  connecting: "text-[color:var(--dp-signal-warn)]",
  disconnected: "text-[color:var(--dp-signal-err)]",
};

export function DebugRuntimePanel({ facts, trackerShards, formatNumber }: DebugRuntimePanelProps) {
  const { t } = useI18n();
  const runtimeId = React.useId();
  const trackerId = React.useId();
  const summary = summarizeTrackerShards(trackerShards);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-labelledby={runtimeId} className={PANEL}>
        <div className={PANEL_HEAD}>
          <h2 id={runtimeId} className={PANEL_TITLE}>
            {t("debug.runtime.title")}
          </h2>
        </div>
        <dl className="m-0 px-4 pb-2 pt-1">
          {facts.map((fact) => (
            <div
              key={fact.key}
              className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-[color:var(--dp-border)] py-[7px] last:border-b-0"
            >
              <dt className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
                {fact.label}
              </dt>
              <dd className="m-0 min-w-0">
                <span
                  className="block truncate font-mono text-[12px] text-[color:var(--dp-text)]"
                  title={fact.value}
                >
                  {fact.value}
                </span>
                {fact.meta && (
                  <span className="block truncate font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
                    {fact.meta}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby={trackerId} className={PANEL}>
        <div className={PANEL_HEAD}>
          <h2 id={trackerId} className={PANEL_TITLE}>
            {t("debug.tracker.title")}
          </h2>
          <span className={cn("ml-auto font-mono text-[11px]", SUMMARY_TONE[summary.tone])}>
            {summary.total > 0
              ? t("debug.tracker.connected", {
                  connected: formatNumber(summary.connected),
                  total: formatNumber(summary.total),
                })
              : t("debug.tracker.noShards")}
          </span>
        </div>
        <p className="m-0 px-4 pb-1 pt-2.5 text-[12px] leading-normal text-[color:var(--dp-text-dim)]">
          {t("debug.tracker.help")}
        </p>
        {trackerShards.length > 0 ? (
          <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
            <thead>
              <tr className="text-[color:var(--dp-text-dimmer)]">
                <th scope="col" className="px-4 py-2 text-left font-normal">
                  {t("debug.tracker.col.shard")}
                </th>
                <th scope="col" className="py-2 text-left font-normal">
                  {t("debug.tracker.col.state")}
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  {t("debug.tracker.col.subs")}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-normal">
                  {t("debug.tracker.col.reconnects")}
                </th>
              </tr>
            </thead>
            <tbody>
              {trackerShards.map((shard) => (
                <tr key={shard.id} className="border-t border-[color:var(--dp-border)]">
                  <td className="px-4 py-1.5 text-[color:var(--dp-text)]">#{shard.id}</td>
                  <td className={cn("py-1.5", SHARD_STATE[shard.connectionState])}>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 flex-none rounded-full bg-current"
                      />
                      {t(`control.trackerConn.${shard.connectionState}`)}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-[color:var(--dp-text-dim)]">
                    {formatNumber(shard.subscriptions)} / {formatNumber(shard.desiredSubscriptions)}
                  </td>
                  <td className="px-4 py-1.5 text-right text-[color:var(--dp-text-dim)]">
                    {formatNumber(shard.reconnectAttempts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mx-4 mb-4 mt-2 rounded-[var(--dp-radius-md)] border border-dashed border-[color:var(--dp-border)] px-3 py-4 text-center text-[12px] text-[color:var(--dp-text-dimmer)]">
            {t("debug.summary.noSignal")}
          </div>
        )}
      </section>
    </div>
  );
}
