import type { ChannelEntry, InventoryItem, WatchingState } from "@renderer/shared/types";
import { WATCH_INTERVAL_MS } from "./useWatchPing";
import type { ActiveDropInfo } from "@renderer/shared/hooks/inventory";
import { canEarnDrop } from "@renderer/shared/domain/inventory";
import { sameGameName } from "@renderer/shared/domain/gameName";
import { DropChannelRestriction } from "@renderer/shared/domain/dropDomain";
import type { ChannelAllowlist } from "@renderer/shared/domain/dropDomain";
import type { CooldownReason } from "./gameCooldowns";

export const STALL_NO_PROGRESS_WINDOW_MS = 15 * 60_000;
export const STALL_NO_PROGRESS_WINDOW_NEAR_END_MS = 3 * 60_000;
export const STALL_RECOVERY_COOLDOWN_MS = 60_000;
export const STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS = 2;
export const STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END = 1;
export const STALL_CONFIRMATION_PROBE_COOLDOWN_MS = 60_000;
export const NO_FARMABLE_DROP_GRACE_MS = 30_000;
export const NO_FARMABLE_GAME_COOLDOWN_MS = 10 * 60_000;
export const NO_PROGRESS_GAME_COOLDOWN_MS = 30 * 60_000;

/**
 * Effect descriptors returned by the decide* functions. The useStallRecovery
 * executor maps them 1:1 onto setters/dispatches and logs `log` actions via
 * logInfo — decisions stay pure and unit-testable, log lines stay identical.
 */
export type StallRecoveryAction =
  | { kind: "log"; message: string; data: Record<string, unknown> }
  | { kind: "switch-channel"; channel: ChannelEntry }
  | { kind: "set-cooldown"; game: string; durationMs: number; reason: CooldownReason }
  | { kind: "retarget"; to: string }
  | { kind: "enable-auto-select" }
  | { kind: "stop-watching" }
  | { kind: "dispatch-stall-stop"; game: string; context: string }
  | { kind: "refresh-channels"; game: string }
  | { kind: "refresh-inventory" };

/** "Watching with no farmable drop" grace-period marker (was noFarmableDropRef). */
export type NoFarmableMarker = { key: string; sinceAt: number };

export type IdleNoFarmableInput = {
  allowWatching: boolean;
  autoSelectEnabled: boolean;
  targetGame: string;
  activeTargetGame: string;
  channelAllowlist: ChannelAllowlist;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  channelsRefreshing: boolean;
  noFarmable: NoFarmableMarker | null;
  getNextTargetGame: (currentGame: string) => string;
};

export type StallRecoveryDecision = {
  actions: StallRecoveryAction[];
  noFarmable: NoFarmableMarker | null;
};

/**
 * Idle branch (not watching): if the target's drops are restricted to specific
 * channels and none of them is live, cool the game down and move the target on.
 */
export const decideIdleNoFarmable = (input: IdleNoFarmableInput): StallRecoveryDecision => {
  const {
    allowWatching,
    autoSelectEnabled,
    targetGame,
    activeTargetGame,
    channelAllowlist,
    channels,
    channelsLoading,
    channelsRefreshing,
    noFarmable,
    getNextTargetGame,
  } = input;
  const shouldEvaluateIdleNoFarmable = allowWatching && autoSelectEnabled && !!targetGame;
  if (!shouldEvaluateIdleNoFarmable) {
    return { actions: [], noFarmable: null };
  }
  const allowlistRestriction = DropChannelRestriction.fromAllowlist(channelAllowlist);
  if (!allowlistRestriction.hasConstraints) {
    return { actions: [], noFarmable: null };
  }
  if ((channelsLoading || channelsRefreshing) && channels.length === 0) {
    // Snapshot still loading — keep the marker untouched (matches the old
    // early-return that skipped the `noFarmableDropRef.current = null` reset).
    return { actions: [], noFarmable };
  }
  const hasAllowlistedChannel = channels.some((channel) =>
    allowlistRestriction.allowsChannel(channel),
  );
  if (hasAllowlistedChannel) {
    return { actions: [], noFarmable: null };
  }
  // Two bindings mirroring the original's two consts; the || activeTargetGame
  // fallback below is only reachable when targetGame is whitespace-only.
  const stalledGame = activeTargetGame.trim() || targetGame.trim();
  const currentForRetarget = activeTargetGame.trim() || targetGame.trim();
  const nextTargetGame = currentForRetarget ? getNextTargetGame(currentForRetarget) : "";
  const actions: StallRecoveryAction[] = [
    {
      kind: "set-cooldown",
      game: stalledGame,
      durationMs: NO_FARMABLE_GAME_COOLDOWN_MS,
      reason: "stall-no-farmable",
    },
    {
      kind: "log",
      message: "watch-engine: no-farmable idle evaluate",
      data: {
        from: currentForRetarget || null,
        to: nextTargetGame || null,
        channelsCount: channels.length,
        allowlistActive: allowlistRestriction.hasConstraints,
      },
    },
  ];
  if (nextTargetGame) {
    actions.push(
      {
        kind: "log",
        message: "watch-engine: retarget",
        data: {
          reason: "stall-no-farmable-idle",
          from: activeTargetGame || targetGame || null,
          to: nextTargetGame,
        },
      },
      { kind: "retarget", to: nextTargetGame },
    );
  } else {
    actions.push({
      kind: "log",
      message: "watch-engine: retarget skipped",
      data: {
        reason: "stall-no-farmable-idle-no-next-target",
        from: activeTargetGame || targetGame || null,
      },
    });
  }
  actions.push(
    { kind: "enable-auto-select" },
    {
      kind: "dispatch-stall-stop",
      game: stalledGame || activeTargetGame,
      context: "stall-no-farmable",
    },
  );
  return { actions, noFarmable: null };
};

