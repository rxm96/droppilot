import * as React from "react";
import type { SettingsSectionKey } from "./SettingsSidebar";

export function useSettingsViewState(initial: SettingsSectionKey = "general") {
  const [active, setActive] = React.useState<SettingsSectionKey>(initial);
  return { active, setActive };
}
