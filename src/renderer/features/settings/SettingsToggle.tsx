import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type SettingsToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
};

export function SettingsToggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: SettingsToggleProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-[20px] w-[36px] flex-shrink-0 items-center rounded-full transition-colors",
          "border",
          checked
            ? "bg-[color:var(--dp-accent)] border-[color:var(--dp-accent)]"
            : "bg-[color:var(--dp-bg-elevated-2)] border-[color:var(--dp-border)]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-[14px] w-[14px] rounded-full bg-white transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </button>
      {label && (
        <span className="font-mono text-[11px] text-[color:var(--dp-text-dim)]">{label}</span>
      )}
    </label>
  );
}
