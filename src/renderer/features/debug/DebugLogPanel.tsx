import * as React from "react";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import { ChevronDown } from "@renderer/shared/lib/icons";
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

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: "text-[color:var(--dp-text-dimmer)]",
  info: "text-[color:var(--dp-accent)]",
  warn: "text-[color:var(--dp-signal-warn)]",
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
        className="rounded-[2px] bg-[color:var(--dp-accent-soft)] px-0.5 text-[color:var(--dp-accent)]"
      >
        {part}
      </mark>
    ) : (
      <span key={`${idx}:${part}`}>{part}</span>
    ),
  );
}

type LogArgsProps = { id: string; args: unknown[]; highlightTerm: string };
const LogArgs = React.memo(function LogArgs({ id, args, highlightTerm }: LogArgsProps) {
  const text = React.useMemo(() => formatArgs(args), [args]);
  return (
    <pre
      id={id}
      className="col-start-4 col-end-7 m-0 mt-1 mb-1 whitespace-pre-wrap break-words rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-app)] px-3 py-2 font-mono text-[11px] leading-normal text-[color:var(--dp-text-dim)]"
    >
      {highlightMatches(text, highlightTerm)}
    </pre>
  );
});

type LogRowProps = { row: StructuredLogRow; detailsLabel: string; highlightTerm: string };
const LogRow = React.memo(function LogRow({ row, detailsLabel, highlightTerm }: LogRowProps) {
  const [open, setOpen] = React.useState(false);
  const argsId = React.useId();
  const hasArgs = row.args.length > 0;
  return (
    <li
      className={cn(
        "grid grid-cols-[76px_44px_96px_minmax(0,1fr)_auto_16px] items-baseline gap-x-2.5 px-4 py-1.5 font-mono text-[11px] hover:bg-[color:var(--dp-bg-elevated-2)]",
        row.level === "error" && "shadow-[inset_2px_0_0_var(--dp-signal-err)]",
      )}
    >
      <span className="truncate tabular-nums text-[color:var(--dp-text-dimmer)]">
        {row.timeLabel}
      </span>
      <span className={LEVEL_COLOR[row.level]}>{highlightMatches(row.level, highlightTerm)}</span>
      <span className="truncate text-[color:var(--dp-text-dimmer)]" title={row.source ?? undefined}>
        {row.source ? highlightMatches(row.source, highlightTerm) : null}
      </span>
      <span className="min-w-0 truncate font-sans text-[13px] text-[color:var(--dp-text)]">
        {highlightMatches(row.headline, highlightTerm)}
      </span>
      <span className="tabular-nums text-[color:var(--dp-text-dimmer)]">
        {row.repeatCount > 1 ? `×${row.repeatCount}` : null}
      </span>
      {hasArgs ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? argsId : undefined}
          aria-label={detailsLabel}
          title={detailsLabel}
          onClick={() => setOpen((prev) => !prev)}
          className="flex h-4 w-4 items-center justify-center self-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-text)]"
        >
          <ChevronDown
            size={14}
            strokeWidth={1.7}
            aria-hidden="true"
            className={cn("transition-transform", !open && "-rotate-90")}
          />
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
      {row.meta && (
        <div className="col-start-4 col-end-7 truncate text-[10px] text-[color:var(--dp-text-dimmer)]">
          {highlightMatches(row.meta, highlightTerm)}
        </div>
      )}
      {row.details && (
        <div
          className={cn(
            "col-start-4 col-end-7 break-words text-[10px]",
            row.level === "error"
              ? "text-[color:var(--dp-signal-err)]"
              : "text-[color:var(--dp-text-dim)]",
          )}
        >
          {highlightMatches(row.details, highlightTerm)}
        </div>
      )}
      {hasArgs && open && <LogArgs id={argsId} args={row.args} highlightTerm={highlightTerm} />}
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
  const titleId = React.useId();
  const searchId = React.useId();
  const showJumpToLatest = props.visibleCount > props.logWindowStep && !props.highlightTerm;

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col overflow-hidden rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[color:var(--dp-border)] px-4 py-3">
        <h2 id={titleId} className="m-0 text-[13px] font-semibold text-[color:var(--dp-text)]">
          {t("debug.log")}
        </h2>
        <span className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("debug.kept", { count: props.formatNumber(props.totalLogs) })}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="dp-sm"
            variant="dp-outline"
            title={props.paused ? t("debug.resume") : t("debug.pause")}
            onClick={props.onTogglePaused}
            className={
              props.paused
                ? "text-[color:var(--dp-signal-warn)]"
                : "text-[color:var(--dp-signal-ok)]"
            }
          >
            <span aria-hidden="true">{props.paused ? "❚❚" : "●"}</span>
            {props.paused ? t("debug.status.paused") : t("debug.status.live")}
          </Button>
          <Button
            type="button"
            size="dp-sm"
            variant={props.autoScroll ? "dp-secondary" : "dp-outline"}
            aria-pressed={props.autoScroll}
            onClick={props.onToggleAutoScroll}
            className={props.autoScroll ? undefined : "text-[color:var(--dp-text-dimmer)]"}
          >
            {t("debug.follow")}
          </Button>
          <Button type="button" size="dp-sm" variant="dp-outline" onClick={props.onClear}>
            {t("debug.clear")}
          </Button>
        </div>
      </div>

      {/* Toolbar: search + level filter */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--dp-border)] px-4 py-2.5">
        <label htmlFor={searchId} className="sr-only">
          {t("debug.search")}
        </label>
        <Input
          id={searchId}
          tone="dp"
          type="search"
          placeholder={t("debug.search")}
          value={props.query}
          onChange={(e) => props.setQuery(e.target.value)}
          className="min-w-[180px] flex-1 bg-[color:var(--dp-bg-app)]"
        />
        <div
          role="group"
          aria-label={t("debug.levelFilter")}
          className="flex gap-0.5 rounded-[var(--dp-radius-md)] border border-[color:var(--dp-border)] p-0.5"
        >
          {LEVELS.map((level) => {
            const pressed = props.levels[level];
            return (
              <button
                key={level}
                type="button"
                aria-pressed={pressed}
                onClick={() => props.setLevels((prev) => ({ ...prev, [level]: !prev[level] }))}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-[var(--dp-radius-sm)] px-2.5 font-mono text-[11px] transition-colors",
                  pressed
                    ? "bg-[color:var(--dp-bg-elevated-2)] shadow-[inset_0_0_0_1px_var(--dp-border)]"
                    : "text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-text)]",
                )}
              >
                <span className={pressed ? LEVEL_COLOR[level] : undefined}>{level}</span>
                <span className="tabular-nums text-[color:var(--dp-text-dimmer)]">
                  {props.formatNumber(props.counts[level])}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Window row */}
      <div className="flex min-h-[36px] flex-wrap items-center justify-between gap-2 border-b border-[color:var(--dp-border)] px-4 py-1 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
        <span>
          {props.hiddenCount > 0
            ? t("debug.logWindow", {
                visible: props.formatNumber(props.visibleLogsLength),
                total: props.formatNumber(props.filteredLength),
              })
            : t("debug.logWindowAll", { total: props.formatNumber(props.filteredLength) })}
        </span>
        {(props.hiddenCount > 0 || showJumpToLatest) && (
          <div className="flex gap-1.5">
            {props.hiddenCount > 0 && (
              <Button
                type="button"
                variant="dp-ghost"
                size="dp-sm"
                onClick={() => props.setVisibleCount((prev) => prev + props.logWindowStep)}
              >
                {t("debug.showOlder")}
              </Button>
            )}
            {showJumpToLatest && (
              <Button
                type="button"
                variant="dp-ghost"
                size="dp-sm"
                onClick={() => props.setVisibleCount(props.logWindowStep)}
              >
                {t("debug.jumpToLatest")}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Log list (scrollable; auto-scroll pins it to the bottom) */}
      <div ref={props.listRef} className="max-h-[560px] min-h-[320px] overflow-y-auto py-1.5">
        {props.structuredRows.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[color:var(--dp-text-dimmer)]">
            {t("debug.empty")}
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
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
    </section>
  );
}
