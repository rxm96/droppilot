import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
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
  const snapshotLines = useMemo(() => snapshotText.split("\n"), [snapshotText]);
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
        entry.message.toLowerCase().includes(needle) || entry.level.toLowerCase().includes(needle)
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
          <CardContent>
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
                  {filtered.map((entry) => {
                    const style = LEVEL_STYLES[entry.level];
                    return (
                      <li key={entry.id} className={cn("log-item", `level-${entry.level}`)}>
                        <div className="log-head">
                          <Badge className={style.badge} variant="outline">
                            {entry.level}
                          </Badge>
                          <span className="log-time">
                            {new Date(entry.at).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className={cn("log-message", style.text)}>
                          {entry.message || t("debug.emptyMessage")}
                        </div>
                        {entry.args.length > 0 ? (
                          <details className="log-details-wrap">
                            <summary className="log-details-summary">
                              {t("debug.details")}
                            </summary>
                            <pre className="log-details">
                              {formatArgs(entry.args)}
                            </pre>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
