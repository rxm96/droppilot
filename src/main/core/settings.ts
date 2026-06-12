import { app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  applySettingsPatch,
  normalizeSettings,
  type AppSettings,
  type SettingsSaveData,
} from "../../shared/settingsSchema";

// The schema (src/shared/settingsSchema.ts) is the single source of truth for
// keys, defaults, and normalization. This module only owns durable storage:
// atomic writes, the backup mirror, corrupt-primary recovery, and write
// serialization.
export type SettingsData = AppSettings;
export type { SettingsSaveData };

const settingsFile = join(app.getPath("userData"), "settings.json");
// Mirror of the last successfully-written settings. If the primary file is ever
// truncated/corrupted (e.g. a write interrupted by an update restart), load
// recovers from here instead of falling back to empty defaults — which a later
// save would otherwise persist over the real data.
const backupFile = join(app.getPath("userData"), "settings.bak.json");

// All writes flow through one promise chain so concurrent saves (window-bounds
// autosave + a settings toggle, etc.) can't interleave their read-modify-write.
let writeQueue: Promise<unknown> = Promise.resolve();
let tmpCounter = 0;

/**
 * Write atomically: write to a temp file, then rename over the target. rename
 * is atomic on the same volume (Windows + POSIX), so an interrupted or crashed
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

export async function loadSettings(): Promise<SettingsData> {
  let source = await readRawJson(settingsFile);
  if (source.status === "corrupt") {
    // Primary file is unreadable/truncated. Preserve it for forensics (best
    // effort) and recover from the backup rather than returning empty defaults
    // that a subsequent save would persist over the real data.
    await fs.rename(settingsFile, `${settingsFile}.corrupt`).catch(() => undefined);
    const backup = await readRawJson(backupFile);
    if (backup.status === "ok") {
      source = backup;
      await atomicWrite(settingsFile, backup.raw).catch(() => undefined);
    }
  }
  if (source.status !== "ok") return normalizeSettings(undefined);

  try {
    return normalizeSettings(JSON.parse(source.raw));
  } catch {
    // Unparseable JSON (recovered backup included) → full defaults, same as legacy.
    return normalizeSettings(undefined);
  }
}

export async function saveSettings(data: SettingsSaveData): Promise<SettingsData> {
  // Serialize through the write queue so overlapping saves (e.g. window-bounds
  // autosave racing a settings toggle) can't interleave their read-modify-write.
  const run = writeQueue.then(() => persistSettings(data));
  writeQueue = run.catch(() => undefined);
  return run;
}

async function persistSettings(data: SettingsSaveData): Promise<SettingsData> {
  const current = await loadSettings();
  const next = applySettingsPatch(current, data);
  const serialized = JSON.stringify(next, null, 2);
  await atomicWrite(settingsFile, serialized);
  // Mirror to the backup so a future corrupt primary can be recovered.
  await atomicWrite(backupFile, serialized).catch(() => undefined);
  return next;
}

export async function exportSettings(): Promise<SettingsData> {
  return loadSettings();
}

export async function importSettings(payload: SettingsSaveData): Promise<SettingsData> {
  // Reuse the same merge/validation logic as saveSettings
  return saveSettings(payload);
}
