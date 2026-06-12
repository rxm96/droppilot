import { describe, expect, it } from "vitest";
import {
  MANUAL_STOP_SUPPRESSION_HOLD_MS,
  STALL_STOP_SUPPRESSION_HOLD_MS,
  selectIsTargetSuppressed,
  selectVisibleTargetGame,
  shouldForceClearWatchingOnSuppressedTarget,
  stampWatchEngineEvent,
  watchEngineReducer,
  WATCH_ENGINE_INITIAL_STATE,
  type WatchEngineEvent,
} from "./watchEngine";

describe("watchEngine", () => {
  it("suppresses the active target when watching stops", () => {
    const next = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stop",
      activeTargetGame: "EA Sports FC 26",
      at: 1_000,
    });
    expect(next.suppressedTargetGame).toBe("EA Sports FC 26");
    expect(next.suppressionReason).toBe("manual-stop");
    expect(next.suppressedAt).toBe(1_000);
  });

  it("clears suppression when manually starting the same game", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stop",
      activeTargetGame: "EA Sports FC 26",
    });
    const resumed = watchEngineReducer(suppressed, {
      type: "watch/manual_start",
      watchingGame: "EA Sports FC 26",
    });
    expect(resumed.suppressedTargetGame).toBe("");
    expect(resumed.suppressionReason).toBeNull();
    expect(resumed.suppressedAt).toBeNull();
  });

  it("keeps suppression while active target is temporarily empty", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stall_stop",
      activeTargetGame: "EA Sports FC 26",
      at: 1_000,
    });
    const synced = watchEngineReducer(suppressed, {
      type: "sync",
      activeTargetGame: "",
      watchingGame: "",
      now: 1_500,
    });
    expect(synced.suppressedTargetGame).toBe("EA Sports FC 26");
  });

  it("keeps stall suppression when active target changes to another game", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stall_stop",
      activeTargetGame: "EA Sports FC 26",
      at: 1_000,
    });
    const synced = watchEngineReducer(suppressed, {
      type: "sync",
      activeTargetGame: "Battlefield 6",
      watchingGame: "",
      now: 1_500,
    });
    expect(synced.suppressedTargetGame).toBe("EA Sports FC 26");
    expect(synced.suppressionReason).toBe("stall-stop");
  });

  it("clears manual-stop suppression once another game is watched", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stop",
      activeTargetGame: "EA Sports FC 26",
    });
    const synced = watchEngineReducer(suppressed, {
      type: "sync",
      activeTargetGame: "Battlefield 6",
      watchingGame: "Battlefield 6",
    });
    expect(synced.suppressedTargetGame).toBe("");
    expect(synced.suppressionReason).toBeNull();
    expect(synced.suppressedAt).toBeNull();
  });

  it("keeps stall-stop suppression during hold window even if another game is watched", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stall_stop",
      activeTargetGame: "EA Sports FC 26",
      at: 10_000,
    });
    const synced = watchEngineReducer(suppressed, {
      type: "sync",
      activeTargetGame: "Battlefield 6",
      watchingGame: "Battlefield 6",
      now: 10_000 + STALL_STOP_SUPPRESSION_HOLD_MS - 1,
    });
    expect(synced.suppressedTargetGame).toBe("EA Sports FC 26");
    expect(synced.suppressionReason).toBe("stall-stop");
  });

  it("clears stall-stop suppression after hold window while another game is being watched", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stall_stop",
      activeTargetGame: "EA Sports FC 26",
      at: 20_000,
    });
    const synced = watchEngineReducer(suppressed, {
      type: "sync",
      activeTargetGame: "Battlefield 6",
      watchingGame: "Battlefield 6",
      now: 20_000 + STALL_STOP_SUPPRESSION_HOLD_MS,
    });
    expect(synced.suppressedTargetGame).toBe("");
    expect(synced.suppressionReason).toBeNull();
    expect(synced.suppressedAt).toBeNull();
  });

  it("keeps stall-stop suppression after hold window while the stalled game is still being watched", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stall_stop",
      activeTargetGame: "EA Sports FC 26",
      at: 25_000,
    });
    const synced = watchEngineReducer(suppressed, {
      type: "sync",
      activeTargetGame: "EA Sports FC 26",
      watchingGame: "EA Sports FC 26",
      now: 25_000 + STALL_STOP_SUPPRESSION_HOLD_MS,
    });
    expect(synced.suppressedTargetGame).toBe("EA Sports FC 26");
    expect(synced.suppressionReason).toBe("stall-stop");
    expect(synced.suppressedAt).toBe(25_000);
  });

  it("clears stall-stop suppression after hold window even when no game is being watched", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stall_stop",
      activeTargetGame: "EA Sports FC 26",
      at: 30_000,
    });
    const synced = watchEngineReducer(suppressed, {
      type: "sync",
      activeTargetGame: "EA Sports FC 26",
      watchingGame: "",
      now: 30_000 + STALL_STOP_SUPPRESSION_HOLD_MS,
    });
    expect(synced.suppressedTargetGame).toBe("");
    expect(synced.suppressionReason).toBeNull();
    expect(synced.suppressedAt).toBeNull();
  });

  it("keeps manual-stop suppression during hold window when idle", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stop",
      activeTargetGame: "EA Sports FC 26",
      at: 5_000,
    });
    const synced = watchEngineReducer(suppressed, {
      type: "sync",
      activeTargetGame: "EA Sports FC 26",
      watchingGame: "",
      now: 5_000 + MANUAL_STOP_SUPPRESSION_HOLD_MS - 1,
    });
    expect(synced.suppressedTargetGame).toBe("EA Sports FC 26");
    expect(synced.suppressionReason).toBe("manual-stop");
  });

  it("clears manual-stop suppression after hold window when idle", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stop",
      activeTargetGame: "EA Sports FC 26",
      at: 5_000,
    });
    const synced = watchEngineReducer(suppressed, {
      type: "sync",
      activeTargetGame: "EA Sports FC 26",
      watchingGame: "",
      now: 5_000 + MANUAL_STOP_SUPPRESSION_HOLD_MS,
    });
    expect(synced.suppressedTargetGame).toBe("");
    expect(synced.suppressionReason).toBeNull();
    expect(synced.suppressedAt).toBeNull();
  });

  it("still clears manual-stop suppression immediately when a different game is watched", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stop",
      activeTargetGame: "EA Sports FC 26",
      at: 5_000,
    });
    const synced = watchEngineReducer(suppressed, {
      type: "sync",
      activeTargetGame: "Battlefield 6",
      watchingGame: "Battlefield 6",
      now: 5_001, // well within hold window
    });
    expect(synced.suppressedTargetGame).toBe("");
    expect(synced.suppressionReason).toBeNull();
  });

  it("derives visible target and forced clear flags", () => {
    const suppressed = watchEngineReducer(WATCH_ENGINE_INITIAL_STATE, {
      type: "watch/stall_stop",
      activeTargetGame: "EA Sports FC 26",
    });
    expect(selectIsTargetSuppressed(suppressed, "EA Sports FC 26")).toBe(true);
    expect(selectVisibleTargetGame(suppressed, "EA Sports FC 26")).toBe("");
    expect(shouldForceClearWatchingOnSuppressedTarget(suppressed, "EA Sports FC 26")).toBe(true);
  });
});

