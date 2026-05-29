import * as React from "react";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";
import { useI18n } from "@renderer/shared/i18n";

export type AlertsSectionProps = {
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
};

export function AlertsSection(props: AlertsSectionProps) {
  const { t } = useI18n();
  const disabledByMaster = !props.alertsEnabled;
  return (
    <div className="flex flex-col">
      <SectionLabel>{t("settings.subsection.masterSwitch")}</SectionLabel>
      <SettingRow
        label={t("settings.row.alertsEnabled.label")}
        description={t("settings.row.alertsEnabled.description")}
        control={<SettingsToggle checked={props.alertsEnabled} onChange={props.setAlertsEnabled} />}
      />
      <SettingRow
        divided
        disabled={disabledByMaster}
        label={t("settings.row.alertsNotifyWhileFocused.label")}
        description={t("settings.row.alertsNotifyWhileFocused.description")}
        control={
          <SettingsToggle
            checked={props.alertsNotifyWhileFocused}
            onChange={props.setAlertsNotifyWhileFocused}
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
              checked={props.alertsDropClaimed}
              onChange={props.setAlertsDropClaimed}
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
              checked={props.alertsDropEndingSoon}
              onChange={props.setAlertsDropEndingSoon}
              disabled={disabledByMaster}
            />
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster || !props.alertsDropEndingSoon}
          label={t("settings.row.alertsDropEndingMinutes.label")}
          description={t("settings.row.alertsDropEndingMinutes.description")}
          control={
            <div className="flex items-center gap-2">
              <Input
                tone="dp"
                type="number"
                min={1}
                value={props.alertsDropEndingMinutes}
                onChange={(e) =>
                  props.setAlertsDropEndingMinutes(Math.max(1, Number(e.target.value) || 1))
                }
                disabled={disabledByMaster || !props.alertsDropEndingSoon}
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
              checked={props.alertsNewDrops}
              onChange={props.setAlertsNewDrops}
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
              checked={props.alertsWatchError}
              onChange={props.setAlertsWatchError}
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
              checked={props.alertsAutoSwitch}
              onChange={props.setAlertsAutoSwitch}
              disabled={disabledByMaster}
            />
          }
        />
      </div>
    </div>
  );
}
