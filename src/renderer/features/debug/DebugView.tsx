import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useInterval } from "@renderer/shared/hooks/useInterval";
import { useI18n } from "@renderer/shared/i18n";
import type { ChannelTrackerStatus } from "@renderer/shared/types";
import { WATCH_INTERVAL_MS } from "@renderer/shared/hooks/watch/useWatchPing";
import { Pill } from "@renderer/shared/components/ui/pill";
import {
  LOG_LIMIT,
  clearLogBuffer,
  getLogBuffer,
  pushLog,
  subscribeLogs,
  type LogEntry,
} from "@renderer/shared/utils/logStore";
import { resetPerfStore } from "@renderer/shared/utils/perfStore";
import { isChannelTrackerStatus } from "@renderer/shared/utils/ipc";
import {
  LOG_WINDOW_STEP,
  SEARCH_LOG_WINDOW,
  groupStructuredRows,
  parseTimeValue,
  structureLogEntry,
  type DebugSnapshot,
  type LevelCounts,
  type LevelFilter,
  type SummaryTone,
} from "./debugHelpers";
import { DebugSummary, type DebugSummaryCard } from "./DebugSummary";
import { DebugRuntimePanel, type DebugFact } from "./DebugRuntimePanel";
import { DebugLogPanel } from "./DebugLogPanel";
import { DebugAdvancedPanel } from "./DebugAdvancedPanel";

type DebugViewProps = {
  snapshot: Record<string, unknown>;
};

