export type ReconcileSchedulePolicy = {
  forceLoading: boolean;
  minGapMs: number;
  baseDelayMs: number;
};

export type ReconcilerTimerApi = {
  setTimeout: (callback: () => void, delayMs: number) => number;
  clearTimeout: (timerId: number) => void;
  now: () => number;
};

export class InventoryPubSubReconciler {
  private timerId: number | null = null;
  private pendingForce = false;
  private scheduledAt = 0;
  private lastReconcileAt = 0;
  private readonly progressByDropId = new Map<string, number>();

  constructor(private readonly timers: ReconcilerTimerApi) {}

  reset(): void {
    this.clearScheduledReconcile();
    this.pendingForce = false;
    this.scheduledAt = 0;
    this.lastReconcileAt = 0;
    this.progressByDropId.clear();
  }

  clearScheduledReconcile(): void {
    this.clearTimer();
  }

  shouldApplyProgress(dropId: string, progressMinutes: number): boolean {
    const id = dropId.trim();
    if (!id) return false;
    if (!Number.isFinite(progressMinutes)) return false;
    const progress = Math.max(0, progressMinutes);
    const lastProgress = this.progressByDropId.get(id) ?? -1;
    if (progress <= lastProgress) return false;
    this.progressByDropId.set(id, progress);
    return true;
  }

  schedule(policy: ReconcileSchedulePolicy, run: (forceLoading: boolean) => void): void {
    this.pendingForce = this.pendingForce || policy.forceLoading;
    const now = this.timers.now();
    const nextAt = Math.max(now + policy.baseDelayMs, this.lastReconcileAt + policy.minGapMs);
    if (this.timerId !== null && nextAt >= this.scheduledAt) {
      return;
    }
    this.clearTimer();
    this.scheduledAt = nextAt;
    this.timerId = this.timers.setTimeout(
      () => {
        this.timerId = null;
        this.lastReconcileAt = this.timers.now();
        const force = this.pendingForce;
        this.pendingForce = false;
        run(force);
      },
      Math.max(0, nextAt - now),
    );
  }

  private clearTimer(): void {
    if (this.timerId === null) return;
    this.timers.clearTimeout(this.timerId);
    this.timerId = null;
  }
}
