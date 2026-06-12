import * as React from "react";
import type { ThemePreference } from "@renderer/shared/theme";
import type { AppSettings, SettingsSetter } from "../../../shared/settingsSchema";
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
  onLogout: () => void;
  onLogin: () => void;
  settings: AppSettings;
  setSetting: SettingsSetter;
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  accent: string | null;
  setAccent: (val: string | null) => void;
  fontPair: import("@renderer/shared/fontPairs").FontPairId;
  setFontPair: (val: import("@renderer/shared/fontPairs").FontPairId) => void;
  sendTestAlert: () => void;
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
    ...(props.showUpdateCheck
      ? [{ key: "updates" as SettingsSectionKey, label: t("settings.section.updates.sidebar") }]
      : []),
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
              settings={props.settings}
              setSetting={props.setSetting}
              sendTestAlert={props.sendTestAlert}
            />
          )}
          {active === "engine" && (
            <EngineSection
              settings={props.settings}
              setSetting={props.setSetting}
              showAutoStart={props.showAutoStart}
              setRefreshIntervals={props.setRefreshIntervals}
              resetAutomation={props.resetAutomation}
            />
          )}
          {active === "appearance" && (
            <AppearanceSection
              theme={props.theme}
              setTheme={props.setTheme}
              accent={props.accent}
              setAccent={props.setAccent}
              fontPair={props.fontPair}
              setFontPair={props.setFontPair}
              settings={props.settings}
              setSetting={props.setSetting}
            />
          )}
          {active === "updates" && props.showUpdateCheck && (
            <UpdatesSection
              settings={props.settings}
              setSetting={props.setSetting}
              updateStatus={props.updateStatus}
              checkUpdates={props.checkUpdates}
              downloadUpdate={props.downloadUpdate}
              installUpdate={props.installUpdate}
            />
          )}
          {active === "alerts" && (
            <AlertsSection settings={props.settings} setSetting={props.setSetting} />
          )}
          {active === "account" && (
            <AccountSection
              isLinked={props.isLinked}
              onLogout={props.onLogout}
              onLogin={props.onLogin}
              settings={props.settings}
              setSetting={props.setSetting}
            />
          )}
          {active === "advanced" && (
            <AdvancedSection
              settings={props.settings}
              setSetting={props.setSetting}
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
