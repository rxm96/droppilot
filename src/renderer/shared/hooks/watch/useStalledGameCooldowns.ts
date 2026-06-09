import { useCallback, useEffect, useRef, useState } from "react";
import { logInfo } from "@renderer/shared/utils/logger";
import {
  isGameInCooldown,
  nextCooldownExpiry,
  pruneExpiredCooldowns,
  removeCooldown,
  upsertCooldown,
  type CooldownReason,
  type GameCooldownMap,
} from "./gameCooldowns";

/**
 * Stalled-game cooldown store. State drives reactivity (orchestration filter,
 * snapshot); the ref mirror lets setCooldown/clearCooldown stay referentially
 * stable while still deduplicating against the latest value.
 */
export function useStalledGameCooldowns() {
  const [cooldowns, setCooldowns] = useState<GameCooldownMap>({});
  const cooldownsRef = useRef<GameCooldownMap>({});

  const setCooldown = useCallback((rawGame: string, durationMs: number, reason: CooldownReason) => {
    const game = rawGame.trim();
    if (!game) return;
    const now = Date.now();
    const until = now + durationMs;
    const current = cooldownsRef.current[game] ?? 0;
    if (current >= until) return;
    cooldownsRef.current = { ...cooldownsRef.current, [game]: until };
    logInfo("watch-engine: cooldown", {
      reason,
      game,
      durationMs,
      until,
    });
    setCooldowns((prev) => upsertCooldown(prev, game, until));
  }, []);

  const clearCooldown = useCallback((rawGame: string, context: string) => {
    const game = rawGame.trim();
    if (!game) return;
    if (!(game in cooldownsRef.current)) return;
    cooldownsRef.current = removeCooldown(cooldownsRef.current, game);
    logInfo("watch-engine: cooldown clear", { context, game });
    setCooldowns((prev) => removeCooldown(prev, game));
  }, []);

  useEffect(() => {
    cooldownsRef.current = cooldowns;
  }, [cooldowns]);

  // Self-pruning: drop expired entries, then sleep until the next expiry
  // (+32ms slack). Prune-by-time instead of the old prune-by-name-list — the
  // two only diverge if an entry is extended between render and state update,
  // where prune-by-time is the safer behavior.
  useEffect(() => {
    const entries = Object.entries(cooldowns);
    if (entries.length === 0) return;
    const now = Date.now();
    const pruned = pruneExpiredCooldowns(cooldowns, now);
    if (pruned !== cooldowns) {
      setCooldowns((prev) => pruneExpiredCooldowns(prev, now));
      return;
    }
    const nextExpiry = nextCooldownExpiry(cooldowns);
    if (nextExpiry === null) return;
    const timer = window.setTimeout(
      () => {
        setCooldowns((prev) => pruneExpiredCooldowns(prev, Date.now()));
      },
      Math.max(0, nextExpiry - now) + 32,
    );
    return () => window.clearTimeout(timer);
  }, [cooldowns]);

  // Reads state (not the ref) on purpose: consumers memoize on this callback,
  // and it must change identity when the map changes so they re-evaluate.
  const isInCooldown = useCallback(
    (rawGame: string, now = Date.now()): boolean => isGameInCooldown(cooldowns, rawGame, now),
    [cooldowns],
  );

  return { cooldowns, setCooldown, clearCooldown, isInCooldown };
}
