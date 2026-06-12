import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";
import type { AppSettings, SettingsSetter } from "../../../../shared/settingsSchema";
import { useI18n } from "@renderer/shared/i18n";

export type EngineSectionProps = {
  settings: AppSettings;
  setSetting: SettingsSetter;
  showAutoStart?: boolean;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
};

export function EngineSection(props: EngineSectionProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col">
      {props.showAutoStart && (
        <>
          <SectionLabel>{t("settings.subsection.appLifecycle")}</SectionLabel>
          <SettingRow
            label={t("settings.row.autoStart.label")}
            description={t("settings.row.autoStart.description")}
            control={
              <SettingsToggle
                checked={props.settings.autoStart}
                onChange={(v) => props.setSetting("autoStart", v)}
              />
            }
          />
          <SettingRow
            divided
            label={t("settings.row.closeToTray.label")}
            description={t("settings.row.closeToTray.description")}
            control={
              <SettingsToggle
                checked={props.settings.closeToTray}
                onChange={(v) => props.setSetting("closeToTray", v)}
              />
            }
          />
          <SettingRow
            divided
            label={t("settings.row.minimizeToTray.label")}
            description={t("settings.row.minimizeToTray.description")}
            control={
              <SettingsToggle
                checked={props.settings.minimizeToTray}
                onChange={(v) => props.setSetting("minimizeToTray", v)}
              />
            }
          />
        </>
      )}

      <div className={props.showAutoStart ? "mt-6" : undefined}>
        <SectionLabel>{t("settings.subsection.automation")}</SectionLabel>
        <SettingRow
          label={t("settings.autoClaim")}
          description={t("settings.autoClaimHint")}
          control={
            <SettingsToggle
              checked={props.settings.autoClaim}
              onChange={(v) => props.setSetting("autoClaim", v)}
            />
          }
        />
        <SettingRow
          divided
          label={t("settings.autoSelect")}
          description={t("settings.autoSelectHint")}
          control={
            <SettingsToggle
              checked={props.settings.autoSelect}
              onChange={(v) => props.setSetting("autoSelect", v)}
            />
          }
        />
        <SettingRow
          divided
          label={t("settings.autoSwitch")}
          description={t("settings.autoSwitchHint")}
          control={
            <SettingsToggle
              checked={props.settings.autoSwitch}
              onChange={(v) => props.setSetting("autoSwitch", v)}
            />
          }
        />
        <SettingRow
          divided
          label={t("settings.warmup")}
          description={t("settings.warmupHint")}
          control={
            <SettingsToggle
              checked={props.settings.warmupEnabled}
              onChange={(v) => props.setSetting("warmupEnabled", v)}
            />
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.refreshCadence")}</SectionLabel>
        <SettingRow
          label={t("settings.row.refreshInterval.label")}
          description={t("settings.row.refreshInterval.description")}
          control={
            <div className="flex items-center gap-2">
              <Input
                tone="dp"
                type="number"
                min={5}
                value={Math.round(props.settings.refreshMinMs / 1000)}
                onChange={(e) => {
                  const min = Math.max(5, Number(e.target.value) || 0) * 1000;
                  props.setRefreshIntervals(min, Math.max(min, props.settings.refreshMaxMs));
                }}
                aria-label={t("settings.aria.minIntervalSeconds")}
                className="w-20"
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                {t("settings.unit.to")}
              </span>
              <Input
                tone="dp"
                type="number"
                min={5}
                value={Math.round(props.settings.refreshMaxMs / 1000)}
                onChange={(e) => {
                  const max = Math.max(5, Number(e.target.value) || 0) * 1000;
                  props.setRefreshIntervals(Math.min(max, props.settings.refreshMinMs), max);
                }}
                aria-label={t("settings.aria.maxIntervalSeconds")}
                className="w-20"
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                {t("settings.unit.sec")}
              </span>
            </div>
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.dangerZone")}</SectionLabel>
        <SettingRow
          label={t("settings.row.resetAutomation.label")}
          description={t("settings.row.resetAutomation.description")}
          control={
            <Button variant="dp-outline" size="dp-md" onClick={props.resetAutomation}>
              {t("settings.button.reset")}
            </Button>
          }
        />
      </div>
    </div>
  );
}
