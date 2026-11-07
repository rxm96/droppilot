import * as React from "react";
import { Button } from "@renderer/shared/components/ui/button";
import { Input } from "@renderer/shared/components/ui/input";
import { buildDiscordPayload } from "@renderer/shared/domain/alerts/discordPayload";
import { useI18n } from "@renderer/shared/i18n";
import { SettingRow } from "../SettingRow";
import { SettingsPanel } from "../SettingsPanel";
import { SettingsToggle } from "../SettingsToggle";

export type NotificationsSectionProps = {
  id: string;
  alertsEnabled: boolean;
  setAlertsEnabled: (val: boolean) => void;
  alertsNotifyWhileFocused: boolean;
  setAlertsNotifyWhileFocused: (val: boolean) => void;
  alertsDropClaimed: boolean;
  setAlertsDropClaimed: (val: boolean) => void;
  alertsDropEndingSoon: boolean;
  setAlertsDropEndingSoon: (val: boolean) => void;
  alertsDropEndingMinutes: number;
  setAlertsDropEndingMinutes: (val: number) => void;
  alertsWatchError: boolean;
  setAlertsWatchError: (val: boolean) => void;
  alertsAutoSwitch: boolean;
  setAlertsAutoSwitch: (val: boolean) => void;
  alertsNewDrops: boolean;
  setAlertsNewDrops: (val: boolean) => void;
  sendTestAlert: () => void;
  webhookEnabled: boolean;
  setWebhookEnabled: (val: boolean) => void;
  webhookUrl: string;
  setWebhookUrl: (val: string) => void;
  webhookDropClaimed: boolean;
  setWebhookDropClaimed: (val: boolean) => void;
  webhookWatchError: boolean;
  setWebhookWatchError: (val: boolean) => void;
  webhookDropEndingSoon: boolean;
  setWebhookDropEndingSoon: (val: boolean) => void;
  webhookAutoSwitch: boolean;
  setWebhookAutoSwitch: (val: boolean) => void;
  webhookNewDrops: boolean;
  setWebhookNewDrops: (val: boolean) => void;
};

