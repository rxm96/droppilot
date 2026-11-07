import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { useI18n } from "@renderer/shared/i18n";
import { cn } from "@renderer/shared/lib/utils";
import { channelInitials } from "@renderer/features/overview/overviewModel";
import type { ProfileState } from "@renderer/shared/types";
import type { UpdateChannel } from "../../../../shared/updateChannels";
import { ChoiceButtons } from "../ChoiceButtons";
import { SettingRow } from "../SettingRow";
import { SettingsPanel } from "../SettingsPanel";
import { accountRowState } from "./accountRow";
import { ReleaseHistory } from "./ReleaseHistory";
import { updateStatusLine, type UpdateStatus } from "./updateStatusLine";

export type AccountUpdatesSectionProps = {
  id: string;
  isLinked: boolean;
  /** Demo mode shows the demo profile and no account button (see accountRowState). */
  demoMode: boolean;
  profile: ProfileState;
  onLogout: () => void;
  onLogin: () => void;
  version: string;
  /** Update status, actions and channel exist only in the installed Windows app. */
  showUpdateCheck?: boolean;
  updateStatus?: UpdateStatus;
  checkUpdates?: () => void;
  downloadUpdate?: () => void;
  installUpdate?: () => void;
  updateChannel: UpdateChannel;
  setUpdateChannel: (val: UpdateChannel) => void;
};

const TONE_CLASS: Record<ReturnType<typeof updateStatusLine>["tone"], string> = {
  ok: "text-[color:var(--dp-signal-ok)]",
  accent: "text-[color:var(--dp-accent)]",
  err: "text-[color:var(--dp-signal-err)]",
  dim: "text-[color:var(--dp-text-dimmer)]",
};

/** The Twitch account, the app version with update actions, the update channel and changelog. */
export function AccountUpdatesSection(props: AccountUpdatesSectionProps) {
  const { t } = useI18n();
  const [changelogOpen, setChangelogOpen] = React.useState(false);
  const changelogId = React.useId();
  const account = accountRowState(props);
  const name = account.name;
  const state = props.updateStatus?.state ?? "idle";
  const line = updateStatusLine(props.updateStatus);

  return (
    <SettingsPanel id={props.id} title={t("settings.section.account")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--dp-accent-soft)] font-mono text-[12px] font-semibold text-[color:var(--dp-accent)]"
        >
          {name ? channelInitials(name) : "–"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-[color:var(--dp-text)]">
            {name ?? t("settings.account.signedOut")}
          </div>
          <div className="font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
            {t(account.statusKey)}
          </div>
        </div>
        {account.action === "logout" && (
          <Button variant="dp-outline" size="dp-md" onClick={props.onLogout}>
            {t("settings.account.logout")}
          </Button>
        )}
        {account.action === "login" && (
          <Button variant="dp-primary" size="dp-md" onClick={props.onLogin}>
            {t("settings.account.login")}
          </Button>
        )}
      </div>

      <SettingRow
        label={t("settings.row.version.label", { version: props.version || "–" })}
        description={
          props.showUpdateCheck ? (
            <span
              className={cn("font-mono text-[11px]", TONE_CLASS[line.tone])}
              title={state === "error" ? props.updateStatus?.message : undefined}
            >
              {t(line.key)}
              {line.suffix}
            </span>
          ) : undefined
        }
        control={
          <>
            {props.showUpdateCheck && props.checkUpdates && (
              <Button
                variant="dp-outline"
                size="dp-md"
                onClick={props.checkUpdates}
                disabled={state === "checking" || state === "downloading"}
              >
                {t("settings.button.check")}
              </Button>
            )}
            {props.showUpdateCheck && props.downloadUpdate && state === "available" && (
              <Button variant="dp-primary" size="dp-md" onClick={props.downloadUpdate}>
                {t("settings.button.download")}
              </Button>
            )}
            {props.showUpdateCheck && props.installUpdate && state === "downloaded" && (
              <Button variant="dp-primary" size="dp-md" onClick={props.installUpdate}>
                {t("settings.button.installRestart")}
              </Button>
            )}
            <Button
              variant="dp-outline"
              size="dp-md"
              aria-expanded={changelogOpen}
              aria-controls={changelogId}
              onClick={() => setChangelogOpen((open) => !open)}
            >
              {t("settings.button.changelog")} {changelogOpen ? "−" : "+"}
            </Button>
          </>
        }
      >
        {/* Mounted only while open, so the release list is fetched on demand. */}
        <div id={changelogId}>{changelogOpen && <ReleaseHistory />}</div>
      </SettingRow>

      {props.showUpdateCheck && (
        <SettingRow
          label={t("settings.updateChannel")}
          description={t("settings.row.updateChannel.description")}
          control={
            <ChoiceButtons
              value={props.updateChannel}
              onChange={props.setUpdateChannel}
              ariaLabel={t("settings.aria.updateChannel")}
              options={[
                { value: "stable", label: t("settings.updateChannel.stable") },
                { value: "preview", label: t("settings.updateChannel.preview") },
              ]}
            />
          }
        />
      )}
    </SettingsPanel>
  );
}