/**
 * "Near end" threshold shared by two consumers: at or below this predicted
 * remaining time, the claim probe starts running (useClaimProbe), and the
 * no-progress stall check switches to its tighter near-end window
 * (STALL_NO_PROGRESS_WINDOW_NEAR_END_MS).
 */
export const CLAIM_PROBE_NEAR_END_MINUTES = 1;

export type StallRecoveryDrop = {
  id: string;
  earnedMinutes: number;
  allowedChannelIds?: string[];
  allowedChannelLogins?: string[];
};

export type WatchStallTracker = {
  key: string;
  lastEarnedMinutes: number;
  lastProgressAt: number;
  lastActionAt: number;
  recoveryCount: number;
};

const resolveWatchingId = (watching: WatchingState): string =>
  String(watching?.channelId ?? watching?.id ?? "").trim();

const resolveWatchingLogin = (watching: WatchingState): string =>
  String(watching?.login ?? watching?.name ?? "")
    .trim()
    .toLowerCase();

const isSameAsWatching = (channel: ChannelEntry, watching: WatchingState): boolean => {
  if (!watching) return false;
  const watchingId = resolveWatchingId(watching);
  if (watchingId && channel.id === watchingId) return true;
  const watchingLogin = resolveWatchingLogin(watching);
  if (watchingLogin && channel.login.trim().toLowerCase() === watchingLogin) return true;
  return false;
};

const canFarmDropOnChannel = (
  channel: ChannelEntry,
  restriction: DropChannelRestriction,
): boolean => {
  return restriction.allowsChannel(channel);
};

export const buildWatchStallTrackerKey = (watching: WatchingState, dropId: string): string => {
  const gameKey = String(watching?.game ?? watching?.channelId ?? watching?.id ?? "")
    .trim()
    .toLowerCase();
  return `${gameKey}:${dropId}`;
};

export const evaluateNoProgressStall = ({
  tracker,
  key,
  earnedMinutes,
  now,
  noProgressWindowMs,
  actionCooldownMs,
}: {
  tracker: WatchStallTracker | null;
  key: string;
  earnedMinutes: number;
  now: number;
  noProgressWindowMs: number;
  actionCooldownMs: number;
}): { tracker: WatchStallTracker; shouldRecover: boolean } => {
  if (!tracker || tracker.key !== key) {
    return {
      tracker: {
        key,
        lastEarnedMinutes: earnedMinutes,
        lastProgressAt: now,
        lastActionAt: 0,
        recoveryCount: 0,
      },
      shouldRecover: false,
    };
  }

  if (earnedMinutes !== tracker.lastEarnedMinutes) {
    return {
      tracker: {
        ...tracker,
        lastEarnedMinutes: earnedMinutes,
        lastProgressAt: now,
        recoveryCount: 0,
      },
      shouldRecover: false,
    };
  }

  if (now - tracker.lastProgressAt < noProgressWindowMs) {
    return { tracker, shouldRecover: false };
  }
  if (now - tracker.lastActionAt < actionCooldownMs) {
    return { tracker, shouldRecover: false };
  }

  return {
    tracker: {
      ...tracker,
      lastActionAt: now,
      recoveryCount: tracker.recoveryCount + 1,
    },
    shouldRecover: true,
  };
};

