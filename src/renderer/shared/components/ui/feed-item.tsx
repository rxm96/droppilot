import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type FeedItemTone = "ok" | "warn" | "err" | "info" | "accent";

export type FeedItemProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: FeedItemTone;
  icon: React.ReactNode;
  msg: React.ReactNode;
  meta?: React.ReactNode;
};

const ICON_TONE: Record<FeedItemTone, string> = {
  ok: "bg-[color-mix(in_srgb,var(--dp-signal-ok)_10%,transparent)] text-[color:var(--dp-signal-ok)]",
  warn: "bg-[color-mix(in_srgb,var(--dp-signal-warn)_10%,transparent)] text-[color:var(--dp-signal-warn)]",
  err: "bg-[color-mix(in_srgb,var(--dp-signal-err)_10%,transparent)] text-[color:var(--dp-signal-err)]",
  info: "bg-[color-mix(in_srgb,var(--dp-signal-info)_10%,transparent)] text-[color:var(--dp-signal-info)]",
  accent: "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]",
};

export const FeedItem = React.forwardRef<HTMLDivElement, FeedItemProps>(
  ({ className, tone = "info", icon, msg, meta, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("grid grid-cols-[22px_minmax(0,1fr)] gap-2.5", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-[22px] w-[22px] items-center justify-center rounded-[var(--dp-radius-sm)] [&>svg]:h-3 [&>svg]:w-3",
          ICON_TONE[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] leading-snug text-[color:var(--dp-text)]">{msg}</div>
        {meta != null && (
          <div className="mt-0.5 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {meta}
          </div>
        )}
      </div>
    </div>
  ),
);
FeedItem.displayName = "FeedItem";
