import * as React from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@renderer/shared/components/ui/select";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";
import type { ThemePreference } from "@renderer/shared/theme";

export type AppearanceSectionProps = {
  theme: ThemePreference;
  setTheme: (val: ThemePreference) => void;
  enableBadgesEmotes: boolean;
  setEnableBadgesEmotes: (val: boolean) => void;
};

export function AppearanceSection(props: AppearanceSectionProps) {
  return (
    <div className="flex flex-col">
      <SectionLabel>theme</SectionLabel>
      <SettingRow
        label="Color scheme"
        description="Light or dark interface."
        control={
          <Select value={props.theme} onValueChange={(v) => props.setTheme(v as ThemePreference)}>
            <SelectTrigger tone="dp" aria-label="Theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="light">Light</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />

      <div className="mt-6">
        <SectionLabel>content</SectionLabel>
        <SettingRow
          label="Show badges &amp; emotes"
          description="Display Twitch badges and emotes in chat-like elements."
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
