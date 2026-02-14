import type { ComponentProps, ReactNode } from "react";
import { Profiler, useCallback } from "react";
import {
  ControlView,
  DebugView,
  InventoryView,
  OverviewView,
  PriorityView,
  SettingsView,
} from "@renderer/features";
import { TopNav } from "./TopNav";
import { isPerfEnabled, recordRender } from "@renderer/shared/utils/perfStore";

type AppContentProps = {
  navProps: ComponentProps<typeof TopNav>;
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
  overviewProps,
  inventoryProps,
  priorityProps,
  settingsProps,
  controlProps,
  debugSnapshot,
  debugEnabled,
}: AppContentProps) {
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
  return (
    <main className="layout">
      <TopNav {...navProps} />

      <section className="panel inventory-panel">
        {view === "overview" && renderWithPerf("OverviewView", <OverviewView {...overviewProps} />)}

        {view === "inventory" &&
          renderWithPerf("InventoryView", <InventoryView {...inventoryProps} />)}

        {view === "priorities" &&
          renderWithPerf("PriorityView", <PriorityView {...priorityProps} />)}

        {view === "settings" && renderWithPerf("SettingsView", <SettingsView {...settingsProps} />)}

        {view === "control" && renderWithPerf("ControlView", <ControlView {...controlProps} />)}

        {view === "debug" && renderWithPerf("DebugView", <DebugView snapshot={debugSnapshot} />)}
      </section>
    </main>
  );
}
