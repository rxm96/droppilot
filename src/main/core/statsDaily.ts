export const RETENTION_DAYS = 180;
export type DailyEntry = { minutes: number; claims: number };
export type DailyMap = Record<string, DailyEntry>;

// "YYYY-MM-DD" in LOCAL time (so streaks align to the user's day)
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const clampInt = (v: unknown): number => {
  const n = Math.floor(Number(v) || 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

export function normalizeDaily(input: unknown): DailyMap {
  if (!input || typeof input !== "object") return {};
  const out: DailyMap = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!KEY_RE.test(k) || !v || typeof v !== "object") continue;
    const minutes = clampInt((v as DailyEntry).minutes);
    const claims = clampInt((v as DailyEntry).claims);
    if (minutes > 0 || claims > 0) out[k] = { minutes, claims };
  }
  return out;
}

export function addToDaily(
  daily: DailyMap,
  now: number,
  delta: { minutes?: number; claims?: number },
): DailyMap {
  const key = localDateKey(now);
  const cur = daily[key] ?? { minutes: 0, claims: 0 };
  return {
    ...daily,
    [key]: {
      minutes: cur.minutes + clampInt(delta.minutes),
      claims: cur.claims + clampInt(delta.claims),
    },
  };
}

export function pruneDaily(daily: DailyMap, now: number, retentionDays = RETENTION_DAYS): DailyMap {
  const cutoff = localDateKey(now - retentionDays * 86_400_000);
  const out: DailyMap = {};
  for (const [k, v] of Object.entries(daily)) if (k >= cutoff) out[k] = v;
  return out;
}
