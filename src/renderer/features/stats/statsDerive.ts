type DailyMap = Record<string, { minutes: number; claims: number }>;

function localDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_MS = 86_400_000;

const minusOneDay = (ts: number): number => {
  const d = new Date(ts);
  d.setDate(d.getDate() - 1);
  return d.getTime();
};

/**
 * Compute the current streak and the longest streak from a daily activity map.
 *
 * A day is "active" if its entry exists and `minutes > 0`.
 *
 * Current streak: count consecutive active days walking backward from today.
 * If today is not active, start the count from yesterday instead (today may
 * legitimately still be 0 early in the day). Stop at the first inactive day.
 *
 * Longest streak: the maximum run of consecutive active calendar days anywhere
 * in the map.
 */
export function computeStreaks(
  daily: DailyMap,
  now = Date.now(),
): { current: number; longest: number } {
  const isActive = (key: string): boolean => key in daily && daily[key].minutes > 0;

  // --- current streak ---
  const todayKey = localDateKey(now);
  let startTs = isActive(todayKey) ? now : minusOneDay(now);

  let current = 0;
  let cursor = startTs;
  while (true) {
    const key = localDateKey(cursor);
    if (isActive(key)) {
      current++;
      cursor = minusOneDay(cursor);
    } else {
      break;
    }
  }

  // --- longest streak ---
  const activeKeys = Object.keys(daily)
    .filter((k) => daily[k].minutes > 0)
    .sort(); // lexicographic sort works for YYYY-MM-DD

  let longest = 0;
  let runLength = 0;

  for (let i = 0; i < activeKeys.length; i++) {
    if (i === 0) {
      runLength = 1;
    } else {
      const prevTs = new Date(activeKeys[i - 1]).getTime();
      const currTs = new Date(activeKeys[i]).getTime();
      // Consecutive if exactly 1 calendar day apart (86_400_000 ms)
      if (currTs - prevTs === DAY_MS) {
        runLength++;
      } else {
        runLength = 1;
      }
    }
    if (runLength > longest) {
      longest = runLength;
    }
  }

  return { current, longest };
}

/**
 * Build a dense, zero-filled trend series of exactly `rangeDays` entries
 * ending today (inclusive), ordered oldest → newest.
 */
export function buildTrendSeries(
  daily: DailyMap,
  rangeDays: number,
  now = Date.now(),
): { date: string; minutes: number }[] {
  // Step by calendar day from local midnight to avoid DST-transition duplicates/gaps.
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const series: { date: string; minutes: number }[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const date = localDateKey(d.getTime());
    series.push({ date, minutes: daily[date]?.minutes ?? 0 });
  }
  return series;
}

/**
 * Return the top `limit` games by claims, sorted descending.
 */
export function topGames(
  claimsByGame: Record<string, number>,
  limit = 5,
): { name: string; claims: number }[] {
  return Object.entries(claimsByGame)
    .map(([name, claims]) => ({ name, claims }))
    .sort((a, b) => b.claims - a.claims)
    .slice(0, limit);
}

/**
 * Format a minute count as a human-readable string.
 * Locale-neutral; no plural words.
 * Examples: 0 → "0m", 40 → "40m", 120 → "2h 0m", 700 → "11h 40m".
 * Negative or NaN values are treated as 0.
 */
export function formatWatchTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    minutes = 0;
  }
  const mins = Math.floor(minutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) {
    return `${m}m`;
  }
  return `${h}h ${m}m`;
}

/**
 * Short hour label for the chart summary and y-axis ticks.
 * Under an hour: whole minutes ("40m"); under ten hours: one decimal ("1.5h");
 * from ten hours: whole hours ("347h"). Zero, negative and NaN → "0".
 */
