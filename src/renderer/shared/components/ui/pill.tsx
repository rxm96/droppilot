import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/shared/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--dp-radius-xs)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] border",
  {
    variants: {
      tone: {
        accent:
          "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)] border-[color:var(--dp-accent-soft)]",
        ok: "bg-[rgba(74,222,128,0.08)] text-[color:var(--dp-signal-ok)] border-[rgba(74,222,128,0.18)]",
        warn: "bg-[rgba(251,191,36,0.08)] text-[color:var(--dp-signal-warn)] border-[rgba(251,191,36,0.18)]",
        err: "bg-[rgba(248,113,113,0.08)] text-[color:var(--dp-signal-err)] border-[rgba(248,113,113,0.18)]",
        info: "bg-[rgba(96,165,250,0.08)] text-[color:var(--dp-signal-info)] border-[rgba(96,165,250,0.18)]",
        dim: "bg-[rgba(154,160,168,0.06)] text-[color:var(--dp-text-dim)] border-[rgba(154,160,168,0.12)]",
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
