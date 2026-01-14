import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";

export type StatsData = {
  totalMinutes: number;
  totalClaims: number;
  lastReset: number;
  lastMinuteAt?: number;
  lastClaimAt?: number;
  lastDropTitle?: string;
  lastGame?: string;
};

const statsFile = join(app.getPath("userData"), "stats.json");

const defaultStats: StatsData = {
  totalMinutes: 0,
  totalClaims: 0,
  lastReset: Date.now(),
};

async function writeStats(data: StatsData): Promise<StatsData> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(statsFile, JSON.stringify(data, null, 2), "utf-8");
  return data;
}

export async function loadStats(): Promise<StatsData> {
  try {
    const raw = await fs.readFile(statsFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StatsData>;
    return {
      ...defaultStats,
      ...parsed,
      totalMinutes: Math.max(0, Number(parsed?.totalMinutes) || 0),
      totalClaims: Math.max(0, Number(parsed?.totalClaims) || 0),
      lastReset: typeof parsed?.lastReset === "number" ? parsed.lastReset : defaultStats.lastReset,
    };
  } catch {
    return defaultStats;
  }
}

export async function saveStats(data: Partial<StatsData>): Promise<StatsData> {
  const current = await loadStats();
  const next: StatsData = {
    ...current,
    ...data,
    totalMinutes: Math.max(0, Number(data.totalMinutes ?? current.totalMinutes) || 0),
    totalClaims: Math.max(0, Number(data.totalClaims ?? current.totalClaims) || 0),
    lastReset: typeof data.lastReset === "number" ? data.lastReset : current.lastReset,
  };
  return writeStats(next);
}

export async function bumpStats(delta: {
  minutes?: number;
  claims?: number;
  lastDropTitle?: string;
  lastGame?: string;
}): Promise<StatsData> {
  const current = await loadStats();
  const next: StatsData = {
    ...current,
    totalMinutes: Math.max(0, current.totalMinutes + Math.max(0, delta.minutes ?? 0)),
    totalClaims: Math.max(0, current.totalClaims + Math.max(0, delta.claims ?? 0)),
    lastMinuteAt: delta.minutes && delta.minutes > 0 ? Date.now() : current.lastMinuteAt,
    lastClaimAt: delta.claims && delta.claims > 0 ? Date.now() : current.lastClaimAt,
    lastDropTitle: delta.lastDropTitle ?? current.lastDropTitle,
    lastGame: delta.lastGame ?? current.lastGame,
    lastReset: current.lastReset,
  };
  return writeStats(next);
}

export async function resetStats(): Promise<StatsData> {
  const base: StatsData = { ...defaultStats, lastReset: Date.now() };
  return writeStats(base);
}
