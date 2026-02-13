import type { ChannelInfo, TwitchService } from "./service";
import { WebSocket as NodeWebSocket, type RawData } from "ws";

export type ChannelTrackerMode = "polling" | "ws" | "hybrid";
export type ChannelTrackerState = "idle" | "ok" | "error";
export type ChannelTrackerConnectionState = "disconnected" | "connecting" | "connected";

export type ChannelTrackerStatus = {
  mode: ChannelTrackerMode;
  effectiveMode?: "polling" | "ws";
  state: ChannelTrackerState;
  lastRequestAt: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastErrorMessage?: string;
  requests: number;
  failures: number;
  connectionState?: ChannelTrackerConnectionState;
  subscriptions?: number;
  desiredSubscriptions?: number;
  topicLimit?: number;
  reconnectAttempts?: number;
  fallbackActive?: boolean;
  fallbackUntil?: number | null;
};

export type ChannelTrackerDiffSource = "ws" | "fetch";
export type ChannelTrackerDiffReason = "snapshot" | "stream-up" | "stream-down" | "viewers";
export type ChannelTrackerDiffEvent = {
  game: string;
  at: number;
  source: ChannelTrackerDiffSource;
  reason: ChannelTrackerDiffReason;
  added: ChannelInfo[];
  removedIds: string[];
  updated: ChannelInfo[];
};
export type ChannelTrackerDiffListener = (event: ChannelTrackerDiffEvent) => void;

export interface ChannelTracker {
  mode: ChannelTrackerMode;
  getChannelsForGame(gameName: string): Promise<ChannelInfo[]>;
  getStatus(): ChannelTrackerStatus;
  onDiff(listener: ChannelTrackerDiffListener): () => void;
  dispose?(): void;
}

export class PollingChannelTracker implements ChannelTracker {
  mode: ChannelTrackerMode = "polling";
  private state: ChannelTrackerState = "idle";
  private lastRequestAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastErrorMessage: string | undefined;
  private requests = 0;
  private failures = 0;
  private readonly gameChannels = new Map<string, ChannelInfo[]>();
  private readonly diffListeners = new Set<ChannelTrackerDiffListener>();

  constructor(private readonly twitch: TwitchService) {}

