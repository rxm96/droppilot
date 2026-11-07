import { describe, expect, it } from "vitest";
import type { LogEntry, LogLevel } from "@renderer/shared/utils/logStore";
import {
  REPORT_LOG_LIMIT,
  buildDebugReport,
  formatReportLogEntry,
  formatReportTime,
  redactSnapshotForReport,
  summarizeTrackerShards,
} from "./debugHelpers";

const NOW = Date.UTC(2026, 10, 7, 12, 30, 0);
// Local-time base so the HH:MM:SS assertions hold in every timezone.
const BASE = new Date(2026, 10, 7, 4, 25, 41).getTime();

const entry = (
  index: number,
  args: unknown[],
  level: LogLevel = "info",
): Pick<LogEntry, "at" | "level" | "message" | "args"> => ({
  at: BASE + index * 1000,
  level,
  message: args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "),
  args,
});

const reportLines = (report: string) => report.split("\n");

describe("formatReportTime", () => {
  it("formats a zero-padded local 24h clock", () => {
    expect(formatReportTime(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe("03:04:05");
    expect(formatReportTime(new Date(2026, 0, 2, 23, 59, 9).getTime())).toBe("23:59:09");
  });
});

describe("formatReportLogEntry", () => {
  it("prints time, level and message on one line without args", () => {
    expect(formatReportLogEntry(entry(0, ["inventory: fetch started"]))).toBe(
      "04:25:41 info inventory: fetch started",
    );
  });

  it("puts extra args below the line as indented JSON", () => {
    const text = formatReportLogEntry(entry(1, ["tracker: shard closed", { shard: 3 }], "warn"));
    expect(reportLines(text)).toEqual([
      "04:25:42 warn tracker: shard closed",
      "    1. {",
      '      "shard": 3',
      "    }",
    ]);
  });

  it("does not repeat a non-string first arg as the message", () => {
    const text = formatReportLogEntry(entry(0, [{ code: 1006 }], "error"));
    expect(reportLines(text)[0]).toBe("04:25:41 error");
    expect(text).toContain('"code": 1006');
  });
});

describe("redactSnapshotForReport", () => {
  it("replaces the account's login, name and avatar and keeps the rest", () => {
    const snapshot = {
      appVersion: "4.1.0",
      profile: { status: "ready", login: "me", displayName: "Me", avatar: "https://x/y.png" },
      watching: { name: "JumpMaster" },
    };
    expect(redactSnapshotForReport(snapshot)).toEqual({
      appVersion: "4.1.0",
      profile: {
        status: "ready",
        login: "[redacted]",
        displayName: "[redacted]",
        avatar: "[redacted]",
      },
      watching: { name: "JumpMaster" },
    });
    expect(snapshot.profile.login).toBe("me");
  });

  it("leaves a snapshot without a profile alone", () => {
    const snapshot = { profile: null, auth: { status: "idle" } };
    expect(redactSnapshotForReport(snapshot)).toBe(snapshot);
  });
});

describe("buildDebugReport", () => {
  it("starts with the version and an ISO timestamp, then the snapshot", () => {
    const snapshotText = JSON.stringify({ appVersion: "4.1.0", auth: { status: "ok" } }, null, 2);
    const report = buildDebugReport({ appVersion: "4.1.0", now: NOW, snapshotText, logs: [] });
    const lines = reportLines(report);
    expect(lines[0]).toBe("DropPilot v4.1.0 · debug report · 2026-11-07T12:30:00.000Z");
    expect(report).toContain(`== state snapshot ==\n${snapshotText}\n`);
  });

  it("says so when there are no log entries", () => {
    const report = buildDebugReport({ appVersion: "", now: NOW, snapshotText: "{}", logs: [] });
    expect(reportLines(report)[0]).toContain("DropPilot unknown version");
    expect(report).toContain("== event log (0) ==\n(no log entries)");
  });

  it("keeps only the last 200 entries, oldest first", () => {
    const logs = Array.from({ length: REPORT_LOG_LIMIT + 50 }, (_, index) =>
      entry(index, [`event ${index}`]),
    );
    const report = buildDebugReport({ appVersion: "4.1.0", now: NOW, snapshotText: "{}", logs });
    const logLines = reportLines(report).filter((line) => / info event \d+$/.test(line));
    expect(logLines).toHaveLength(REPORT_LOG_LIMIT);
    expect(logLines[0]).toMatch(/ info event 50$/);
    expect(logLines[logLines.length - 1]).toMatch(/ info event 249$/);
    expect(report).toContain(`== event log (last ${REPORT_LOG_LIMIT} of 250) ==`);
    expect(report).not.toContain("event 49\n");
  });

  it("includes args JSON for entries that have them", () => {
    const logs = [entry(0, ["watch: ping sent", { channel: "jumpmaster" }]), entry(1, ["done"])];
    const report = buildDebugReport({ appVersion: "v4.1.0", now: NOW, snapshotText: "{}", logs });
    expect(reportLines(report)[0]).toContain("DropPilot v4.1.0 ");
    expect(report).toContain(
      '04:25:41 info watch: ping sent\n    1. {\n      "channel": "jumpmaster"\n    }\n04:25:42 info done',
    );
  });
});

describe("summarizeTrackerShards", () => {
  const shard = (connectionState: string) => ({ connectionState });

  it("is none without shards", () => {
    expect(summarizeTrackerShards([])).toEqual({ connected: 0, total: 0, tone: "none" });
  });

  it("is down when no shard is connected", () => {
    expect(summarizeTrackerShards([shard("disconnected"), shard("connecting")])).toEqual({
      connected: 0,
      total: 2,
      tone: "down",
    });
  });

  it("is partial when some shards are connected", () => {
    expect(summarizeTrackerShards([shard("connected"), shard("disconnected")]).tone).toBe(
      "partial",
    );
  });

  it("is ok when every shard is connected", () => {
    expect(summarizeTrackerShards([shard("connected"), shard("connected")])).toEqual({
      connected: 2,
      total: 2,
      tone: "ok",
    });
  });
});
