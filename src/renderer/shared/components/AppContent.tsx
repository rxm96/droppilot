import type { ComponentProps, ReactNode } from "react";
import { Profiler, Suspense, lazy, useCallback } from "react";
import { OverviewView } from "@renderer/features/overview";
import type { View } from "@renderer/shared/types";
import { isPerfEnabled, recordRender } from "@renderer/shared/utils/perfStore";

// Non-overview views are code-split. Importing each from its own feature entry
// (not the @renderer/features barrel, which would eagerly pull every view) keeps
// @dnd-kit (priorities), Radix (settings), the stats charts and the
// diagnostics-only DebugView out of the startup chunk. Overview is the default
// landing view, so it stays eager for an instant first paint.
const ControlView = lazy(() =>
  import("@renderer/features/control").then((m) => ({ default: m.ControlView })),
);
const DebugView = lazy(() =>
  import("@renderer/features/debug").then((m) => ({ default: m.DebugView })),
);
const InventoryView = lazy(() =>
  import("@renderer/features/inventory").then((m) => ({ default: m.InventoryView })),
);
const PriorityView = lazy(() =>
  import("@renderer/features/priority").then((m) => ({ default: m.PriorityView })),
);
const SettingsView = lazy(() =>
  import("@renderer/features/settings").then((m) => ({ default: m.SettingsView })),
);
const StatsView = lazy(() =>
  import("@renderer/features/stats").then((m) => ({ default: m.StatsView })),
);

type NavProps = {
  view: View;
  setView: (next: View) => void;
};

type AppContentProps = {
  navProps: NavProps;
  overviewProps: ComponentProps<typeof OverviewView>;
  statsProps: ComponentProps<typeof StatsView>;
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
  statsProps,
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
    <main className="px-8 py-7 max-w-[1640px] mx-auto">
      <Suspense fallback={null}>
        {view === "overview" && renderWithPerf("OverviewView", <OverviewView {...overviewProps} />)}
        {view === "stats" && renderWithPerf("StatsView", <StatsView {...statsProps} />)}
        {view === "inventory" &&
          renderWithPerf("InventoryView", <InventoryView {...inventoryProps} />)}
        {view === "priorities" &&
          renderWithPerf("PriorityView", <PriorityView {...priorityProps} />)}
        {view === "settings" && renderWithPerf("SettingsView", <SettingsView {...settingsProps} />)}
        {view === "control" && renderWithPerf("ControlView", <ControlView {...controlProps} />)}
        {view === "debug" && renderWithPerf("DebugView", <DebugView snapshot={debugSnapshot} />)}
      </Suspense>
    </main>
  );
}
