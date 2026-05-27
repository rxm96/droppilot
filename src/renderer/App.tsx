import { AppContent, Hero, TitleBar, UpdateOverlay } from "@renderer/shared/components";
import { useAppModel } from "@renderer/shared/hooks";
import { I18nProvider } from "@renderer/shared/i18n";
import { DevPrimitivesView } from "@renderer/features/dev-primitives";

function App() {
  const {
    language,
    isMac,
    heroProps,
    titleBarProps,
    updateOverlayProps,
    navProps,
    overviewProps,
    inventoryProps,
    priorityProps,
    settingsProps,
    controlProps,
    debugSnapshot,
    debugEnabled,
  } = useAppModel();

  // Dev-only primitives showcase. Open with #dev-primitives in the URL.
  // Lives outside the normal View enum so it never appears in the nav
  // or i18n tables — it is purely for engineering preview.
  if (import.meta.env.DEV && typeof window !== "undefined" && window.location.hash === "#dev-primitives") {
    return (
      <I18nProvider language={language}>
        <DevPrimitivesView />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={language}>
      <div className="window-shell">
        {!isMac && <TitleBar {...titleBarProps} />}
        <UpdateOverlay {...updateOverlayProps} />
        <div className="app-shell">
          <Hero {...heroProps} />

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
      </div>
    </I18nProvider>
  );
}

export default App;
