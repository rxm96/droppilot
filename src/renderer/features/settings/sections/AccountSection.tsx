import * as React from "react";
import { Pill } from "@renderer/shared/components/ui/pill";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";
import { useI18n } from "@renderer/shared/i18n";

export type AccountSectionProps = {
  isLinked: boolean;
  allowUnlinkedGames: boolean;
  setAllowUnlinkedGames: (val: boolean) => void;
};

export function AccountSection(props: AccountSectionProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col">
      <SectionLabel>{t("settings.subsection.twitchAccount")}</SectionLabel>
      <SettingRow
        label={t("settings.row.connectionStatus.label")}
        description={t("settings.row.connectionStatus.description")}
        control={
          <div>
            {props.isLinked ? (
              <Pill tone="ok" dot>{t("settings.account.linked")}</Pill>
            ) : (
              <Pill tone="warn" dot>{t("settings.account.notLinked")}</Pill>
            )}
          </div>
        }
      />

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.gameLinking")}</SectionLabel>
        <SettingRow
          label={t("settings.allowUnlinked")}
          description={t("settings.row.allowUnlinked.description")}
          control={
            <SettingsToggle
              checked={props.allowUnlinkedGames}
              onChange={props.setAllowUnlinkedGames}
            />
          }
        />
      </div>
    </div>
  );
}
