import { pushLog, type LogLevel } from "./logStore";

const prefix = "[DropPilot]";

const log =
  (level: LogLevel) =>
  (...args: unknown[]) => {
    const timestamp = new Date().toISOString();
    // eslint-disable-next-line no-console
    (console as any)[level](`${prefix} ${timestamp}`, ...args);
    pushLog(level, args);
  };

export const logDebug = log("debug");
export const logInfo = log("info");
export const logWarn = log("warn");
export const logError = log("error");
