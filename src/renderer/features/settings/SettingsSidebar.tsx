import * as React from "react";
import {
  Settings as SettingsIcon,
  Play,
  Sun,
  Download,
  AlertTriangle,
  User,
  Bug,
} from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";

export type SettingsSectionKey =
  | "general"
  | "engine"
  | "appearance"
  | "updates"
  | "alerts"
  | "account"
  | "advanced";

export type SettingsSidebarItem = {
  key: SettingsSectionKey;
  label: string;
};

export type SettingsSidebarProps = {
  items: SettingsSidebarItem[];
  active: SettingsSectionKey;
  onChange: (next: SettingsSectionKey) => void;
};

const ICON_MAP: Record<SettingsSectionKey, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  general: SettingsIcon,
  engine: Play,
  appearance: Sun,
  updates: Download,
  alerts: AlertTriangle,
  account: User,
  advanced: Bug,
};

export function SettingsSidebar({ items, active, onChange }: SettingsSidebarProps) {
  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-col gap-0.5 w-[200px] flex-shrink-0"
      role="tablist"
    >
      {items.map((item) => {
        const Icon = ICON_MAP[item.key];
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex items-center gap-2.5 px-3 py-2 rounded-[var(--dp-radius-sm)] text-left",
              "font-mono text-[12px] tracking-[0.02em] transition-colors",
              isActive
                ? "bg-[color:var(--dp-accent-soft)] text-[color:var(--dp-accent)]"
                : "text-[color:var(--dp-text-dim)] hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text)]",
            )}
          >
            <Icon size={13} strokeWidth={1.7} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
