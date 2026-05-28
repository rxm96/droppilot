import * as React from "react";
import type { ThemePreference } from "@renderer/shared/theme";
import type { UpdateChannel } from "../../../shared/updateChannels";
import { SettingsSidebar, type SettingsSectionKey } from "./SettingsSidebar";
import { useSettingsViewState } from "./useSettingsViewState";
import { GeneralSection } from "./sections/GeneralSection";
import { EngineSection } from "./sections/EngineSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { UpdatesSection } from "./sections/UpdatesSection";
import { AlertsSection } from "./sections/AlertsSection";
import { AccountSection } from "./sections/AccountSection";
import { AdvancedSection } from "./sections/AdvancedSection";
import { useI18n } from "@renderer/shared/i18n";

type SettingsProps = {
  isLinked: boolean;
  language: "de" | "en";
  setLanguage: (val: "de" | "en") => void;
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  accent: string | null;
  setAccent: (val: string | null) => void;
  fontPair: import("@renderer/shared/fontPairs").FontPairId;
  setFontPair: (val: import("@renderer/shared/fontPairs").FontPairId) => void;
  autoStart: boolean;
  setAutoStart: (val: boolean) => void;
  autoClaim: boolean;
  setAutoClaim: (val: boolean) => void;
  autoSelect: boolean;
  setAutoSelect: (val: boolean) => void;
  autoSwitchEnabled: boolean;
  setAutoSwitchEnabled: (val: boolean) => void;
  warmupEnabled: boolean;
  setWarmupEnabled: (val: boolean) => void;
  updateChannel: UpdateChannel;
  setUpdateChannel: (val: UpdateChannel) => void;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  debugEnabled: boolean;
  setDebugEnabled: (val: boolean) => void;
  alertsEnabled: boolean;
  setAlertsEnabled: (val: boolean) => void;
  alertsNotifyWhileFocused: boolean;
  setAlertsNotifyWhileFocused: (val: boolean) => void;
  alertsDropClaimed: boolean;
  setAlertsDropClaimed: (val: boolean) => void;
  alertsDropEndingSoon: boolean;
  setAlertsDropEndingSoon: (val: boolean) => void;
  alertsDropEndingMinutes: number;
  setAlertsDropEndingMinutes: (val: number) => void;
  alertsWatchError: boolean;
  setAlertsWatchError: (val: boolean) => void;
  alertsAutoSwitch: boolean;
  setAlertsAutoSwitch: (val: boolean) => void;
  alertsNewDrops: boolean;
  setAlertsNewDrops: (val: boolean) => void;
  enableBadgesEmotes: boolean;
  setEnableBadgesEmotes: (val: boolean) => void;
  allowUnlinkedGames: boolean;
  setAllowUnlinkedGames: (val: boolean) => void;
  closeToTray: boolean;
  setCloseToTray: (val: boolean) => void;
  minimizeToTray: boolean;
  setMinimizeToTray: (val: boolean) => void;
  sendTestAlert: () => void;
  refreshMinMs: number;
  refreshMaxMs: number;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => void;
  importSettings: () => void;
  settingsInfo?: string | null;
  settingsError?: string | null;
  showUpdateCheck?: boolean;
  showAutoStart?: boolean;
  checkUpdates?: () => void;
  downloadUpdate?: () => void;
  installUpdate?: () => void;
  updateStatus?: {
    state:
      | "idle"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "none"
      | "error"
      | "unsupported";
    message?: string;
    version?: string;
    progress?: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
  };
};