  async getChannelsForGame(gameName: string): Promise<ChannelInfo[]> {
    this.requests += 1;
    this.lastRequestAt = Date.now();
    try {
      const channels = await this.twitch.getChannelsForGame(gameName);
      const prevChannels = this.gameChannels.get(gameName) ?? [];
      const nextChannels = cloneChannels(channels);
      this.gameChannels.set(gameName, nextChannels);
      this.state = "ok";
      this.lastSuccessAt = Date.now();
      this.lastErrorMessage = undefined;
      this.emitDiff(gameName, "snapshot", "fetch", prevChannels, nextChannels);
      return channels;
    } catch (err) {
      this.state = "error";
      this.failures += 1;
      this.lastErrorAt = Date.now();
      this.lastErrorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  getStatus(): ChannelTrackerStatus {
    return {
      mode: this.mode,
      state: this.state,
      lastRequestAt: this.lastRequestAt,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastErrorMessage: this.lastErrorMessage,
      requests: this.requests,
      failures: this.failures,
    };
  }

  onDiff(listener: ChannelTrackerDiffListener): () => void {
    this.diffListeners.add(listener);
    return () => {
      this.diffListeners.delete(listener);
    };
  }

  private emitDiff(
    game: string,
    reason: ChannelTrackerDiffReason,
    source: ChannelTrackerDiffSource,
    prevChannels: ChannelInfo[],
    nextChannels: ChannelInfo[],
  ) {
    if (this.diffListeners.size === 0) return;
    const diff = buildChannelListDiff(prevChannels, nextChannels);
    if (!diff) return;
    const event: ChannelTrackerDiffEvent = {
      game,
      at: Date.now(),
      source,
      reason,
      ...diff,
    };
    for (const listener of this.diffListeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }
}

const PUBSUB_URL = "wss://pubsub-edge.twitch.tv/v1";
const TOPIC_PREFIX = "video-playback-by-id.";
const WS_TOPICS_LIMIT = 50;
const LISTEN_BATCH_SIZE = WS_TOPICS_LIMIT;
const MAX_WS_SOCKETS = 8;
const MAX_TRACKED_TOPICS_LIMIT = WS_TOPICS_LIMIT * MAX_WS_SOCKETS;
const DEFAULT_MAX_TRACKED_TOPICS = 199;
const DEFAULT_OFFLINE_UNSUBSCRIBE_GRACE_MS = 3 * 60_000;
const TOPIC_CAP_WARN_INTERVAL_MS = 60_000;

type WsTrackerOptions = {
  mode?: "ws" | "hybrid";
  wsUrl?: string;
  pingIntervalMs?: number;
  maxTrackedTopics?: number;
  maxSockets?: number;
  refreshMs?: number;
  fallbackPollRefreshMs?: number;
  fallbackAfterReconnectAttempts?: number;
  fallbackCooldownMs?: number;
  offlineUnsubscribeGraceMs?: number;
};

type WsShard = {
  id: number;
  ws: NodeWebSocket | null;
  connectionState: ChannelTrackerConnectionState;
  reconnectTimer: NodeJS.Timeout | null;
  pingTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
  subscribedChannelIds: Set<string>;
};

type PubSubEnvelope = {
  type?: string;
  error?: string;
  data?: {
    topic?: string;
    message?: string;
  };
};

type PlaybackPayload = {
  type?: string;
  viewers?: number;
  viewer_count?: number;
  viewers_count?: number;
  view_count?: number;
};

const cloneChannel = (channel: ChannelInfo): ChannelInfo => ({ ...channel });
const cloneChannels = (channels: ChannelInfo[]): ChannelInfo[] => channels.map(cloneChannel);

const sameChannelInfo = (left: ChannelInfo, right: ChannelInfo): boolean =>
  left.id === right.id &&
  left.streamId === right.streamId &&
  left.displayName === right.displayName &&
  left.login === right.login &&
  left.title === right.title &&
  left.viewers === right.viewers &&
  left.language === right.language &&
  left.thumbnail === right.thumbnail &&
  left.game === right.game;

const buildChannelListDiff = (
  prevChannels: ChannelInfo[],
  nextChannels: ChannelInfo[],
): Pick<ChannelTrackerDiffEvent, "added" | "removedIds" | "updated"> | null => {
  const prevById = new Map(prevChannels.map((channel) => [channel.id, channel]));
  const nextById = new Map(nextChannels.map((channel) => [channel.id, channel]));
  const added: ChannelInfo[] = [];
  const removedIds: string[] = [];
  const updated: ChannelInfo[] = [];

  for (const [id, nextChannel] of nextById) {
    const prevChannel = prevById.get(id);
    if (!prevChannel) {
      added.push(cloneChannel(nextChannel));
      continue;
    }
    if (!sameChannelInfo(prevChannel, nextChannel)) {
      updated.push(cloneChannel(nextChannel));
    }
  }

  for (const [id] of prevById) {
    if (!nextById.has(id)) {
      removedIds.push(id);
    }
  }

  if (added.length === 0 && removedIds.length === 0 && updated.length === 0) {
    return null;
  }

  return { added, removedIds, updated };
};

const topicForChannel = (channelId: string) => `${TOPIC_PREFIX}${channelId}`;

const channelIdFromTopic = (topic: string | undefined): string | null => {
  if (!topic || !topic.startsWith(TOPIC_PREFIX)) return null;
  const channelId = topic.slice(TOPIC_PREFIX.length).trim();
  return channelId.length ? channelId : null;
};

const toMessageText = (raw: unknown): string => {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf-8");
  if (Array.isArray(raw)) {
    return Buffer.concat(
      raw.map((entry) => (Buffer.isBuffer(entry) ? entry : Buffer.from(entry))),
    ).toString("utf-8");
  }
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf-8");
  if (ArrayBuffer.isView(raw)) {
    return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf-8");
  }
  return "";
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

export class WsChannelTracker implements ChannelTracker {
  mode: ChannelTrackerMode;
  private state: ChannelTrackerState = "idle";
  private lastRequestAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastErrorMessage: string | undefined;
  private requests = 0;
  private failures = 0;
  private fallbackTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  private wsFallbackUntil: number | null = null;
  private desiredChannelIds = new Set<string>();
  private desiredChannelIdsByShard = new Map<number, Set<string>>();
  private channelShardById = new Map<string, number>();
  private gameChannels = new Map<string, ChannelInfo[]>();
  private gameRefreshedAt = new Map<string, number>();
  private gameChannelIds = new Map<string, Set<string>>();
  private channelDetails = new Map<string, ChannelInfo>();
  private channelToGames = new Map<string, Set<string>>();
  private offlineSinceByChannelId = new Map<string, number>();
  private offlinePruneTimers = new Map<string, NodeJS.Timeout>();
  private readonly diffListeners = new Set<ChannelTrackerDiffListener>();
  private readonly wsUrl: string;
  private readonly pingIntervalMs: number;
  private readonly maxSockets: number;
  private readonly maxTrackedTopics: number;
  private readonly refreshMs: number;
  private readonly fallbackPollRefreshMs: number;
  private readonly fallbackAfterReconnectAttempts: number;
  private readonly fallbackCooldownMs: number;
  private readonly offlineUnsubscribeGraceMs: number;
  private readonly shards: WsShard[];
  private lastTopicCapWarnAt: number | null = null;

  constructor(
    private readonly twitch: TwitchService,
    opts: WsTrackerOptions = {},
  ) {
    this.mode = opts.mode ?? "ws";
    this.wsUrl = opts.wsUrl ?? PUBSUB_URL;
    this.pingIntervalMs = Math.max(30_000, opts.pingIntervalMs ?? 4 * 60_000);
    this.maxSockets = Math.min(MAX_WS_SOCKETS, Math.max(1, opts.maxSockets ?? MAX_WS_SOCKETS));
    const requestedMaxTrackedTopics = Math.max(
      1,
      opts.maxTrackedTopics ?? DEFAULT_MAX_TRACKED_TOPICS,
    );
    const hardTopicCap = Math.min(MAX_TRACKED_TOPICS_LIMIT, this.maxSockets * WS_TOPICS_LIMIT);
    this.maxTrackedTopics = Math.min(requestedMaxTrackedTopics, hardTopicCap);
    if (requestedMaxTrackedTopics > this.maxTrackedTopics) {
      console.warn(
        `[DropPilot] WS topic cap limited to ${this.maxTrackedTopics} in shard mode ` +
          `(requested: ${requestedMaxTrackedTopics})`,
      );
    }
    this.refreshMs = Math.max(10_000, opts.refreshMs ?? 90_000);
    this.fallbackPollRefreshMs = Math.max(5_000, opts.fallbackPollRefreshMs ?? 25_000);
    this.fallbackAfterReconnectAttempts = Math.max(
      1,
      opts.fallbackAfterReconnectAttempts ?? 8,
    );
    this.fallbackCooldownMs = Math.max(30_000, opts.fallbackCooldownMs ?? 30 * 60_000);
    this.offlineUnsubscribeGraceMs = Math.max(
      5_000,
      opts.offlineUnsubscribeGraceMs ?? DEFAULT_OFFLINE_UNSUBSCRIBE_GRACE_MS,
    );
    this.shards = Array.from({ length: this.maxSockets }, (_, idx) => this.createShard(idx));
  }

  async getChannelsForGame(gameName: string): Promise<ChannelInfo[]> {
    this.requests += 1;
    const now = Date.now();
    this.lastRequestAt = now;
    this.maybeRestoreWs(now);
    const fallbackActive = this.isPollingFallbackActive(now);
    const cached = this.gameChannels.get(gameName);
    const refreshedAt = this.gameRefreshedAt.get(gameName) ?? 0;
    const refreshWindow = fallbackActive ? this.fallbackPollRefreshMs : this.refreshMs;
    const hasFreshCache = cached !== undefined && now - refreshedAt < refreshWindow;
    if (hasFreshCache) {
      this.state = "ok";
      this.lastSuccessAt = now;
      this.lastErrorMessage = undefined;
      this.recomputeDesiredChannels();
      return cloneChannels(cached);
    }
    try {
      const prevChannels = this.gameChannels.get(gameName) ?? [];
      const channels = await this.twitch.getChannelsForGame(gameName);
      this.state = "ok";
      this.lastSuccessAt = Date.now();
      this.lastErrorMessage = undefined;
      this.replaceGameChannels(gameName, channels);
      const nextChannels = this.gameChannels.get(gameName) ?? [];
      this.emitDiff(gameName, "snapshot", "fetch", prevChannels, nextChannels);
      this.recomputeDesiredChannels();
      return this.getCachedChannels(gameName);
    } catch (err) {
      this.state = "error";
      this.failures += 1;
      this.lastErrorAt = Date.now();
      this.lastErrorMessage = err instanceof Error ? err.message : String(err);
      if (cached !== undefined) {
        return cloneChannels(cached);
      }
      throw err;
    }
  }

  private getAggregateConnectionState(): ChannelTrackerConnectionState {
    const states = this.shards.map((shard) => shard.connectionState);
    if (states.some((state) => state === "connected")) return "connected";
    if (states.some((state) => state === "connecting")) return "connecting";
    return "disconnected";
  }

  private getTotalSubscribedChannels(): number {
    let total = 0;
    for (const shard of this.shards) {
      total += shard.subscribedChannelIds.size;
    }
    return total;
  }

  private getMaxReconnectAttempts(): number {
    let max = 0;
    for (const shard of this.shards) {
      if (shard.reconnectAttempts > max) {
        max = shard.reconnectAttempts;
      }
    }
    return max;
  }

  getStatus(): ChannelTrackerStatus {
    const fallbackActive = this.isPollingFallbackActive();
    return {
      mode: this.mode,
      effectiveMode: fallbackActive ? "polling" : "ws",
      state: this.state,
      lastRequestAt: this.lastRequestAt,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastErrorMessage: this.lastErrorMessage,
      requests: this.requests,
      failures: this.failures,
      connectionState: this.getAggregateConnectionState(),
      subscriptions: this.getTotalSubscribedChannels(),
      desiredSubscriptions: this.desiredChannelIds.size,
      topicLimit: this.maxTrackedTopics,
      reconnectAttempts: this.getMaxReconnectAttempts(),
      fallbackActive,
      fallbackUntil: fallbackActive ? this.wsFallbackUntil : null,
    };
  }

  onDiff(listener: ChannelTrackerDiffListener): () => void {
    this.diffListeners.add(listener);
    return () => {
      this.diffListeners.delete(listener);
    };
  }

  dispose() {
    this.disposed = true;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    for (const timer of this.offlinePruneTimers.values()) {
      clearTimeout(timer);
    }
    this.offlinePruneTimers.clear();
    this.offlineSinceByChannelId.clear();
    for (const shard of this.shards) {
      this.clearShardReconnectTimer(shard);
      this.stopShardPingLoop(shard);
      if (shard.ws) {
        try {
          shard.ws.close(1000, "DropPilot shutdown");
        } catch {
          // ignore close errors
        }
      }
      shard.ws = null;
      shard.connectionState = "disconnected";
      shard.subscribedChannelIds.clear();
    }
    this.desiredChannelIdsByShard.clear();
  }

  private getCachedChannels(gameName: string): ChannelInfo[] {
    return cloneChannels(this.gameChannels.get(gameName) ?? []);
  }

  private replaceGameChannels(gameName: string, channels: ChannelInfo[]) {
    const normalized = cloneChannels(channels);
    const nextIds = new Set<string>();
    const prevIds = this.gameChannelIds.get(gameName) ?? new Set<string>();
    for (const channel of normalized) {
      if (!channel.id) continue;
      nextIds.add(channel.id);
      this.clearOfflineMarker(channel.id);
      this.channelDetails.set(channel.id, cloneChannel(channel));
      const games = this.channelToGames.get(channel.id) ?? new Set<string>();
      games.add(gameName);
      this.channelToGames.set(channel.id, games);
    }
    for (const channelId of prevIds) {
      if (nextIds.has(channelId)) continue;
      const games = this.channelToGames.get(channelId);
      if (!games) continue;
      games.delete(gameName);
      if (!games.size) {
        this.channelToGames.delete(channelId);
        this.clearOfflineMarker(channelId);
      }
    }
    this.gameChannelIds.set(gameName, nextIds);
    this.gameChannels.set(gameName, normalized);
    this.gameRefreshedAt.set(gameName, Date.now());
  }

  private isChannelSubscribed(channelId: string): boolean {
    for (const shard of this.shards) {
      if (shard.subscribedChannelIds.has(channelId)) return true;
    }
    return false;
  }

  private recomputeDesiredChannels() {
    const allChannelIds = new Set<string>();
    for (const ids of this.gameChannelIds.values()) {
      for (const channelId of ids) {
        allChannelIds.add(channelId);
      }
    }

    const ranked = Array.from(allChannelIds).map((channelId) => {
      const games = this.channelToGames.get(channelId);
      let gamePriority = 0;
      if (games?.size) {
        for (const game of games) {
          gamePriority = Math.max(gamePriority, this.gameRefreshedAt.get(game) ?? 0);
        }
      }
      return {
        channelId,
        gamePriority,
        offline: this.offlineSinceByChannelId.has(channelId),
        subscribed: this.isChannelSubscribed(channelId),
        viewers: this.channelDetails.get(channelId)?.viewers ?? 0,
        name: this.channelDetails.get(channelId)?.displayName ?? channelId,
      };
    });

    ranked.sort((left, right) => {
      if (left.gamePriority !== right.gamePriority) {
        return right.gamePriority - left.gamePriority;
      }
      if (left.offline !== right.offline) {
        return left.offline ? 1 : -1;
      }
      if (left.subscribed !== right.subscribed) {
        return left.subscribed ? -1 : 1;
      }
      if (left.viewers !== right.viewers) {
        return right.viewers - left.viewers;
      }
      return left.name.localeCompare(right.name);
    });

    this.warnIfTopicCapReached(ranked.length);
    const desired = new Set<string>();
    for (const entry of ranked) {
      const channelId = entry.channelId;
      desired.add(channelId);
      if (desired.size >= this.maxTrackedTopics) break;
    }
    this.desiredChannelIds = desired;
    this.syncSubscriptions();
  }

  private warnIfTopicCapReached(candidateCount: number) {
    if (candidateCount <= this.maxTrackedTopics) return;
    const now = Date.now();
    if (
      this.lastTopicCapWarnAt !== null &&
      now - this.lastTopicCapWarnAt < TOPIC_CAP_WARN_INTERVAL_MS
    ) {
      return;
    }
    this.lastTopicCapWarnAt = now;
    console.warn(
      `[DropPilot] WS topic cap reached (${this.maxTrackedTopics}). ` +
        `Tracking top ${this.maxTrackedTopics} of ${candidateCount} channels.`,
    );
  }

  private createShard(id: number): WsShard {
    return {
      id,
      ws: null,
      connectionState: "disconnected",
      reconnectTimer: null,
      pingTimer: null,
      reconnectAttempts: 0,
      subscribedChannelIds: new Set<string>(),
    };
  }

  private hashChannelId(channelId: string): number {
    let hash = 0;
    for (let i = 0; i < channelId.length; i += 1) {
      hash = (hash * 31 + channelId.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  private assignDesiredChannelsToShards() {
    const desiredByShard = new Map<number, Set<string>>();
    const desiredIds = Array.from(this.desiredChannelIds);
    const activeShardCount = Math.min(
      this.shards.length,
      Math.ceil(desiredIds.length / WS_TOPICS_LIMIT),
    );
    for (let shardId = 0; shardId < activeShardCount; shardId += 1) {
      desiredByShard.set(shardId, new Set<string>());
    }
    if (activeShardCount === 0) {
      this.desiredChannelIdsByShard = desiredByShard;
      this.channelShardById.clear();
      return;
    }

    const toAssign: string[] = [];
    for (const channelId of desiredIds) {
      const preferredShardId = this.channelShardById.get(channelId);
      if (
        preferredShardId === undefined ||
        preferredShardId < 0 ||
        preferredShardId >= activeShardCount
      ) {
        toAssign.push(channelId);
        continue;
      }
      const bucket = desiredByShard.get(preferredShardId);
      if (!bucket || bucket.size >= WS_TOPICS_LIMIT) {
        toAssign.push(channelId);
        continue;
      }
      bucket.add(channelId);
    }

    for (const channelId of toAssign) {
      const startShard = this.hashChannelId(channelId) % activeShardCount;
      let assigned = false;
      for (let offset = 0; offset < activeShardCount; offset += 1) {
        const shardId = (startShard + offset) % activeShardCount;
        const bucket = desiredByShard.get(shardId);
        if (!bucket || bucket.size >= WS_TOPICS_LIMIT) continue;
        bucket.add(channelId);
        this.channelShardById.set(channelId, shardId);
        assigned = true;
        break;
      }
      if (!assigned) {
        this.channelShardById.delete(channelId);
      }
    }

    for (const [shardId, bucket] of desiredByShard) {
      for (const channelId of bucket) {
        this.channelShardById.set(channelId, shardId);
      }
    }
    for (const channelId of Array.from(this.channelShardById.keys())) {
      if (!this.desiredChannelIds.has(channelId)) {
        this.channelShardById.delete(channelId);
      }
    }
    this.desiredChannelIdsByShard = desiredByShard;
  }

  private disconnectShard(shard: WsShard, reason: string, resetReconnectAttempts: boolean) {
    this.clearShardReconnectTimer(shard);
    this.stopShardPingLoop(shard);
    if (this.isShardOpen(shard) && shard.subscribedChannelIds.size > 0) {
      this.sendSubscription(shard, "UNLISTEN", Array.from(shard.subscribedChannelIds));
    }
    shard.subscribedChannelIds.clear();
    if (resetReconnectAttempts) {
      shard.reconnectAttempts = 0;
    }

    const ws = shard.ws;
    shard.ws = null;
    shard.connectionState = "disconnected";
    if (!ws) return;
    try {
      ws.close(1000, reason);
    } catch {
      // ignore close errors
    }
  }

  private syncSubscriptions() {
    this.maybeRestoreWs();
    this.assignDesiredChannelsToShards();

    if (this.isPollingFallbackActive()) {
      for (const shard of this.shards) {
        this.disconnectShard(shard, "Polling fallback active", false);
      }
      return;
    }

    for (const shard of this.shards) {
      const desiredForShard = this.desiredChannelIdsByShard.get(shard.id);
      if (!desiredForShard || desiredForShard.size === 0) {
        this.disconnectShard(shard, "No topics assigned", true);
        continue;
      }

      this.ensureShardSocket(shard);
      if (!this.isShardOpen(shard)) continue;

      const toSubscribe: string[] = [];
      for (const channelId of desiredForShard) {
        if (!shard.subscribedChannelIds.has(channelId)) {
          toSubscribe.push(channelId);
        }
      }

      const toUnsubscribe: string[] = [];
      for (const channelId of shard.subscribedChannelIds) {
        if (!desiredForShard.has(channelId)) {
          toUnsubscribe.push(channelId);
        }
      }

      if (toUnsubscribe.length) {
        this.sendSubscription(shard, "UNLISTEN", toUnsubscribe);
        for (const channelId of toUnsubscribe) {
          shard.subscribedChannelIds.delete(channelId);
        }
      }
      if (toSubscribe.length) {
        this.sendSubscription(shard, "LISTEN", toSubscribe);
        for (const channelId of toSubscribe) {
          shard.subscribedChannelIds.add(channelId);
        }
      }
    }
  }

  private ensureShardSocket(shard: WsShard) {
    if (this.disposed) return;
    this.maybeRestoreWs();
    if (this.isPollingFallbackActive()) return;
    const desiredForShard = this.desiredChannelIdsByShard.get(shard.id);
    if (!desiredForShard || desiredForShard.size === 0) return;
    if (shard.ws && shard.connectionState !== "disconnected") return;

    shard.connectionState = "connecting";
    let ws: NodeWebSocket;
    try {
      ws = new NodeWebSocket(this.wsUrl);
    } catch (err) {
      this.markWsError(err);
      this.scheduleShardReconnect(shard);
      return;
    }

    shard.ws = ws;
    ws.on("open", () => {
      if (shard.ws !== ws) return;
      this.clearWsFallback();
      this.clearShardReconnectTimer(shard);
      shard.connectionState = "connected";
      shard.reconnectAttempts = 0;
      this.state = "ok";
      this.lastSuccessAt = Date.now();
      this.lastErrorMessage = undefined;
      this.startShardPingLoop(shard);
      shard.subscribedChannelIds.clear();
      const desiredIds = this.desiredChannelIdsByShard.get(shard.id);
      if (!desiredIds || desiredIds.size === 0) return;
      const ids = Array.from(desiredIds);
      this.sendSubscription(shard, "LISTEN", ids);
      for (const channelId of ids) {
        shard.subscribedChannelIds.add(channelId);
      }
    });
    ws.on("message", (data: RawData) => {
      if (shard.ws !== ws) return;
      this.handleWsMessage(shard, data);
    });
    ws.on("error", (err) => {
      if (shard.ws !== ws) return;
      this.markWsError(err);
    });
    ws.on("close", () => {
      if (shard.ws !== ws) return;
      shard.connectionState = "disconnected";
      this.stopShardPingLoop(shard);
      shard.ws = null;
      shard.subscribedChannelIds.clear();
      this.scheduleShardReconnect(shard);
    });
  }

  private isShardOpen(shard: WsShard) {
    return !!shard.ws && shard.ws.readyState === NodeWebSocket.OPEN;
  }

  private startShardPingLoop(shard: WsShard) {
    this.stopShardPingLoop(shard);
    shard.pingTimer = setInterval(() => {
      if (!this.isShardOpen(shard)) return;
      this.sendRaw(shard, { type: "PING" });
    }, this.pingIntervalMs);
  }

  private stopShardPingLoop(shard: WsShard) {
    if (!shard.pingTimer) return;
    clearInterval(shard.pingTimer);
    shard.pingTimer = null;
  }

  private clearShardReconnectTimer(shard: WsShard) {
    if (!shard.reconnectTimer) return;
    clearTimeout(shard.reconnectTimer);
    shard.reconnectTimer = null;
  }

  private scheduleShardReconnect(shard: WsShard) {
    if (this.disposed) return;
    this.maybeRestoreWs();
    if (this.isPollingFallbackActive()) return;
    const desiredForShard = this.desiredChannelIdsByShard.get(shard.id);
    if (!desiredForShard || desiredForShard.size === 0) return;
    if (shard.reconnectTimer) return;

    shard.reconnectAttempts += 1;
    if (shard.reconnectAttempts >= this.fallbackAfterReconnectAttempts) {
      this.activatePollingFallback(
        `WS shard ${shard.id + 1} unavailable after ${shard.reconnectAttempts} reconnect attempts`,
      );
      return;
    }
    const backoff = Math.min(30_000, 1_000 * 2 ** Math.min(shard.reconnectAttempts, 5));
    const jitter = Math.floor(Math.random() * 500);
    const delay = backoff + jitter;
    shard.reconnectTimer = setTimeout(() => {
      shard.reconnectTimer = null;
      this.ensureShardSocket(shard);
    }, delay);
  }

  private sendRaw(shard: WsShard, payload: Record<string, unknown>) {
    if (!this.isShardOpen(shard) || !shard.ws) return;
    try {
      shard.ws.send(JSON.stringify(payload));
    } catch (err) {
      this.markWsError(err);
    }
  }

  private sendSubscription(shard: WsShard, type: "LISTEN" | "UNLISTEN", channelIds: string[]) {
    if (!channelIds.length) return;
    if (!this.isShardOpen(shard) || !shard.ws) return;
    for (const part of chunk(channelIds, LISTEN_BATCH_SIZE)) {
      this.sendRaw(shard, {
        type,
        nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        data: {
          topics: part.map((channelId) => topicForChannel(channelId)),
          auth_token: "",
        },
      });
    }
  }

  private handleWsMessage(shard: WsShard, raw: unknown) {
    const text = toMessageText(raw);
    if (!text) return;
    let envelope: PubSubEnvelope;
    try {
      envelope = JSON.parse(text) as PubSubEnvelope;
    } catch {
      return;
    }

    const type = String(envelope.type ?? "").toUpperCase();
    if (type === "PONG") {
      this.state = "ok";
      this.lastSuccessAt = Date.now();
      this.lastErrorMessage = undefined;
      return;
    }
    if (type === "RECONNECT") {
      if (shard.ws) {
        try {
          shard.ws.close();
        } catch {
          // ignore close errors
        }
      }
      return;
    }
    if (type === "RESPONSE") {
      if (envelope.error) {
        this.markWsError(`[shard ${shard.id + 1}] ${envelope.error}`);
      }
      return;
    }
    if (type !== "MESSAGE") return;

    const channelId = channelIdFromTopic(envelope.data?.topic);
    if (!channelId) return;

    let payload: PlaybackPayload;
    try {
      payload = JSON.parse(envelope.data?.message ?? "{}") as PlaybackPayload;
    } catch {
      return;
    }
    this.applyPlaybackUpdate(channelId, payload);
  }

  private applyPlaybackUpdate(channelId: string, payload: PlaybackPayload) {
    const games = this.channelToGames.get(channelId);
    if (!games?.size) return;
    const now = Date.now();
    const gameList = Array.from(games);

    const eventType = String(payload.type ?? "").toLowerCase();
    if (eventType === "stream-down") {
      for (const game of gameList) {
        const current = this.gameChannels.get(game);
        if (!current?.length) continue;
        const next = current.filter((channel) => channel.id !== channelId);
        if (next.length === current.length) continue;
        this.gameChannels.set(game, next);
        this.emitPatch({
          game,
          at: now,
          source: "ws",
          reason: "stream-down",
          added: [],
          removedIds: [channelId],
          updated: [],
        });
      }
      this.markOfflinePendingRemoval(channelId, now);
      this.state = "ok";
      this.lastSuccessAt = now;
      this.lastErrorMessage = undefined;
      return;
    }

    if (eventType === "stream-up") {
      this.clearOfflineMarker(channelId);
      const known = this.channelDetails.get(channelId);
      if (!known) return;
      for (const game of gameList) {
        const current = this.gameChannels.get(game) ?? [];
        if (current.some((channel) => channel.id === channelId)) continue;
        const channel = cloneChannel(known);
        this.gameChannels.set(game, [...current, channel]);
        this.emitPatch({
          game,
          at: now,
          source: "ws",
          reason: "stream-up",
          added: [cloneChannel(channel)],
          removedIds: [],
          updated: [],
        });
      }
      this.state = "ok";
      this.lastSuccessAt = now;
      this.lastErrorMessage = undefined;
      return;
    }

    const viewerCount = this.readViewerCount(payload);
    if (viewerCount === null) return;
    const known = this.channelDetails.get(channelId);
    if (known) {
      known.viewers = viewerCount;
    }
    this.clearOfflineMarker(channelId);
    for (const game of gameList) {
      const current = this.gameChannels.get(game);
      if (!current?.length) continue;
      let changed = false;
      let changedChannel: ChannelInfo | null = null;
      const next = current.map((channel) => {
        if (channel.id !== channelId) return channel;
        if (channel.viewers === viewerCount) return channel;
        changed = true;
        changedChannel = { ...channel, viewers: viewerCount };
        return changedChannel;
      });
      if (changed) {
        this.gameChannels.set(game, next);
        if (changedChannel) {
          this.emitPatch({
            game,
            at: now,
            source: "ws",
            reason: "viewers",
            added: [],
            removedIds: [],
            updated: [cloneChannel(changedChannel)],
          });
        }
      }
    }
    this.state = "ok";
    this.lastSuccessAt = now;
    this.lastErrorMessage = undefined;
  }

  private readViewerCount(payload: PlaybackPayload): number | null {
    const candidates = [
      payload.viewers,
      payload.viewer_count,
      payload.viewers_count,
      payload.view_count,
    ];
    for (const value of candidates) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return value;
      }
    }
    return null;
  }

  private clearOfflineMarker(channelId: string) {
    this.offlineSinceByChannelId.delete(channelId);
    const timer = this.offlinePruneTimers.get(channelId);
    if (timer) {
      clearTimeout(timer);
      this.offlinePruneTimers.delete(channelId);
    }
  }

  private markOfflinePendingRemoval(channelId: string, now: number) {
    this.offlineSinceByChannelId.set(channelId, now);
    if (this.offlinePruneTimers.has(channelId)) return;
    const timer = setTimeout(() => {
      this.offlinePruneTimers.delete(channelId);
      this.pruneOfflineChannel(channelId);
    }, this.offlineUnsubscribeGraceMs);
    this.offlinePruneTimers.set(channelId, timer);
  }

  private pruneOfflineChannel(channelId: string) {
    if (this.disposed) return;
    const games = this.channelToGames.get(channelId);
    this.offlineSinceByChannelId.delete(channelId);
    if (!games?.size) return;
    let changed = false;
    for (const game of games) {
      const ids = this.gameChannelIds.get(game);
      if (!ids) continue;
      if (ids.delete(channelId)) {
        changed = true;
      }
    }
    this.channelToGames.delete(channelId);
    if (changed) {
      this.recomputeDesiredChannels();
    }
  }

  private markWsError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    this.state = "error";
    this.failures += 1;
    this.lastErrorAt = Date.now();
    this.lastErrorMessage = message;
    if (/\berr_[a-z0-9_]+\b/i.test(message)) {
      this.activatePollingFallback(`WS rejected by Twitch (${message})`);
    }
  }

  private isPollingFallbackActive(now = Date.now()) {
    return this.wsFallbackUntil !== null && now < this.wsFallbackUntil;
  }

  private maybeRestoreWs(now = Date.now()) {
    if (this.wsFallbackUntil === null || now < this.wsFallbackUntil) return;
    this.clearWsFallback();
  }

  private clearWsFallback() {
    this.wsFallbackUntil = null;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private activatePollingFallback(reason: string) {
    if (this.disposed) return;
    const now = Date.now();
    this.wsFallbackUntil = now + this.fallbackCooldownMs;
    this.lastErrorAt = now;
    this.lastErrorMessage = reason;
    for (const shard of this.shards) {
      this.disconnectShard(shard, "Switching to polling fallback", false);
    }
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
    }
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      this.clearWsFallback();
      if (this.desiredChannelIds.size > 0) {
        this.syncSubscriptions();
      }
    }, this.fallbackCooldownMs);
  }

  private emitDiff(
    game: string,
    reason: ChannelTrackerDiffReason,
    source: ChannelTrackerDiffSource,
    prevChannels: ChannelInfo[],
    nextChannels: ChannelInfo[],
  ) {
    if (this.diffListeners.size === 0) return;
    const diff = buildChannelListDiff(prevChannels, nextChannels);
    if (!diff) return;
    this.emitPatch({
      game,
      at: Date.now(),
      source,
      reason,
      ...diff,
    });
  }

  private emitPatch(event: ChannelTrackerDiffEvent) {
    if (this.diffListeners.size === 0) return;
    for (const listener of this.diffListeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }
}

export function normalizeTrackerMode(input: string | undefined | null): ChannelTrackerMode {
  const raw = (input ?? "").trim().toLowerCase();
  if (raw === "ws" || raw === "hybrid" || raw === "polling") {
    return raw;
  }
  return "polling";
}

export function createChannelTracker(
  twitch: TwitchService,
  mode: ChannelTrackerMode,
): ChannelTracker {
  if (mode === "ws" || mode === "hybrid") {
    return new WsChannelTracker(twitch, { mode });
  }
  return new PollingChannelTracker(twitch);
}
