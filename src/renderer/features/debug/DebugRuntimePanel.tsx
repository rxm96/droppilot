import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Pill } from "@renderer/shared/components/ui/pill";
import type { ChannelTrackerShardStatus } from "@renderer/shared/types";

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

export function DebugRuntimePanel({ facts, trackerShards, formatNumber }: DebugRuntimePanelProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      {/* Runtime facts */}
      <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-4">
        <SectionLabel>{t("debug.runtime.title")}</SectionLabel>
        <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1 mb-3">
          {t("debug.runtime.subtitle")}
        </div>
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
        >
          {facts.map((fact) => (
            <div key={fact.key} className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mb-0.5">
                {fact.label}
              </div>
              <div className="text-[13px] font-medium text-[color:var(--dp-text)] truncate">
                {fact.value}
              </div>
              {fact.meta && (
                <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-0.5 truncate">
                  {fact.meta}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tracker shards */}
      <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-4">
        <SectionLabel>{t("debug.trackerShards")}</SectionLabel>
        <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1 mb-3">
          {t("debug.trackerShardsHelp")}
        </div>
        <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mb-3">
          {t("debug.websocketHelp")}
        </div>
        {trackerShards.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {trackerShards.map((shard) => {
              const tone: "ok" | "warn" | "err" =
                shard.connectionState === "connected"
                  ? "ok"
                  : shard.connectionState === "connecting"
                    ? "warn"
                    : "err";
              return (
                <li
                  key={shard.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border-soft)] bg-[color:var(--dp-bg-elevated-2)] px-3 py-2"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[12px] font-medium text-[color:var(--dp-text)] truncate">
                      {t("debug.trackerShard", { id: String(shard.id) })}
                    </span>
                    <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] truncate">
                      {t("debug.summary.subscriptions", {
                        active: formatNumber(shard.subscriptions),
                        desired: formatNumber(shard.desiredSubscriptions),
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Pill tone={tone} dot>
                      {t(`control.trackerConn.${shard.connectionState}`)}
                    </Pill>
                    <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                      {t("debug.trackerReconnectsShort")}: {formatNumber(shard.reconnectAttempts)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-[var(--dp-radius-md)] border border-dashed border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated-2)] px-3 py-4 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {t("debug.summary.noSignal")}
          </div>
        )}
      </div>
    </div>
  );
}
