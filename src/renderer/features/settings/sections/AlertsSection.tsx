import * as React from "react";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";

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
  const disabledByMaster = !props.alertsEnabled;
  return (
    <div className="flex flex-col">
      <SectionLabel>master switch</SectionLabel>
      <SettingRow
        label="Desktop alerts"
        description="Master toggle. When off, no notifications are sent regardless of the per-event settings below."
        control={
          <SettingsToggle checked={props.alertsEnabled} onChange={props.setAlertsEnabled} />
        }
      />
      <SettingRow
        divided
        disabled={disabledByMaster}
        label="Notify while the app is focused"
        description="Show notifications even when Droppilot is the active window."
        control={
          <SettingsToggle
            checked={props.alertsNotifyWhileFocused}
            onChange={props.setAlertsNotifyWhileFocused}
            disabled={disabledByMaster}
          />
        }
      />

      <div className="mt-6">
        <SectionLabel>drops</SectionLabel>
        <SettingRow
          disabled={disabledByMaster}
          label="Drop claimed"
          description="A drop you were watching for has been claimed."
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
          label="Drop ending soon"
          description="A drop is close to expiring. Warn you N minutes before."
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
          label="Ending-soon threshold"
          description="How many minutes before expiry the warning fires."
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
                aria-label="Ending-soon minutes"
                className="w-24"
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">min</span>
            </div>
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster}
          label="New drops available"
          description="A new campaign or drop just dropped (pun intended)."
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
        <SectionLabel>engine</SectionLabel>
        <SettingRow
          disabled={disabledByMaster}
          label="Watch errors"
          description="Watcher failed (auth expired, network issue, etc.)."
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
          label="Auto-switch happened"
          description="The watch engine moved to a different channel automatically."
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
