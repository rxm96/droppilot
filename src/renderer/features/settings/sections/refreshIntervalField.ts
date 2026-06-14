/**
 * Pure conversion/clamp helpers for the "Inventory refresh interval" field.
 *
 * The field edits `refreshMinMs`/`refreshMaxMs` in MINUTES, because the engine
 * enforces a hard 60-minute floor on the inventory-refresh cadence in three
 * independent layers (the renderer settings store, the inventory scheduler in
 * `useInventoryRefresh`, and the persisted-settings `clampRefreshIntervals`).
 * The field used to edit in seconds with a 5-second floor, so any sub-hour value
 * the user typed was silently snapped back up by those clamps on the next render
 * — the input appeared to ignore typing. Speaking the same unit and honoring the
 * same floor here keeps edits stable.
 */
export const MIN_REFRESH_MINUTES = 60;

const MS_PER_MINUTE = 60_000;
const MIN_REFRESH_MS = MIN_REFRESH_MINUTES * MS_PER_MINUTE;

/** Milliseconds → whole minutes for display in the input. */
export const msToMinutes = (ms: number): number => Math.round(ms / MS_PER_MINUTE);

const toFlooredMs = (minutes: number): number =>
  Math.max(MIN_REFRESH_MS, (Number.isFinite(minutes) ? minutes : 0) * MS_PER_MINUTE);

export type RefreshIntervals = { minMs: number; maxMs: number };

/** Apply an edit to the MIN field (value in minutes), keeping max ≥ min. */
export const refreshFromMinMinutes = (minutes: number, currentMaxMs: number): RefreshIntervals => {
  const minMs = toFlooredMs(minutes);
  return { minMs, maxMs: Math.max(minMs, currentMaxMs) };
};

/** Apply an edit to the MAX field (value in minutes), keeping min ≤ max. */
export const refreshFromMaxMinutes = (minutes: number, currentMinMs: number): RefreshIntervals => {
  const maxMs = toFlooredMs(minutes);
  return { minMs: Math.min(maxMs, currentMinMs), maxMs };
};
