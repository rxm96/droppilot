export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  id: number;
  at: number;
  timeLabel: string;
  level: LogLevel;
  message: string;
  messageLc: string;
  args: unknown[];
};

export const LOG_LIMIT = 800;
const MAX_LOGS = LOG_LIMIT;
const listeners = new Set<(entry: LogEntry) => void>();
const buffer: LogEntry[] = [];
let counter = 0;
let logCollectionEnabled = false;

export function setLogCollectionEnabled(enabled: boolean) {
  logCollectionEnabled = enabled;
  if (!enabled) {
    buffer.length = 0;
  }
}

export function isLogCollectionEnabled() {
  return logCollectionEnabled;
}

const formatArg = (arg: unknown) => {
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint")
    return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    const serialized = JSON.stringify(arg);
    return serialized ?? String(arg);
  } catch {
    return String(arg);
  }
};

const formatMessage = (args: unknown[]) => args.map(formatArg).join(" ");

export function pushLog(level: LogLevel, args: unknown[]): LogEntry {
  if (!logCollectionEnabled) {
    return {
      id: -1,
      at: 0,
      timeLabel: "",
      level,
      message: "",
      messageLc: "",
      args,
    };
  }
  const at = Date.now();
  const message = formatMessage(args);
  const entry: LogEntry = {
    id: counter++,
    at,
    timeLabel: new Date(at).toLocaleTimeString(),
    level,
    message,
    messageLc: message.toLowerCase(),
    args,
  };
  buffer.push(entry);
  if (buffer.length > MAX_LOGS) {
    buffer.splice(0, buffer.length - MAX_LOGS);
  }
  for (const cb of listeners) {
    cb(entry);
  }
  return entry;
}

export function subscribeLogs(cb: (entry: LogEntry) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getLogBuffer(): LogEntry[] {
  return buffer.slice();
}

export function clearLogBuffer() {
  buffer.length = 0;
}
