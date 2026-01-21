import { useEffect, useMemo, useRef } from "react";
import type { InventoryItem } from "../../types";

export function useDropChanges(targetDrops: InventoryItem[]) {
  const prevDropsRef = useRef<Map<string, { earned: number; status: string }>>(new Map());

  const changedIds = useMemo(() => {
    const prev = prevDropsRef.current;
    if (prev.size === 0) return new Set<string>();
    const changed = new Set<string>();
    for (const drop of targetDrops) {
      if (!prev.has(drop.id)) {
        changed.add(drop.id);
      }
    }
    return changed;
  }, [targetDrops]);

  useEffect(() => {
    const next = new Map<string, { earned: number; status: string }>();
    for (const drop of targetDrops) {
      next.set(drop.id, { earned: Number(drop.earnedMinutes) || 0, status: drop.status });
    }
    prevDropsRef.current = next;
  }, [targetDrops]);

  return { changedIds };
}
