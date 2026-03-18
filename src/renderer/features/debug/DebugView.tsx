import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useInterval } from "@renderer/shared/hooks/useInterval";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import type { ChannelTrackerStatus } from "@renderer/shared/types";
import { WATCH_INTERVAL_MS } from "@renderer/shared/hooks/watch/useWatchPing";
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

type DebugSnapshot = {
  watching?: {
    name?: string;
    game?: string;
    login?: string;
  } | null;
  targetGame?: string;
  tracker?: ChannelTrackerStatus | null;
  userPubSub?: {
    connectionState?: "disconnected" | "connecting" | "connected";
    listening?: boolean;
    reconnectAttempts?: number;
    lastMessageAt?: number | null;
    lastErrorMessage?: string;
    events?: number;
  } | null;
  inventory?: {
    status?: "idle" | "loading" | "ready" | "error";
    items?: number;
    refreshing?: boolean;
    fetchedAt?: number | null;
  };
  inventoryRefresh?: {
    mode?: string;
    lastRun?: string | null;
    nextAt?: string | null;
  };
  channels?: {
    count?: number;
    loading?: boolean;
    refreshing?: boolean;
    diff?: {
      added?: number;
      removed?: number;
      updated?: number;
    } | null;
    error?: {
      message?: string;
    } | null;
  };
  watch?: {
    lastOk?: number;
    nextAt?: number;
    error?: {
      message?: string;
    } | null;
  };
  warmup?: {
    active?: boolean;
    game?: string;
    lastReason?: string | null;
    cooldownUntil?: string | null;
    attemptedCount?: number;
  };
  activeDropInfo?: {
    id?: string;
    title?: string;
    earnedMinutes?: number;
    requiredMinutes?: number;
  } | null;
  priority?: {
    activeTargetGame?: string;
  };
  cpu?: {
    percent?: number;
    idleWakeups?: number;
    lastAt?: number | null;
  };
  perf?: {
    items?: Array<{
      id: string;
      avgMs: number;
      lastMs: number;
    }>;
  };
};

type LevelFilter = Record<LogLevel, boolean>;
type LevelCounts = Record<LogLevel, number>;
type SummaryTone = "ok" | "warn" | "error" | "idle";
type LogSource = {
  source: string | null;
  body: string;
};
type StructuredLogRow = {
  id: string;
  level: LogLevel;
  timeLabel: string;
  source: string | null;
  headline: string;
  meta: string | null;
  details: string | null;
  args: unknown[];
  repeatCount: number;
};

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const LOG_WINDOW_STEP = 120;
const SEARCH_LOG_WINDOW = 200;
const TRACKER_SHARD_PREVIEW_COUNT = 3;

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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseTimeValue = (value: number | string | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseLogSource = (message: string): LogSource => {
  const value = message.trim();
  if (!value) return { source: null, body: value };
  const bracketMatch = /^\[([^\]]+)\]\s*(.*)$/.exec(value);
  if (bracketMatch) {
    return {
      source: bracketMatch[1].trim().replace(":", "/"),
      body: bracketMatch[2].trim() || bracketMatch[1].trim(),
    };
  }
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex > 24) {
    return { source: null, body: value };
  }
  const source = value.slice(0, separatorIndex).trim();
  if (!/^[a-z][a-z0-9-]*$/i.test(source)) {
    return { source: null, body: value };
  }
  const body = value.slice(separatorIndex + 1).trim();
  return {
    source,
    body: body || value,
  };
};

const startCase = (value: string) =>
  value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const summarizeValue = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === "object") return "details";
  return "";
};

