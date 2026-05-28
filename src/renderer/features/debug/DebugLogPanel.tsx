import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { Pill } from "@renderer/shared/components/ui/pill";
import { Button } from "@renderer/shared/components/ui/button";
import { Input } from "@renderer/shared/components/ui/input";
import {
  LEVELS,
  escapeRegExp,
  formatArgs,
  type LevelCounts,
  type LevelFilter,
  type LogLevel,
  type StructuredLogRow,
} from "./debugHelpers";

const LEVEL_TONE: Record<LogLevel, "dim" | "info" | "warn" | "err"> = {
  debug: "dim",
  info: "info",
  warn: "warn",
  error: "err",
};

const LEVEL_TEXT: Record<LogLevel, string> = {
  debug: "text-[color:var(--dp-text-dim)]",
  info: "text-[color:var(--dp-text)]",
  warn: "text-[color:var(--dp-text)]",
  error: "text-[color:var(--dp-signal-err)]",
};

export function highlightMatches(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const source = term.trim();
  if (!source) return text;
  const pattern = new RegExp(`(${escapeRegExp(source)})`, "ig");
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  return parts.map((part, idx) =>
    part.toLowerCase() === source.toLowerCase() ? (
      <mark
        key={`${idx}:${part}`}
        className="bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)] px-0.5 rounded-[2px]"
      >
        {part}
      </mark>
    ) : (
      <span key={`${idx}:${part}`}>{part}</span>
    ),
  );
}

type LogDetailsProps = { args: unknown[]; label: string; highlightTerm?: string };
const LogDetails = React.memo(function LogDetails({ args, label, highlightTerm = "" }: LogDetailsProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const detailsText = React.useMemo(() => (isOpen ? formatArgs(args) : ""), [args, isOpen]);
  return (
    <details
      className="mt-2"
      onToggle={(e) => setIsOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] cursor-pointer hover:text-[color:var(--dp-text-dim)] select-none">
        {label}
      </summary>
      {isOpen ? (
        <pre className="mt-1.5 font-mono text-[10px] text-[color:var(--dp-text-dim)] whitespace-pre-wrap break-words bg-[color:var(--dp-bg-elevated-2)] border border-[color:var(--dp-border-soft)] rounded-[var(--dp-radius-sm)] p-2">
          {highlightMatches(detailsText, highlightTerm)}
        </pre>
      ) : null}
    </details>
  );
});

