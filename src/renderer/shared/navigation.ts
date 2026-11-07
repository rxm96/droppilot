import type { View } from "./types";

const VIEWS: readonly View[] = [
  "overview",
  "inventory",
  "priorities",
  "stats",
  "settings",
  "debug",
];

/**
 * Maps any requested view onto one that exists. `control` was merged into
 * overview (UI polish phase 2), so it and any unknown value land on overview;
 * `debug` is only reachable while the debug view is switched on.
 */
export function resolveView(raw: string | null | undefined, opts: { debugEnabled: boolean }): View {
  const view = VIEWS.find((v) => v === raw);
  if (!view) return "overview";
  if (view === "debug" && !opts.debugEnabled) return "overview";
  return view;
}
