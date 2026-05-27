import * as React from "react";
import { Pill } from "@renderer/shared/components/ui/pill";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";

export type AccountSectionProps = {
  isLinked: boolean;
  allowUnlinkedGames: boolean;
  setAllowUnlinkedGames: (val: boolean) => void;
};

export function AccountSection(props: AccountSectionProps) {
  return (
    <div className="flex flex-col">
      <SectionLabel>twitch account</SectionLabel>
      <SettingRow
        label="Connection status"
        description="Logout and re-login from the top-right of the title bar."
        control={
          <div>
            {props.isLinked ? (
              <Pill tone="ok" dot>linked</Pill>
            ) : (
              <Pill tone="warn" dot>not linked</Pill>
            )}
          </div>
        }
      />

      <div className="mt-6">
        <SectionLabel>game linking</SectionLabel>
        <SettingRow
          label="Allow unlinked games"
          description="Show drops for games where you haven't linked the Twitch account to the game account yet. They won't progress without linking."
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
