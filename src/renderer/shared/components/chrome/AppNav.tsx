import * as React from "react";
import { cn } from "@renderer/shared/lib/utils";

export type AppNavView = "overview" | "stats" | "inventory" | "priorities" | "settings" | "debug";

export type AppNavItem = {
  key: AppNavView;
  label: string;
  /** Amber count badge (e.g. drops that need the user). Hidden when 0/undefined. */
  badge?: number;
  badgeLabel?: string;
};

export type AppNavProps = {
  view: AppNavView;
  onChange: (next: AppNavView) => void;
  items: AppNavItem[];
  /** Right slot — autopilot chip, settings gear, account. */
  right?: React.ReactNode;
  className?: string;
};

export function AppNav({ view, onChange, items, right, className }: AppNavProps) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-[44px] items-stretch border-b border-[color:var(--dp-border)] bg-[color:var(--dp-bg-app)] px-3.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === view;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-2 px-4 font-mono text-[12px] lowercase transition-colors",
              active
                ? "text-[color:var(--dp-text)]"
                : "text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-text)] hover:bg-[color:var(--dp-bg-elevated)]",
            )}
          >
            {item.label}
            {typeof item.badge === "number" && item.badge > 0 && (
              <span
                aria-label={item.badgeLabel}
                className="grid h-4 min-w-4 place-items-center rounded-full bg-[color:var(--dp-signal-warn)] px-[5px] text-[10px] font-semibold text-[color:var(--dp-bg-app)]"
              >
                {item.badge}
              </span>
            )}
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-4 -bottom-px h-[2px] bg-[color:var(--dp-accent)]"
              />
            )}
          </button>
        );
      })}
      {right && <div className="ml-auto flex items-center gap-2 pr-1">{right}</div>}
    </nav>
  );
}
