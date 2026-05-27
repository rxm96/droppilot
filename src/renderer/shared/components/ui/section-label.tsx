import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type SectionLabelProps = React.HTMLAttributes<HTMLDivElement> & {
  /** If true, omits the trailing 1px rule (useful inside panel headers). */
  inline?: boolean;
};

export const SectionLabel = React.forwardRef<HTMLDivElement, SectionLabelProps>(
  ({ className, inline, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--dp-text-dimmer)]",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {!inline && (
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-[color:var(--dp-border)]"
        />
      )}
    </div>
  ),
);
SectionLabel.displayName = "SectionLabel";
