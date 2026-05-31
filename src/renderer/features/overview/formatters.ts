// Shared formatting helpers for the Phase 2 Overview panels.
// No React imports — pure functions.

export function formatRemainingFromEta(
  eta: number | null | undefined,
  fallbackMinutes: number | undefined,
  now: number = Date.now(),
): string {
  const hasEta = typeof eta === "number" && Number.isFinite(eta);
  if (hasEta) {
    const remaining = Math.max(0, Math.ceil((eta - now) / 1000));
    return formatHMS(remaining);
  }
  if (typeof fallbackMinutes === "number" && Number.isFinite(fallbackMinutes)) {
    return formatHMS(Math.max(0, Math.ceil(fallbackMinutes * 60)));
  }
  return "--";
}

export function formatHMS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatHourMinute(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${pad(m)}m`;
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

export function padRank(n: number, width: number = 2): string {
  return String(Math.max(0, Math.floor(n))).padStart(width, "0");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
