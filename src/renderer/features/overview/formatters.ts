// Shared formatting helpers for the Phase 2 Overview panels.
// No React imports — pure functions.

import { msToMinutes } from "../settings/sections/refreshIntervalField";

export function formatHourMinute(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${pad(m)}m`;
}

/**
 * The hero's "% complete" is about the active drop only. With nothing being
 * watched there is no such number, so return null rather than letting callers
 * fall back to the game-wide aggregate (which made hero and queue disagree).
 */
export function resolveHeroProgress(activeDropProgress: number | null | undefined): number | null {
  if (typeof activeDropProgress !== "number" || !Number.isFinite(activeDropProgress)) return null;
  return Math.max(0, Math.min(100, Math.round(activeDropProgress)));
}

/**
 * A drop's ETA as the local clock time it becomes ready ("14:34") plus the
 * whole minutes left until then. One format for every screen. Built from
 * getHours/getMinutes, not toLocaleTimeString, so it never shows seconds and
 * stays deterministic. Null when there is no predictable ETA.
 */
export function formatReadyAt(
  eta: number | null | undefined,
  now: number,
): { clock: string; minutesLeft: number } | null {
  if (typeof eta !== "number" || !Number.isFinite(eta)) return null;
  const date = new Date(eta);
  return {
    clock: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    minutesLeft: Math.max(0, Math.ceil((eta - now) / 60_000)),
  };
}

/**
 * Time until a campaign ends as one compact unit ("2d", "18h", "40m"),
 * rounded down (at least 1m). Null when unknown or already over.
 */
export function formatEndsIn(endsAt: string | null | undefined, now: number): string | null {
  const end = endsAt ? Date.parse(endsAt) : Number.NaN;
  if (!Number.isFinite(end) || end <= now) return null;
  const minutes = Math.max(1, Math.floor((end - now) / 60_000));
  if (minutes >= 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h`;
  return `${minutes}m`;
}

export function formatPercent(n: number): string {
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

export function formatRelative(
  timestamp: number | null | undefined,
  now: number = Date.now(),
): string {
  // `timestamp <= 0` covers the idle/never-set sentinel (watchStats.lastOk
  // defaults to 0). Without this guard `now - 0` renders as "~20604d ago"
  // (milliseconds since the 1970 epoch) instead of "--".
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) return "--";
  const diff = Math.max(0, now - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatUptime(sinceMs: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - sinceMs);
  const totalMinutes = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${pad(m)}m`;
}

/**
 * Inventory-refresh interval window (min/max in ms) → a compact minutes label for
 * the EnginePanel "cadence" row, e.g. "60–70 min" (or "60 min" when min === max).
 * `unit` is the already-translated minutes abbreviation, keeping this pure.
 */
export function formatRefreshCadence(minMs: number, maxMs: number, unit: string): string {
  const lo = msToMinutes(minMs);
  const hi = msToMinutes(maxMs);
  return lo === hi ? `${lo} ${unit}` : `${lo}–${hi} ${unit}`;
}

export function padRank(n: number, width: number = 2): string {
  return String(Math.max(0, Math.floor(n))).padStart(width, "0");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