/** Desktop notifications, per event, plus the optional Discord webhook. */
export function NotificationsSection(props: NotificationsSectionProps) {
  const { t } = useI18n();
  const off = !props.alertsEnabled;
  const [testStatus, setTestStatus] = React.useState<string | null>(null);
  const [testSending, setTestSending] = React.useState(false);

  const handleWebhookTest = async () => {
    if (!props.webhookUrl) {
      setTestStatus(t("settings.webhook.testNoUrl"));
      return;
    }
    const body = buildDiscordPayload({
      type: "drop-claimed",
      title: t("alerts.title.test"),
      body: t("alerts.body.test"),
      timestampIso: new Date().toISOString(),
    });
    setTestSending(true);
    try {
      const res = await window.electronAPI.webhook.send(props.webhookUrl, body);
      setTestStatus(
        res.ok
          ? t("settings.webhook.testOk")
          : t("settings.webhook.testFailed", { error: res.error ?? `http-${res.status}` }),
      );
    } finally {
      setTestSending(false);
    }
  };

  const eventRow = (
    key: "DropClaimed" | "DropEndingSoon" | "NewDrops" | "WatchError" | "AutoSwitch",
    checked: boolean,
    onChange: (v: boolean) => void,
    extra?: React.ReactNode,
  ) => {
    const label = t(`settings.row.alerts${key}.label`);
    return (
      <SettingRow
        key={key}
        disabled={off}
        label={label}
        description={t(`settings.row.alerts${key}.description`)}
        control={
          <>
            {extra}
            <SettingsToggle
              checked={checked}
              onChange={onChange}
              disabled={off}
              ariaLabel={label}
            />
          </>
        }
      />
    );
  };

  const webhookEvents: Array<{
    key: "DropClaimed" | "DropEndingSoon" | "NewDrops" | "WatchError" | "AutoSwitch";
    checked: boolean;
    onChange: (v: boolean) => void;
  }> = [
    {
      key: "DropClaimed",
      checked: props.webhookDropClaimed,
      onChange: props.setWebhookDropClaimed,
    },
    {
      key: "DropEndingSoon",
      checked: props.webhookDropEndingSoon,
      onChange: props.setWebhookDropEndingSoon,
    },
    { key: "NewDrops", checked: props.webhookNewDrops, onChange: props.setWebhookNewDrops },
    { key: "WatchError", checked: props.webhookWatchError, onChange: props.setWebhookWatchError },
    { key: "AutoSwitch", checked: props.webhookAutoSwitch, onChange: props.setWebhookAutoSwitch },
  ];

  return (
    <SettingsPanel id={props.id} title={t("settings.section.notifications")}>
      <SettingRow
        label={t("settings.row.alertsEnabled.label")}
        description={t("settings.row.alertsEnabled.description")}
        control={
          <SettingsToggle
            checked={props.alertsEnabled}
            onChange={props.setAlertsEnabled}
            ariaLabel={t("settings.row.alertsEnabled.label")}
          />
        }
      />
      {eventRow("DropClaimed", props.alertsDropClaimed, props.setAlertsDropClaimed)}
      {eventRow(
        "DropEndingSoon",
        props.alertsDropEndingSoon,
        props.setAlertsDropEndingSoon,
        <span className="flex items-center gap-2 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
          <Input
            tone="dp"
            type="number"
            min={1}
            max={60}
            value={props.alertsDropEndingMinutes}
            onChange={(e) =>
              props.setAlertsDropEndingMinutes(Math.max(1, Number(e.target.value) || 1))
            }
            disabled={off || !props.alertsDropEndingSoon}
            aria-label={t("settings.aria.endingSoonMinutes")}
            className="w-16"
          />
          {t("settings.row.alertsDropEndingMinutes.suffix")}
        </span>,
      )}
      {eventRow("NewDrops", props.alertsNewDrops, props.setAlertsNewDrops)}
      {eventRow("WatchError", props.alertsWatchError, props.setAlertsWatchError)}
      {eventRow("AutoSwitch", props.alertsAutoSwitch, props.setAlertsAutoSwitch)}
      <SettingRow
        disabled={off}
        label={t("settings.row.alertsNotifyWhileFocused.label")}
        description={t("settings.row.alertsNotifyWhileFocused.description")}
        control={
          <SettingsToggle
            checked={props.alertsNotifyWhileFocused}
            onChange={props.setAlertsNotifyWhileFocused}
            disabled={off}
            ariaLabel={t("settings.row.alertsNotifyWhileFocused.label")}
          />
        }
      />
      <SettingRow
        label={t("settings.row.sendTestAlert.label")}
        description={t("settings.row.sendTestAlert.description")}
        control={
          <Button variant="dp-outline" size="dp-md" onClick={props.sendTestAlert}>
            {t("settings.button.sendTest")}
          </Button>
        }
      />
      <SettingRow
        label={t("settings.row.webhookEnabled.label")}
        description={t("settings.row.webhookEnabled.description")}
        control={
          <SettingsToggle
            checked={props.webhookEnabled}
            onChange={props.setWebhookEnabled}
            ariaLabel={t("settings.row.webhookEnabled.label")}
          />
        }
      >
        {props.webhookEnabled && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                tone="dp"
                type="url"
                value={props.webhookUrl}
                onChange={(e) => props.setWebhookUrl(e.target.value)}
                placeholder={t("settings.row.webhookUrl.placeholder")}
                aria-label={t("settings.row.webhookUrl.label")}
                className="min-w-[240px] flex-1 font-mono"
              />
              <Button
                variant="dp-outline"
                size="dp-md"
                onClick={() => void handleWebhookTest()}
                disabled={!props.webhookUrl || testSending}
              >
                {t("settings.action.webhookTest")}
              </Button>
            </div>
            <p className="m-0 text-[12px] text-[color:var(--dp-text-dimmer)]" aria-live="polite">
              {testStatus ?? t("settings.row.webhookUrl.description")}
            </p>
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-1.5 p-0 font-mono text-[11px] text-[color:var(--dp-text-dimmer)]">
                {t("settings.webhook.eventsTitle")}
              </legend>
              <div className="flex flex-col gap-2">
                {webhookEvents.map((event) => {
                  const label = t(`settings.row.alerts${event.key}.label`);
                  return (
                    <div key={event.key} className="flex items-center justify-between gap-4">
                      <span className="text-[13px] text-[color:var(--dp-text)]">{label}</span>
                      <SettingsToggle
                        checked={event.checked}
                        onChange={event.onChange}
                        ariaLabel={t("settings.webhook.eventAria", { event: label })}
                      />
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}
      </SettingRow>
    </SettingsPanel>
  );
}
