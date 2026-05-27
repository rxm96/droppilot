import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/shared/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background shadow-none hover:translate-y-0 hover:filter-none",
  {
    variants: {
      variant: {
        // === Legacy variants — DO NOT CHANGE, in use across the app ===
        default: "bg-foreground text-background hover:opacity-90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted",
        outline: "border border-border bg-transparent text-foreground hover:bg-muted",
        ghost: "bg-transparent text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",

        // === Design-overhaul variants (Pro Console palette) ===
        "dp-primary":
          "bg-[var(--dp-accent)] text-[#0a0b0d] font-semibold hover:bg-[var(--dp-accent-hover)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
        "dp-secondary":
          "bg-[var(--dp-bg-elevated)] text-[var(--dp-text)] border border-[var(--dp-border)] hover:bg-[var(--dp-bg-elevated-2)] hover:border-[var(--dp-accent-soft)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
        "dp-outline":
          "bg-transparent text-[var(--dp-text)] border border-[var(--dp-border)] hover:bg-[var(--dp-bg-elevated)] hover:border-[color:var(--dp-accent-soft)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
        "dp-ghost":
          "bg-transparent text-[var(--dp-text-dim)] hover:bg-[var(--dp-accent-soft)] hover:text-[var(--dp-accent)] rounded-[var(--dp-radius-sm)] font-mono tracking-[0.02em]",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2 text-xs",
        xs: "h-7 px-2 text-xs",
        // === Design-overhaul sizes ===
        "dp-sm": "h-7 px-2.5 text-[11px]",
        "dp-md": "h-8 px-3 text-[11px]",
        "dp-lg": "h-9 px-4 text-[12px]",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
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
