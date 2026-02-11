import type { ComponentProps, ReactNode } from "react";
import { Profiler, useCallback } from "react";
import { ControlView } from "./ControlView";
import { DebugView } from "./DebugView";
import { InventoryView } from "./InventoryView";
import { OverviewView } from "./OverviewView";
import { PriorityView } from "./PriorityView";
import { SettingsView } from "./SettingsView";
import { TopNav } from "./TopNav";
import { useI18n } from "../i18n";
import { isPerfEnabled, recordRender } from "../utils/perfStore";

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
  debugEnabled: boolean;
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
  debugEnabled,
}: AppContentProps) {
  const { t } = useI18n();
  const view = navProps.view;
  const renderWithPerf = useCallback(
    (id: string, node: ReactNode) => {
      if (!debugEnabled || !isPerfEnabled()) return node;
      return (
        <Profiler id={id} onRender={(_, __, actualDuration) => recordRender(id, actualDuration)}>
          {node}
        </Profiler>
      );
    },
    [debugEnabled],
  );
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
        {view === "overview" && renderWithPerf("OverviewView", <OverviewView {...overviewProps} />)}

        {view === "inventory" && renderWithPerf("InventoryView", <InventoryView {...inventoryProps} />)}

        {view === "priorities" && renderWithPerf("PriorityView", <PriorityView {...priorityProps} />)}

        {view === "settings" && renderWithPerf("SettingsView", <SettingsView {...settingsProps} />)}

        {view === "control" && renderWithPerf("ControlView", <ControlView {...controlProps} />)}

        {view === "debug" && renderWithPerf("DebugView", <DebugView snapshot={debugSnapshot} />)}
      </section>
    </main>
  );
}
