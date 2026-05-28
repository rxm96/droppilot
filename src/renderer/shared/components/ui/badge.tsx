import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/shared/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        // === Legacy ===
        default: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-foreground",
        muted: "border-border bg-muted text-muted-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",

        // === Design overhaul ===
        "dp-accent":
          "rounded-[var(--dp-radius-xs)] border-[color:var(--dp-accent-soft)] bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
        "dp-ok":
          "rounded-[var(--dp-radius-xs)] border-[color-mix(in_srgb,var(--dp-signal-ok)_18%,transparent)] bg-[color-mix(in_srgb,var(--dp-signal-ok)_10%,transparent)] text-[color:var(--dp-signal-ok)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
        "dp-warn":
          "rounded-[var(--dp-radius-xs)] border-[color-mix(in_srgb,var(--dp-signal-warn)_20%,transparent)] bg-[color-mix(in_srgb,var(--dp-signal-warn)_10%,transparent)] text-[color:var(--dp-signal-warn)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
        "dp-err":
          "rounded-[var(--dp-radius-xs)] border-[color-mix(in_srgb,var(--dp-signal-err)_20%,transparent)] bg-[color-mix(in_srgb,var(--dp-signal-err)_10%,transparent)] text-[color:var(--dp-signal-err)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
        "dp-info":
          "rounded-[var(--dp-radius-xs)] border-[color-mix(in_srgb,var(--dp-signal-info)_20%,transparent)] bg-[color-mix(in_srgb,var(--dp-signal-info)_10%,transparent)] text-[color:var(--dp-signal-info)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
        "dp-dim":
          "rounded-[var(--dp-radius-xs)] border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated-2)] text-[color:var(--dp-text-dim)] font-mono uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