export const shouldProbeNoProgressConfirmation = ({
  tracker,
  key,
  now,
  noProgressWindowMs,
  probeLeadMs,
  lastWatchOk,
  watchPingGraceMs,
  lastProbeAt,
  probeCooldownMs,
}: {
  tracker: WatchStallTracker | null;
  key: string;
  now: number;
  noProgressWindowMs: number;
  probeLeadMs: number;
  lastWatchOk: number;
  watchPingGraceMs: number;
  lastProbeAt: number;
  probeCooldownMs: number;
}): boolean => {
  if (!tracker || tracker.key !== key) return false;
  if (lastWatchOk <= tracker.lastProgressAt) return false;
  if (now - lastWatchOk > watchPingGraceMs) return false;
  const probeAt = tracker.lastProgressAt + Math.max(0, noProgressWindowMs - probeLeadMs);
  if (now < probeAt) return false;
  if (now >= tracker.lastProgressAt + noProgressWindowMs) return false;
  if (lastProbeAt >= tracker.lastProgressAt && now - lastProbeAt < probeCooldownMs) return false;
  return true;
};

export const pickStallRecoveryChannel = ({
  channels,
  watching,
  drop,
}: {
  channels: ChannelEntry[];
  watching: WatchingState;
  drop: StallRecoveryDrop;
}): ChannelEntry | null => {
  if (!watching) return null;
  const restriction = new DropChannelRestriction({
    ids: drop.allowedChannelIds,
    logins: drop.allowedChannelLogins,
  });
  for (const channel of channels) {
    if (isSameAsWatching(channel, watching)) continue;
    if (!canFarmDropOnChannel(channel, restriction)) continue;
    return channel;
  }
  return null;
};

/** Confirmation-probe bookkeeping (was watchConfirmationProbeRef). */
export type WatchConfirmationProbe = {
  key: string;
  baselineProgressAt: number;
  lastProbeAt: number;
};

export type NoProgressRecoveryInput = {
  watching: NonNullable<WatchingState>;
  activeDropInfo: ActiveDropInfo;
  targetGame: string;
  activeTargetGame: string;
  channels: ChannelEntry[];
  lastWatchOk: number;
  now: number;
  tracker: WatchStallTracker | null;
  confirmationProbe: WatchConfirmationProbe | null;
  getNextTargetGame: (currentGame: string) => string;
};

export type NoProgressRecoveryDecision = {
  actions: StallRecoveryAction[];
  tracker: WatchStallTracker | null;
  confirmationProbe: WatchConfirmationProbe | null;
};

/**
 * Watching with an active drop: track earned-minutes progress; just before the
 * no-progress window elapses, spend one cheap inventory poll to rule out a
 * stale snapshot; on a confirmed stall, switch channels (within a small
 * budget), force-refresh once no alternate is visible, and finally give up on
 * the game (cooldown + retarget + stall-stop).
 */
