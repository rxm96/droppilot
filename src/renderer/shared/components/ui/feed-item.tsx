import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type FeedItemTone = "ok" | "warn" | "err" | "info" | "accent";

export type FeedItemProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: FeedItemTone;
  icon: React.ReactNode;
  msg: React.ReactNode;
  meta?: React.ReactNode;
  /** Drops the divider that would normally appear under this item. */
  last?: boolean;
};

const ICON_TONE: Record<FeedItemTone, string> = {
  ok: "bg-[color-mix(in_srgb,var(--dp-signal-ok)_10%,transparent)] text-[color:var(--dp-signal-ok)]",
  warn: "bg-[color-mix(in_srgb,var(--dp-signal-warn)_10%,transparent)] text-[color:var(--dp-signal-warn)]",
  err: "bg-[color-mix(in_srgb,var(--dp-signal-err)_10%,transparent)] text-[color:var(--dp-signal-err)]",
  info: "bg-[color-mix(in_srgb,var(--dp-signal-info)_10%,transparent)] text-[color:var(--dp-signal-info)]",
  accent: "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]",
};

export const FeedItem = React.forwardRef<HTMLDivElement, FeedItemProps>(
  ({ className, tone = "info", icon, msg, meta, last, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-start gap-2.5 py-2.5",
        !last && "border-b border-[color:var(--dp-border-soft)]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[var(--dp-radius-xs)] [&>svg]:h-[11px] [&>svg]:w-[11px]",
          ICON_TONE[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] leading-snug text-[color:var(--dp-text)]">{msg}</div>
        {meta != null && (
          <div className="mt-1 font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
            {meta}
          </div>
        )}
      </div>
    </div>
  ),
);
FeedItem.displayName = "FeedItem";