const buildMeta = (payload?: Record<string, unknown>) => {
  if (!payload) return null;
  const candidates: Array<[string, unknown]> = [
    ["game", payload.game],
    ["count", payload.count],
    ["decision", payload.decision],
    ["reason", payload.reason],
    ["channel", payload.login ?? payload.channelId],
    ["drop", payload.title ?? payload.dropId],
    ["attempt", payload.reconnectAttempts ?? payload.attempts],
    ["status", payload.status],
  ];
  const parts = candidates
    .filter(([, value]) => value !== undefined && value !== null && `${value}`.length > 0)
    .slice(0, 3)
    .map(([label, value]) => `${label}: ${summarizeValue(value)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
};

const buildDetails = (payload?: Record<string, unknown>) => {
  if (!payload) return null;
  const preferred =
    payload.message ??
    payload.code ??
    payload.err ??
    payload.context ??
    payload.next ??
    payload.prev ??
    payload.changed;
  if (preferred instanceof Error) return `${preferred.name}: ${preferred.message}`;
  if (typeof preferred === "string") return preferred;
  if (typeof preferred === "number" || typeof preferred === "boolean") return String(preferred);
  if (preferred && typeof preferred === "object") return safeStringify(preferred);
  return null;
};

const formatHeadline = (source: string | null, body: string) => {
  const trimmed = body.trim();
  if (!trimmed) return startCase(source ?? "event");
  if (source === "watch-engine") {
    return `Watch Engine ${startCase(trimmed)}`;
  }
  if (source) {
    return `${startCase(source)} ${startCase(trimmed)}`;
  }
  return startCase(trimmed);
};

const trimSentence = (value: string, limit = 96) =>
  value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;

const structureLogEntry = (entry: LogEntry, emptyMessage: string): StructuredLogRow => {
  const primaryArg = typeof entry.args[0] === "string" ? entry.args[0].trim() : "";
  const rawMessage = primaryArg || entry.message || emptyMessage;
  const parsed = parseLogSource(rawMessage);
  const payload = entry.args.find(
    (arg) => arg && typeof arg === "object" && !Array.isArray(arg) && !(arg instanceof Error),
  ) as Record<string, unknown> | undefined;
  const extraString = entry.args
    .slice(primaryArg ? 1 : 0)
    .find((arg) => typeof arg === "string" && arg.trim().length > 0) as string | undefined;
  const details =
    buildDetails(payload) ?? (extraString ? trimSentence(extraString.trim(), 140) : null);
  return {
    id: String(entry.id),
    level: entry.level,
    timeLabel: entry.timeLabel,
    source: parsed.source,
    headline: trimSentence(formatHeadline(parsed.source, parsed.body)),
    meta: buildMeta(payload),
    details,
    args: entry.args,
    repeatCount: 1,
  };
};

const canGroupStructuredRows = (left: StructuredLogRow, right: StructuredLogRow) =>
  left.level === right.level &&
  left.source === right.source &&
  left.headline === right.headline &&
  left.meta === right.meta &&
  left.level !== "warn" &&
  left.level !== "error";

const groupStructuredRows = (rows: StructuredLogRow[]) => {
  const grouped: StructuredLogRow[] = [];
  for (const row of rows) {
    const last = grouped[grouped.length - 1];
    if (last && canGroupStructuredRows(last, row)) {
      last.repeatCount += 1;
      last.timeLabel = row.timeLabel;
      last.args = row.args;
      if (row.details) last.details = row.details;
      continue;
    }
    grouped.push({ ...row });
  }
  return grouped;
};

const highlightMatches = (text: string, term: string) => {
  if (!term) return text;
  const source = term.trim();
  if (!source) return text;
  const pattern = new RegExp(`(${escapeRegExp(source)})`, "ig");
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  return parts.map((part, idx) =>
    part.toLowerCase() === source.toLowerCase() ? (
      <mark key={`${idx}:${part}`} className="log-highlight">
        {part}
      </mark>
    ) : (
      <span key={`${idx}:${part}`}>{part}</span>
    ),
  );
};

const LEVEL_STYLES: Record<
  LogLevel,
  { badgeVariant: "outline" | "muted" | "default" | "destructive"; border: string; text: string }
> = {
  debug: {
    badgeVariant: "outline",
    border: "border-l-border",
    text: "text-foreground",
  },
  info: {
    badgeVariant: "muted",
    border: "border-l-border",
    text: "text-foreground",
  },
  warn: {
    badgeVariant: "default",
    border: "border-l-border",
    text: "text-foreground",
  },
  error: {
    badgeVariant: "destructive",
    border: "border-l-destructive",
    text: "text-destructive",
  },
};

type LogDetailsProps = {
  args: unknown[];
  label: string;
  highlightTerm?: string;
};

const LogDetails = memo(function LogDetails({ args, label, highlightTerm = "" }: LogDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const detailsText = useMemo(() => (isOpen ? formatArgs(args) : ""), [args, isOpen]);

  return (
    <details
      className="log-details-wrap"
      onToggle={(e) => setIsOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="log-details-summary">{label}</summary>
      {isOpen ? (
        <pre className="log-details">{highlightMatches(detailsText, highlightTerm)}</pre>
      ) : null}
    </details>
  );
});

type LogRowProps = {
  row: StructuredLogRow;
  detailsLabel: string;
  highlightTerm?: string;
};

const LogRow = memo(function LogRow({ row, detailsLabel, highlightTerm = "" }: LogRowProps) {
  const style = LEVEL_STYLES[row.level];

  return (
    <li className={cn("log-item", `level-${row.level}`)}>
      <div className="log-head">
        <div className="log-meta-group">
          <Badge variant={style.badgeVariant}>{highlightMatches(row.level, highlightTerm)}</Badge>
          {row.source ? (
            <Badge variant="outline" className="log-source-badge">
              {highlightMatches(row.source, highlightTerm)}
            </Badge>
          ) : null}
          {row.repeatCount > 1 ? (
            <Badge variant="muted" className="log-repeat-badge">
              x{row.repeatCount}
            </Badge>
          ) : null}
        </div>
        <span className="log-time">{row.timeLabel}</span>
      </div>
      <div className={cn("log-headline", style.text)}>
        {highlightMatches(row.headline, highlightTerm)}
      </div>
      {row.meta ? (
        <div className="log-meta-copy">{highlightMatches(row.meta, highlightTerm)}</div>
      ) : null}
      {row.details ? (
        <div className={cn("log-message", style.text)}>
          {highlightMatches(row.details, highlightTerm)}
        </div>
      ) : null}
      {row.args.length > 0 ? (
        <LogDetails args={row.args} label={detailsLabel} highlightTerm={highlightTerm} />
      ) : null}
    </li>
  );
});

type DebugMetricCardProps = {
  label: string;
  value: string;
  meta: string;
  tone: SummaryTone;
  priority?: "lead" | "support";
};

function DebugMetricCard({
  label,
  value,
  meta,
  tone,
  priority = "support",
}: DebugMetricCardProps) {
  return (
    <Card className={cn("debug-panel debug-metric-card", `tone-${tone}`, priority === "lead" && "is-lead")}>
      <CardContent className="debug-metric-content">
        <div className="debug-metric-label">{label}</div>
        <div className="debug-metric-value">{value}</div>
        <div className="debug-metric-meta">{meta}</div>
      </CardContent>
    </Card>
  );
}

type DebugSupportStripItemProps = {
  label: string;
  value: string;
  meta: string;
  tone: SummaryTone;
};

function DebugSupportStripItem({ label, value, meta, tone }: DebugSupportStripItemProps) {
  return (
    <div className={cn("debug-support-stat", `tone-${tone}`)}>
      <div className="debug-support-stat-head">
        <span className="debug-support-stat-dot" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="debug-support-stat-value">{value}</div>
      <div className="debug-support-stat-meta">{meta}</div>
    </div>
  );
}

type DebugFactTileProps = {
  label: string;
  value: string;
  meta?: string;
};

function DebugFactTile({ label, value, meta }: DebugFactTileProps) {
  return (
    <div className="debug-fact-tile">
      <div className="debug-fact-main">
        <div className="debug-fact-label">{label}</div>
        {meta ? <div className="debug-fact-meta">{meta}</div> : null}
      </div>
      <div className="debug-fact-value">{value}</div>
    </div>
  );
}

export function DebugView({ snapshot }: DebugViewProps) {
  const { t, language } = useI18n();
  const [logs, setLogs] = useState<LogEntry[]>(() => getLogBuffer());
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showSnapshotPanel, setShowSnapshotPanel] = useState(false);
  const [query, setQuery] = useState("");
  const [simDropId, setSimDropId] = useState("");
  const [simProgress, setSimProgress] = useState("1");
  const [simBusy, setSimBusy] = useState(false);
  const [showAllTrackerShards, setShowAllTrackerShards] = useState(false);
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
  const trackerShards = useMemo(() => trackerStatus?.shards ?? [], [trackerStatus]);
  const trackerShardSummary = useMemo(() => {
    return trackerShards.reduce(
      (summary, shard) => {
        summary.total += 1;
        if (shard.connectionState === "connected") {
          summary.connected += 1;
        } else if (shard.connectionState === "connecting") {
          summary.connecting += 1;
        } else {
          summary.disconnected += 1;
        }
        return summary;
      },
      { total: 0, connected: 0, connecting: 0, disconnected: 0 },
    );
  }, [trackerShards]);
  const visibleTrackerShards = useMemo(
    () =>
      showAllTrackerShards
        ? trackerShards
        : trackerShards.slice(0, TRACKER_SHARD_PREVIEW_COUNT),
    [showAllTrackerShards, trackerShards],
  );
  const hiddenTrackerShardCount = Math.max(0, trackerShards.length - visibleTrackerShards.length);
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

  useEffect(() => {
    if (trackerShards.length <= TRACKER_SHARD_PREVIEW_COUNT && showAllTrackerShards) {
      setShowAllTrackerShards(false);
    }
  }, [showAllTrackerShards, trackerShards.length]);

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
  const summaryCards = useMemo(
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
        priority: "lead" as const,
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
        priority: "lead" as const,
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
        priority: "support" as const,
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
        priority: "support" as const,
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
        priority: "support" as const,
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
        priority: "support" as const,
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
  const leadSummaryCards = useMemo(
    () => summaryCards.filter((card) => card.priority === "lead"),
    [summaryCards],
  );
  const supportSummaryCards = useMemo(
    () => summaryCards.filter((card) => card.priority === "support"),
    [summaryCards],
  );
  const runtimeFacts = useMemo(
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
  const runtimeFactGroups = useMemo(
    () => [runtimeFacts.slice(0, 3), runtimeFacts.slice(3)].filter((group) => group.length > 0),
    [runtimeFacts],
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
    <div className="debug-shell">
      <div className="debug-header">
        <div>
          <h2 className="text-lg font-semibold">{t("debug.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("debug.subtitle")}</p>
        </div>
        <Badge variant="outline" className="debug-header-total">
          {t("debug.total")}: {formatNumber(logs.length)}
        </Badge>
      </div>
      <div className="debug-summary-shell">
        <div className="debug-summary-grid debug-summary-grid-lead">
          {leadSummaryCards.map((card) => (
            <DebugMetricCard
              key={card.key}
              label={card.label}
              value={card.value}
              meta={card.meta}
              tone={card.tone}
              priority={card.priority}
            />
          ))}
        </div>
        <div className="debug-support-strip" role="list" aria-label={t("debug.summary.supportStrip")}>
          {supportSummaryCards.map((card) => (
            <DebugSupportStripItem
              key={card.key}
              label={card.label}
              value={card.value}
              meta={card.meta}
              tone={card.tone}
            />
          ))}
        </div>
      </div>
      <div className="debug-investigation-grid">
        <div className="debug-side-stack">
          <Card className="debug-panel debug-support-panel">
            <div>
              <CardHeader className="debug-section-header">
                <CardTitle>{t("debug.runtime.title")}</CardTitle>
                <p className="text-xs text-muted-foreground">{t("debug.runtime.subtitle")}</p>
              </CardHeader>
              <CardContent className="debug-support-content">
                <div className="debug-facts-grid">
                  {runtimeFactGroups.map((group, groupIndex) => (
                    <div key={`runtime-group-${groupIndex}`} className="debug-fact-group">
                      {group.map((fact) => (
                        <DebugFactTile
                          key={fact.key}
                          label={fact.label}
                          value={fact.value}
                          meta={fact.meta}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </CardContent>
            </div>
          </Card>
          <Card className="debug-panel debug-support-panel">
            <CardHeader className="debug-section-header">
              <CardTitle>{t("debug.trackerShards")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("debug.trackerShardsHelp")}</p>
            </CardHeader>
            <CardContent className="debug-support-content flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">{t("debug.websocketHelp")}</p>
              {trackerShards.length > 0 ? (
                <>
                  <div className="debug-shard-overview">
                    <span className="debug-shard-overview-copy">
                      {t("debug.trackerShardSummary", {
                        total: formatNumber(trackerShardSummary.total),
                        connected: formatNumber(trackerShardSummary.connected),
                        connecting: formatNumber(trackerShardSummary.connecting),
                        disconnected: formatNumber(trackerShardSummary.disconnected),
                      })}
                    </span>
                    {hiddenTrackerShardCount > 0 ? (
                      <span className="debug-shard-overview-copy">
                        {t("debug.trackerShardPreview", {
                          visible: formatNumber(visibleTrackerShards.length),
                          total: formatNumber(trackerShards.length),
                        })}
                      </span>
                    ) : null}
                  </div>
                  <ul className="debug-shard-list">
                    {visibleTrackerShards.map((shard) => (
                      <li key={shard.id} className="debug-shard-row">
                        <div className="debug-shard-main">
                          <span className="debug-shard-name">
                            {t("debug.trackerShard", { id: String(shard.id) })}
                          </span>
                          <span className="debug-shard-subscriptions">
                            {t("debug.summary.subscriptions", {
                              active: formatNumber(shard.subscriptions),
                              desired: formatNumber(shard.desiredSubscriptions),
                            })}
                          </span>
                        </div>
                        <div className="debug-shard-meta">
                          <span className={`debug-shard-state state-${shard.connectionState}`}>
                            {t(`control.trackerConn.${shard.connectionState}`)}
                          </span>
                          <span className="debug-shard-reconnects">
                            {t("debug.trackerReconnectsShort")}:{" "}
                            {formatNumber(shard.reconnectAttempts)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {trackerShards.length > TRACKER_SHARD_PREVIEW_COUNT ? (
                    <div className="debug-shard-actions">
                      <Button
                        variant="outline"
                        size="xs"
                        type="button"
                        onClick={() => setShowAllTrackerShards((prev) => !prev)}
                      >
                        {showAllTrackerShards
                          ? t("debug.trackerShowLess")
                          : t("debug.trackerShowAll", {
                              count: formatNumber(hiddenTrackerShardCount),
                            })}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
                  {t("debug.summary.noSignal")}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="debug-investigation-main">
          <Card className="debug-panel debug-log-panel">
            <CardHeader className="debug-log-panel-header">
              <div>
                <CardTitle>{t("debug.log")}</CardTitle>
                <p className="text-xs text-muted-foreground">{t("debug.logHelp")}</p>
              </div>
              <div className="debug-log-header-side">
                <div className="debug-log-statuses">
                  <Badge variant={paused ? "outline" : "muted"}>
                    {paused ? t("debug.status.paused") : t("debug.status.live")}
                  </Badge>
                  <Badge variant="outline">
                    {autoScroll ? t("debug.status.autoScrollOn") : t("debug.status.autoScrollOff")}
                  </Badge>
                </div>
                <div className="debug-log-utility-actions">
                  <Button
                    type="button"
                    variant={paused ? "secondary" : "ghost"}
                    size="xs"
                    onClick={togglePaused}
                  >
                    {paused ? t("debug.resume") : t("debug.pause")}
                  </Button>
                  <Button
                    type="button"
                    variant={autoScroll ? "secondary" : "ghost"}
                    size="xs"
                    onClick={toggleAutoScroll}
                  >
                    {t("debug.autoScroll")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="debug-log-content">
              <div className="debug-log-controls">
                <div className="debug-log-filters">
                  <div className="debug-log-search">
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
              </div>
              <div className="debug-log-overview">
                <span className="debug-log-overview-copy">
                  {hiddenCount > 0
                    ? t("debug.logWindow", {
                        visible: formatNumber(visibleLogs.length),
                        total: formatNumber(filtered.length),
                      })
                    : t("debug.logWindowAll", { total: formatNumber(filtered.length) })}
                </span>
                <div className="debug-log-overview-actions">
                  {hiddenCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setVisibleCount((prev) => prev + LOG_WINDOW_STEP)}
                    >
                      {t("debug.showOlder")}
                    </Button>
                  ) : null}
                  {visibleCount > LOG_WINDOW_STEP && !highlightTerm ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setVisibleCount(LOG_WINDOW_STEP)}
                    >
                      {t("debug.jumpToLatest")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="debug-log-clear-action"
                    onClick={() => {
                      clearLogBuffer();
                      resetPerfStore();
                      setLogs([]);
                    }}
                  >
                    {t("debug.clear")}
                  </Button>
                </div>
              </div>
              <div ref={listRef} className="debug-log-frame">
                {structuredRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("debug.empty")}</p>
                ) : (
                  <ul className="log-timeline">
                    {structuredRows.map((row) => (
                      <LogRow
                        key={row.id}
                        row={row}
                        detailsLabel={t("debug.details")}
                        highlightTerm={highlightTerm}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="debug-panel debug-advanced-panel">
            <CardHeader className="debug-section-header debug-advanced-header">
              <CardTitle>{t("debug.advanced.title")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("debug.advanced.subtitle")}</p>
            </CardHeader>
            <CardContent className="debug-advanced-stack">
              <section className="debug-toolbox-section" aria-labelledby="debug-sim-title">
                <div className="debug-toolbox-head">
                  <div className="debug-toolbox-copy-block">
                    <h3 id="debug-sim-title" className="debug-toolbox-title">
                      {t("debug.sim.title")}
                    </h3>
                    <p className="debug-toolbox-copy">{t("debug.sim.help")}</p>
                  </div>
                </div>
                <div className="debug-toolbox-body">
                  <div className="debug-toolbox-fields">
                    <label className="debug-toolbox-field">
                      <span className="debug-toolbox-label">{t("debug.sim.dropId")}</span>
                      <Input
                        type="text"
                        placeholder={t("debug.sim.dropId")}
                        value={simDropId}
                        onChange={(e) => setSimDropId(e.target.value)}
                      />
                    </label>
                    <label className="debug-toolbox-field">
                      <span className="debug-toolbox-label">{t("debug.sim.progress")}</span>
                      <Input
                        type="number"
                        min={0}
                        placeholder={t("debug.sim.progress")}
                        value={simProgress}
                        onChange={(e) => setSimProgress(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="debug-toolbox-actions">
                    <div className="debug-toolbox-action-group">
                      <p className="debug-toolbox-label">{t("debug.sim.dropEvents")}</p>
                      <div className="debug-toolbox-action-row">
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={simBusy || simDropId.trim().length === 0}
                          onClick={() => void emitDebugEvent("drop-progress")}
                        >
                          {t("debug.sim.progressBtn")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={simBusy || simDropId.trim().length === 0}
                          onClick={() => void emitDebugEvent("drop-claim")}
                        >
                          {t("debug.sim.claimBtn")}
                        </Button>
                      </div>
                    </div>
                    <div className="debug-toolbox-action-group">
                      <p className="debug-toolbox-label">{t("debug.sim.systemEvents")}</p>
                      <div className="debug-toolbox-action-row">
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={simBusy}
                          onClick={() => void emitDebugEvent("notification")}
                        >
                          {t("debug.sim.notificationBtn")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              <section className="debug-toolbox-disclosure" aria-labelledby="debug-snapshot-title">
                <div className="debug-toolbox-head">
                  <div className="debug-toolbox-copy-block">
                    <h3 id="debug-snapshot-title" className="debug-toolbox-title">
                      {t("debug.snapshot")}
                    </h3>
                    <p className="debug-toolbox-copy">{t("debug.snapshotHelp")}</p>
                  </div>
                  <div className="debug-toolbox-disclosure-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => setShowSnapshotPanel((prev) => !prev)}
                    >
                      {showSnapshotPanel ? t("debug.snapshotHide") : t("debug.snapshotShow")}
                    </Button>
                    {showSnapshotPanel ? (
                      <Button variant="outline" size="sm" onClick={copySnapshot} type="button">
                        {copied ? t("debug.copied") : t("debug.copy")}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {showSnapshotPanel ? (
                  <div className="debug-toolbox-body debug-toolbox-body-tight">
                    <ol className="code-panel debug-snapshot-panel" aria-label={t("debug.snapshot")}>
                      {snapshotLines.map((line, index) => (
                        <li key={`${index}`} className="code-line">
                          {line}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
