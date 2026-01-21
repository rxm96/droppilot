import type { ComponentProps } from "react";
import { ControlView } from "../../features/control/ControlView";
import { DebugView } from "../../features/debug/DebugView";
import { InventoryView } from "../../features/inventory/InventoryView";
import { OverviewView } from "../../features/overview/OverviewView";
import { SettingsView } from "../../features/settings/SettingsView";
import { Sidebar } from "./Sidebar";

type AppContentProps = {
  sidebarProps: ComponentProps<typeof Sidebar>;
  overviewProps: ComponentProps<typeof OverviewView>;
  inventoryProps: ComponentProps<typeof InventoryView>;
  settingsProps: ComponentProps<typeof SettingsView>;
  controlProps: ComponentProps<typeof ControlView>;
  debugSnapshot: Record<string, unknown>;
};

export function AppContent({
  sidebarProps,
  overviewProps,
  inventoryProps,
  settingsProps,
  controlProps,
  debugSnapshot,
}: AppContentProps) {
  const view = sidebarProps.view;
  return (
    <main className="layout">
      <Sidebar {...sidebarProps} />

      <section className="panel inventory-panel">
        {view === "overview" && <OverviewView {...overviewProps} />}

        {view === "inventory" && <InventoryView {...inventoryProps} />}

        {view === "settings" && <SettingsView {...settingsProps} />}

        {view === "control" && <ControlView {...controlProps} />}

        {view === "debug" && <DebugView snapshot={debugSnapshot} />}
      </section>
    </main>
  );
}
