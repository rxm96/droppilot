import { isVerboseLoggingEnabled } from "./logger";

type RenderStat = {
  id: string;
  renders: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  lastAt: number;
};

type PerfSnapshot = {
  version: number;
  items: Array<{
    id: string;
    renders: number;
    avgMs: number;
    maxMs: number;
    lastMs: number;
    lastAt: number;
  }>;
};

const stats = new Map<string, RenderStat>();
let version = 0;
const PERF_ENTRY_TTL_MS = 20 * 60_000;
const PERF_MAX_ENTRIES = 120;

export const isPerfEnabled = () => isVerboseLoggingEnabled();

const pruneStats = (now: number) => {
  const before = stats.size;

  for (const [id, stat] of stats) {
    if (now - stat.lastAt > PERF_ENTRY_TTL_MS) {
      stats.delete(id);
    }
  }

  if (stats.size > PERF_MAX_ENTRIES) {
    const overflow = stats.size - PERF_MAX_ENTRIES;
    const oldestFirst = Array.from(stats.values()).sort((a, b) => a.lastAt - b.lastAt);
    for (let i = 0; i < overflow; i += 1) {
      const candidate = oldestFirst[i];
      if (candidate) {
        stats.delete(candidate.id);
      }
    }
  }

  if (stats.size !== before) {
    version += 1;
  }
};

export const recordRender = (id: string, durationMs: number) => {
  if (!isPerfEnabled()) return;
  if (!id) return;
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const now = Date.now();
  pruneStats(now);
  const current = stats.get(id);
  if (!current) {
    stats.set(id, {
      id,
      renders: 1,
      totalMs: durationMs,
      maxMs: durationMs,
      lastMs: durationMs,
      lastAt: now,
    });
  } else {
    current.renders += 1;
    current.totalMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    current.lastMs = durationMs;
    current.lastAt = now;
  }
  version += 1;
};

export const getPerfSnapshot = (): PerfSnapshot => {
  pruneStats(Date.now());
  const items = Array.from(stats.values())
    .map((stat) => ({
      id: stat.id,
      renders: stat.renders,
      avgMs: stat.renders ? Math.round((stat.totalMs / stat.renders) * 100) / 100 : 0,
      maxMs: Math.round(stat.maxMs * 100) / 100,
      lastMs: Math.round(stat.lastMs * 100) / 100,
      lastAt: stat.lastAt,
    }))
    .sort((a, b) => b.avgMs - a.avgMs);
  return { version, items };
};

export const resetPerfStore = () => {
  if (stats.size === 0) return;
  stats.clear();
  version += 1;
};
