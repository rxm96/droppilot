import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";

export type AdvancedSectionProps = {
  debugEnabled: boolean;
  setDebugEnabled: (val: boolean) => void;
  settingsJson: string;
  setSettingsJson: (val: string) => void;
  exportSettings: () => void;
  importSettings: () => void;
  settingsInfo?: string | null;
  settingsError?: string | null;
};

export function AdvancedSection(props: AdvancedSectionProps) {
  return (
    <div className="flex flex-col">
      <SectionLabel>diagnostics</SectionLabel>
      <SettingRow
        label="Show Debug view"
        description="Adds a 'debug' tab to the top nav with logs, perf snapshots, and a state dump."
        control={
          <SettingsToggle checked={props.debugEnabled} onChange={props.setDebugEnabled} />
        }
      />

      <div className="mt-6">
        <SectionLabel>settings export &amp; import</SectionLabel>
        <div className="py-4">
          <div className="text-[13px] font-medium text-[color:var(--dp-text)] mb-1">
            Settings JSON
          </div>
          <div className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)] mb-3">
            Paste a JSON blob and click Import, or click Export to copy your current settings.
          </div>
          <textarea
            value={props.settingsJson}
            onChange={(e) => props.setSettingsJson(e.target.value)}
            spellCheck={false}
            className="w-full h-[160px] rounded-[var(--dp-radius-sm)] border border-[color:var(--dp-border)] bg-[color:var(--dp-bg-elevated)] px-3 py-2 font-mono text-[11px] text-[color:var(--dp-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--dp-accent)] focus-visible:border-[color:var(--dp-accent)] resize-y"
          />
          <div className="flex gap-2 mt-3">
            <Button variant="dp-secondary" size="dp-md" onClick={props.exportSettings}>
              export
            </Button>
            <Button variant="dp-outline" size="dp-md" onClick={props.importSettings}>
              import
            </Button>
          </div>
          {props.settingsInfo && (
            <div className="mt-3 font-mono text-[10px] text-[color:var(--dp-signal-ok)]">
              {props.settingsInfo}
            </div>
          )}
          {props.settingsError && (
            <div className="mt-3 font-mono text-[10px] text-[color:var(--dp-signal-err)]">
              {props.settingsError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
