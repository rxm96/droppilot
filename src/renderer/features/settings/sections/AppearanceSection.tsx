import * as React from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@renderer/shared/components/ui/select";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";
import { AccentPicker } from "../AccentPicker";
import { FontPicker } from "../FontPicker";
import type { ThemePreference } from "@renderer/shared/theme";
import type { FontPairId } from "@renderer/shared/fontPairs";
import { useI18n } from "@renderer/shared/i18n";

export type AppearanceSectionProps = {
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  enableBadgesEmotes: boolean;
  setEnableBadgesEmotes: (val: boolean) => void;
  accent: string | null;
  setAccent: (val: string | null) => void;
  fontPair: FontPairId;
  setFontPair: (val: FontPairId) => void;
};

export function AppearanceSection(props: AppearanceSectionProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col">
      <SectionLabel>{t("settings.subsection.theme")}</SectionLabel>
      <SettingRow
        label={t("settings.row.theme.label")}
        description={t("settings.row.theme.description")}
        control={
          <Select value={props.theme} onValueChange={(v) => props.setTheme(v as ThemePreference)}>
            <SelectTrigger tone="dp" aria-label={t("settings.aria.theme")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="dark">{t("settings.row.theme.dark")}</SelectItem>
                <SelectItem value="light">{t("settings.row.theme.light")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.accent")}</SectionLabel>
        <SettingRow
          stacked
          label={t("settings.row.accent.label")}
          description={t("settings.row.accent.description")}
          control={<AccentPicker accent={props.accent} setAccent={props.setAccent} />}
        />
      </div>

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.typography")}</SectionLabel>
        <SettingRow
          label={t("settings.row.fontPair.label")}
          description={t("settings.row.fontPair.description")}
          control={<FontPicker fontPair={props.fontPair} setFontPair={props.setFontPair} />}
        />
      </div>

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.content")}</SectionLabel>
        <SettingRow
          label={t("settings.badgesEmotes")}
          description={t("settings.row.badgesEmotes.description")}
          control={
            <SettingsToggle
              checked={props.enableBadgesEmotes}
              onChange={props.setEnableBadgesEmotes}
            />
          }
        />
      </div>
    </div>
  );
}
