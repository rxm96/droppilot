import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!enabled) {
      setSample({ lastAt: null });
      return;
    }
    const read = () => {
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
    };

    read();
    const timer = window.setInterval(read, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);

  return sample;
}
