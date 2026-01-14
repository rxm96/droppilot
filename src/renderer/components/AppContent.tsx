import type { ComponentProps } from "react";
import { ControlView } from "./ControlView";
import { DebugView } from "./DebugView";
import { InventoryView } from "./InventoryView";
import { OverviewView } from "./OverviewView";
import { SettingsView } from "./SettingsView";
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
