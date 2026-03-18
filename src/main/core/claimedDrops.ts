import { app } from "electron";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

export type ClaimedDropRecord = {
  claimedAt: number;
  expiresAt: number;
};

export const CLAIM_WINDOW_AFTER_CAMPAIGN_END_MS = 24 * 60 * 60 * 1000;
export const RECENT_CLAIM_TTL_MS = 48 * 60 * 60 * 1000;

const resolveClaimedDropsFile = (): string =>
  join(app.getPath("userData"), "recentClaimedDrops.json");

const normalizeRecord = (input: unknown): ClaimedDropRecord | null => {
  if (!input || typeof input !== "object") return null;
  const record = input as Partial<ClaimedDropRecord>;
  const claimedAt = Number(record.claimedAt);
  const expiresAt = Number(record.expiresAt);
  if (!Number.isFinite(claimedAt) || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }
  return {
    claimedAt: Math.max(0, claimedAt),
    expiresAt: Math.max(0, expiresAt),
  };
};

export const pruneClaimedDropRecords = (
  input: Record<string, ClaimedDropRecord>,
  now = Date.now(),
): Record<string, ClaimedDropRecord> => {
  const next: Record<string, ClaimedDropRecord> = {};
  for (const [rawKey, rawValue] of Object.entries(input ?? {})) {
    const key = rawKey.trim();
    if (!key) continue;
    const record = normalizeRecord(rawValue);
    if (!record || record.expiresAt <= now) continue;
    next[key] = record;
  }
  return next;
};

async function writeClaimedDropRecords(
  records: Record<string, ClaimedDropRecord>,
  file = resolveClaimedDropsFile(),
): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(records, null, 2), "utf-8");
}

async function loadClaimedDropRecordsInternal(
  now = Date.now(),
  file = resolveClaimedDropsFile(),
): Promise<Record<string, ClaimedDropRecord>> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, ClaimedDropRecord>;
    const pruned = pruneClaimedDropRecords(parsed, now);
    const parsedKeys = Object.keys(parsed ?? {});
    const prunedKeys = Object.keys(pruned);
    if (parsedKeys.length !== prunedKeys.length) {
      await writeClaimedDropRecords(pruned, file);
    }
    return pruned;
  } catch {
    return {};
  }
}

export async function loadRecentClaimedDropIds(opts?: {
  now?: number;
  file?: string;
}): Promise<Set<string>> {
  const records = await loadClaimedDropRecordsInternal(
    opts?.now ?? Date.now(),
    opts?.file ?? resolveClaimedDropsFile(),
  );
  return new Set(Object.keys(records));
}

export const resolveRecentClaimExpiry = ({
  claimedAt = Date.now(),
  endsAt,
}: {
  claimedAt?: number;
  endsAt?: string;
}): number => {
  const campaignEndMs = typeof endsAt === "string" ? Date.parse(endsAt) : Number.NaN;
  if (Number.isFinite(campaignEndMs)) {
    const claimWindowExpiresAt = campaignEndMs + CLAIM_WINDOW_AFTER_CAMPAIGN_END_MS;
    if (claimWindowExpiresAt > claimedAt) {
      return claimWindowExpiresAt;
    }
  }
  return claimedAt + RECENT_CLAIM_TTL_MS;
};

export async function markRecentClaimedDrop(
  claimKey: string,
  opts?: { claimedAt?: number; expiresAt?: number; endsAt?: string; file?: string },
): Promise<void> {
  const key = claimKey.trim();
  if (!key) return;
  const claimedAt = opts?.claimedAt ?? Date.now();
  const fallbackExpiresAt = resolveRecentClaimExpiry({ claimedAt, endsAt: opts?.endsAt });
  const expiresAt =
    typeof opts?.expiresAt === "number" &&
    Number.isFinite(opts.expiresAt) &&
    opts.expiresAt > claimedAt
      ? opts.expiresAt
      : fallbackExpiresAt;
  const file = opts?.file ?? resolveClaimedDropsFile();
  const records = await loadClaimedDropRecordsInternal(claimedAt, file);
  records[key] = { claimedAt, expiresAt };
  await writeClaimedDropRecords(records, file);
}

export async function clearRecentClaimedDrops(opts?: { file?: string }): Promise<void> {
  const file = opts?.file ?? resolveClaimedDropsFile();
  try {
    await fs.unlink(file);
  } catch {
    // ignore
  }
}
