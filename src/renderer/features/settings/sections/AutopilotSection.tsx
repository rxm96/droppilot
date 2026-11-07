import * as React from "react";
import { Input } from "@renderer/shared/components/ui/input";
import { useI18n } from "@renderer/shared/i18n";
import { SettingRow } from "../SettingRow";
import { SettingsPanel } from "../SettingsPanel";
import { SettingsToggle } from "../SettingsToggle";
import {
  MIN_REFRESH_MINUTES,
  msToMinutes,
  refreshFromMaxMinutes,
  refreshFromMinMinutes,
} from "./refreshIntervalField";

export type AutopilotSectionProps = {
  id: string;
  autoClaim: boolean;
  setAutoClaim: (val: boolean) => void;
  autoSelect: boolean;
  setAutoSelect: (val: boolean) => void;
  autoSwitchEnabled: boolean;
  setAutoSwitchEnabled: (val: boolean) => void;
  refreshMinMs: number;
  refreshMaxMs: number;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  allowUnlinkedGames: boolean;
  setAllowUnlinkedGames: (val: boolean) => void;
  enableBadgesEmotes: boolean;
  setEnableBadgesEmotes: (val: boolean) => void;
  onOpenGames: () => void;
};

/** What the autopilot does on its own: claiming, picking and leaving streams, drop checks. */
export function AutopilotSection(props: AutopilotSectionProps) {
  const { t } = useI18n();
  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <SettingsToggle checked={checked} onChange={onChange} ariaLabel={label} />
  );
  return (
    <SettingsPanel
      id={props.id}
      title={t("settings.section.autopilot")}
      footer={
        <p className="m-0 mt-2 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          {t("settings.autopilot.gamesHint")}{" "}
          <button
            type="button"
            onClick={props.onOpenGames}
            className="text-[color:var(--dp-accent)] hover:text-[color:var(--dp-text)]"
          >
            {t("settings.autopilot.gamesLink")}
          </button>
        </p>
      }
    >
      <SettingRow
        label={t("settings.row.autoClaim.label")}
        description={t("settings.row.autoClaim.description")}
        control={toggle(t("settings.row.autoClaim.label"), props.autoClaim, props.setAutoClaim)}
      />
      <SettingRow
        label={t("settings.row.autoSelect.label")}
        description={t("settings.row.autoSelect.description")}
        control={toggle(t("settings.row.autoSelect.label"), props.autoSelect, props.setAutoSelect)}
      />
      <SettingRow
        label={t("settings.row.autoSwitch.label")}
        description={t("settings.row.autoSwitch.description")}
        control={toggle(
          t("settings.row.autoSwitch.label"),
          props.autoSwitchEnabled,
          props.setAutoSwitchEnabled,
        )}
      />
      <SettingRow
        label={t("settings.row.refreshInterval.label")}
        description={t("settings.row.refreshInterval.description")}
        control={
          <div className="flex items-center gap-2 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            <span>{t("settings.unit.every")}</span>
            <MinutesField
              valueMs={props.refreshMinMs}
              ariaLabel={t("settings.aria.minIntervalMinutes")}
              onCommit={(minutes) => {
                const { minMs, maxMs } = refreshFromMinMinutes(minutes, props.refreshMaxMs);
                props.setRefreshIntervals(minMs, maxMs);
              }}
            />
            <span>{t("settings.unit.to")}</span>
            <MinutesField
              valueMs={props.refreshMaxMs}
              ariaLabel={t("settings.aria.maxIntervalMinutes")}
              onCommit={(minutes) => {
                const { minMs, maxMs } = refreshFromMaxMinutes(minutes, props.refreshMinMs);
                props.setRefreshIntervals(minMs, maxMs);
              }}
            />
            <span>{t("settings.unit.min")}</span>
          </div>
        }
      />
      <SettingRow
        label={t("settings.row.allowUnlinked.label")}
        description={t("settings.row.allowUnlinked.description")}
        control={toggle(
          t("settings.row.allowUnlinked.label"),
          props.allowUnlinkedGames,
          props.setAllowUnlinkedGames,
        )}
      />
      <SettingRow
        label={t("settings.row.badgesEmotes.label")}
        description={t("settings.row.badgesEmotes.description")}
        control={toggle(
          t("settings.row.badgesEmotes.label"),
          props.enableBadgesEmotes,
          props.setEnableBadgesEmotes,
        )}
      />
    </SettingsPanel>
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
