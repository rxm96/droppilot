import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type SettingRowProps = {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** The control element (toggle, input, select, button row). */
  control: React.ReactNode;
  /** When true, the row is dimmed (e.g. disabled by a parent toggle). */
  disabled?: boolean;
  /** Adds a top border to visually separate from the previous row. */
  divided?: boolean;
  className?: string;
};

export function SettingRow({
  label,
  description,
  control,
  disabled,
  divided,
  className,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        "grid items-start gap-6 py-4",
        divided && "border-t border-[color:var(--dp-border-soft)]",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
      style={{ gridTemplateColumns: "1fr 240px" }}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[color:var(--dp-text)] leading-tight">
          {label}
        </div>
        {description != null && (
          <div className="mt-1 font-mono text-[10px] leading-relaxed text-[color:var(--dp-text-dimmer)]">
            {description}
          </div>
        )}
      </div>
      <div className="flex flex-col items-stretch gap-2">{control}</div>
    </div>
  );
}