export function formatHoursShort(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0";
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  const hours = minutes / 60;
  if (minutes < 600) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours)}h`;
}

/** Chart scale steps in hours; the smallest one that fits the busiest day wins. */
const SCALE_STEPS_HOURS = [1, 2, 4, 6, 8, 12, 16, 20, 24];
/** Smallest bar height (in % of the chart) for a day that has any minutes. */
const MIN_BAR_PCT = 2;

export type WatchChartBar = { date: string; minutes: number; pct: number; today: boolean };

export type WatchChart = {
  bars: WatchChartBar[];
  totalMinutes: number;
  /** Average per calendar day of the range (days without watching count as 0). */
  avgMinutes: number;
  /** Minutes at the top of the chart. */
  scaleMinutes: number;
  /** y-axis ticks in minutes: top, half, zero. */
  ticks: [number, number, number];
};

function chartScaleMinutes(maxMinutes: number): number {
  const step = SCALE_STEPS_HOURS.find((h) => h * 60 >= maxMinutes);
  if (step !== undefined) return step * 60;
  // Above 24h (corrupt data): round up to 4-hour steps.
  return Math.ceil(maxMinutes / 240) * 240;
}

/**
 * Watch-time bars for the last `rangeDays` days (oldest → newest, today last),
 * with the total, the daily average and a rounded scale for the y-axis.
 */
export function buildWatchChart(daily: DailyMap, rangeDays: number, now = Date.now()): WatchChart {
  const series = buildTrendSeries(daily, rangeDays, now);
  const totalMinutes = series.reduce((sum, s) => sum + s.minutes, 0);
  const maxMinutes = series.reduce((max, s) => Math.max(max, s.minutes), 0);
  const scaleMinutes = chartScaleMinutes(maxMinutes);
  const bars = series.map((s, i) => ({
    date: s.date,
    minutes: s.minutes,
    pct: s.minutes > 0 ? Math.max(MIN_BAR_PCT, (s.minutes / scaleMinutes) * 100) : 0,
    today: i === series.length - 1,
  }));
  return {
    bars,
    totalMinutes,
    avgMinutes: series.length > 0 ? totalMinutes / series.length : 0,
    scaleMinutes,
    ticks: [scaleMinutes, scaleMinutes / 2, 0],
  };
}

/** Heatmap intensity 0–3: 0 = nothing, then thirds of the busiest day. */
export function calendarLevel(minutes: number, maxMinutes: number): 0 | 1 | 2 | 3 {
  if (!(minutes > 0) || !(maxMinutes > 0)) return 0;
  if (minutes * 3 <= maxMinutes) return 1;
  if (minutes * 3 <= maxMinutes * 2) return 2;
  return 3;
}

export type CalendarCell = { date: string; minutes: number; claims: number; level: 0 | 1 | 2 | 3 };

/**
 * A calendar heatmap: `weeks` columns of 7 days (Monday first), the last
 * column being the current week. Days after today are `null`.
 */
export function buildCalendar(
  daily: DailyMap,
  weeks: number,
  now = Date.now(),
): { weeks: (CalendarCell | null)[][] } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sinceMonday = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(start.getDate() - sinceMonday - (weeks - 1) * 7);

  const raw: ({ date: string; minutes: number; claims: number } | null)[][] = [];
  let max = 0;
  for (let w = 0; w < weeks; w++) {
    const column: ({ date: string; minutes: number; claims: number } | null)[] = [];
    for (let d = 0; d < 7; d++) {
      // Step by calendar day (not 24h) so DST changes cannot skip or repeat a day.
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      if (day.getTime() > today.getTime()) {
        column.push(null);
        continue;
      }
      const date = localDateKey(day.getTime());
      const minutes = Math.max(0, Number(daily[date]?.minutes) || 0);
      const claims = Math.max(0, Number(daily[date]?.claims) || 0);
      max = Math.max(max, minutes);
      column.push({ date, minutes, claims });
    }
    raw.push(column);
  }
  return {
    weeks: raw.map((column) =>
      column.map((cell) => (cell ? { ...cell, level: calendarLevel(cell.minutes, max) } : null)),
    ),
  };
}
