import type { ComponentProps } from "react";
import { ControlView } from "./ControlView";
import { DebugView } from "./DebugView";
import { InventoryView } from "./InventoryView";
import { OverviewView } from "./OverviewView";
import { PriorityView } from "./PriorityView";
import { SettingsView } from "./SettingsView";
import { TopNav } from "./TopNav";
import { useI18n } from "../i18n";

type AppContentProps = {
  navProps: ComponentProps<typeof TopNav>;
  authProps: {
    auth: ComponentProps<typeof TopNav>["auth"];
    creds: { username: string; password: string; token: string };
    setCreds: (next: { username: string; password: string; token: string }) => void;
    startLoginWithCreds: () => void;
  };
  overviewProps: ComponentProps<typeof OverviewView>;
  inventoryProps: ComponentProps<typeof InventoryView>;
  priorityProps: ComponentProps<typeof PriorityView>;
  settingsProps: ComponentProps<typeof SettingsView>;
  controlProps: ComponentProps<typeof ControlView>;
  debugSnapshot: Record<string, unknown>;
};

export function AppContent({
  navProps,
  authProps,
  overviewProps,
  inventoryProps,
  priorityProps,
  settingsProps,
  controlProps,
  debugSnapshot,
}: AppContentProps) {
  const { t } = useI18n();
  const view = navProps.view;
  const { auth, creds, setCreds, startLoginWithCreds } = authProps;
  return (
    <main className="layout">
      <TopNav {...navProps} />
      {auth.status !== "ok" && (
        <section className="auth-panel">
          <div className="auth-panel-head">
            <div>
              <div className="auth-panel-title">{t("session.credentials")}</div>
              <div className="auth-panel-help">{t("session.loginNeeded")}</div>
            </div>
          </div>
          <div className="auth-form">
            <input
              type="text"
              placeholder={t("session.username")}
              value={creds.username}
              onChange={(e) => setCreds({ ...creds, username: e.target.value })}
            />
            <input
              type="password"
              placeholder={t("session.password")}
              value={creds.password}
              onChange={(e) => setCreds({ ...creds, password: e.target.value })}
            />
            <input
              type="text"
              placeholder={t("session.token")}
              value={creds.token}
              onChange={(e) => setCreds({ ...creds, token: e.target.value })}
            />
            <button
              type="button"
              className="auth-submit"
              onClick={startLoginWithCreds}
              disabled={auth.status === "pending"}
            >
              {auth.status === "pending" ? t("session.login") : t("session.loginCredentials")}
            </button>
          </div>
        </section>
      )}

      <section className="panel inventory-panel">
        {view === "overview" && <OverviewView {...overviewProps} />}

        {view === "inventory" && <InventoryView {...inventoryProps} />}

        {view === "priorities" && <PriorityView {...priorityProps} />}

        {view === "settings" && <SettingsView {...settingsProps} />}

        {view === "control" && <ControlView {...controlProps} />}

        {view === "debug" && <DebugView snapshot={debugSnapshot} />}
      </section>
    </main>
  );
}
