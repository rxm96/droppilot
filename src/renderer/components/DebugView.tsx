import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import {
  LOG_LIMIT,
  clearLogBuffer,
  getLogBuffer,
  pushLog,
  subscribeLogs,
  type LogEntry,
  type LogLevel,
} from "../utils/logStore";

type DebugViewProps = {
  snapshot: Record<string, unknown>;
};

type LevelFilter = Record<LogLevel, boolean>;
type LevelCounts = Record<LogLevel, number>;

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

const safeStringify = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value instanceof Error) {
    return JSON.stringify(
      { name: value.name, message: value.message, stack: value.stack },
      null,
      2
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

export function DebugView({ snapshot }: DebugViewProps) {
  const { t, language } = useI18n();
  const [logs, setLogs] = useState<LogEntry[]>(() => getLogBuffer());
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [levels, setLevels] = useState<LevelFilter>({
    debug: true,
    info: true,
    warn: true,
    error: true,
  });
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (paused) return;
    const unsubscribe = subscribeLogs((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > LOG_LIMIT) {
          next.splice(0, next.length - LOG_LIMIT);
        }
        return next;
      });
    });
    return () => unsubscribe();
  }, [paused]);

  useEffect(() => {
    if (!paused) {
      setLogs(getLogBuffer());
    }
  }, [paused]);

  useEffect(() => {
    if (!autoScroll || paused) return;
    const node = listRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [logs, autoScroll, paused]);

  const snapshotText = useMemo(() => JSON.stringify(snapshot, null, 2), [snapshot]);
  const counts = useMemo(() => {
    const byLevel: LevelCounts = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const entry of logs) {
      byLevel[entry.level] += 1;
    }
    return byLevel;
  }, [logs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((entry) => {
      if (!levels[entry.level]) return false;
      if (!needle) return true;
      return (
        entry.message.toLowerCase().includes(needle) ||
        entry.level.toLowerCase().includes(needle)
      );
    });
  }, [logs, levels, query]);

  const formatNumber = (val: number) =>
    new Intl.NumberFormat(language === "de" ? "de-DE" : "en-US").format(Math.max(0, val ?? 0));

  const togglePaused = () => {
    setPaused((prev) => {
      const next = !prev;
      pushLog("info", ["debug: pause", { paused: next }]);
      return next;
    });
  };

  const toggleAutoScroll = () => {
    setAutoScroll((prev) => {
      const next = !prev;
      pushLog("info", ["debug: auto-scroll", { enabled: next }]);
      return next;
    });
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

  return (
    <>
      <div className="panel-head">
        <div>
          <h2>{t("debug.title")}</h2>
          <p className="meta">{t("debug.subtitle")}</p>
        </div>
      </div>
      <div className="overview-grid">
        <div className="card wide">
          <div className="card-header-row">
            <div className="label">{t("debug.snapshot")}</div>
            <div className="debug-controls">
              <span className="pill ghost small">{t("debug.total")}: {formatNumber(logs.length)}</span>
              <button type="button" className="ghost subtle-btn" onClick={copySnapshot}>
                {copied ? t("debug.copied") : t("debug.copy")}
              </button>
            </div>
          </div>
          <pre className="debug-snapshot">{snapshotText}</pre>
        </div>
        <div className="card wide">
          <div className="card-header-row">
            <div className="label">{t("debug.log")}</div>
            <div className="debug-controls">
              <div className="debug-status">
                <span className={`pill ${paused ? "ghost danger-chip" : "ghost"}`}>
                  {paused ? t("debug.status.paused") : t("debug.status.live")}
                </span>
                <span className="pill ghost">
                  {autoScroll ? t("debug.status.autoScrollOn") : t("debug.status.autoScrollOff")}
                </span>
              </div>
              <button type="button" className="ghost subtle-btn" onClick={() => {
                clearLogBuffer();
                setLogs([]);
              }}>
                {t("debug.clear")}
              </button>
              <button type="button" className="ghost subtle-btn" onClick={togglePaused}>
                {paused ? t("debug.resume") : t("debug.pause")}
              </button>
              <button
                type="button"
                className={`ghost subtle-btn ${autoScroll ? "active" : ""}`}
                onClick={toggleAutoScroll}
              >
                {t("debug.autoScroll")}
              </button>
            </div>
          </div>
          <div className="debug-toolbar">
            <input
              type="text"
              className="debug-search"
              placeholder={t("debug.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="debug-levels">
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={levels[level] ? "pill active" : "pill ghost"}
                  onClick={() => setLevels((prev) => ({ ...prev, [level]: !prev[level] }))}
                >
                  {level} ({formatNumber(counts[level])})
                </button>
              ))}
            </div>
          </div>
          <div ref={listRef} className="debug-log-panel">
            {filtered.length === 0 ? (
              <p className="meta muted">{t("debug.empty")}</p>
            ) : (
              <ul className="debug-log">
                {filtered.map((entry) => (
                  <li key={entry.id} className={`debug-log-item ${entry.level}`}>
                    <div className="debug-log-header">
                      <span className={`pill ghost small level-${entry.level}`}>{entry.level}</span>
                      <span className="meta muted">{new Date(entry.at).toLocaleTimeString()}</span>
                    </div>
                    <div className="debug-log-message">{entry.message || t("debug.emptyMessage")}</div>
                    {entry.args.length > 0 ? (
                      <details>
                        <summary>{t("debug.details")}</summary>
                        <pre className="debug-log-details">{formatArgs(entry.args)}</pre>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
