import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Pill } from "@renderer/shared/components/ui/pill";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/shared/components/ui/select";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import type { UpdateChannel } from "../../../../shared/updateChannels";
import { useI18n } from "@renderer/shared/i18n";

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
  const { t } = useI18n();
  const state = props.updateStatus?.state ?? "idle";
  const version = props.updateStatus?.version;
  const progress = props.updateStatus?.progress;
  const statusPill = (() => {
    switch (state) {
      case "available":
        return (
          <Pill tone="accent" dot>
            {t("settings.status.available")}
            {version ? ` · v${version}` : ""}
          </Pill>
        );
      case "downloading":
        return (
          <Pill tone="info" dot>
            {t("settings.status.downloading")}
            {typeof progress === "number" ? ` · ${Math.round(progress)}%` : ""}
          </Pill>
        );
      case "downloaded":
        return (
          <Pill tone="ok" dot>
            {t("settings.status.downloaded")}
            {version ? ` · v${version}` : ""}
          </Pill>
        );
      case "error":
        return (
          <Pill tone="err" dot title={props.updateStatus?.message}>
            {t("settings.status.error")}
          </Pill>
        );
      case "checking":
        return (
          <Pill tone="info" dot>
            {t("settings.status.checking")}
          </Pill>
        );
      case "none":
        return <Pill tone="dim">{t("settings.status.upToDate")}</Pill>;
      case "unsupported":
        return <Pill tone="dim">{t("settings.status.unsupported")}</Pill>;
      default:
        return <Pill tone="dim">{t("settings.status.idle")}</Pill>;
    }
  })();

  return (
    <div className="flex flex-col">
      <SectionLabel>{t("settings.subsection.releaseChannel")}</SectionLabel>
      <SettingRow
        label={t("settings.updateChannel")}
        description={t("settings.row.updateChannel.description")}
        control={
          <Select
            value={props.updateChannel}
            onValueChange={(v) => props.setUpdateChannel(v as UpdateChannel)}
          >
            <SelectTrigger tone="dp" aria-label={t("settings.aria.updateChannel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="stable">{t("settings.updateChannel.stable")}</SelectItem>
                <SelectItem value="preview">{t("settings.updateChannel.preview")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.currentState")}</SectionLabel>
        <SettingRow
          label={t("settings.row.updateStatus.label")}
          description={t("settings.row.updateStatus.description")}
          control={<div>{statusPill}</div>}
        />
        <SettingRow
          divided
          label={t("settings.row.updateActions.label")}
          description={t("settings.row.updateActions.description")}
          control={
            <div className="flex flex-wrap gap-2">
              {props.checkUpdates && (
                <Button
                  variant="dp-secondary"
                  size="dp-sm"
                  onClick={props.checkUpdates}
                  disabled={state === "checking" || state === "downloading"}
                >
                  {t("settings.button.check")}
                </Button>
              )}
              {props.downloadUpdate && state === "available" && (
                <Button variant="dp-primary" size="dp-sm" onClick={props.downloadUpdate}>
                  {t("settings.button.download")}
                </Button>
              )}
              {props.installUpdate && state === "downloaded" && (
                <Button variant="dp-primary" size="dp-sm" onClick={props.installUpdate}>
                  {t("settings.button.installRestart")}
                </Button>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
