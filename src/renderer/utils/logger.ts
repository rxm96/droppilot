import { pushLog, type LogLevel } from "./logStore";

const prefix = "[DropPilot]";
const DEBUG_LOGS_KEY = "droppilot:debug-logs";
const isDev = import.meta.env.DEV;

function readDebugOptIn(): boolean {
  if (typeof window === "undefined") return false;

  let fromStorage = false;
  try {
    fromStorage = window.localStorage.getItem(DEBUG_LOGS_KEY) === "1";
  } catch {
    // ignore storage access errors
  }

  let fromQuery = false;
  try {
    const params = new URLSearchParams(window.location.search);
    fromQuery = params.get("debugLogs") === "1";
  } catch {
    // ignore URL parse errors
  }

  if (fromQuery && !fromStorage) {
    try {
      window.localStorage.setItem(DEBUG_LOGS_KEY, "1");
      fromStorage = true;
    } catch {
      // ignore storage write errors
    }
  }

  return fromStorage || fromQuery;
}

const debugOptIn = readDebugOptIn();
export const isVerboseLoggingEnabled = () => isDev || debugOptIn;
const shouldEmit = (level: LogLevel) =>
  isVerboseLoggingEnabled() || level === "warn" || level === "error";

const log =
  (level: LogLevel) =>
  (...args: unknown[]) => {
    if (!shouldEmit(level)) return;
    const timestamp = new Date().toISOString();
    // eslint-disable-next-line no-console
    (console as any)[level](`${prefix} ${timestamp}`, ...args);
    pushLog(level, args);
  };

export const logDebug = log("debug");
export const logInfo = log("info");
export const logWarn = log("warn");
export const logError = log("error");
