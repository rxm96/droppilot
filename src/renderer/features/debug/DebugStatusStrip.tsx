import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import type { SummaryTone } from "./debugHelpers";

export type DebugStatusCell = {
  key: string;
  label: string;
  value: string;
  meta: string;
  tone: SummaryTone;
};

const TONE_DOT: Record<SummaryTone, string> = {
  ok: "var(--dp-signal-ok)",
  warn: "var(--dp-signal-warn)",
  error: "var(--dp-signal-err)",
  idle: "var(--dp-text-dimmer)",
};

// Only problems colour the value; ok and idle stay plain text.
const TONE_VALUE: Record<SummaryTone, string> = {
  ok: "text-[color:var(--dp-text)]",
  warn: "text-[color:var(--dp-signal-warn)]",
  error: "text-[color:var(--dp-signal-err)]",
  idle: "text-[color:var(--dp-text)]",
};

/**
 * One panel, six cells. gap-px over a border-coloured background draws the
 * dividers, also when the strip wraps to three columns in a narrow window.
 */
export function DebugStatusStrip({ cells }: { cells: DebugStatusCell[] }) {
  const { t } = useI18n();
  return (
    <section aria-label={t("debug.status.label")}>
      <dl className="m-0 grid grid-cols-3 gap-px overflow-hidden rounded-[var(--dp-radius-xl)] border border-[color:var(--dp-border)] bg-[color:var(--dp-border)] @min-[1024px]:grid-cols-6">
        {cells.map((cell) => (
          <div key={cell.key} className="min-w-0 bg-[color:var(--dp-bg-elevated)] px-4 py-3.5">
            <dt className="flex items-center gap-1.5 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 flex-none rounded-full"
                style={{ background: TONE_DOT[cell.tone] }}
              />
              <span className="truncate">{cell.label}</span>
            </dt>
            <dd
              className={cn(
                "m-0 mt-1.5 truncate font-mono text-[15px] tabular-nums",
                TONE_VALUE[cell.tone],
              )}
              title={cell.value}
            >
              {cell.value}
            </dd>
            <dd
              className="m-0 mt-0.5 truncate font-mono text-[11px] text-[color:var(--dp-text-dimmer)]"
              title={cell.meta}
            >
              {cell.meta}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