type LogRowProps = { row: StructuredLogRow; detailsLabel: string; highlightTerm?: string };
const LogRow = React.memo(function LogRow({ row, detailsLabel, highlightTerm = "" }: LogRowProps) {
  return (
    <li
      className={cn(
        "border-l-2 border-[color:var(--dp-border)] pl-3 py-2",
        row.level === "error" && "border-l-[color:var(--dp-signal-err)]",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Pill tone={LEVEL_TONE[row.level]}>{highlightMatches(row.level, highlightTerm)}</Pill>
          {row.source && (
            <Pill tone="dim">{highlightMatches(row.source, highlightTerm)}</Pill>
          )}
          {row.repeatCount > 1 && <Pill tone="dim">x{row.repeatCount}</Pill>}
        </div>
        <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] flex-shrink-0">
          {row.timeLabel}
        </span>
      </div>
      <div className={cn("text-[12px] font-medium leading-tight", LEVEL_TEXT[row.level])}>
        {highlightMatches(row.headline, highlightTerm)}
      </div>
      {row.meta && (
        <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-0.5">
          {highlightMatches(row.meta, highlightTerm)}
        </div>
      )}
      {row.details && (
        <div className={cn("font-mono text-[10px] mt-1", LEVEL_TEXT[row.level])}>
          {highlightMatches(row.details, highlightTerm)}
        </div>
      )}
      {row.args.length > 0 && (
        <LogDetails args={row.args} label={detailsLabel} highlightTerm={highlightTerm} />
      )}
    </li>
  );
});

export type DebugLogPanelProps = {
  paused: boolean;
  autoScroll: boolean;
  query: string;
  setQuery: (val: string) => void;
  levels: LevelFilter;
  setLevels: React.Dispatch<React.SetStateAction<LevelFilter>>;
  counts: LevelCounts;
  visibleCount: number;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
  hiddenCount: number;
  visibleLogsLength: number;
  filteredLength: number;
  highlightTerm: string;
  structuredRows: StructuredLogRow[];
  listRef: React.RefObject<HTMLDivElement | null>;
  totalLogs: number;
  onClear: () => void;
  onTogglePaused: () => void;
  onToggleAutoScroll: () => void;
  formatNumber: (val: number) => string;
  logWindowStep: number;
};

export function DebugLogPanel(props: DebugLogPanelProps) {
  const { t } = useI18n();
  return (
    <div className="rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-5 py-4 flex flex-col gap-3 min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <SectionLabel>{t("debug.log")}</SectionLabel>
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mt-1">
            {t("debug.logHelp")}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Pill tone={props.paused ? "warn" : "ok"} dot>
            {props.paused ? t("debug.status.paused") : t("debug.status.live")}
          </Pill>
          <Pill tone="dim">
            {props.autoScroll ? t("debug.status.autoScrollOn") : t("debug.status.autoScrollOff")}
          </Pill>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <Button variant="dp-outline" size="dp-sm" onClick={props.onClear}>
          {t("debug.clear")}
        </Button>
        <Button variant="dp-outline" size="dp-sm" onClick={props.onTogglePaused}>
          {props.paused ? t("debug.resume") : t("debug.pause")}
        </Button>
        <Button
          variant={props.autoScroll ? "dp-secondary" : "dp-outline"}
          size="dp-sm"
          onClick={props.onToggleAutoScroll}
        >
          {t("debug.autoScroll")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[180px]">
          <Input
            tone="dp"
            type="text"
            placeholder={t("debug.search")}
            value={props.query}
            onChange={(e) => props.setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map((level) => (
            <Button
              key={level}
              type="button"
              size="dp-sm"
              variant={props.levels[level] ? "dp-secondary" : "dp-outline"}
              onClick={() => props.setLevels((prev) => ({ ...prev, [level]: !prev[level] }))}
            >
              {level} ({props.formatNumber(props.counts[level])})
            </Button>
          ))}
        </div>
      </div>

      {/* Overview row */}
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
        <span>
          {props.hiddenCount > 0
            ? t("debug.logWindow", {
                visible: props.formatNumber(props.visibleLogsLength),
                total: props.formatNumber(props.filteredLength),
              })
            : t("debug.logWindowAll", { total: props.formatNumber(props.filteredLength) })}
        </span>
        <div className="flex gap-1.5">
          {props.hiddenCount > 0 && (
            <Button
              type="button"
              variant="dp-outline"
              size="dp-sm"
              onClick={() => props.setVisibleCount((prev) => prev + props.logWindowStep)}
            >
              {t("debug.showOlder")}
            </Button>
          )}
          {props.visibleCount > props.logWindowStep && !props.highlightTerm && (
            <Button
              type="button"
              variant="dp-outline"
              size="dp-sm"
              onClick={() => props.setVisibleCount(props.logWindowStep)}
            >
              {t("debug.jumpToLatest")}
            </Button>
          )}
        </div>
      </div>

      {/* Log frame (scrollable) */}
      <div
        ref={props.listRef}
        className="rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border-soft)] bg-[color:var(--dp-bg-elevated-2)] p-2 overflow-y-auto"
        style={{ maxHeight: "560px" }}
      >
        {props.structuredRows.length === 0 ? (
          <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)] text-center py-8">
            {t("debug.empty")}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {props.structuredRows.map((row) => (
              <LogRow
                key={row.id}
                row={row}
                detailsLabel={t("debug.details")}
                highlightTerm={props.highlightTerm}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
