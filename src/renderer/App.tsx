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

  const [now, setNow] = React.useState<number>(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

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
    if (d === "watching-progress" || d === "watching-recover") return t("statusbar.engine.running");
    if (d === "watching-no-farmable" || d === "watching-no-watchable")
      return t("statusbar.engine.standby");
    if (d === "suppressed" || d === "cooldown") return t("statusbar.engine.paused");
    if (d === "no-target") return t("statusbar.engine.idle");
    if (d.startsWith("idle")) return t("statusbar.engine.idle");
    return t("statusbar.engine.idle");
  }, [overviewProps.watchDecision, t]);

  const engineTone =
    overviewProps.watchDecision === "watching-progress" ||
    overviewProps.watchDecision === "watching-recover"
      ? "ok"
      : overviewProps.watchDecision === "suppressed"
        ? "warn"
        : "dim";

  const overviewPropsExtended = React.useMemo(
    () => ({
      ...overviewProps,
      onPause: controlProps.stopWatching,
      onSwitchTarget: () => navProps.setView("priorities"),
    }),
    [overviewProps, controlProps.stopWatching, navProps],
  );

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--dp-bg-app)", color: "var(--dp-text)" }}
    >
      {!isMac && (
        <Titlebar
          title="droppilot"
          version={titleBarVersion}
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
          overviewProps={overviewPropsExtended}
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
          { label: `last sync · ${formatRelative(overviewProps.lastWatchOk, now)}` },
        ]}
        right={[
          { label: `v${titleBarVersion ?? "—"}` },
          { label: <span style={{ color: "var(--dp-accent)" }}>⌘K</span> },
        ]}
      />
    </div>
  );
}

export default App;
