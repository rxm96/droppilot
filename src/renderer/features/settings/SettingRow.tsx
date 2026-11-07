import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type SettingRowProps = {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** The control (toggle, field, select, buttons), shown on the right. */
  control?: React.ReactNode;
  /** Dims the row and blocks input (e.g. switched off by a parent toggle). */
  disabled?: boolean;
  /** Puts the control on its own full-width line under the text (swatches, textareas). */
  stacked?: boolean;
  /** Extra content under the row (e.g. an expanded changelog). */
  children?: React.ReactNode;
  className?: string;
};

/** One settings row: sans label + muted sans description on the left, control on the right. */
export function SettingRow({
  label,
  description,
  control,
  disabled,
  stacked,
  children,
  className,
}: SettingRowProps) {
  return (
    <div className={cn("px-5 py-3.5", disabled && "pointer-events-none opacity-50", className)}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-[1_1_240px]">
          <div className="text-[14px] font-medium leading-snug text-[color:var(--dp-text)]">
            {label}
          </div>
          {description != null && (
            <div className="mt-0.5 text-[13px] leading-snug text-[color:var(--dp-text-dim)]">
              {description}
            </div>
          )}
        </div>
        {control != null && (
          <div className={cn("flex flex-wrap items-center gap-2", stacked && "basis-full")}>
            {control}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
