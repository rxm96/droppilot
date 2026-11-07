import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";
import type { FontPairId } from "@renderer/shared/fontPairs";
import { useI18n } from "@renderer/shared/i18n";
import type { ThemePreference } from "@renderer/shared/theme";
import { AccentPicker } from "../AccentPicker";
import { ChoiceButtons } from "../ChoiceButtons";
import { FontPicker } from "../FontPicker";
import { SettingRow } from "../SettingRow";
import { SettingsPanel } from "../SettingsPanel";

export type AppearanceSectionProps = {
  id: string;
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  accent: string | null;
  setAccent: (val: string | null) => void;
  fontPair: FontPairId;
  setFontPair: (val: FontPairId) => void;
  language: "de" | "en";
  setLanguage: (val: "de" | "en") => void;
};

/** Theme, accent, font pair and language. */
export function AppearanceSection(props: AppearanceSectionProps) {
  const { t } = useI18n();
  return (
    <SettingsPanel id={props.id} title={t("settings.section.appearance")}>
      <SettingRow
        label={t("settings.row.theme.label")}
        control={
          <ChoiceButtons
            value={props.theme}
            onChange={props.setTheme}
            ariaLabel={t("settings.aria.theme")}
            options={[
              { value: "dark", label: t("settings.row.theme.dark") },
              { value: "light", label: t("settings.row.theme.light") },
            ]}
          />
        }
      />
      <SettingRow
        label={t("settings.row.accent.label")}
        description={t("settings.row.accent.description")}
        control={<AccentPicker accent={props.accent} setAccent={props.setAccent} />}
      />
      <SettingRow
        label={t("settings.row.fontPair.label")}
        description={t("settings.row.fontPair.description")}
        control={
          <div className="w-[260px]">
            <FontPicker fontPair={props.fontPair} setFontPair={props.setFontPair} />
          </div>
        }
      />
      <SettingRow
        label={t("settings.language")}
        control={
          <div className="w-[160px]">
            <Select
              value={props.language}
              onValueChange={(v) => props.setLanguage(v as "de" | "en")}
            >
              <SelectTrigger tone="dp" aria-label={t("settings.aria.language")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent tone="dp">
                <SelectGroup>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        }
      />
    </SettingsPanel>
  );
}