export const decideNoProgressRecovery = (
  input: NoProgressRecoveryInput,
): NoProgressRecoveryDecision => {
  const {
    watching,
    activeDropInfo,
    targetGame,
    activeTargetGame,
    channels,
    lastWatchOk,
    now,
    tracker,
    confirmationProbe,
    getNextTargetGame,
  } = input;
  const dropId = activeDropInfo.id?.trim();
  if (!dropId) {
    return { actions: [], tracker: null, confirmationProbe: null };
  }
  const actions: StallRecoveryAction[] = [];
  const earnedMinutes = Math.max(0, Number(activeDropInfo.earnedMinutes) || 0);
  const key = buildWatchStallTrackerKey(watching, dropId);
  const nearEndNoProgressProbe = activeDropInfo.remainingMinutes <= CLAIM_PROBE_NEAR_END_MINUTES;
  const noProgressWindowMs = nearEndNoProgressProbe
    ? STALL_NO_PROGRESS_WINDOW_NEAR_END_MS
    : STALL_NO_PROGRESS_WINDOW_MS;
  const evaluation = evaluateNoProgressStall({
    tracker,
    key,
    earnedMinutes,
    now,
    noProgressWindowMs,
    actionCooldownMs: STALL_RECOVERY_COOLDOWN_MS,
  });
  let probe = confirmationProbe;
  if (
    probe &&
    (probe.key !== key || probe.baselineProgressAt < evaluation.tracker.lastProgressAt)
  ) {
    probe = null;
  }
  const probeLeadMs = Math.min(2 * 60_000, Math.floor(noProgressWindowMs / 3));
  const recentWatchPingGraceMs = WATCH_INTERVAL_MS + 30_000;
  const lastProbeAt =
    probe?.key === key && probe?.baselineProgressAt === evaluation.tracker.lastProgressAt
      ? probe.lastProbeAt
      : 0;
  if (
    shouldProbeNoProgressConfirmation({
      tracker: evaluation.tracker,
      key,
      now,
      noProgressWindowMs,
      probeLeadMs,
      lastWatchOk,
      watchPingGraceMs: recentWatchPingGraceMs,
      lastProbeAt,
      probeCooldownMs: STALL_CONFIRMATION_PROBE_COOLDOWN_MS,
    })
  ) {
    probe = {
      key,
      baselineProgressAt: evaluation.tracker.lastProgressAt,
      lastProbeAt: now,
    };
    actions.push(
      {
        kind: "log",
        message: "watch-engine: confirmation probe",
        data: {
          reason: "stall-no-progress-confirmation-probe",
          key,
          noProgressWindowMs,
          probeLeadMs,
          lastConfirmedProgressMsAgo: Math.max(0, now - evaluation.tracker.lastProgressAt),
        },
      },
      { kind: "refresh-inventory" },
    );
  }
  if (!evaluation.shouldRecover) {
    return { actions, tracker: evaluation.tracker, confirmationProbe: probe };
  }
  const maxChannelRecoveryAttempts = nearEndNoProgressProbe
    ? STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS_NEAR_END
    : STALL_MAX_CHANNEL_RECOVERY_ATTEMPTS;
  const allowChannelRecovery = evaluation.tracker.recoveryCount <= maxChannelRecoveryAttempts;

  if (allowChannelRecovery) {
    const nextChannel = pickStallRecoveryChannel({
      channels,
      watching,
      drop: {
        id: activeDropInfo.id,
        earnedMinutes: activeDropInfo.earnedMinutes,
        allowedChannelIds: activeDropInfo.allowedChannelIds,
        allowedChannelLogins: activeDropInfo.allowedChannelLogins,
      },
    });
    if (nextChannel) {
      actions.push({ kind: "switch-channel", channel: nextChannel });
      return { actions, tracker: evaluation.tracker, confirmationProbe: probe };
    }
    // No alternate channel currently visible: force-refresh state before game-level retarget.
    // This avoids premature target jumps when tracker/inventory snapshots are briefly stale.
    const recoveryGame = activeTargetGame.trim() || targetGame.trim() || watching.game.trim();
    actions.push({
      kind: "log",
      message: "watch-engine: no-progress refresh",
      data: {
        reason: "stall-no-progress-refresh",
        game: recoveryGame || null,
        nearEndProbe: nearEndNoProgressProbe,
        noProgressWindowMs,
        attempts: evaluation.tracker.recoveryCount,
        maxChannelRecoveryAttempts,
      },
    });
    if (recoveryGame) {
      actions.push({ kind: "refresh-channels", game: recoveryGame });
    }
    actions.push({ kind: "refresh-inventory" });
    return { actions, tracker: evaluation.tracker, confirmationProbe: probe };
  } else {
    actions.push({
      kind: "log",
      message: "watch-engine: retarget escalation",
      data: {
        reason: "stall-no-progress-recovery-budget",
        from: activeTargetGame || null,
        nearEndProbe: nearEndNoProgressProbe,
        noProgressWindowMs,
        attempts: evaluation.tracker.recoveryCount,
        maxChannelRecoveryAttempts,
      },
    });
  }
  const stalledGame = activeTargetGame.trim() || targetGame.trim() || watching.game.trim();
  actions.push({
    kind: "set-cooldown",
    game: stalledGame,
    durationMs: NO_PROGRESS_GAME_COOLDOWN_MS,
    reason: "stall-no-progress",
  });
  const currentForRetarget = activeTargetGame.trim() || targetGame.trim();
  const nextTargetGame = currentForRetarget ? getNextTargetGame(currentForRetarget) : "";
  if (nextTargetGame) {
    actions.push(
      {
        kind: "log",
        message: "watch-engine: retarget",
        data: {
          reason: "stall-no-progress-direct",
          from: activeTargetGame,
          to: nextTargetGame,
        },
      },
      { kind: "retarget", to: nextTargetGame },
    );
  }
  actions.push(
    { kind: "enable-auto-select" },
    { kind: "stop-watching" },
    {
      kind: "dispatch-stall-stop",
      game: stalledGame || activeTargetGame,
      context: "stall-no-progress",
    },
  );
  return { actions, tracker: evaluation.tracker, confirmationProbe: probe };
};

