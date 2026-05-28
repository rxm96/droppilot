import * as React from "react";
import { Logo } from "@renderer/shared/components/Logo";
import { Pill } from "@renderer/shared/components/ui/pill";
import { Sun, Moon, Settings, Minus, Square, X } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { useI18n } from "@renderer/shared/i18n";

export type TitlebarTheme = "light" | "dark";

export type TitlebarProps = {
  title?: string;
  theme: TitlebarTheme;
  onThemeToggle: () => void;
  onSettingsClick?: () => void;

  /** Connection / API status pills shown center-right. */
  connectionState?: "connected" | "disconnected" | "connecting";
  apiLatencyMs?: number;

  /** When false, the min/max/close window controls aren't rendered (e.g. macOS uses native chrome). */
  showWindowControls?: boolean;

  className?: string;
};

const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

export function Titlebar({
  title = "droppilot",
  theme,
  onThemeToggle,
  onSettingsClick,
  connectionState,
  apiLatencyMs,
  showWindowControls = true,
  className,
}: TitlebarProps) {
  const { t } = useI18n();
  const [isMaximized, setIsMaximized] = React.useState(false);

  // Subscribe to OS-level maximize/unmaximize so the maximize/restore icon swaps
  // when the user double-clicks the titlebar, uses snap zones, or presses
  // Win+Up/Win+Down. Also fetch initial state once.
  React.useEffect(() => {
    if (!showWindowControls) return;
    const api = window.electronAPI?.app;
    if (!api) return;
    let cancelled = false;
    api.isMaximized().then((res: { ok: boolean; isMaximized?: boolean }) => {
      if (!cancelled && res?.ok) setIsMaximized(!!res.isMaximized);
    });
    const unsubscribe = api.onMaximizedChange((payload: { isMaximized: boolean }) => {
      setIsMaximized(payload.isMaximized);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [showWindowControls]);

  const sendWindowControl = React.useCallback(
    (action: "minimize" | "maximize" | "restore" | "close") => {
      window.electronAPI?.app?.windowControl(action);
    },
    [],
  );

  const handleMaxRestore = React.useCallback(() => {
    sendWindowControl(isMaximized ? "restore" : "maximize");
  }, [isMaximized, sendWindowControl]);

  return (
    <div
      className={cn(
        "flex h-9 items-center gap-3.5 border-b border-[color:var(--dp-border)] bg-[color:var(--dp-bg-chrome)] pl-3.5",
        // Pad-right is small when we draw our own controls (they bring their own width).
        // When showWindowControls is off (macOS uses native traffic lights on the LEFT,
        // not the right) keep a small uniform pad-right.
        showWindowControls ? "pr-1" : "pr-3.5",
        "app-drag",
        className,
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2">
        <Logo size={18} animated />
        <span className="font-mono text-[11px] font-medium tracking-[0.04em] text-[color:var(--dp-text-dim)]">
          {title}
        </span>
      </div>

      {/* Center/right status */}
      <div className="ml-auto flex items-center gap-2" style={noDrag}>
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

        {/* Icon actions: theme + settings */}
        <button
          type="button"
          onClick={onThemeToggle}
          aria-label={t("chrome.window.themeToggle")}
          title={t("chrome.window.themeToggle")}
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
            aria-label={t("chrome.window.openSettings")}
            title={t("chrome.window.openSettings")}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--dp-radius-xs)] text-[color:var(--dp-text-dimmer)] transition-colors hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text-dim)]"
          >
            <Settings size={13} strokeWidth={1.7} />
          </button>
        )}

        {/* Window controls (Windows / Linux only). macOS uses native traffic lights.
            self-stretch overrides the parent's items-center so this wrapper
            spans the full 36px titlebar height; each button below then uses
            h-full to render a proper 46x36 hit-target like the OS controls. */}
        {showWindowControls && (
          <div className="flex items-stretch self-stretch ml-1.5 -mr-1" style={noDrag}>
            <WindowButton
              ariaLabel={t("chrome.window.minimize")}
              onClick={() => sendWindowControl("minimize")}
            >
              <Minus size={13} strokeWidth={1.7} />
            </WindowButton>
            <WindowButton
              ariaLabel={isMaximized ? t("chrome.window.restore") : t("chrome.window.maximize")}
              onClick={handleMaxRestore}
            >
              {/* Always the single-square (windowed) glyph for visual consistency —
                  the button still toggles maximize/restore; only the label changes. */}
              <Square size={11} strokeWidth={1.8} />
            </WindowButton>
            <WindowButton
              ariaLabel={t("chrome.window.close")}
              onClick={() => sendWindowControl("close")}
              danger
            >
              <X size={14} strokeWidth={1.8} />
            </WindowButton>
          </div>
        )}
      </div>
    </div>
  );
}

type WindowButtonProps = {
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
  /** Red hover treatment for the close button (Windows convention). */
  danger?: boolean;
};

function WindowButton({ ariaLabel, onClick, children, danger }: WindowButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "flex h-full w-[46px] items-center justify-center text-[color:var(--dp-text-dim)] transition-colors",
        danger
          ? "hover:bg-[#e81123] hover:text-white"
          : "hover:bg-[color:var(--dp-bg-elevated)] hover:text-[color:var(--dp-text)]",
      )}
    >
      {children}
    </button>
  );
}