export function DebugView({ snapshot }: DebugViewProps) {
  const { t, language } = useI18n();
  const [logs, setLogs] = useState<LogEntry[]>(() => getLogBuffer());
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [simDropId, setSimDropId] = useState("");
  const [simProgress, setSimProgress] = useState("1");
  const [simBusy, setSimBusy] = useState(false);
  const [levels, setLevels] = useState<LevelFilter>({
    debug: true,
    info: true,
    warn: true,
    error: true,
  });
  const [visibleCount, setVisibleCount] = useState(LOG_WINDOW_STEP);
  const deferredQuery = useDeferredValue(query);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef<LogEntry[]>([]);
  const pausedLogRef = useRef<boolean | null>(null);
  const autoScrollLogRef = useRef<boolean | null>(null);
  const snapshotData = snapshot as DebugSnapshot;

  useEffect(() => {
    if (pausedLogRef.current === null) {
      pausedLogRef.current = paused;
      return;
    }
    if (pausedLogRef.current === paused) return;
    pausedLogRef.current = paused;
    pushLog("info", ["debug: pause", { paused }]);
  }, [paused]);

  useEffect(() => {
    if (autoScrollLogRef.current === null) {
      autoScrollLogRef.current = autoScroll;
      return;
    }
    if (autoScrollLogRef.current === autoScroll) return;
    autoScrollLogRef.current = autoScroll;
    pushLog("info", ["debug: auto-scroll", { enabled: autoScroll }]);
  }, [autoScroll]);

  const flushPending = useCallback(() => {
    if (pendingRef.current.length === 0) return;
    const batch = pendingRef.current;
    pendingRef.current = [];
    setLogs((prev) => {
      const next = [...prev, ...batch];
      if (next.length > LOG_LIMIT) {
        next.splice(0, next.length - LOG_LIMIT);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (paused) return;
    const unsubscribe = subscribeLogs((entry) => {
      pendingRef.current.push(entry);
    });
    return () => {
      flushPending();
      unsubscribe();
      pendingRef.current = [];
    };
  }, [paused, flushPending]);

  useInterval(flushPending, 250, !paused);

  useEffect(() => {
    if (!paused) {
      setLogs(getLogBuffer());
      return;
    }
    if (pendingRef.current.length === 0) return;
    const batch = pendingRef.current;
    pendingRef.current = [];
    setLogs((prev) => {
      const next = [...prev, ...batch];
      if (next.length > LOG_LIMIT) {
        next.splice(0, next.length - LOG_LIMIT);
      }
      return next;
    });
  }, [paused]);

  useEffect(() => {
    if (!autoScroll || paused) return;
    const node = listRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [logs, autoScroll, paused]);

  const snapshotText = useMemo(() => JSON.stringify(snapshot, null, 2), [snapshot]);
  const snapshotLines = useMemo(() => snapshotText.split("\n"), [snapshotText]);
  const counts = useMemo(() => {
    const byLevel: LevelCounts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const entry of logs) {
      byLevel[entry.level] += 1;
    }
    return byLevel;
  }, [logs]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return logs.filter((entry) => {
      if (!levels[entry.level]) return false;
      if (!needle) return true;
      return entry.messageLc.includes(needle) || entry.level.includes(needle);
    });
  }, [logs, levels, deferredQuery]);

  const highlightTerm = deferredQuery.trim();
  const effectiveVisibleCount = highlightTerm ? SEARCH_LOG_WINDOW : visibleCount;
  const hiddenCount = Math.max(0, filtered.length - effectiveVisibleCount);
  const visibleLogs = useMemo(
    () => filtered.slice(Math.max(0, filtered.length - effectiveVisibleCount)),
    [effectiveVisibleCount, filtered],
  );
  const structuredRows = useMemo(
    () =>
      groupStructuredRows(
        visibleLogs.map((entry) => structureLogEntry(entry, t("debug.emptyMessage"))),
      ),
    [t, visibleLogs],
  );

  const trackerStatus = useMemo<ChannelTrackerStatus | null>(() => {
    const candidate = snapshot["tracker"];
    return isChannelTrackerStatus(candidate) ? candidate : null;
  }, [snapshot]);
  const trackerShards = trackerStatus?.shards ?? [];

  const suggestedDropId = useMemo(() => {
    const candidate = snapshot["activeDropInfo"];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return "";
    const id = (candidate as Record<string, unknown>)["id"];
    if (typeof id !== "string") return "";
    return id.trim();
  }, [snapshot]);

  useEffect(() => {
    if (!suggestedDropId) return;
    setSimDropId((prev) => (prev.trim().length ? prev : suggestedDropId));
  }, [suggestedDropId]);

  useEffect(() => {
    if (highlightTerm) {
      setVisibleCount(LOG_WINDOW_STEP);
    }
  }, [highlightTerm]);

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US"),
    [language],
  );
  const formatNumber = (val: number) => numberFormatter.format(Math.max(0, val ?? 0));

  const relativeTimeFormatter = useMemo(
    () =>
      new Intl.RelativeTimeFormat(language === "de" ? "de-DE" : "en-US", {
        numeric: "auto",
      }),
    [language],
  );
  const formatRelativeTime = useCallback(
    (value: number | string | null | undefined) => {
      const timestamp = parseTimeValue(value);
      if (!timestamp) return t("debug.summary.noSignal");
      const diffMs = timestamp - Date.now();
      const absMs = Math.abs(diffMs);
      if (absMs < 60_000) {
        return relativeTimeFormatter.format(Math.round(diffMs / 1000), "second");
      }
      if (absMs < 3_600_000) {
        return relativeTimeFormatter.format(Math.round(diffMs / 60_000), "minute");
      }
      if (absMs < 86_400_000) {
        return relativeTimeFormatter.format(Math.round(diffMs / 3_600_000), "hour");
      }
      return relativeTimeFormatter.format(Math.round(diffMs / 86_400_000), "day");
    },
    [relativeTimeFormatter, t],
  );

  const inventoryStatusLabel = useCallback(
    (status?: "idle" | "loading" | "ready" | "error") => {
      if (status === "loading") return t("inventory.loading");
      if (status === "error") return t("inventory.error");
      if (status === "idle") return t("inventory.idle");
      return t("session.ready");
    },
    [t],
  );

  const trackerConnectionLabel = useCallback(
    (state?: "disconnected" | "connecting" | "connected") =>
      t(`control.trackerConn.${state ?? "disconnected"}`),
    [t],
  );

  const watchAgeMs = snapshotData.watch?.lastOk ? Date.now() - snapshotData.watch.lastOk : null;
  const topPerfEntry = snapshotData.perf?.items?.[0] ?? null;

  const summaryCards = useMemo<DebugSummaryCard[]>(
    () => [
      {
        key: "watching",
        label: t("debug.summary.watching"),
        value: snapshotData.watching?.name?.trim() || t("debug.summary.watchingIdle"),
        meta:
          snapshotData.watching?.game?.trim() ||
          snapshotData.priority?.activeTargetGame?.trim() ||
          t("debug.runtime.none"),
        tone: (snapshotData.watching ? "ok" : "idle") satisfies SummaryTone,
      },
      {
        key: "tracker",
        label: t("debug.summary.tracker"),
        value: trackerConnectionLabel(trackerStatus?.connectionState),
        meta:
          trackerShards.length > 0
            ? t("debug.summary.shards", { count: formatNumber(trackerShards.length) })
            : t("debug.summary.subscriptions", {
                active: formatNumber(trackerStatus?.subscriptions ?? 0),
                desired: formatNumber(trackerStatus?.desiredSubscriptions ?? 0),
              }),
        tone: (trackerStatus?.state === "error"
          ? "error"
          : trackerStatus?.connectionState === "connecting"
            ? "warn"
            : trackerStatus?.state === "ok"
              ? "ok"
              : "idle") satisfies SummaryTone,
      },
      {
        key: "pubsub",
        label: t("debug.summary.pubsub"),
        value: trackerConnectionLabel(snapshotData.userPubSub?.connectionState),
        meta: snapshotData.userPubSub?.listening
          ? t("debug.summary.events", {
              count: formatNumber(snapshotData.userPubSub?.events ?? 0),
            })
          : t("debug.summary.notListening"),
        tone: (snapshotData.userPubSub?.lastErrorMessage
          ? "error"
          : snapshotData.userPubSub?.connectionState === "connecting"
            ? "warn"
            : snapshotData.userPubSub?.connectionState === "connected"
              ? "ok"
              : "idle") satisfies SummaryTone,
      },
      {
        key: "inventory",
        label: t("debug.summary.inventory"),
        value:
          snapshotData.inventory?.status === "ready"
            ? t("debug.summary.items", {
                count: formatNumber(snapshotData.inventory?.items ?? 0),
              })
            : inventoryStatusLabel(snapshotData.inventory?.status),
        meta: snapshotData.inventory?.refreshing
          ? t("debug.runtime.refreshing")
          : t("debug.summary.lastSeen", {
              time: formatRelativeTime(snapshotData.inventory?.fetchedAt),
            }),
        tone: (snapshotData.inventory?.status === "error"
          ? "error"
          : snapshotData.inventory?.refreshing || snapshotData.inventory?.status === "loading"
            ? "warn"
            : snapshotData.inventory?.status === "ready"
              ? "ok"
              : "idle") satisfies SummaryTone,
      },
      {
        key: "watch",
        label: t("debug.summary.watchPing"),
        value: formatRelativeTime(snapshotData.watch?.lastOk),
        meta: snapshotData.watch?.error?.message
          ? snapshotData.watch.error.message
          : t("debug.summary.nextCheck", {
              time: formatRelativeTime(snapshotData.watch?.nextAt),
            }),
        tone: (snapshotData.watch?.error
          ? "error"
          : watchAgeMs === null
            ? "idle"
            : watchAgeMs > WATCH_INTERVAL_MS * 2
              ? "warn"
              : "ok") satisfies SummaryTone,
      },
      {
        key: "cpu",
        label: t("debug.summary.cpu"),
        value:
          typeof snapshotData.cpu?.percent === "number"
            ? `${snapshotData.cpu.percent.toFixed(2)}%`
            : "--",
        meta: topPerfEntry
          ? t("debug.summary.topComponent", {
              id: topPerfEntry.id,
              time: formatNumber(Math.round(topPerfEntry.avgMs)),
            })
          : t("debug.summary.componentsTracked", { count: "0" }),
        tone: (typeof snapshotData.cpu?.percent === "number" && snapshotData.cpu.percent >= 35
          ? "warn"
          : snapshotData.cpu?.lastAt
            ? "ok"
            : "idle") satisfies SummaryTone,
      },
    ],
    [
      formatNumber,
      formatRelativeTime,
      inventoryStatusLabel,
      snapshotData.cpu,
      snapshotData.inventory?.fetchedAt,
      snapshotData.inventory?.items,
      snapshotData.inventory?.refreshing,
      snapshotData.inventory?.status,
      snapshotData.priority?.activeTargetGame,
      snapshotData.userPubSub?.connectionState,
      snapshotData.userPubSub?.events,
      snapshotData.userPubSub?.lastErrorMessage,
      snapshotData.userPubSub?.listening,
      snapshotData.watch?.error,
      snapshotData.watch?.lastOk,
      snapshotData.watch?.nextAt,
      snapshotData.watching?.game,
      snapshotData.watching?.name,
      t,
      topPerfEntry,
      trackerConnectionLabel,
      trackerShards.length,
      trackerStatus?.connectionState,
      trackerStatus?.desiredSubscriptions,
      trackerStatus?.state,
      trackerStatus?.subscriptions,
      watchAgeMs,
    ],
  );

  const runtimeFacts = useMemo<DebugFact[]>(
    () => [
      {
        key: "stream",
        label: t("debug.runtime.channel"),
        value: snapshotData.watching?.name?.trim() || t("debug.summary.watchingIdle"),
        meta: snapshotData.watching?.game?.trim() || snapshotData.watching?.login?.trim() || "",
      },
      {
        key: "target",
        label: t("debug.runtime.target"),
        value:
          snapshotData.priority?.activeTargetGame?.trim() ||
          snapshotData.targetGame?.trim() ||
          t("debug.runtime.none"),
        meta: t("debug.summary.channels", {
          count: formatNumber(snapshotData.channels?.count ?? 0),
        }),
      },
      {
        key: "drop",
        label: t("debug.runtime.drop"),
        value: snapshotData.activeDropInfo?.title?.trim() || t("debug.runtime.none"),
        meta:
          typeof snapshotData.activeDropInfo?.requiredMinutes === "number"
            ? `${formatNumber(snapshotData.activeDropInfo?.earnedMinutes ?? 0)}/${formatNumber(
                snapshotData.activeDropInfo.requiredMinutes,
              )} min`
            : "",
      },
      {
        key: "inventory",
        label: t("debug.runtime.inventoryRefresh"),
        value: snapshotData.inventory?.refreshing
          ? t("debug.runtime.refreshing")
          : formatRelativeTime(snapshotData.inventoryRefresh?.nextAt),
        meta: t("debug.summary.lastSeen", {
          time: formatRelativeTime(snapshotData.inventoryRefresh?.lastRun),
        }),
      },
      {
        key: "channels",
        label: t("debug.runtime.channelRefresh"),
        value: snapshotData.channels?.refreshing
          ? t("debug.runtime.refreshing")
          : t("debug.summary.channels", {
              count: formatNumber(snapshotData.channels?.count ?? 0),
            }),
        meta: snapshotData.channels?.diff
          ? `+${formatNumber(snapshotData.channels.diff.added ?? 0)} / -${formatNumber(
              snapshotData.channels.diff.removed ?? 0,
            )} / ${formatNumber(snapshotData.channels.diff.updated ?? 0)} ${t(
              "debug.runtime.updated",
            )}`
          : snapshotData.channels?.error?.message || "",
      },
      {
        key: "warmup",
        label: t("debug.runtime.warmup"),
        value: snapshotData.warmup?.active
          ? snapshotData.warmup.game?.trim() || t("debug.status.live")
          : t("debug.runtime.none"),
        meta: snapshotData.warmup?.cooldownUntil
          ? t("debug.runtime.cooldown", {
              time: formatRelativeTime(snapshotData.warmup.cooldownUntil),
            })
          : snapshotData.warmup?.lastReason?.trim() ||
            t("debug.runtime.attempts", {
              count: formatNumber(snapshotData.warmup?.attemptedCount ?? 0),
            }),
      },
    ],
    [
      formatNumber,
      formatRelativeTime,
      snapshotData.activeDropInfo?.earnedMinutes,
      snapshotData.activeDropInfo?.requiredMinutes,
      snapshotData.activeDropInfo?.title,
      snapshotData.channels?.count,
      snapshotData.channels?.diff,
      snapshotData.channels?.error?.message,
      snapshotData.channels?.refreshing,
      snapshotData.inventory?.refreshing,
      snapshotData.inventoryRefresh?.lastRun,
      snapshotData.inventoryRefresh?.nextAt,
      snapshotData.priority?.activeTargetGame,
      snapshotData.targetGame,
      snapshotData.warmup?.active,
      snapshotData.warmup?.attemptedCount,
      snapshotData.warmup?.cooldownUntil,
      snapshotData.warmup?.game,
      snapshotData.warmup?.lastReason,
      snapshotData.watching?.game,
      snapshotData.watching?.login,
      snapshotData.watching?.name,
      t,
    ],
  );

  const togglePaused = () => {
    setPaused((prev) => !prev);
  };

  const toggleAutoScroll = () => {
    setAutoScroll((prev) => !prev);
  };

  const copySnapshot = async () => {
    try {
      await navigator.clipboard.writeText(snapshotText);
      setCopied(true);
      pushLog("info", ["debug: snapshot copied"]);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (err) {
      pushLog("warn", ["debug: snapshot copy failed", err]);
    }
  };

  const emitDebugEvent = async (kind: "drop-progress" | "drop-claim" | "notification") => {
    if (kind !== "notification" && simDropId.trim().length === 0) {
      pushLog("warn", ["debug: missing drop id for pubsub simulation"]);
      return;
    }
    const progressValue =
      Number.isFinite(Number(simProgress)) && Number(simProgress) >= 0
        ? Math.floor(Number(simProgress))
        : 0;
    setSimBusy(true);
    try {
      const payload =
        kind === "drop-progress"
          ? {
              kind,
              dropId: simDropId.trim(),
              currentProgressMin: progressValue,
              requiredProgressMin: Math.max(progressValue, 1),
            }
          : kind === "drop-claim"
            ? {
                kind,
                dropId: simDropId.trim(),
                dropInstanceId: `debug-claim-${Date.now()}`,
              }
            : {
                kind,
                notificationType: "user_drop_reward_reminder_notification",
              };
      const res = (await window.electronAPI.twitch.debugEmitUserPubSubEvent(payload)) as {
        ok?: boolean;
        message?: string;
      };
      if (!res?.ok) {
        throw new Error(res?.message || "unknown debug emit error");
      }
      pushLog("info", [t("debug.sim.sent"), payload]);
    } catch (err) {
      pushLog("warn", [t("debug.sim.failed"), err]);
    } finally {
      setSimBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[color:var(--dp-text)] leading-tight">
            {t("debug.title")}
          </h2>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mt-1">
            {t("debug.subtitle")}
          </div>
        </div>
        <Pill tone="dim">
          {t("debug.total")}: {formatNumber(logs.length)}
        </Pill>
      </div>

      {/* Summary metric grid */}
      <DebugSummary cards={summaryCards} />

      {/* Investigation: runtime + log */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)" }}>
        <DebugRuntimePanel
          facts={runtimeFacts}
          trackerShards={trackerShards}
          formatNumber={formatNumber}
        />
        <DebugLogPanel
          paused={paused}
          autoScroll={autoScroll}
          query={query}
          setQuery={setQuery}
          levels={levels}
          setLevels={setLevels}
          counts={counts}
          visibleCount={visibleCount}
          setVisibleCount={setVisibleCount}
          hiddenCount={hiddenCount}
          visibleLogsLength={visibleLogs.length}
          filteredLength={filtered.length}
          highlightTerm={highlightTerm}
          structuredRows={structuredRows}
          listRef={listRef}
          totalLogs={logs.length}
          onClear={() => {
            clearLogBuffer();
            resetPerfStore();
            setLogs([]);
          }}
          onTogglePaused={togglePaused}
          onToggleAutoScroll={toggleAutoScroll}
          formatNumber={formatNumber}
          logWindowStep={LOG_WINDOW_STEP}
        />
      </div>

      {/* Advanced */}
      <DebugAdvancedPanel
        simDropId={simDropId}
        setSimDropId={setSimDropId}
        simProgress={simProgress}
        setSimProgress={setSimProgress}
        simBusy={simBusy}
        onEmit={emitDebugEvent}
        copied={copied}
        onCopy={copySnapshot}
        snapshotLines={snapshotLines}
      />
    </div>
  );
}
