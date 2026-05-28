import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";
import { Button } from "@renderer/shared/components/ui/button";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";
import { useI18n } from "@renderer/shared/i18n";

export type GeneralSectionProps = {
  language: "de" | "en";
  setLanguage: (val: "de" | "en") => void;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  sendTestAlert: () => void;
};

export function GeneralSection(props: GeneralSectionProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col">
      <SectionLabel>{t("settings.subsection.languageMode")}</SectionLabel>
      <SettingRow
        label={t("settings.language")}
        description={t("settings.row.language.description")}
        control={
          <Select value={props.language} onValueChange={(v) => props.setLanguage(v as "de" | "en")}>
            <SelectTrigger tone="dp" aria-label={t("settings.aria.language")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />
      <SettingRow
        divided
        label={t("settings.demoMode")}
        description={t("settings.row.demoMode.description")}
        control={<SettingsToggle checked={props.demoMode} onChange={props.setDemoMode} />}
      />

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.diagnostics")}</SectionLabel>
        <SettingRow
          label={t("settings.row.sendTestAlert.label")}
          description={t("settings.row.sendTestAlert.description")}
          control={
            <Button variant="dp-secondary" size="dp-md" onClick={props.sendTestAlert}>
              {t("settings.button.sendTest")}
            </Button>
          }
        />
      </div>
    </div>
  );
}
