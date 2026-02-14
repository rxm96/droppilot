import { AppContent, Hero, TitleBar, UpdateOverlay } from "@renderer/shared/components";
import { useAppModel } from "@renderer/shared/hooks";
import { I18nProvider } from "@renderer/shared/i18n";

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
