import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type StatusbarTone = "ok" | "warn" | "err" | "info" | "dim";

export type StatusbarItem = {
  label: React.ReactNode;
  /** Leading dot color (omit for none). */
  tone?: StatusbarTone;
};

export type StatusbarProps = {
  left?: StatusbarItem[];
  right?: StatusbarItem[];
  className?: string;
};

const TONE_COLOR: Record<StatusbarTone, string> = {
  ok: "var(--dp-signal-ok)",
  warn: "var(--dp-signal-warn)",
  err: "var(--dp-signal-err)",
  info: "var(--dp-signal-info)",
  dim: "var(--dp-text-dimmer)",
};

function renderItems(items: StatusbarItem[] | undefined) {
  if (!items || items.length === 0) return null;
  return items.map((item, i) => (
    <React.Fragment key={i}>
      {i > 0 && (
        <span className="text-[color:var(--dp-border)]" aria-hidden="true">
          │
        </span>
      )}
      <span className="flex items-center gap-1.5">
        {item.tone && (
          <span
            aria-hidden="true"
            className="inline-block h-[5px] w-[5px] rounded-full"
            style={{ background: TONE_COLOR[item.tone] }}
          />
        )}
        <span>{item.label}</span>
      </span>
    </React.Fragment>
  ));
}

export function Statusbar({ left, right, className }: StatusbarProps) {
  return (
    <div
      className={cn(
        "flex h-[26px] items-center gap-4 border-t border-[color:var(--dp-border)] bg-[color:var(--dp-bg-chrome)] px-4 font-mono text-[10px] text-[color:var(--dp-text-dimmer)]",
        className,
      )}
    >
      {renderItems(left)}
      {right && <div className="ml-auto flex items-center gap-3.5">{renderItems(right)}</div>}
    </div>
  );
}
