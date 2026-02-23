import { describe, expect, it, vi } from "vitest";
import { InventoryPubSubReconciler } from "./inventoryPubSubReconciler";

type ScheduledTimer = {
  callback: () => void;
  runAt: number;
};

const createTimerHarness = () => {
  let now = 0;
  let nextTimerId = 1;
  const timers = new Map<number, ScheduledTimer>();

  const setNow = (value: number) => {
    now = value;
  };

  const runDueTimers = () => {
    const due = Array.from(timers.entries())
      .filter(([, timer]) => timer.runAt <= now)
      .sort((a, b) => a[1].runAt - b[1].runAt);
    for (const [id, timer] of due) {
      if (!timers.has(id)) continue;
      timers.delete(id);
      timer.callback();
    }
  };

  return {
    timers,
    setNow,
    runDueTimers,
    timerApi: {
      setTimeout: (callback: () => void, delayMs: number) => {
        const id = nextTimerId++;
        timers.set(id, { callback, runAt: now + Math.max(0, delayMs) });
        return id;
      },
      clearTimeout: (timerId: number) => {
        timers.delete(timerId);
      },
      now: () => now,
    },
  };
};

describe("InventoryPubSubReconciler", () => {
  it("keeps drop progress monotonic per drop", () => {
    const harness = createTimerHarness();
    const reconciler = new InventoryPubSubReconciler(harness.timerApi);

    expect(reconciler.shouldApplyProgress("drop-1", 5)).toBe(true);
    expect(reconciler.shouldApplyProgress("drop-1", 5)).toBe(false);
    expect(reconciler.shouldApplyProgress("drop-1", 4)).toBe(false);
    expect(reconciler.shouldApplyProgress("drop-1", 6)).toBe(true);
  });

  it("merges pending force flags and runs once on scheduled reconcile", () => {
    const harness = createTimerHarness();
    const reconciler = new InventoryPubSubReconciler(harness.timerApi);
    const run = vi.fn<(forceLoading: boolean) => void>();

    harness.setNow(1_000);
    reconciler.schedule({ forceLoading: false, minGapMs: 2_000, baseDelayMs: 500 }, run);
    harness.setNow(1_100);
    reconciler.schedule({ forceLoading: true, minGapMs: 2_000, baseDelayMs: 100 }, run);

    harness.setNow(1_999);
    harness.runDueTimers();
    expect(run).not.toHaveBeenCalled();

    harness.setNow(2_000);
    harness.runDueTimers();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(true);
  });

  it("replaces a later timer when a sooner reconcile is scheduled", () => {
    const harness = createTimerHarness();
    const reconciler = new InventoryPubSubReconciler(harness.timerApi);
    const run = vi.fn<(forceLoading: boolean) => void>();

    harness.setNow(0);
    reconciler.schedule({ forceLoading: false, minGapMs: 0, baseDelayMs: 1_000 }, run);
    harness.setNow(100);
    reconciler.schedule({ forceLoading: false, minGapMs: 0, baseDelayMs: 100 }, run);

    harness.setNow(200);
    harness.runDueTimers();
    expect(run).toHaveBeenCalledTimes(1);

    harness.setNow(1_000);
    harness.runDueTimers();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reset clears timers and progress memory", () => {
    const harness = createTimerHarness();
    const reconciler = new InventoryPubSubReconciler(harness.timerApi);
    const run = vi.fn<(forceLoading: boolean) => void>();

    harness.setNow(0);
    reconciler.schedule({ forceLoading: true, minGapMs: 0, baseDelayMs: 100 }, run);
    expect(reconciler.shouldApplyProgress("drop-1", 3)).toBe(true);
    reconciler.reset();

    harness.setNow(200);
    harness.runDueTimers();
    expect(run).not.toHaveBeenCalled();
    expect(reconciler.shouldApplyProgress("drop-1", 3)).toBe(true);
  });
});
