import { useCallback, useEffect, useState } from "react";
import { useInterval } from "@renderer/shared/hooks/useInterval";

export type CpuSample = {
  percent?: number;
  idleWakeups?: number;
  lastAt: number | null;
};

type Params = {
  enabled: boolean;
  intervalMs?: number;
};

export function useDebugCpu({ enabled, intervalMs = 1000 }: Params): CpuSample {
  const [sample, setSample] = useState<CpuSample>({ lastAt: null });

  const read = useCallback(() => {
    try {
      if (typeof process !== "undefined" && typeof process.getCPUUsage === "function") {
        const usage = process.getCPUUsage();
        setSample({
          percent: Math.round(usage.percentCPUUsage * 100) / 100,
          idleWakeups:
            typeof usage.idleWakeupsPerSecond === "number"
              ? Math.round(usage.idleWakeupsPerSecond * 100) / 100
              : undefined,
          lastAt: Date.now(),
        });
        return;
      }
    } catch {
      // ignore and keep last sample
    }
    setSample((prev) => ({ ...prev, lastAt: Date.now() }));
  }, []);

  useEffect(() => {
    if (!enabled) {
      setSample({ lastAt: null });
      return;
    }
    read();
  }, [enabled, read]);

  useInterval(read, intervalMs, enabled);

  return sample;
}