export function SettingsView(props: SettingsProps) {
  const { t } = useI18n();
  const { active, setActive } = useSettingsViewState("general");

  const items: { key: SettingsSectionKey; label: string }[] = [
    { key: "general", label: t("settings.section.general.sidebar") },
    { key: "engine", label: t("settings.section.engine.sidebar") },
    { key: "appearance", label: t("settings.section.appearance.sidebar") },
    ...(props.showUpdateCheck ? [{ key: "updates" as SettingsSectionKey, label: t("settings.section.updates.sidebar") }] : []),
    { key: "alerts", label: t("settings.section.alerts.sidebar") },
    { key: "account", label: t("settings.section.account.sidebar") },
    { key: "advanced", label: t("settings.section.advanced.sidebar") },
  ];

  const sectionTitle: Record<SettingsSectionKey, string> = {
    general: t("settings.section.general"),
    engine: t("settings.section.engine"),
    appearance: t("settings.section.appearance"),
    updates: t("settings.section.updates"),
    alerts: t("settings.section.alerts"),
    account: t("settings.section.account"),
    advanced: t("settings.section.advanced"),
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[color:var(--dp-text)] leading-tight">
          {t("settings.pageTitle")}
        </h2>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--dp-text-dimmer)] mt-1">
          {sectionTitle[active]}
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <SettingsSidebar items={items} active={active} onChange={setActive} />

        <main className="flex-1 min-w-0 rounded-[var(--dp-radius-lg)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-6 py-5">
          {active === "general" && (
            <GeneralSection
              language={props.language}
              setLanguage={props.setLanguage}
              demoMode={props.demoMode}
              setDemoMode={props.setDemoMode}
              sendTestAlert={props.sendTestAlert}
            />
          )}
          {active === "engine" && (
            <EngineSection
              autoStart={props.autoStart}
              setAutoStart={props.setAutoStart}
              showAutoStart={props.showAutoStart}
              autoClaim={props.autoClaim}
              setAutoClaim={props.setAutoClaim}
              autoSelect={props.autoSelect}
              setAutoSelect={props.setAutoSelect}
              autoSwitchEnabled={props.autoSwitchEnabled}
              setAutoSwitchEnabled={props.setAutoSwitchEnabled}
              warmupEnabled={props.warmupEnabled}
              setWarmupEnabled={props.setWarmupEnabled}
              refreshMinMs={props.refreshMinMs}
              refreshMaxMs={props.refreshMaxMs}
              setRefreshIntervals={props.setRefreshIntervals}
              resetAutomation={props.resetAutomation}
              closeToTray={props.closeToTray}
              setCloseToTray={props.setCloseToTray}
              minimizeToTray={props.minimizeToTray}
              setMinimizeToTray={props.setMinimizeToTray}
            />
          )}
          {active === "appearance" && (
            <AppearanceSection
              theme={props.theme}
              setTheme={props.setTheme}
              enableBadgesEmotes={props.enableBadgesEmotes}
              setEnableBadgesEmotes={props.setEnableBadgesEmotes}
              accent={props.accent}
              setAccent={props.setAccent}
              fontPair={props.fontPair}
              setFontPair={props.setFontPair}
            />
          )}
          {active === "updates" && props.showUpdateCheck && (
            <UpdatesSection
              updateChannel={props.updateChannel}
              setUpdateChannel={props.setUpdateChannel}
              updateStatus={props.updateStatus}
              checkUpdates={props.checkUpdates}
              downloadUpdate={props.downloadUpdate}
              installUpdate={props.installUpdate}
            />
          )}
          {active === "alerts" && (
            <AlertsSection
              alertsEnabled={props.alertsEnabled}
              setAlertsEnabled={props.setAlertsEnabled}
              alertsNotifyWhileFocused={props.alertsNotifyWhileFocused}
              setAlertsNotifyWhileFocused={props.setAlertsNotifyWhileFocused}
              alertsDropClaimed={props.alertsDropClaimed}
              setAlertsDropClaimed={props.setAlertsDropClaimed}
              alertsDropEndingSoon={props.alertsDropEndingSoon}
              setAlertsDropEndingSoon={props.setAlertsDropEndingSoon}
              alertsDropEndingMinutes={props.alertsDropEndingMinutes}
              setAlertsDropEndingMinutes={props.setAlertsDropEndingMinutes}
              alertsWatchError={props.alertsWatchError}
              setAlertsWatchError={props.setAlertsWatchError}
              alertsAutoSwitch={props.alertsAutoSwitch}
              setAlertsAutoSwitch={props.setAlertsAutoSwitch}
              alertsNewDrops={props.alertsNewDrops}
              setAlertsNewDrops={props.setAlertsNewDrops}
            />
          )}
          {active === "account" && (
            <AccountSection
              isLinked={props.isLinked}
              allowUnlinkedGames={props.allowUnlinkedGames}
              setAllowUnlinkedGames={props.setAllowUnlinkedGames}
            />
          )}
          {active === "advanced" && (
            <AdvancedSection
              debugEnabled={props.debugEnabled}
              setDebugEnabled={props.setDebugEnabled}
              settingsJson={props.settingsJson}
              setSettingsJson={props.setSettingsJson}
              exportSettings={props.exportSettings}
              importSettings={props.importSettings}
              settingsInfo={props.settingsInfo}
              settingsError={props.settingsError}
            />
          )}
        </main>
      </div>
    </div>
  );
}
