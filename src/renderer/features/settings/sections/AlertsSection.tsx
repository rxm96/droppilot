import * as React from "react";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";
import type { AppSettings, SettingsSetter } from "../../../../shared/settingsSchema";
import { useI18n } from "@renderer/shared/i18n";

export type AlertsSectionProps = {
  settings: AppSettings;
  setSetting: SettingsSetter;
};

export function AlertsSection(props: AlertsSectionProps) {
  const { t } = useI18n();
  const disabledByMaster = !props.settings.alertsEnabled;
  return (
    <div className="flex flex-col">
      <SectionLabel>{t("settings.subsection.masterSwitch")}</SectionLabel>
      <SettingRow
        label={t("settings.row.alertsEnabled.label")}
        description={t("settings.row.alertsEnabled.description")}
        control={
          <SettingsToggle
            checked={props.settings.alertsEnabled}
            onChange={(v) => props.setSetting("alertsEnabled", v)}
          />
        }
      />
      <SettingRow
        divided
        disabled={disabledByMaster}
        label={t("settings.row.alertsNotifyWhileFocused.label")}
        description={t("settings.row.alertsNotifyWhileFocused.description")}
        control={
          <SettingsToggle
            checked={props.settings.alertsNotifyWhileFocused}
            onChange={(v) => props.setSetting("alertsNotifyWhileFocused", v)}
            disabled={disabledByMaster}
          />
        }
      />

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.drops")}</SectionLabel>
        <SettingRow
          disabled={disabledByMaster}
          label={t("settings.row.alertsDropClaimed.label")}
          description={t("settings.row.alertsDropClaimed.description")}
          control={
            <SettingsToggle
              checked={props.settings.alertsDropClaimed}
              onChange={(v) => props.setSetting("alertsDropClaimed", v)}
              disabled={disabledByMaster}
            />
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster}
          label={t("settings.row.alertsDropEndingSoon.label")}
          description={t("settings.row.alertsDropEndingSoon.description")}
          control={
            <SettingsToggle
              checked={props.settings.alertsDropEndingSoon}
              onChange={(v) => props.setSetting("alertsDropEndingSoon", v)}
              disabled={disabledByMaster}
            />
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster || !props.settings.alertsDropEndingSoon}
          label={t("settings.row.alertsDropEndingMinutes.label")}
          description={t("settings.row.alertsDropEndingMinutes.description")}
          control={
            <div className="flex items-center gap-2">
              <Input
                tone="dp"
                type="number"
                min={1}
                value={props.settings.alertsDropEndingMinutes}
                onChange={(e) =>
                  props.setSetting(
                    "alertsDropEndingMinutes",
                    Math.max(1, Number(e.target.value) || 1),
                  )
                }
                disabled={disabledByMaster || !props.settings.alertsDropEndingSoon}
                aria-label={t("settings.aria.endingSoonMinutes")}
                className="w-24"
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                {t("settings.unit.min")}
              </span>
            </div>
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster}
          label={t("settings.row.alertsNewDrops.label")}
          description={t("settings.row.alertsNewDrops.description")}
          control={
            <SettingsToggle
              checked={props.settings.alertsNewDrops}
              onChange={(v) => props.setSetting("alertsNewDrops", v)}
              disabled={disabledByMaster}
            />
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.engine")}</SectionLabel>
        <SettingRow
          disabled={disabledByMaster}
          label={t("settings.row.alertsWatchError.label")}
          description={t("settings.row.alertsWatchError.description")}
          control={
            <SettingsToggle
              checked={props.settings.alertsWatchError}
              onChange={(v) => props.setSetting("alertsWatchError", v)}
              disabled={disabledByMaster}
            />
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster}
          label={t("settings.row.alertsAutoSwitch.label")}
          description={t("settings.row.alertsAutoSwitch.description")}
          control={
            <SettingsToggle
              checked={props.settings.alertsAutoSwitch}
              onChange={(v) => props.setSetting("alertsAutoSwitch", v)}
              disabled={disabledByMaster}
            />
          }
        />
      </div>
    </div>
  );
}
