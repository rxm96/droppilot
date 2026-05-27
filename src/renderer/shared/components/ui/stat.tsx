import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type StatProps = React.HTMLAttributes<HTMLDivElement> & {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Apply the accent color to the value. */
  accent?: boolean;
  /** Sub-line semantic tone — picks the right signal color. */
  subTone?: "default" | "ok" | "warn" | "err";
};

const SUB_TONE: Record<NonNullable<StatProps["subTone"]>, string> = {
  default: "text-[color:var(--dp-text-dimmer)]",
  ok: "text-[color:var(--dp-signal-ok)]",
  warn: "text-[color:var(--dp-signal-warn)]",
  err: "text-[color:var(--dp-signal-err)]",
};

export const Stat = React.forwardRef<HTMLDivElement, StatProps>(
  ({ className, label, value, sub, accent, subTone = "default", children, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col", className)} {...props}>
      <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)]">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-[22px] font-medium leading-none tracking-[-0.01em]",
          accent ? "text-[color:var(--dp-accent)]" : "text-[color:var(--dp-text)]",
        )}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </div>
      {sub != null && (
        <div className={cn("mt-1 font-mono text-[10px]", SUB_TONE[subTone])}>
          {sub}
        </div>
      )}
      {children}
    </div>
  ),
);
Stat.displayName = "Stat";
