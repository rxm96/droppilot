import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";
import { useI18n } from "@renderer/shared/i18n";
import {
  MIN_REFRESH_MINUTES,
  msToMinutes,
  refreshFromMaxMinutes,
  refreshFromMinMinutes,
} from "./refreshIntervalField";

export type EngineSectionProps = {
  autoStart?: boolean;
  setAutoStart?: (val: boolean) => void;
  showAutoStart?: boolean;
  autoClaim: boolean;
  setAutoClaim: (val: boolean) => void;
  autoSelect: boolean;
  setAutoSelect: (val: boolean) => void;
  autoSwitchEnabled: boolean;
  setAutoSwitchEnabled: (val: boolean) => void;
  warmupEnabled: boolean;
  setWarmupEnabled: (val: boolean) => void;
  refreshMinMs: number;
  refreshMaxMs: number;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
  closeToTray?: boolean;
  setCloseToTray?: (val: boolean) => void;
  minimizeToTray?: boolean;
  setMinimizeToTray?: (val: boolean) => void;
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
                checked={!!props.autoStart}
                onChange={(v) => props.setAutoStart?.(v)}
              />
            }
          />
          <SettingRow
            divided
            label={t("settings.row.closeToTray.label")}
            description={t("settings.row.closeToTray.description")}
            control={
              <SettingsToggle
                checked={!!props.closeToTray}
                onChange={(v) => props.setCloseToTray?.(v)}
              />
            }
          />
          <SettingRow
            divided
            label={t("settings.row.minimizeToTray.label")}
            description={t("settings.row.minimizeToTray.description")}
            control={
              <SettingsToggle
                checked={!!props.minimizeToTray}
                onChange={(v) => props.setMinimizeToTray?.(v)}
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
          control={<SettingsToggle checked={props.autoClaim} onChange={props.setAutoClaim} />}
        />
        <SettingRow
          divided
          label={t("settings.autoSelect")}
          description={t("settings.autoSelectHint")}
          control={<SettingsToggle checked={props.autoSelect} onChange={props.setAutoSelect} />}
        />
        <SettingRow
          divided
          label={t("settings.autoSwitch")}
          description={t("settings.autoSwitchHint")}
          control={
            <SettingsToggle
              checked={props.autoSwitchEnabled}
              onChange={props.setAutoSwitchEnabled}
            />
          }
        />
        <SettingRow
          divided
          label={t("settings.warmup")}
          description={t("settings.warmupHint")}
          control={
            <SettingsToggle checked={props.warmupEnabled} onChange={props.setWarmupEnabled} />
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
              <MinutesField
                valueMs={props.refreshMinMs}
                ariaLabel={t("settings.aria.minIntervalMinutes")}
                onCommit={(minutes) => {
                  const { minMs, maxMs } = refreshFromMinMinutes(minutes, props.refreshMaxMs);
                  props.setRefreshIntervals(minMs, maxMs);
                }}
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                {t("settings.unit.to")}
              </span>
              <MinutesField
                valueMs={props.refreshMaxMs}
                ariaLabel={t("settings.aria.maxIntervalMinutes")}
                onCommit={(minutes) => {
                  const { minMs, maxMs } = refreshFromMaxMinutes(minutes, props.refreshMinMs);
                  props.setRefreshIntervals(minMs, maxMs);
                }}
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                {t("settings.unit.min")}
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

type MinutesFieldProps = {
  /** The persisted value in milliseconds; displayed in whole minutes. */
  valueMs: number;
  ariaLabel: string;
  /** Receives the typed minutes (un-clamped); the caller applies the floor. */
  onCommit: (minutes: number) => void;
};

/**
 * Number input that edits a millisecond value in minutes. While focused it holds
 * a local draft so typing is never clamped mid-entry — e.g. the leading "1" of
 * "120" must not snap to the 60-minute floor before you finish. The floor and
 * cross-field clamp are applied by `onCommit`, fired on blur or Enter.
 */
function MinutesField({ valueMs, ariaLabel, onCommit }: MinutesFieldProps) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    onCommit(Number(draft));
    setDraft(null);
  };
  return (
    <Input
      tone="dp"
      type="number"
      min={MIN_REFRESH_MINUTES}
      value={draft ?? String(msToMinutes(valueMs))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      aria-label={ariaLabel}
      className="w-20"
    />
  );
}
