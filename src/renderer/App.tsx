import * as React from "react";
import { AppContent, UpdateOverlay } from "@renderer/shared/components";
import { Titlebar } from "@renderer/shared/components/chrome/Titlebar";
import { AppNav, type AppNavItem } from "@renderer/shared/components/chrome/AppNav";
import { AutopilotChip } from "@renderer/shared/components/chrome/AutopilotChip";
import { SessionExpiredBanner } from "@renderer/shared/components/chrome/SessionExpiredBanner";
import { Statusbar } from "@renderer/shared/components/chrome/Statusbar";
import { Button } from "@renderer/shared/components/ui/button";
import { Settings } from "@renderer/shared/lib/icons";
import { cn } from "@renderer/shared/lib/utils";
import { useAppModel } from "@renderer/shared/hooks";
import { I18nProvider, useI18n } from "@renderer/shared/i18n";
import { DevPrimitivesView } from "@renderer/features/dev-primitives";
import { formatRelative } from "@renderer/features/overview/formatters";
import { TimeText } from "@renderer/shared/components/TimeText";

function App() {
  const model = useAppModel();

  // Dev-only primitives showcase. Phase 1 introduced this route.
  if (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.location.hash === "#dev-primitives"
  ) {
    return (
      <I18nProvider language={model.language}>
        <DevPrimitivesView />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={model.language}>
      <AppShell model={model} />
    </I18nProvider>
  );
}

type Model = ReturnType<typeof useAppModel>;

function AppShell({ model }: { model: Model }) {
  const { t } = useI18n();
  const {
    isMac,
    titleBarProps,
    navProps,
    overviewProps,
    statusbarProps,
    statsProps,
    inventoryProps,
    priorityProps,
    settingsProps,
    debugSnapshot,
    debugEnabled,
    updateOverlayProps,
  } = model;

  const {
    theme: titleBarTheme,
    setTheme: titleBarSetTheme,
    version: titleBarVersion,
  } = titleBarProps;

  // Resolve theme: titleBarProps.theme may be "system" — coerce to the rendered light/dark.
  const resolvedTheme: "light" | "dark" = React.useMemo(() => {
    if (titleBarTheme === "dark") return "dark";
    if (titleBarTheme === "light") return "light";
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "light";
  }, [titleBarTheme]);

  const toggleTheme = React.useCallback(() => {
    titleBarSetTheme((current) => (current === "dark" ? "light" : "dark"));
  }, [titleBarSetTheme]);

  const { setView, dropsNeedingYou } = navProps;
  const openSettings = React.useCallback(() => setView("settings"), [setView]);

  // Tabs: overview · drops · games · stats (+ debug when enabled). The view
  // keys stay inventory/priorities; only the labels changed. Settings is the
  // gear in the right slot.
  const navItems: AppNavItem[] = React.useMemo(() => {
    const base: AppNavItem[] = [
      { key: "overview", label: t("nav.overview") },
      {
        key: "inventory",
        label: t("nav.drops"),
        badge: dropsNeedingYou,
        badgeLabel: t("nav.dropsNeedYou", { count: dropsNeedingYou }),
      },
      { key: "priorities", label: t("nav.games") },
      { key: "stats", label: t("nav.stats") },
    ];
    if (debugEnabled) base.push({ key: "debug", label: t("nav.debug") });
    return base;
  }, [debugEnabled, dropsNeedingYou, t]);

  // Right slot: autopilot chip, settings gear, account.
  const navRight = React.useMemo(() => {
    const linked = navProps.auth.status === "ok" || navProps.demoMode;
    const ready = navProps.profile.status === "ready" ? navProps.profile : null;
    const settingsActive = navProps.view === "settings";
    return (
      <>
        <AutopilotChip state={navProps.autopilotState} onToggle={navProps.toggleAutopilot} />
        <button
          type="button"
          onClick={openSettings}
          aria-label={t("chrome.window.openSettings")}
          aria-current={settingsActive ? "page" : undefined}
          title={t("chrome.window.openSettings")}
          className={cn(
            "grid h-[30px] w-[30px] place-items-center rounded-[var(--dp-radius-md)] border transition-colors hover:bg-[color:var(--dp-bg-elevated-2)]",
            settingsActive
              ? "border-[color:var(--dp-accent)] text-[color:var(--dp-accent)]"
              : "border-[color:var(--dp-border)] text-[color:var(--dp-text-dim)] hover:text-[color:var(--dp-text)]",
          )}
        >
          <Settings size={14} strokeWidth={1.7} />
        </button>
        {linked && ready ? (
          <span className="pl-1.5 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {ready.displayName}
          </span>
        ) : (
          <Button
            variant="dp-primary"
            size="dp-sm"
            onClick={navProps.startLogin}
            disabled={navProps.auth.status === "pending"}
          >
            {navProps.auth.status === "pending" ? t("session.login") : t("session.loginBrowser")}
          </Button>
        )}
      </>
    );
  }, [navProps, openSettings, t]);

  // Statusbar: a user pause wins over the decision-derived label, so the
  // statusbar turns amber together with the chip.
  const engineLabel = React.useMemo(() => {
    if (statusbarProps.autopilotState === "paused") return t("statusbar.engine.paused");
    const d = statusbarProps.decision;
    if (d === "watching-progress" || d === "watching-recover") return t("statusbar.engine.running");
    if (d === "watching-no-farmable" || d === "watching-no-watchable")
      return t("statusbar.engine.standby");
    if (d === "suppressed" || d === "cooldown") return t("statusbar.engine.paused");
    return t("statusbar.engine.idle");
  }, [statusbarProps.autopilotState, statusbarProps.decision, t]);

  const engineTone =
    statusbarProps.autopilotState === "paused"
      ? "warn"
      : statusbarProps.decision === "watching-progress" ||
          statusbarProps.decision === "watching-recover"
        ? "ok"
        : statusbarProps.decision === "suppressed"
          ? "warn"
          : "dim";

  return (
    // h-screen + overflow-hidden locks the outer shell to the viewport so the
    // chrome strips (Titlebar / AppNav / Statusbar) stay fixed in place.
    // The middle content area is the actual scroll container (see below).
    <div
      className="h-screen overflow-hidden flex flex-col"
      style={{ background: "var(--dp-bg-app)", color: "var(--dp-text)" }}
    >
      {!isMac && (
        <Titlebar
          title="droppilot"
          theme={resolvedTheme}
          onThemeToggle={toggleTheme}
          updateStatus={titleBarProps.updateStatus}
          onDownloadUpdate={titleBarProps.onDownloadUpdate}
          onInstallUpdate={titleBarProps.onInstallUpdate}
        />
      )}
      <UpdateOverlay {...updateOverlayProps} />
      <AppNav view={navProps.view} onChange={setView} items={navItems} right={navRight} />
      {/* On overview the needs-you panel carries the re-login prompt. */}
      {navProps.view !== "overview" && (
        <SessionExpiredBanner auth={navProps.auth} onRelogin={navProps.startLogin} />
      )}
      {/* min-h-0 is critical: flex children default to min-height:auto which
          would prevent the inner content from shrinking below its intrinsic
          height, so overflow-y-auto would never engage. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <AppContent
          navProps={navProps}
          overviewProps={overviewProps}
          statsProps={statsProps}
          inventoryProps={inventoryProps}
          priorityProps={priorityProps}
          settingsProps={settingsProps}
          debugSnapshot={debugSnapshot}
          debugEnabled={debugEnabled}
        />
      </div>
      <Statusbar
        left={[
          { tone: engineTone, label: engineLabel },
          {
            label: `drops · ${statusbarProps.claimedDrops}/${statusbarProps.totalDrops}`,
          },
          {
            label: (
              <TimeText
                intervalMs={5000}
                render={(now) => `last sync · ${formatRelative(statusbarProps.lastWatchOk, now)}`}
              />
            ),
          },
        ]}
        right={[{ label: `v${titleBarVersion ?? "—"}` }]}
      />
    </div>
  );
}

export default App;
