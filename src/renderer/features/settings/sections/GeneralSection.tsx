import * as React from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@renderer/shared/components/ui/select";
import { Button } from "@renderer/shared/components/ui/button";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";

export type GeneralSectionProps = {
  language: "de" | "en";
  setLanguage: (val: "de" | "en") => void;
  demoMode: boolean;
  setDemoMode: (val: boolean) => void;
  sendTestAlert: () => void;
};

export function GeneralSection(props: GeneralSectionProps) {
  return (
    <div className="flex flex-col">
      <SectionLabel>language &amp; mode</SectionLabel>
      <SettingRow
        label="Language"
        description="Interface language for labels, alerts, and onboarding text."
        control={
          <Select value={props.language} onValueChange={(v) => props.setLanguage(v as "de" | "en")}>
            <SelectTrigger tone="dp" aria-label="Language">
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
        label="Demo mode"
        description="Use synthetic data so you can preview the UI without a Twitch login."
        control={<SettingsToggle checked={props.demoMode} onChange={props.setDemoMode} />}
      />

      <div className="mt-6">
        <SectionLabel>diagnostics</SectionLabel>
        <SettingRow
          label="Send test alert"
          description="Triggers a desktop notification to verify alerts work on this OS."
          control={
            <Button variant="dp-secondary" size="dp-md" onClick={props.sendTestAlert}>
              send test
            </Button>
          }
        />
      </div>
    </div>
  );
}
