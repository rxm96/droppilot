import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Package, Play, ListOrdered, Settings, Bug } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";

export type AppNavView = "overview" | "inventory" | "control" | "priorities" | "settings" | "debug";

const ICON_MAP: Record<AppNavView, LucideIcon> = {
  overview: LayoutGrid,
  inventory: Package,
  control: Play,
  priorities: ListOrdered,
  settings: Settings,
  debug: Bug,
};

export type AppNavItem = {
  key: AppNavView;
  label: string;
};

export type AppNavProps = {
  view: AppNavView;
  onChange: (next: AppNavView) => void;
  items: AppNavItem[];
  /** Right slot — session chip, user info, anything. */
  right?: React.ReactNode;
  className?: string;
};

export function AppNav({ view, onChange, items, right, className }: AppNavProps) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-[42px] items-stretch border-b border-[color:var(--dp-border)] bg-[color:var(--dp-bg-app)] px-3.5",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = ICON_MAP[item.key];
        const active = item.key === view;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-[7px] px-3.5 font-mono text-[11px] lowercase tracking-[0.04em] transition-colors",
              active
                ? "text-[color:var(--dp-accent)]"
                : "text-[color:var(--dp-text-dimmer)] hover:text-[color:var(--dp-text-dim)]",
            )}
          >
            <Icon size={13} strokeWidth={1.7} className={active ? undefined : "opacity-85"} />
            {item.label}
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-3.5 -bottom-px h-px bg-[color:var(--dp-accent)]"
                style={{ boxShadow: "0 0 8px var(--dp-accent-glow)" }}
              />
            )}
          </button>
        );
      })}
      {right && (
        <div className="ml-auto flex items-center gap-2.5 pr-1 font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
          {right}
        </div>
      )}
    </nav>
  );
}
