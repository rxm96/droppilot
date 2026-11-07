import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/shared/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--dp-accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-[color:var(--dp-bg-app)] shadow-none hover:translate-y-0 hover:filter-none",
  {
    variants: {
      variant: {
        // Pro Console palette. dp-primary text is --dp-ink (near-black in both
        // themes): the dark- and light-mode accents are both mid-tone shades, so
        // dark text reads well on either.
        "dp-primary":
          "bg-[var(--dp-accent)] text-[color:var(--dp-ink)] font-semibold hover:bg-[var(--dp-accent-hover)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
        "dp-secondary":
          "bg-[var(--dp-bg-elevated)] text-[var(--dp-text)] border border-[var(--dp-border)] hover:bg-[var(--dp-bg-elevated-2)] hover:border-[var(--dp-accent-soft)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
        "dp-outline":
          "bg-transparent text-[var(--dp-text)] border border-[var(--dp-border)] hover:bg-[var(--dp-bg-elevated)] hover:border-[color:var(--dp-accent-soft)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
        "dp-ghost":
          "bg-transparent text-[var(--dp-text-dim)] hover:bg-[var(--dp-accent-soft)] hover:text-[var(--dp-accent)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
      },
      size: {
        "dp-sm": "h-7 px-2.5 text-[11px]",
        "dp-md": "h-8 px-3 text-[11px]",
        "dp-lg": "h-9 px-4 text-[12px]",
      },
    },
    defaultVariants: {
      variant: "dp-outline",
      size: "dp-md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
