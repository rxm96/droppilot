import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import type { ChannelTrackerStatus } from "@renderer/shared/types";
import { Badge } from "@renderer/shared/components/ui/badge";
import { Button } from "@renderer/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/shared/components/ui/card";
import { Input } from "@renderer/shared/components/ui/input";
import {
  LOG_LIMIT,
  clearLogBuffer,
  getLogBuffer,
  pushLog,
  subscribeLogs,
  type LogEntry,
  type LogLevel,
} from "@renderer/shared/utils/logStore";
import { resetPerfStore } from "@renderer/shared/utils/perfStore";
import { isChannelTrackerStatus } from "@renderer/shared/utils/ipc";

type DebugViewProps = {
  snapshot: Record<string, unknown>;
};

type LevelFilter = Record<LogLevel, boolean>;
type LevelCounts = Record<LogLevel, number>;

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

const safeStringify = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
    return String(value);
  if (value instanceof Error) {
    return JSON.stringify(
      { name: value.name, message: value.message, stack: value.stack },
      null,
      2,
    );
  }
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized ?? String(value);
  } catch {
    return String(value);
  }
};

const formatArgs = (args: unknown[]) =>
  args.map((arg, idx) => `${idx + 1}. ${safeStringify(arg)}`).join("\n");

const LEVEL_STYLES: Record<LogLevel, { badge: string; border: string; text: string }> = {
  debug: {
    badge: "border-border bg-muted text-muted-foreground",
    border: "border-l-border",
    text: "text-foreground",
  },
  info: {
    badge: "border-border bg-secondary text-secondary-foreground",
    border: "border-l-border",
    text: "text-foreground",
  },
  warn: {
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    border: "border-l-amber-500/60",
    text: "text-amber-700 dark:text-amber-200",
  },
  error: {
    badge: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    border: "border-l-red-500/60",
    text: "text-red-700 dark:text-red-200",
  },
};

type LogDetailsProps = {
  args: unknown[];
  label: string;
};

const LogDetails = memo(function LogDetails({ args, label }: LogDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const detailsText = useMemo(() => (isOpen ? formatArgs(args) : ""), [args, isOpen]);

  return (
    <details
      className="log-details-wrap"
      onToggle={(e) => setIsOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="log-details-summary">{label}</summary>
      {isOpen ? <pre className="log-details">{detailsText}</pre> : null}
    </details>
  );
});

type LogRowProps = {
  entry: LogEntry;
  emptyMessage: string;
  detailsLabel: string;
};

const LogRow = memo(function LogRow({ entry, emptyMessage, detailsLabel }: LogRowProps) {
  const style = LEVEL_STYLES[entry.level];

  return (
    <li className={cn("log-item", `level-${entry.level}`)}>
      <div className="log-head">
        <Badge className={style.badge} variant="outline">
          {entry.level}
        </Badge>
        <span className="log-time">{entry.timeLabel}</span>
      </div>
      <div className={cn("log-message", style.text)}>{entry.message || emptyMessage}</div>
      {entry.args.length > 0 ? <LogDetails args={entry.args} label={detailsLabel} /> : null}
    </li>
  );
});

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
  const deferredQuery = useDeferredValue(query);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef<LogEntry[]>([]);
  const pausedLogRef = useRef<boolean | null>(null);
  const autoScrollLogRef = useRef<boolean | null>(null);

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

  useEffect(() => {
    if (paused) return;
    const flush = () => {
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
    };
    const unsubscribe = subscribeLogs((entry) => {
      pendingRef.current.push(entry);
    });
    const timer = window.setInterval(flush, 250);
    return () => {
      flush();
      window.clearInterval(timer);
      unsubscribe();
      pendingRef.current = [];
    };
  }, [paused]);

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

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US"),
    [language],
  );
  const formatNumber = (val: number) => numberFormatter.format(Math.max(0, val ?? 0));

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("debug.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("debug.subtitle")}</p>
        </div>
        <Badge variant="muted">
          {t("debug.total")}: {formatNumber(logs.length)}
        </Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("debug.snapshot")}</CardTitle>
            <Button variant="outline" size="sm" onClick={copySnapshot}>
              {copied ? t("debug.copied") : t("debug.copy")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {trackerShards.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("debug.trackerShards")}
                </div>
                <ul className="space-y-1.5">
                  {trackerShards.map((shard) => (
                    <li
                      key={shard.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-background/70 px-2 py-1.5 text-xs"
                    >
                      <span className="font-medium">
                        {t("debug.trackerShard", { id: String(shard.id) })}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">
                          {t(`control.trackerConn.${shard.connectionState}`)}
                        </Badge>
                        <span>
                          {t("debug.trackerSubsShort")}: {formatNumber(shard.subscriptions)}/
                          {formatNumber(shard.desiredSubscriptions)}
                        </span>
                        <span>
                          {t("debug.trackerReconnectsShort")}:{" "}
                          {formatNumber(shard.reconnectAttempts)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("debug.sim.title")}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="text"
                  placeholder={t("debug.sim.dropId")}
                  value={simDropId}
                  onChange={(e) => setSimDropId(e.target.value)}
                />
                <Input
                  type="number"
                  min={0}
                  placeholder={t("debug.sim.progress")}
                  value={simProgress}
                  onChange={(e) => setSimProgress(e.target.value)}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={simBusy || simDropId.trim().length === 0}
                  onClick={() => void emitDebugEvent("drop-progress")}
                >
                  {t("debug.sim.progressBtn")}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={simBusy || simDropId.trim().length === 0}
                  onClick={() => void emitDebugEvent("drop-claim")}
                >
                  {t("debug.sim.claimBtn")}
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={simBusy}
                  onClick={() => void emitDebugEvent("notification")}
                >
                  {t("debug.sim.notificationBtn")}
                </Button>
              </div>
            </div>
            <ol className="code-panel" aria-label={t("debug.snapshot")}>
              {snapshotLines.map((line, index) => (
                <li key={`${index}`} className="code-line">
                  {line}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("debug.log")}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={paused ? "outline" : "muted"}>
                {paused ? t("debug.status.paused") : t("debug.status.live")}
              </Badge>
              <Badge variant="outline">
                {autoScroll ? t("debug.status.autoScrollOn") : t("debug.status.autoScrollOff")}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearLogBuffer();
                  resetPerfStore();
                  setLogs([]);
                }}
              >
                {t("debug.clear")}
              </Button>
              <Button variant="outline" size="sm" onClick={togglePaused}>
                {paused ? t("debug.resume") : t("debug.pause")}
              </Button>
              <Button
                variant={autoScroll ? "secondary" : "outline"}
                size="sm"
                onClick={toggleAutoScroll}
              >
                {t("debug.autoScroll")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[180px] flex-1">
                <Input
                  type="text"
                  placeholder={t("debug.search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {LEVELS.map((level) => (
                  <Button
                    key={level}
                    type="button"
                    size="xs"
                    variant={levels[level] ? "secondary" : "outline"}
                    onClick={() => setLevels((prev) => ({ ...prev, [level]: !prev[level] }))}
                  >
                    {level} ({formatNumber(counts[level])})
                  </Button>
                ))}
              </div>
            </div>
            <div
              ref={listRef}
              className="max-h-[460px] overflow-auto rounded-lg border border-border bg-background p-3"
            >
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("debug.empty")}</p>
              ) : (
                <ul className="log-timeline">
                  {filtered.map((entry) => (
                    <LogRow
                      key={entry.id}
                      entry={entry}
                      emptyMessage={t("debug.emptyMessage")}
                      detailsLabel={t("debug.details")}
                    />
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