describe("stampWatchEngineEvent", () => {
  it("stamps watch/stop and watch/stall_stop with now when at is missing", () => {
    expect(stampWatchEngineEvent({ type: "watch/stop", activeTargetGame: "Rust" }, 42)).toEqual({
      type: "watch/stop",
      activeTargetGame: "Rust",
      at: 42,
    });
    expect(
      stampWatchEngineEvent({ type: "watch/stall_stop", activeTargetGame: "Rust" }, 42),
    ).toEqual({ type: "watch/stall_stop", activeTargetGame: "Rust", at: 42 });
  });

  it("keeps an existing finite at", () => {
    const event: WatchEngineEvent = { type: "watch/stop", activeTargetGame: "Rust", at: 7 };
    expect(stampWatchEngineEvent(event, 42)).toBe(event);
  });

  it("stamps sync with now when missing, keeps existing now", () => {
    expect(
      stampWatchEngineEvent({ type: "sync", activeTargetGame: "", watchingGame: "" }, 42),
    ).toEqual({ type: "sync", activeTargetGame: "", watchingGame: "", now: 42 });
    const synced: WatchEngineEvent = {
      type: "sync",
      activeTargetGame: "",
      watchingGame: "",
      now: 7,
    };
    expect(stampWatchEngineEvent(synced, 42)).toBe(synced);
  });

  it("passes other events through unchanged", () => {
    const event: WatchEngineEvent = { type: "target/manual_set", nextTargetGame: "Rust" };
    expect(stampWatchEngineEvent(event, 42)).toBe(event);
  });

  it("re-stamps non-finite timestamps", () => {
    expect(
      stampWatchEngineEvent({ type: "watch/stop", activeTargetGame: "Rust", at: Number.NaN }, 42),
    ).toEqual({ type: "watch/stop", activeTargetGame: "Rust", at: 42 });
    expect(
      stampWatchEngineEvent(
        { type: "sync", activeTargetGame: "", watchingGame: "", now: Infinity },
        42,
      ),
    ).toEqual({ type: "sync", activeTargetGame: "", watchingGame: "", now: 42 });
  });

  it("keeps an existing finite at on watch/stall_stop", () => {
    const event: WatchEngineEvent = { type: "watch/stall_stop", activeTargetGame: "Rust", at: 7 };
    expect(stampWatchEngineEvent(event, 42)).toBe(event);
  });
});
