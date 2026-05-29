import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/shared/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--dp-radius-xs)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] border",
  {
    variants: {
      tone: {
        accent:
          "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)] border-[color:var(--dp-accent-soft)]",
        ok: "bg-[color-mix(in_srgb,var(--dp-signal-ok)_8%,transparent)] text-[color:var(--dp-signal-ok)] border-[color-mix(in_srgb,var(--dp-signal-ok)_18%,transparent)]",
        warn: "bg-[color-mix(in_srgb,var(--dp-signal-warn)_8%,transparent)] text-[color:var(--dp-signal-warn)] border-[color-mix(in_srgb,var(--dp-signal-warn)_18%,transparent)]",
        err: "bg-[color-mix(in_srgb,var(--dp-signal-err)_8%,transparent)] text-[color:var(--dp-signal-err)] border-[color-mix(in_srgb,var(--dp-signal-err)_18%,transparent)]",
        info: "bg-[color-mix(in_srgb,var(--dp-signal-info)_8%,transparent)] text-[color:var(--dp-signal-info)] border-[color-mix(in_srgb,var(--dp-signal-info)_18%,transparent)]",
        dim: "bg-[color-mix(in_srgb,var(--dp-text-dim)_6%,transparent)] text-[color:var(--dp-text-dim)] border-[color-mix(in_srgb,var(--dp-text-dim)_12%,transparent)]",
      },
    },
    defaultVariants: { tone: "dim" },
  },
);

export type PillProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof pillVariants> & {
    /** Render a leading status dot (with currentColor + glow). */
    dot?: boolean;
  };

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ className, tone, dot, children, ...props }, ref) => (
    <span ref={ref} className={cn(pillVariants({ tone }), className)} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className="inline-block h-[5px] w-[5px] rounded-full bg-current"
          style={{ boxShadow: "0 0 6px currentColor" }}
        />
      )}
      {children}
    </span>
  ),
);
Pill.displayName = "Pill";
