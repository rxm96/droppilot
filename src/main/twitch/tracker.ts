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
const LISTEN_BATCH_SIZE = 50;

type WsTrackerOptions = {
  mode?: "ws" | "hybrid";
  wsUrl?: string;
  pingIntervalMs?: number;
  maxTrackedTopics?: number;
  refreshMs?: number;
  fallbackPollRefreshMs?: number;
  fallbackAfterReconnectAttempts?: number;
  fallbackCooldownMs?: number;
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
  private ws: NodeWebSocket | null = null;
  private connectionState: ChannelTrackerConnectionState = "disconnected";
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private fallbackTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private disposed = false;
  private wsFallbackUntil: number | null = null;
  private desiredChannelIds = new Set<string>();
  private subscribedChannelIds = new Set<string>();
  private gameChannels = new Map<string, ChannelInfo[]>();
  private gameRefreshedAt = new Map<string, number>();
  private gameChannelIds = new Map<string, Set<string>>();
  private channelDetails = new Map<string, ChannelInfo>();
  private channelToGames = new Map<string, Set<string>>();
  private readonly diffListeners = new Set<ChannelTrackerDiffListener>();
  private readonly wsUrl: string;
  private readonly pingIntervalMs: number;
  private readonly maxTrackedTopics: number;
  private readonly refreshMs: number;
  private readonly fallbackPollRefreshMs: number;
  private readonly fallbackAfterReconnectAttempts: number;
  private readonly fallbackCooldownMs: number;

  constructor(
    private readonly twitch: TwitchService,
    opts: WsTrackerOptions = {},
  ) {
    this.mode = opts.mode ?? "ws";
    this.wsUrl = opts.wsUrl ?? PUBSUB_URL;
    this.pingIntervalMs = Math.max(30_000, opts.pingIntervalMs ?? 4 * 60_000);
    this.maxTrackedTopics = Math.max(1, opts.maxTrackedTopics ?? 180);
    this.refreshMs = Math.max(10_000, opts.refreshMs ?? 90_000);
    this.fallbackPollRefreshMs = Math.max(5_000, opts.fallbackPollRefreshMs ?? 25_000);
    this.fallbackAfterReconnectAttempts = Math.max(
      1,
      opts.fallbackAfterReconnectAttempts ?? 8,
    );
    this.fallbackCooldownMs = Math.max(30_000, opts.fallbackCooldownMs ?? 30 * 60_000);
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
      connectionState: this.connectionState,
      subscriptions: this.subscribedChannelIds.size,
      desiredSubscriptions: this.desiredChannelIds.size,
      reconnectAttempts: this.reconnectAttempts,
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, "DropPilot shutdown");
      } catch {
        // ignore close errors
      }
    }
    this.ws = null;
    this.connectionState = "disconnected";
    this.subscribedChannelIds.clear();
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
      }
    }
    this.gameChannelIds.set(gameName, nextIds);
    this.gameChannels.set(gameName, normalized);
    this.gameRefreshedAt.set(gameName, Date.now());
  }

  private recomputeDesiredChannels() {
    const desired = new Set<string>();
    for (const ids of this.gameChannelIds.values()) {
      for (const channelId of ids) {
        desired.add(channelId);
        if (desired.size >= this.maxTrackedTopics) break;
      }
      if (desired.size >= this.maxTrackedTopics) break;
    }
    this.desiredChannelIds = desired;
    this.syncSubscriptions();
  }

  private syncSubscriptions() {
    this.maybeRestoreWs();
    if (this.isPollingFallbackActive()) {
      this.subscribedChannelIds.clear();
      return;
    }
    if (this.desiredChannelIds.size === 0) {
      if (this.subscribedChannelIds.size > 0) {
        this.sendSubscription("UNLISTEN", Array.from(this.subscribedChannelIds));
        this.subscribedChannelIds.clear();
      }
      return;
    }
    this.ensureSocket();
    if (!this.isSocketOpen()) return;

    const toSubscribe = Array.from(this.desiredChannelIds).filter(
      (channelId) => !this.subscribedChannelIds.has(channelId),
    );
    const toUnsubscribe = Array.from(this.subscribedChannelIds).filter(
      (channelId) => !this.desiredChannelIds.has(channelId),
    );

    if (toUnsubscribe.length) {
      this.sendSubscription("UNLISTEN", toUnsubscribe);
      for (const channelId of toUnsubscribe) {
        this.subscribedChannelIds.delete(channelId);
      }
    }
    if (toSubscribe.length) {
      this.sendSubscription("LISTEN", toSubscribe);
      for (const channelId of toSubscribe) {
        this.subscribedChannelIds.add(channelId);
      }
    }
  }

  private ensureSocket() {
    if (this.disposed) return;
    this.maybeRestoreWs();
    if (this.isPollingFallbackActive()) return;
    if (this.ws && this.connectionState !== "disconnected") return;

    this.connectionState = "connecting";
    let ws: NodeWebSocket;
    try {
      ws = new NodeWebSocket(this.wsUrl);
    } catch (err) {
      this.markWsError(err);
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;
    ws.on("open", () => {
      this.clearWsFallback();
      this.connectionState = "connected";
      this.reconnectAttempts = 0;
      this.state = "ok";
      this.lastSuccessAt = Date.now();
      this.lastErrorMessage = undefined;
      this.startPingLoop();
      this.subscribedChannelIds.clear();
      if (this.desiredChannelIds.size) {
        const ids = Array.from(this.desiredChannelIds);
        this.sendSubscription("LISTEN", ids);
        for (const channelId of ids) {
          this.subscribedChannelIds.add(channelId);
        }
      }
    });
    ws.on("message", (data: RawData) => {
      this.handleWsMessage(data);
    });
    ws.on("error", (err) => {
      this.markWsError(err);
    });
    ws.on("close", () => {
      this.connectionState = "disconnected";
      this.stopPingLoop();
      this.ws = null;
      this.subscribedChannelIds.clear();
      this.scheduleReconnect();
    });
  }

  private isSocketOpen() {
    return !!this.ws && this.ws.readyState === NodeWebSocket.OPEN;
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      if (!this.isSocketOpen()) return;
      this.sendRaw({ type: "PING" });
    }, this.pingIntervalMs);
  }

  private stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.disposed) return;
    this.maybeRestoreWs();
    if (this.isPollingFallbackActive()) return;
    if (this.reconnectTimer) return;
    if (this.desiredChannelIds.size === 0) return;
    this.reconnectAttempts += 1;
    if (this.reconnectAttempts >= this.fallbackAfterReconnectAttempts) {
      this.activatePollingFallback(
        `WS unavailable after ${this.reconnectAttempts} reconnect attempts`,
      );
      return;
    }
    const backoff = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempts, 5));
    const jitter = Math.floor(Math.random() * 500);
    const delay = backoff + jitter;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureSocket();
    }, delay);
  }

  private sendRaw(payload: Record<string, unknown>) {
    if (!this.isSocketOpen() || !this.ws) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (err) {
      this.markWsError(err);
    }
  }

  private sendSubscription(type: "LISTEN" | "UNLISTEN", channelIds: string[]) {
    if (!channelIds.length) return;
    if (!this.isSocketOpen() || !this.ws) return;
    for (const part of chunk(channelIds, LISTEN_BATCH_SIZE)) {
      this.sendRaw({
        type,
        nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        data: {
          topics: part.map((channelId) => topicForChannel(channelId)),
          auth_token: "",
        },
      });
    }
  }

  private handleWsMessage(raw: unknown) {
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
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          // ignore close errors
        }
      }
      return;
    }
    if (type === "RESPONSE") {
      if (envelope.error) {
        this.markWsError(envelope.error);
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

    const eventType = String(payload.type ?? "").toLowerCase();
    if (eventType === "stream-down") {
      for (const game of games) {
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
      this.state = "ok";
      this.lastSuccessAt = now;
      this.lastErrorMessage = undefined;
      return;
    }

    if (eventType === "stream-up") {
      const known = this.channelDetails.get(channelId);
      if (!known) return;
      for (const game of games) {
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
    for (const game of games) {
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
    this.connectionState = "disconnected";
    this.lastErrorAt = now;
    this.lastErrorMessage = reason;
    this.stopPingLoop();
    this.subscribedChannelIds.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
    }
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      this.clearWsFallback();
      if (this.desiredChannelIds.size > 0) {
        this.ensureSocket();
      }
    }, this.fallbackCooldownMs);
    if (this.ws) {
      try {
        this.ws.close(1000, "Switching to polling fallback");
      } catch {
        // ignore close errors
      }
      this.ws = null;
    }
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
