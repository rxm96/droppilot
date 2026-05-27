import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Visual treatment. `dp` applies the design-overhaul Pro Console styling. */
  tone?: "default" | "dp";
};

const TONE_CLASSES: Record<NonNullable<InputProps["tone"]>, string> = {
  default:
    "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
  dp: "flex h-8 w-full rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-3 py-1 font-mono text-[12px] text-[color:var(--dp-text)] shadow-none placeholder:text-[color:var(--dp-text-dimmer)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-accent)] focus-visible:border-[color:var(--dp-accent)] transition-colors",
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, tone = "default", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(TONE_CLASSES[tone], className)} {...props} />
  ),
);
Input.displayName = "Input";
