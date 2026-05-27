import * as React from "react";
import { AppContent, UpdateOverlay } from "@renderer/shared/components";
import { Titlebar } from "@renderer/shared/components/chrome/Titlebar";
import { AppNav, type AppNavItem } from "@renderer/shared/components/chrome/AppNav";
import { Statusbar } from "@renderer/shared/components/chrome/Statusbar";
import { Button } from "@renderer/shared/components/ui/button";
import { useAppModel } from "@renderer/shared/hooks";
import { I18nProvider, useI18n } from "@renderer/shared/i18n";
import { DevPrimitivesView } from "@renderer/features/dev-primitives";
import { formatRelative } from "@renderer/features/overview/formatters";

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
    inventoryProps,
    priorityProps,
    settingsProps,
    controlProps,
    debugSnapshot,
    debugEnabled,
    updateOverlayProps,
  } = model;

  // Resolve theme: titleBarProps.theme may be "system" — coerce to the rendered light/dark.
  const resolvedTheme: "light" | "dark" = React.useMemo(() => {
    if (titleBarProps.theme === "dark") return "dark";
    if (titleBarProps.theme === "light") return "light";
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "light";
  }, [titleBarProps.theme]);

  const toggleTheme = React.useCallback(() => {
    titleBarProps.setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, [titleBarProps.setTheme]);

  const openSettings = React.useCallback(() => navProps.setView("settings"), [navProps]);

  const onWindowAction = React.useCallback((action: "minimize" | "maximize" | "close") => {
    window.electronAPI.app.windowControl(action);
  }, []);

  // AppNav items
  const navItems: AppNavItem[] = React.useMemo(() => {
    const base: AppNavItem[] = [
      { key: "overview", label: t("nav.overview") },
      { key: "inventory", label: t("nav.inventory") },
      { key: "control", label: t("nav.control") },
      { key: "priorities", label: t("nav.priorities") },
      { key: "settings", label: t("nav.settings") },
    ];
    if (debugEnabled) {
      const settingsIdx = base.findIndex((item) => item.key === "settings");
      base.splice(settingsIdx, 0, { key: "debug", label: t("nav.debug") });
    }
    return base;
  }, [debugEnabled, t]);

  // AppNav right slot — session indicator or sign-in button
  const sessionRight = React.useMemo(() => {
    const linked = navProps.auth.status === "ok";
    const ready = navProps.profile.status === "ready" ? navProps.profile : null;
    if (linked && ready) {
      return (
        <>
          <span>{ready.displayName}</span>
          <span style={{ color: "var(--dp-accent)" }}>●</span>
          <span>{t("session.connected").toLowerCase()}</span>
        </>
      );
    }
    return (
      <Button
        variant="dp-primary"
        size="dp-sm"
        onClick={navProps.startLogin}
        disabled={navProps.auth.status === "pending"}
      >
        {navProps.auth.status === "pending" ? t("session.login") : t("session.loginBrowser")}
      </Button>
    );
  }, [navProps.auth, navProps.profile, navProps.startLogin, t]);

  // Statusbar
  const engineLabel = React.useMemo(() => {
    const d = overviewProps.watchDecision;
    if (d === "watching-progress" || d === "watching-recover") return "engine: running";
    if (d === "suppressed" || d === "cooldown") return "engine: paused";
    if (d.startsWith("idle")) return "engine: idle";
    return `engine: ${d}`;
  }, [overviewProps.watchDecision]);

  const engineTone =
    overviewProps.watchDecision === "watching-progress" ||
    overviewProps.watchDecision === "watching-recover"
      ? "ok"
      : overviewProps.watchDecision === "suppressed"
        ? "warn"
        : "dim";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--dp-bg-app)", color: "var(--dp-text)" }}
    >
      {!isMac && (
        <Titlebar
          title="droppilot"
          version={titleBarProps.version}
          theme={resolvedTheme}
          onThemeToggle={toggleTheme}
          onSettingsClick={openSettings}
          onWindowAction={onWindowAction}
        />
      )}
      <UpdateOverlay {...updateOverlayProps} />
      <AppNav
        view={navProps.view}
        onChange={navProps.setView}
        items={navItems}
        right={sessionRight}
      />
      <div className="flex-1">
        <AppContent
          navProps={navProps}
          overviewProps={overviewProps}
          inventoryProps={inventoryProps}
          priorityProps={priorityProps}
          settingsProps={settingsProps}
          controlProps={controlProps}
          debugSnapshot={debugSnapshot}
          debugEnabled={debugEnabled}
        />
      </div>
      <Statusbar
        left={[
          { tone: engineTone, label: engineLabel },
          {
            label: `drops · ${overviewProps.claimedDrops}/${overviewProps.totalDrops}`,
          },
          { label: `last sync · ${formatRelative(overviewProps.lastWatchOk)}` },
        ]}
        right={[
          { label: `v${titleBarProps.version ?? "—"}` },
          { label: <span style={{ color: "var(--dp-accent)" }}>⌘K</span> },
        ]}
      />
    </div>
  );
}

export default App;
