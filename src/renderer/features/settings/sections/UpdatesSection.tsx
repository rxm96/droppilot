import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Pill } from "@renderer/shared/components/ui/pill";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@renderer/shared/components/ui/select";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import type { UpdateChannel } from "../../../../shared/updateChannels";

export type UpdatesSectionProps = {
  updateChannel: UpdateChannel;
  setUpdateChannel: (val: UpdateChannel) => void;
  updateStatus?: {
    state:
      | "idle"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "none"
      | "error"
      | "unsupported";
    message?: string;
    version?: string;
    progress?: number;
  };
  checkUpdates?: () => void;
  downloadUpdate?: () => void;
  installUpdate?: () => void;
};

export function UpdatesSection(props: UpdatesSectionProps) {
  const state = props.updateStatus?.state ?? "idle";
  const version = props.updateStatus?.version;
  const progress = props.updateStatus?.progress;
  const statusPill = (() => {
    switch (state) {
      case "available":
        return <Pill tone="accent" dot>update available{version ? ` · v${version}` : ""}</Pill>;
      case "downloading":
        return (
          <Pill tone="info" dot>
            downloading{typeof progress === "number" ? ` · ${Math.round(progress)}%` : ""}
          </Pill>
        );
      case "downloaded":
        return <Pill tone="ok" dot>downloaded{version ? ` · v${version}` : ""}</Pill>;
      case "error":
        return (
          <Pill tone="err" dot title={props.updateStatus?.message}>
            update error
          </Pill>
        );
      case "checking":
        return <Pill tone="info" dot>checking…</Pill>;
      case "none":
        return <Pill tone="dim">up to date</Pill>;
      case "unsupported":
        return <Pill tone="dim">updates unsupported</Pill>;
      default:
        return <Pill tone="dim">idle</Pill>;
    }
  })();

  return (
    <div className="flex flex-col">
      <SectionLabel>release channel</SectionLabel>
      <SettingRow
        label="Update channel"
        description="Switch between stable and pre-release releases."
        control={
          <Select value={props.updateChannel} onValueChange={(v) => props.setUpdateChannel(v as UpdateChannel)}>
            <SelectTrigger tone="dp" aria-label="Update channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="preview">Preview</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />

      <div className="mt-6">
        <SectionLabel>current state</SectionLabel>
        <SettingRow
          label="Status"
          description="Last known update status reported by the auto-updater."
          control={<div>{statusPill}</div>}
        />
        <SettingRow
          divided
          label="Actions"
          description="Manually trigger a check, download, or install."
          control={
            <div className="flex flex-wrap gap-2">
              {props.checkUpdates && (
                <Button
                  variant="dp-secondary"
                  size="dp-sm"
                  onClick={props.checkUpdates}
                  disabled={state === "checking" || state === "downloading"}
                >
                  check
                </Button>
              )}
              {props.downloadUpdate && state === "available" && (
                <Button variant="dp-primary" size="dp-sm" onClick={props.downloadUpdate}>
                  download
                </Button>
              )}
              {props.installUpdate && state === "downloaded" && (
                <Button variant="dp-primary" size="dp-sm" onClick={props.installUpdate}>
                  install &amp; restart
                </Button>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
