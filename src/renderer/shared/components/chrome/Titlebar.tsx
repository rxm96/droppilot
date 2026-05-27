import * as React from "react";
import { Logo } from "@renderer/shared/components/Logo";
import { Pill } from "@renderer/shared/components/ui/pill";
import { Sun, Moon, Settings, Minus, Square, X } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";

export type TitlebarTheme = "light" | "dark";

export type TitlebarProps = {
  title?: string;
  version?: string;
  theme: TitlebarTheme;
  onThemeToggle: () => void;
  onSettingsClick?: () => void;

  /** Connection / API status pills shown center-right. */
  connectionState?: "connected" | "disconnected" | "connecting";
  apiLatencyMs?: number;

  /** Window action handler (null = Windows-native chrome handled elsewhere). */
  onWindowAction?: (action: "minimize" | "maximize" | "close") => void;
  className?: string;
};

export function Titlebar({
  title = "droppilot",
  version,
  theme,
  onThemeToggle,
  onSettingsClick,
  connectionState,
  apiLatencyMs,
  onWindowAction,
  className,
}: TitlebarProps) {
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-3.5 border-b border-[color:var(--dp-border)] bg-[color:var(--dp-bg-chrome)] px-3.5",
        "app-drag",
        className,
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2">
        <Logo size={14} />
        <span className="font-mono text-[11px] font-semibold tracking-[0.04em] text-[color:var(--dp-text)]">
          {title}
        </span>
        {version && (
          <>
            <span className="text-[color:var(--dp-text-dimmer)] opacity-40">·</span>
            <span className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
              v{version}
            </span>
          </>
        )}
      </div>

      {/* Center/right status */}
      <div
        className="ml-auto flex items-center gap-2"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {connectionState && (
          <Pill
            tone={
              connectionState === "connected"
                ? "ok"
                : connectionState === "connecting"
                  ? "warn"
                  : "err"
            }
            dot
          >
            {connectionState}
          </Pill>
        )}
        {typeof apiLatencyMs === "number" && <Pill tone="dim">api {apiLatencyMs}ms</Pill>}

        {/* Icon actions — same size + tone as window controls */}
        <button
          type="button"
          onClick={onThemeToggle}
          aria-label={`Toggle theme (current: ${theme})`}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] transition-colors hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text-dim)]"
        >
          {theme === "dark" ? (
            <Moon size={13} strokeWidth={1.7} />
          ) : (
            <Sun size={13} strokeWidth={1.7} />
          )}
        </button>
        {onSettingsClick && (
          <button
            type="button"
            onClick={onSettingsClick}
            aria-label="Open settings"
            className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] transition-colors hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text-dim)]"
          >
            <Settings size={13} strokeWidth={1.7} />
          </button>
        )}

        {/* Window controls — same visual weight as icon actions, no dedicated "button" look */}
        {onWindowAction && (
          <div className="ml-1 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onWindowAction("minimize")}
              aria-label="Minimize"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] transition-colors hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text-dim)]"
            >
              <Minus size={13} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              onClick={() => onWindowAction("maximize")}
              aria-label="Maximize"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] transition-colors hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text-dim)]"
            >
              <Square size={11} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              onClick={() => onWindowAction("close")}
              aria-label="Close"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] transition-colors hover:bg-[rgba(248,113,113,0.18)] hover:text-[color:var(--dp-signal-err)]"
            >
              <X size={13} strokeWidth={1.7} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
