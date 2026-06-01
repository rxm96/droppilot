import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { DailyMap, normalizeDaily, addToDaily, pruneDaily } from "./statsDaily";

export type StatsData = {
  totalMinutes: number;
  totalClaims: number;
  lastReset: number;
  lastMinuteAt?: number;
  lastClaimAt?: number;
  lastDropTitle?: string;
  lastGame?: string;
  claimsByGame: Record<string, number>;
  daily: DailyMap;
};

const statsFile = join(app.getPath("userData"), "stats.json");
// Mirror of the last good write. If the primary file is ever truncated/corrupted
// (e.g. a write interrupted by an update restart), load recovers from here
// instead of returning empty defaults — which the next bump would then persist
// over the real data. Mirrors the settings.ts recovery strategy.
const backupFile = join(app.getPath("userData"), "stats.bak.json");

const defaultStats: StatsData = {
  totalMinutes: 0,
  totalClaims: 0,
  lastReset: Date.now(),
  claimsByGame: {},
  daily: {},
};

// All mutations flow through one promise chain so concurrent read-modify-writes
// (a watch-minute bump racing a claim bump, or a reset) can't interleave and
// lose an update.
let writeQueue: Promise<unknown> = Promise.resolve();
let tmpCounter = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => undefined);
  return run;
}

/**
 * Write atomically: write a temp file, then rename over the target. rename is
 * atomic on the same volume (Windows + POSIX), so an interrupted or crashed
 * write never leaves a half-written, unparseable file behind.
 */
async function atomicWrite(file: string, contents: string): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const tmp = `${file}.${process.pid}.${++tmpCounter}.tmp`;
  await fs.writeFile(tmp, contents, "utf-8");
  await fs.rename(tmp, file);
}

type RawRead = { status: "ok"; raw: string } | { status: "missing" } | { status: "corrupt" };

async function readRawJson(file: string): Promise<RawRead> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return { status: "missing" };
    return { status: "corrupt" };
  }
  // An empty/whitespace file means a previous write was truncated mid-flight.
  if (!raw.trim()) return { status: "corrupt" };
  return { status: "ok", raw };
}

function normalizeClaimsByGame(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const entries = Object.entries(input as Record<string, unknown>);
  const result: Record<string, number> = {};
  for (const [key, value] of entries) {
    const name = String(key || "").trim();
    if (!name) continue;
    const count = Math.max(0, Number(value) || 0);
    if (count > 0) result[name] = count;
  }
  return result;
}

function parseStats(raw: string): StatsData {
  const parsed = JSON.parse(raw) as Partial<StatsData>;
  return {
    ...defaultStats,
    ...parsed,
    totalMinutes: Math.max(0, Number(parsed?.totalMinutes) || 0),
    totalClaims: Math.max(0, Number(parsed?.totalClaims) || 0),
    lastReset: typeof parsed?.lastReset === "number" ? parsed.lastReset : defaultStats.lastReset,
    claimsByGame: normalizeClaimsByGame((parsed as StatsData)?.claimsByGame),
    daily: normalizeDaily((parsed as StatsData)?.daily),
  };
}

async function writeStats(data: StatsData): Promise<StatsData> {
  const serialized = JSON.stringify(data, null, 2);
  await atomicWrite(statsFile, serialized);
  // Mirror to the backup so a future corrupt primary can be recovered.
  await atomicWrite(backupFile, serialized).catch(() => undefined);
  return data;
}

export async function loadStats(): Promise<StatsData> {
  let source = await readRawJson(statsFile);
  if (source.status === "corrupt") {
    // Primary is unreadable/truncated. Preserve it for forensics (best effort)
    // and recover from the backup rather than returning empty defaults that a
    // subsequent bump would persist over the user's real history.
    await fs.rename(statsFile, `${statsFile}.corrupt`).catch(() => undefined);
    const backup = await readRawJson(backupFile);
    if (backup.status === "ok") {
      source = backup;
      await atomicWrite(statsFile, backup.raw).catch(() => undefined);
    }
  }
  if (source.status !== "ok") return { ...defaultStats };
  try {
    return parseStats(source.raw);
  } catch {
    return { ...defaultStats };
  }
}

export async function saveStats(data: Partial<StatsData>): Promise<StatsData> {
  return enqueue(() => persistSaveStats(data));
}

async function persistSaveStats(data: Partial<StatsData>): Promise<StatsData> {
  const current = await loadStats();
  const next: StatsData = {
    ...current,
    ...data,
    totalMinutes: Math.max(0, Number(data.totalMinutes ?? current.totalMinutes) || 0),
    totalClaims: Math.max(0, Number(data.totalClaims ?? current.totalClaims) || 0),
    lastReset: typeof data.lastReset === "number" ? data.lastReset : current.lastReset,
    claimsByGame:
      data.claimsByGame !== undefined
        ? normalizeClaimsByGame(data.claimsByGame)
        : current.claimsByGame,
    daily: data.daily !== undefined ? normalizeDaily(data.daily) : current.daily,
  };
  return writeStats(next);
}

export async function bumpStats(delta: {
  minutes?: number;
  claims?: number;
  lastDropTitle?: string;
  lastGame?: string;
}): Promise<StatsData> {
  return enqueue(() => persistBumpStats(delta));
}

async function persistBumpStats(delta: {
  minutes?: number;
  claims?: number;
  lastDropTitle?: string;
  lastGame?: string;
}): Promise<StatsData> {
  const current = await loadStats();
  const claims = Math.max(0, delta.claims ?? 0);
  const nextClaimsByGame = { ...current.claimsByGame };
  if (claims > 0 && delta.lastGame) {
    const key = String(delta.lastGame).trim();
    if (key) {
      nextClaimsByGame[key] = Math.max(0, (nextClaimsByGame[key] ?? 0) + claims);
    }
  }
  const now = Date.now();
  const next: StatsData = {
    ...current,
    totalMinutes: Math.max(0, current.totalMinutes + Math.max(0, delta.minutes ?? 0)),
    totalClaims: Math.max(0, current.totalClaims + claims),
    lastMinuteAt: delta.minutes && delta.minutes > 0 ? now : current.lastMinuteAt,
    lastClaimAt: claims > 0 ? now : current.lastClaimAt,
    lastDropTitle: delta.lastDropTitle ?? current.lastDropTitle,
    lastGame: delta.lastGame ?? current.lastGame,
    lastReset: current.lastReset,
    claimsByGame: nextClaimsByGame,
    daily: pruneDaily(addToDaily(current.daily, now, { minutes: delta.minutes, claims }), now),
  };
  return writeStats(next);
}

export async function resetStats(): Promise<StatsData> {
  return enqueue(() => {
    const base: StatsData = { ...defaultStats, lastReset: Date.now(), claimsByGame: {}, daily: {} };
    return writeStats(base);
  });
}
