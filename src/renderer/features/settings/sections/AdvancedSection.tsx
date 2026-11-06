import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { useI18n } from "@renderer/shared/i18n";
import { ResetStatsButton } from "../ResetStatsButton";
import { SettingRow } from "../SettingRow";
import { SettingsPanel } from "../SettingsPanel";
import { SettingsToggle } from "../SettingsToggle";

export type AdvancedSectionProps = {
  id: string;
  debugEnabled: boolean;
  setDebugEnabled: (val: boolean) => void;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => void;
  importSettings: () => void;
  /** i18n key (or plain message) from the settings store. */
  settingsInfo?: string | null;
  /** i18n key or an error message; `t` passes unknown keys through. */
  settingsError?: string | null;
  resetAutomation: () => void;
  resetStats: () => void;
};

/** Debug view, demo mode, settings backup and the two resets. */
export function AdvancedSection(props: AdvancedSectionProps) {
  const { t } = useI18n();
  const { setSettingsJson } = props;

  // The Settings-JSON preview is a snapshot taken at store load. UI prefs
  // (theme/accent/font) persist directly via IPC and bypass the settings
  // store, so re-read the live on-disk settings whenever this page opens —
  // otherwise the preview looks stale (e.g. accent / uiPrefsMigrated missing).
  React.useEffect(() => {
    let cancelled = false;
    void window.electronAPI?.settings?.get?.().then((s) => {
      if (!cancelled && s) setSettingsJson(JSON.stringify(s, null, 2));
    });
    return () => {
      cancelled = true;
    };
  }, [setSettingsJson]);

  return (
    <SettingsPanel id={props.id} title={t("settings.section.advanced")}>
      <SettingRow
        label={t("settings.row.debugView.label")}
        description={t("settings.row.debugView.description")}
        control={
          <SettingsToggle
            checked={props.debugEnabled}
            onChange={props.setDebugEnabled}
            ariaLabel={t("settings.row.debugView.label")}
          />
        }
      />
      <SettingRow
        label={t("settings.demoMode")}
        description={t("settings.row.demoMode.description")}
        control={
          <SettingsToggle
            checked={props.demoMode}
            onChange={props.setDemoMode}
            ariaLabel={t("settings.demoMode")}
          />
        }
      />
      <SettingRow
        label={t("settings.row.settingsJson.label")}
        description={t("settings.row.settingsJson.description")}
        control={
          <>
            <Button variant="dp-outline" size="dp-md" onClick={props.exportSettings}>
              {t("settings.button.export")}
            </Button>
            <Button variant="dp-outline" size="dp-md" onClick={props.importSettings}>
              {t("settings.button.import")}
            </Button>
          </>
        }
      >
        <textarea
          value={props.settingsJson}
          onChange={(e) => props.setSettingsJson(e.target.value)}
          spellCheck={false}
          aria-label={t("settings.row.settingsJson.label")}
          className="mt-3 h-[160px] w-full resize-y rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-app)] px-3 py-2 font-mono text-[11px] text-[color:var(--dp-text)] focus-visible:border-[color:var(--dp-accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-accent)]"
        />
        {props.settingsInfo && (
          <div className="mt-2 font-mono text-[11px] text-[color:var(--dp-signal-ok)]">
            {t(props.settingsInfo)}
          </div>
        )}
        {props.settingsError && (
          <div className="mt-2 font-mono text-[11px] text-[color:var(--dp-signal-err)]">
            {t(props.settingsError)}
          </div>
        )}
      </SettingRow>
      <SettingRow
        label={t("settings.row.resetAutomation.label")}
        description={t("settings.row.resetAutomation.description")}
        control={
          <Button variant="dp-outline" size="dp-md" onClick={props.resetAutomation}>
            {t("settings.button.reset")}
          </Button>
        }
      />
      <SettingRow
        label={t("settings.row.resetStats.label")}
        description={t("settings.row.resetStats.description")}
        control={<ResetStatsButton onReset={props.resetStats} />}
      />
    </SettingsPanel>
  );
}
