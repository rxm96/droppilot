import { useI18n } from "@renderer/shared/i18n";
import { SettingRow } from "../SettingRow";
import { SettingsPanel } from "../SettingsPanel";
import { SettingsToggle } from "../SettingsToggle";

export type AppSectionProps = {
  id: string;
  autoStart: boolean;
  setAutoStart: (val: boolean) => void;
  closeToTray: boolean;
  setCloseToTray: (val: boolean) => void;
  minimizeToTray: boolean;
  setMinimizeToTray: (val: boolean) => void;
};

/** Start at login and tray behavior (Windows only, as before). */
export function AppSection(props: AppSectionProps) {
  const { t } = useI18n();
  const rows: Array<{ key: string; checked: boolean; onChange: (v: boolean) => void }> = [
    { key: "autoStart", checked: props.autoStart, onChange: props.setAutoStart },
    { key: "closeToTray", checked: props.closeToTray, onChange: props.setCloseToTray },
    { key: "minimizeToTray", checked: props.minimizeToTray, onChange: props.setMinimizeToTray },
  ];
  return (
    <SettingsPanel id={props.id} title={t("settings.section.app")}>
      {rows.map((row) => {
        const label = t(`settings.row.${row.key}.label`);
        return (
          <SettingRow
            key={row.key}
            label={label}
            description={t(`settings.row.${row.key}.description`)}
            control={
              <SettingsToggle checked={row.checked} onChange={row.onChange} ariaLabel={label} />
            }
          />
        );
      })}
    </SettingsPanel>
  );
}
