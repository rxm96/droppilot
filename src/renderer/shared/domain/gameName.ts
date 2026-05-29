/**
 * Game-name normalization for safe equality comparisons.
 *
 * Game name strings flow into the app from three independent sources:
 *
 * 1. The Twitch inventory / drops API (sets `item.game` on InventoryItem)
 * 2. The Twitch channel tracker API (sets `channel.game` on ChannelEntry,
 *    which becomes `watching.game` via useWatchingController)
 * 3. The user's priority list (stored verbatim in settings)
 *
 * These APIs occasionally disagree about the canonical form of a game name —
 * trailing whitespace, case variations, or punctuation differences. Raw string
 * equality (`a === b`) then silently fails: the watch session can't be matched
 * to a target game, `isWatchingTargetGame` returns false, `activeDropInfo`
 * collapses to null, ETA falls back to a static "remainingMinutes * 60"
 * placeholder, and the queue's earnedMinutes never advances.
 *
 * `normalizeGameName(s)` is the single canonical form used at every equality
 * site. Always normalize BOTH operands before comparing. The original string
 * stays untouched for display — only comparisons go through the normalized
 * form.
 *
 *   sameGameName("Marvel Rivals", "  marvel rivals  ") === true
 *   sameGameName("Marvel Rivals", "MARVEL RIVALS")     === true
 *   sameGameName("Marvel Rivals", "Marvel Rivals 2")   === false
 */

export function normalizeGameName(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  // Lowercase + trim handles 99% of real-world API mismatches. We deliberately
  // do NOT strip punctuation or numbers (e.g. "Subnautica 2") — those carry
  // meaning that game-name equality must preserve.
  return value.trim().toLocaleLowerCase();
}

/** Compare two game name strings tolerantly. Returns false when either side is empty. */
export function sameGameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeGameName(a);
  const nb = normalizeGameName(b);
  if (na.length === 0 || nb.length === 0) return false;
  return na === nb;
}