export type WatchingNoFarmableInput = {
  watching: NonNullable<WatchingState>;
  targetGame: string;
  activeTargetGame: string;
  channelAllowlist: ChannelAllowlist;
  channels: ChannelEntry[];
  channelsLoading: boolean;
  targetDrops: InventoryItem[];
  noFarmable: NoFarmableMarker | null;
  now: number;
  getNextTargetGame: (currentGame: string) => string;
};

/**
 * Watching, but useTargetDrops sees no active (farmable) drop. Give the
 * inventory a grace window to catch up, then try drop-allowlisted candidate
 * channels, then any allowed channel if we're on the wrong game — and only
 * then give up on the game (cooldown + retarget + stall-stop).
 */
export const decideWatchingNoFarmable = (
  input: WatchingNoFarmableInput,
): StallRecoveryDecision & { resetStallTracking: boolean } => {
  const {
    watching,
    targetGame,
    activeTargetGame,
    channelAllowlist,
    channels,
    channelsLoading,
    targetDrops,
    noFarmable,
    now,
    getNextTargetGame,
  } = input;
  const noFarmableKey = targetGame;
  if (!noFarmable || noFarmable.key !== noFarmableKey) {
    return {
      actions: [],
      noFarmable: { key: noFarmableKey, sinceAt: now },
      resetStallTracking: false,
    };
  }
  if (now - noFarmable.sinceAt < NO_FARMABLE_DROP_GRACE_MS) {
    return { actions: [], noFarmable, resetStallTracking: false };
  }
  // Asymmetry vs. the idle branch is original behavior: only `channelsLoading`
  // gates here (not `channelsRefreshing`).
  if (channelsLoading && channels.length === 0) {
    return { actions: [], noFarmable, resetStallTracking: false };
  }
  const candidateDrops = targetDrops.filter(
    (drop) => drop.status === "progress" && canEarnDrop(drop, { category: "in-progress" }),
  );
  for (const candidate of candidateDrops) {
    const nextChannel = pickStallRecoveryChannel({
      channels,
      watching,
      drop: {
        id: candidate.id,
        earnedMinutes: candidate.earnedMinutes,
        allowedChannelIds: candidate.allowedChannelIds,
        allowedChannelLogins: candidate.allowedChannelLogins,
      },
    });
    if (nextChannel) {
      return {
        actions: [{ kind: "switch-channel", channel: nextChannel }],
        noFarmable: null,
        resetStallTracking: false,
      };
    }
  }
  const allowlistRestriction = DropChannelRestriction.fromAllowlist(channelAllowlist);
  const fallbackChannel = allowlistRestriction.hasConstraints
    ? channels.find((channel) => allowlistRestriction.allowsChannel(channel))
    : channels[0];
  if (!sameGameName(watching.game, targetGame) && fallbackChannel) {
    return {
      actions: [{ kind: "switch-channel", channel: fallbackChannel }],
      noFarmable: null,
      resetStallTracking: false,
    };
  }
  const stalledGame = activeTargetGame.trim() || targetGame.trim() || watching.game.trim();
  const currentForRetarget = activeTargetGame.trim() || targetGame.trim();
  const nextTargetGame = currentForRetarget ? getNextTargetGame(currentForRetarget) : "";
  const actions: StallRecoveryAction[] = [
    {
      kind: "set-cooldown",
      game: stalledGame,
      durationMs: NO_FARMABLE_GAME_COOLDOWN_MS,
      reason: "stall-no-farmable",
    },
  ];
  if (nextTargetGame) {
    actions.push(
      {
        kind: "log",
        message: "watch-engine: retarget",
        data: {
          reason: "stall-no-farmable-direct",
          from: activeTargetGame,
          to: nextTargetGame,
        },
      },
      { kind: "retarget", to: nextTargetGame },
    );
  }
  actions.push(
    { kind: "enable-auto-select" },
    { kind: "stop-watching" },
    {
      kind: "dispatch-stall-stop",
      game: stalledGame || activeTargetGame,
      context: "stall-no-farmable",
    },
  );
  return { actions, noFarmable: null, resetStallTracking: true };
};
