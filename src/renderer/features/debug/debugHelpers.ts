import type { LogEntry, LogLevel } from "@renderer/shared/utils/logStore";

// Re-export LogLevel so consumers can import from a single debug location.
export type { LogLevel };

// ─── Constants ──────────────────────────────────────────────────────────────

export const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
export const LOG_WINDOW_STEP = 120;
export const SEARCH_LOG_WINDOW = 200;

// ─── Types ───────────────────────────────────────────────────────────────────

export type LevelFilter = Record<LogLevel, boolean>;
export type LevelCounts = Record<LogLevel, number>;
export type SummaryTone = "ok" | "warn" | "error" | "idle";

export type LogSource = {
  source: string | null;
  body: string;
};

export type StructuredLogRow = {
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

export type DebugSnapshot = {
  watching?: {
    name?: string;
    game?: string;
    login?: string;
  } | null;
  targetGame?: string;
  tracker?: import("@renderer/shared/types").ChannelTrackerStatus | null;
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

// ─── Pure utility functions ──────────────────────────────────────────────────

export const safeStringify = (value: unknown) => {
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

export const formatArgs = (args: unknown[]) =>
  args.map((arg, idx) => `${idx + 1}. ${safeStringify(arg)}`).join("\n");

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const parseTimeValue = (value: number | string | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const parseLogSource = (message: string): LogSource => {
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

export const startCase = (value: string) =>
  value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const summarizeValue = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) return `${value.length} items`;
  if (value && typeof value === "object") return "details";
  return "";
};

export const buildMeta = (payload?: Record<string, unknown>) => {
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

export const buildDetails = (payload?: Record<string, unknown>) => {
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

export const formatHeadline = (source: string | null, body: string) => {
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

export const trimSentence = (value: string, limit = 96) =>
  value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value;

export const structureLogEntry = (entry: LogEntry, emptyMessage: string): StructuredLogRow => {
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

export const canGroupStructuredRows = (left: StructuredLogRow, right: StructuredLogRow) =>
  left.level === right.level &&
  left.source === right.source &&
  left.headline === right.headline &&
  left.meta === right.meta &&
  left.level !== "warn" &&
  left.level !== "error";

export const groupStructuredRows = (rows: StructuredLogRow[]) => {
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
