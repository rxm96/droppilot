import * as React from "react";
import { cn } from "../../lib/utils";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, ...props }, ref) => (
    <label className={cn("inline-flex items-center", className)}>
      <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
      <span
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full border border-border bg-muted transition-colors",
          "peer-checked:bg-foreground peer-disabled:opacity-50",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform",
            "peer-checked:translate-x-4",
          )}
        />
      </span>
    </label>
  ),
);
Switch.displayName = "Switch";
