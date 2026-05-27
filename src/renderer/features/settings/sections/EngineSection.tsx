import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";

export type EngineSectionProps = {
  autoStart?: boolean;
  setAutoStart?: (val: boolean) => void;
  showAutoStart?: boolean;
  autoClaim: boolean;
  setAutoClaim: (val: boolean) => void;
  autoSelect: boolean;
  setAutoSelect: (val: boolean) => void;
  autoSwitchEnabled: boolean;
  setAutoSwitchEnabled: (val: boolean) => void;
  warmupEnabled: boolean;
  setWarmupEnabled: (val: boolean) => void;
  refreshMinMs: number;
  refreshMaxMs: number;
  setRefreshIntervals: (minMs: number, maxMs: number) => void;
  resetAutomation: () => void;
};

export function EngineSection(props: EngineSectionProps) {
  return (
    <div className="flex flex-col">
      {props.showAutoStart && (
        <>
          <SectionLabel>app lifecycle</SectionLabel>
          <SettingRow
            label="Launch at login"
            description="Starts Droppilot automatically when you log into your OS."
            control={
              <SettingsToggle
                checked={!!props.autoStart}
                onChange={(v) => props.setAutoStart?.(v)}
              />
            }
          />
        </>
      )}

      <div className={props.showAutoStart ? "mt-6" : undefined}>
        <SectionLabel>automation</SectionLabel>
        <SettingRow
          label="Auto-claim"
          description="Automatically claim earned drops when they're available."
          control={<SettingsToggle checked={props.autoClaim} onChange={props.setAutoClaim} />}
        />
        <SettingRow
          divided
          label="Auto-select target game"
          description="Pick the next watchable game based on your priorities."
          control={<SettingsToggle checked={props.autoSelect} onChange={props.setAutoSelect} />}
        />
        <SettingRow
          divided
          label="Auto-switch on stall"
          description="If no progress is detected, switch to a different live channel."
          control={
            <SettingsToggle
              checked={props.autoSwitchEnabled}
              onChange={props.setAutoSwitchEnabled}
            />
          }
        />
        <SettingRow
          divided
          label="Warm up watcher"
          description="Send a probe before binding to detect cookie/auth issues early."
          control={
            <SettingsToggle checked={props.warmupEnabled} onChange={props.setWarmupEnabled} />
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>refresh cadence</SectionLabel>
        <SettingRow
          label="Channels refresh interval"
          description="How often the channel tracker re-queries Twitch (random jitter between min and max)."
          control={
            <div className="flex items-center gap-2">
              <Input
                tone="dp"
                type="number"
                min={5}
                value={Math.round(props.refreshMinMs / 1000)}
                onChange={(e) => {
                  const min = Math.max(5, Number(e.target.value) || 0) * 1000;
                  props.setRefreshIntervals(min, Math.max(min, props.refreshMaxMs));
                }}
                aria-label="Minimum interval seconds"
                className="w-20"
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">to</span>
              <Input
                tone="dp"
                type="number"
                min={5}
                value={Math.round(props.refreshMaxMs / 1000)}
                onChange={(e) => {
                  const max = Math.max(5, Number(e.target.value) || 0) * 1000;
                  props.setRefreshIntervals(Math.min(max, props.refreshMinMs), max);
                }}
                aria-label="Maximum interval seconds"
                className="w-20"
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">sec</span>
            </div>
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>danger zone</SectionLabel>
        <SettingRow
          label="Reset automation flags"
          description="Clears auto-claim, auto-switch, warmup, etc. back to defaults. Does not log you out."
          control={
            <Button variant="dp-outline" size="dp-md" onClick={props.resetAutomation}>
              reset
            </Button>
          }
        />
      </div>
    </div>
  );
}
