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

export const isPerfEnabled = () => isVerboseLoggingEnabled();

export const recordRender = (id: string, durationMs: number) => {
  if (!isPerfEnabled()) return;
  const now = Date.now();
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
