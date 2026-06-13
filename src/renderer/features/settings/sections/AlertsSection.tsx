import * as React from "react";
import { Input } from "@renderer/shared/components/ui/input";
import { SectionLabel } from "@renderer/shared/components/ui/section-label";
import { SettingRow } from "../SettingRow";
import { SettingsToggle } from "../SettingsToggle";
import { useI18n } from "@renderer/shared/i18n";
import { Button } from "@renderer/shared/components/ui/button";
import { buildDiscordPayload } from "@renderer/shared/domain/alerts/discordPayload";

export type AlertsSectionProps = {
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

export function AlertsSection(props: AlertsSectionProps) {
  const { t } = useI18n();
  const disabledByMaster = !props.alertsEnabled;
  const [webhookTestStatus, setWebhookTestStatus] = React.useState<string | null>(null);
  const [webhookTestSending, setWebhookTestSending] = React.useState(false);
  const handleWebhookTest = async () => {
    if (!props.webhookUrl) {
      setWebhookTestStatus(t("settings.webhook.testNoUrl"));
      return;
    }
    const body = buildDiscordPayload({
      type: "drop-claimed",
      title: t("alerts.title.test"),
      body: t("alerts.body.test"),
      timestampIso: new Date().toISOString(),
    });
    setWebhookTestSending(true);
    try {
      const res = await window.electronAPI.webhook.send(props.webhookUrl, body);
      setWebhookTestStatus(
        res.ok
          ? t("settings.webhook.testOk")
          : t("settings.webhook.testFailed", { error: res.error ?? `http-${res.status}` }),
      );
    } finally {
      setWebhookTestSending(false);
    }
  };
  return (
    <div className="flex flex-col">
      <SectionLabel>{t("settings.subsection.masterSwitch")}</SectionLabel>
      <SettingRow
        label={t("settings.row.alertsEnabled.label")}
        description={t("settings.row.alertsEnabled.description")}
        control={<SettingsToggle checked={props.alertsEnabled} onChange={props.setAlertsEnabled} />}
      />
      <SettingRow
        divided
        disabled={disabledByMaster}
        label={t("settings.row.alertsNotifyWhileFocused.label")}
        description={t("settings.row.alertsNotifyWhileFocused.description")}
        control={
          <SettingsToggle
            checked={props.alertsNotifyWhileFocused}
            onChange={props.setAlertsNotifyWhileFocused}
            disabled={disabledByMaster}
          />
        }
      />

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.drops")}</SectionLabel>
        <SettingRow
          disabled={disabledByMaster}
          label={t("settings.row.alertsDropClaimed.label")}
          description={t("settings.row.alertsDropClaimed.description")}
          control={
            <SettingsToggle
              checked={props.alertsDropClaimed}
              onChange={props.setAlertsDropClaimed}
              disabled={disabledByMaster}
            />
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster}
          label={t("settings.row.alertsDropEndingSoon.label")}
          description={t("settings.row.alertsDropEndingSoon.description")}
          control={
            <SettingsToggle
              checked={props.alertsDropEndingSoon}
              onChange={props.setAlertsDropEndingSoon}
              disabled={disabledByMaster}
            />
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster || !props.alertsDropEndingSoon}
          label={t("settings.row.alertsDropEndingMinutes.label")}
          description={t("settings.row.alertsDropEndingMinutes.description")}
          control={
            <div className="flex items-center gap-2">
              <Input
                tone="dp"
                type="number"
                min={1}
                value={props.alertsDropEndingMinutes}
                onChange={(e) =>
                  props.setAlertsDropEndingMinutes(Math.max(1, Number(e.target.value) || 1))
                }
                disabled={disabledByMaster || !props.alertsDropEndingSoon}
                aria-label={t("settings.aria.endingSoonMinutes")}
                className="w-24"
              />
              <span className="font-mono text-[10px] text-[color:var(--dp-text-dimmer)]">
                {t("settings.unit.min")}
              </span>
            </div>
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster}
          label={t("settings.row.alertsNewDrops.label")}
          description={t("settings.row.alertsNewDrops.description")}
          control={
            <SettingsToggle
              checked={props.alertsNewDrops}
              onChange={props.setAlertsNewDrops}
              disabled={disabledByMaster}
            />
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.engine")}</SectionLabel>
        <SettingRow
          disabled={disabledByMaster}
          label={t("settings.row.alertsWatchError.label")}
          description={t("settings.row.alertsWatchError.description")}
          control={
            <SettingsToggle
              checked={props.alertsWatchError}
              onChange={props.setAlertsWatchError}
              disabled={disabledByMaster}
            />
          }
        />
        <SettingRow
          divided
          disabled={disabledByMaster}
          label={t("settings.row.alertsAutoSwitch.label")}
          description={t("settings.row.alertsAutoSwitch.description")}
          control={
            <SettingsToggle
              checked={props.alertsAutoSwitch}
              onChange={props.setAlertsAutoSwitch}
              disabled={disabledByMaster}
            />
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>{t("settings.subsection.webhook")}</SectionLabel>
        <SettingRow
          label={t("settings.row.webhookEnabled.label")}
          description={t("settings.row.webhookEnabled.description")}
          control={
            <SettingsToggle checked={props.webhookEnabled} onChange={props.setWebhookEnabled} />
          }
        />
        <SettingRow
          divided
          stacked
          disabled={!props.webhookEnabled}
          label={t("settings.row.webhookUrl.label")}
          description={t("settings.row.webhookUrl.description")}
          control={
            <Input
              tone="dp"
              type="url"
              value={props.webhookUrl}
              onChange={(e) => props.setWebhookUrl(e.target.value)}
              placeholder={t("settings.row.webhookUrl.placeholder")}
              disabled={!props.webhookEnabled}
              aria-label={t("settings.row.webhookUrl.label")}
              className="w-full"
            />
          }
        />
        <SettingRow
          divided
          disabled={!props.webhookEnabled}
          label={t("settings.action.webhookTest")}
          description={webhookTestStatus ?? t("settings.row.webhookTest.description")}
          control={
            <Button
              variant="dp-secondary"
              size="dp-md"
              onClick={() => void handleWebhookTest()}
              disabled={!props.webhookEnabled || !props.webhookUrl || webhookTestSending}
            >
              {t("settings.action.webhookTest")}
            </Button>
          }
        />
        <SettingRow
          divided
          disabled={!props.webhookEnabled}
          label={t("settings.row.alertsDropClaimed.label")}
          description={t("settings.row.alertsDropClaimed.description")}
          control={
            <SettingsToggle
              checked={props.webhookDropClaimed}
              onChange={props.setWebhookDropClaimed}
              disabled={!props.webhookEnabled}
            />
          }
        />
        <SettingRow
          divided
          disabled={!props.webhookEnabled}
          label={t("settings.row.alertsWatchError.label")}
          description={t("settings.row.alertsWatchError.description")}
          control={
            <SettingsToggle
              checked={props.webhookWatchError}
              onChange={props.setWebhookWatchError}
              disabled={!props.webhookEnabled}
            />
          }
        />
        <SettingRow
          divided
          disabled={!props.webhookEnabled}
          label={t("settings.row.alertsDropEndingSoon.label")}
          description={t("settings.row.alertsDropEndingSoon.description")}
          control={
            <SettingsToggle
              checked={props.webhookDropEndingSoon}
              onChange={props.setWebhookDropEndingSoon}
              disabled={!props.webhookEnabled}
            />
          }
        />
        <SettingRow
          divided
          disabled={!props.webhookEnabled}
          label={t("settings.row.alertsAutoSwitch.label")}
          description={t("settings.row.alertsAutoSwitch.description")}
          control={
            <SettingsToggle
              checked={props.webhookAutoSwitch}
              onChange={props.setWebhookAutoSwitch}
              disabled={!props.webhookEnabled}
            />
          }
        />
        <SettingRow
          divided
          disabled={!props.webhookEnabled}
          label={t("settings.row.alertsNewDrops.label")}
          description={t("settings.row.alertsNewDrops.description")}
          control={
            <SettingsToggle
              checked={props.webhookNewDrops}
              onChange={props.setWebhookNewDrops}
              disabled={!props.webhookEnabled}
            />
          }
        />
      </div>
    </div>
  );
}
