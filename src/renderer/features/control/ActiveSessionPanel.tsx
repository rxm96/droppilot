import * as React from "react";
import type { ChannelEntry, WatchingState } from "@renderer/shared/types";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Pill } from "@renderer/shared/components/ui/pill";
import { useI18n } from "@renderer/shared/i18n";
import {
  formatHourMinute,
  formatPercent,
  formatRelative,
} from "@renderer/features/overview/formatters";

export type ActiveSessionPanelProps = {
  watching: WatchingState;
  activeChannel: ChannelEntry | null;
  activeThumb: string | null;
  activeLoginMismatch: string | null;
  activeDropTitle: string | null;
  activeDropEarnedMinutes: number;
  activeDropRequiredMinutes: number;
  activeEtaText: string | null;
  lastWatchOk?: number;
};

export function ActiveSessionPanel({
  watching,
  activeChannel,
  activeThumb,
  activeLoginMismatch,
  activeDropTitle,
  activeDropEarnedMinutes,
  activeDropRequiredMinutes,
  activeEtaText,
  lastWatchOk,
}: ActiveSessionPanelProps) {
  const { t } = useI18n();

  const isWatching = !!watching;
  const channelDisplay = activeChannel?.displayName ?? watching?.name ?? "—";
  const channelLogin = activeChannel?.login ?? watching?.login ?? "";
  const channelGame = activeChannel?.game ?? watching?.game ?? "";
  const viewers = activeChannel?.viewers ?? 0;

  const progressPct =
    activeDropRequiredMinutes > 0
      ? Math.round((activeDropEarnedMinutes / activeDropRequiredMinutes) * 100)
      : 0;

  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--dp-border-soft)]">
        <SectionLabel inline>{isWatching ? t("control.activeSession.nowWatching") : t("control.activeSession.noActiveSession")}</SectionLabel>
        {lastWatchOk && (
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
            {t("control.activeSession.lastPing")} · {formatRelative(lastWatchOk)}
          </div>
        )}
      </div>

      <div className="px-5 py-5">
        {/* Stream card */}
        <div className="flex gap-4 mb-5">
          <div className="w-[160px] h-[90px] rounded-[var(--dp-radius-md)] overflow-hidden border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated-2)] flex-shrink-0">
            {activeThumb ? (
              <img
                src={activeThumb}
                alt=""
                loading="lazy"
                className="block w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                {isWatching ? t("control.activeSession.loading") : t("control.activeSession.noStream")}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-medium text-[color:var(--dp-text)] mb-1 truncate">
              {channelDisplay}
            </div>
            <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] mb-2 truncate">
              {channelGame || "—"}
              {channelLogin && (
                <>
                  {" · "}
                  twitch.tv/{channelLogin}
                </>
              )}
            </div>
            {isWatching ? (
              <div className="flex items-center gap-2">
                <Pill tone="accent" dot>
                  {t("control.activeSession.live")}
                </Pill>
                {viewers > 0 && (
                  <span className="font-mono text-[11px] text-[color:var(--dp-text-dim)] tabular-nums">
                    {viewers.toLocaleString()} {t("control.activeSession.viewers")}
                  </span>
                )}
              </div>
            ) : (
              <Pill tone="dim">{t("control.activeSession.paused")}</Pill>
            )}
            {activeLoginMismatch && (
              <div className="mt-2 font-mono text-[10px] text-[color:var(--dp-signal-warn)]">
                {t("control.streamLoginMismatch", { login: activeLoginMismatch })}
              </div>
            )}
          </div>
        </div>

        {/* Active drop */}
        {activeDropTitle ? (
          <div className="border-t border-[color:var(--dp-border-soft)] pt-4">
            <SectionLabel>{t("control.activeSession.activeDrop")}</SectionLabel>
            <div className="mt-2 text-[15px] font-medium text-[color:var(--dp-text)] mb-2">
              {activeDropTitle}
            </div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="flex-1 h-[4px] rounded-[2px] bg-[color:var(--dp-border)] overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, progressPct))}%`,
                    background: "linear-gradient(90deg, var(--dp-accent), #c4b5fd)",
                    boxShadow: "0 0 8px var(--dp-accent-glow)",
                  }}
                />
              </div>
              <span className="font-mono text-[12px] text-[color:var(--dp-text)] tabular-nums w-[40px] text-right flex-shrink-0">
                {formatPercent(progressPct)}
              </span>
            </div>
            <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
              {activeEtaText
                ? t("control.activeSession.watchedRequiredEta", {
                    watched: formatHourMinute(activeDropEarnedMinutes),
                    required: activeDropRequiredMinutes > 0 ? formatHourMinute(activeDropRequiredMinutes) : "—",
                    eta: activeEtaText,
                  })
                : t("control.activeSession.watchedRequired", {
                    watched: formatHourMinute(activeDropEarnedMinutes),
                    required: activeDropRequiredMinutes > 0 ? formatHourMinute(activeDropRequiredMinutes) : "—",
                  })}
            </div>
          </div>
        ) : (
          <div className="border-t border-[color:var(--dp-border-soft)] pt-4 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {isWatching ? t("control.activeSession.noFarmable") : t("control.activeSession.engineIdle")}
          </div>
        )}
      </div>
    </div>
  );
}
