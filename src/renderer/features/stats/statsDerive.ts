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
  const isActive = (key: string): boolean =>
    key in daily && daily[key].minutes > 0;

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
  const result: { date: string; minutes: number }[] = [];
  // today is the last (index rangeDays - 1), oldest is index 0
  for (let i = rangeDays - 1; i >= 0; i--) {
    const ts = now - i * DAY_MS;
    const date = localDateKey(ts);
    result.push({ date, minutes: daily[date]?.minutes ?? 0 });
  }
  return result;
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
