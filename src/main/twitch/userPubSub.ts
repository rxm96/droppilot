import type { SessionData } from "../core/storage";
import { WebSocket as NodeWebSocket, type RawData } from "ws";

const PUBSUB_URL = "wss://pubsub-edge.twitch.tv/v1";
const DROPS_TOPIC_PREFIX = "user-drop-events.";
const NOTIFICATIONS_TOPIC_PREFIX = "onsite-notifications.";
const DEFAULT_NOTIFICATION_TYPES = new Set<string>([
  "user_drop_reward_reminder_notification",
  "quests_viewer_reward_campaign_earned_emote",
]);

type PubSubEnvelope = {
  type?: string;
  error?: string;
  data?: {
    topic?: string;
    message?: string;
  };
};

type AuthContext = {
  userId: string;
  accessToken: string;
};

export type UserPubSubConnectionState = "disconnected" | "connecting" | "connected";
export type UserPubSubState = "idle" | "ok" | "error";
export type UserPubSubEventKind = "drop-progress" | "drop-claim" | "notification";

export type UserPubSubEvent = {
  kind: UserPubSubEventKind;
  at: number;
  topic: string;
  messageType: string;
  dropId?: string;
  dropInstanceId?: string;
  currentProgressMin?: number;
  requiredProgressMin?: number;
  notificationType?: string;
};

export type UserPubSubStatus = {
  state: UserPubSubState;
  connectionState: UserPubSubConnectionState;
  listening: boolean;
  reconnectAttempts: number;
  lastMessageAt: number | null;
  lastErrorAt: number | null;
  lastErrorMessage?: string;
  events: number;
  currentUserId?: string;
};

export type UserPubSubListener = (event: UserPubSubEvent) => void;

type UserPubSubOptions = {
  wsUrl?: string;
  reconnectMinMs?: number;
  reconnectMaxMs?: number;
  pingIntervalMs?: number;
  authSyncIntervalMs?: number;
  notificationTypes?: Set<string>;
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

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
};

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length ? normalized : undefined;
};

export const parseUserPubSubEvent = (
  topic: string | undefined,
  rawMessage: string | undefined,
  at: number = Date.now(),
  notificationTypes: Set<string> = DEFAULT_NOTIFICATION_TYPES,
): UserPubSubEvent | null => {
  if (!topic || !rawMessage) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawMessage) as Record<string, unknown>;
  } catch {
    return null;
  }
  const messageType = toStringValue(payload.type) ?? "";
  if (!messageType) return null;

  if (topic.startsWith(DROPS_TOPIC_PREFIX)) {
    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : null;
    const dropId = toStringValue(data?.drop_id ?? data?.dropId);
    if (messageType === "drop-progress") {
      const currentProgressMin = toFiniteNumber(
        data?.current_progress_min ?? data?.currentProgressMin,
      );
      const requiredProgressMin = toFiniteNumber(
        data?.required_progress_min ?? data?.requiredProgressMin,
      );
      return {
        kind: "drop-progress",
        at,
        topic,
        messageType,
        dropId,
        currentProgressMin,
        requiredProgressMin,
      };
    }
    if (messageType === "drop-claim") {
      const dropInstanceId = toStringValue(data?.drop_instance_id ?? data?.dropInstanceId);
      return {
        kind: "drop-claim",
        at,
        topic,
        messageType,
        dropId,
        dropInstanceId,
      };
    }
    return null;
  }

  if (!topic.startsWith(NOTIFICATIONS_TOPIC_PREFIX)) {
    return null;
  }
  if (messageType !== "create-notification") {
    return null;
  }
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null;
  const notification =
    data?.notification && typeof data.notification === "object"
      ? (data.notification as Record<string, unknown>)
      : null;
  const notificationType = toStringValue(notification?.type);
  if (!notificationType) return null;
  if (notificationTypes.size > 0 && !notificationTypes.has(notificationType)) {
    return null;
  }
  return {
    kind: "notification",
    at,
    topic,
    messageType,
    notificationType,
  };
};

export class UserPubSub {
  private state: UserPubSubState = "idle";
  private connectionState: UserPubSubConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private lastMessageAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastErrorMessage: string | undefined;
  private events = 0;
  private listening = false;
  private running = false;
  private disposed = false;
  private ws: NodeWebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private authSyncTimer: NodeJS.Timeout | null = null;
  private currentUserId: string | null = null;
  private currentAccessToken: string | null = null;
  private readonly listeners = new Set<UserPubSubListener>();
  private readonly wsUrl: string;
  private readonly reconnectMinMs: number;
  private readonly reconnectMaxMs: number;
  private readonly pingIntervalMs: number;
  private readonly authSyncIntervalMs: number;
  private readonly notificationTypes: Set<string>;

  constructor(
    private readonly sessionProvider: () => Promise<SessionData | null>,
    opts: UserPubSubOptions = {},
  ) {
    this.wsUrl = opts.wsUrl ?? PUBSUB_URL;
    this.reconnectMinMs = Math.max(1_000, opts.reconnectMinMs ?? 1_500);
    this.reconnectMaxMs = Math.max(this.reconnectMinMs, opts.reconnectMaxMs ?? 60_000);
    this.pingIntervalMs = Math.max(30_000, opts.pingIntervalMs ?? 4 * 60_000);
    this.authSyncIntervalMs = Math.max(5_000, opts.authSyncIntervalMs ?? 20_000);
    this.notificationTypes = opts.notificationTypes ?? DEFAULT_NOTIFICATION_TYPES;
  }

  start() {
    if (this.disposed || this.running) return;
    this.running = true;
    this.startAuthSyncLoop();
    void this.ensureConnection();
  }

  stop() {
    this.running = false;
    this.stopAuthSyncLoop();
    this.clearReconnectTimer();
    this.stopPingLoop();
    this.disconnect("DropPilot UserPubSub stopped", true);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.listeners.clear();
  }

  notifySessionChanged() {
    if (this.disposed) return;
    this.currentAccessToken = null;
    this.currentUserId = null;
    this.disconnect("User session changed", true);
    if (this.running) {
      void this.ensureConnection();
    }
  }

  getStatus(): UserPubSubStatus {
    return {
      state: this.state,
      connectionState: this.connectionState,
      listening: this.listening,
      reconnectAttempts: this.reconnectAttempts,
      lastMessageAt: this.lastMessageAt,
      lastErrorAt: this.lastErrorAt,
      lastErrorMessage: this.lastErrorMessage,
      events: this.events,
      currentUserId: this.currentUserId ?? undefined,
    };
  }

  onEvent(listener: UserPubSubListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitDebugEvent(payload: {
    kind: UserPubSubEventKind;
    messageType?: string;
    dropId?: string;
    dropInstanceId?: string;
    currentProgressMin?: number;
    requiredProgressMin?: number;
    notificationType?: string;
  }): UserPubSubEvent {
    const at = Date.now();
    const userId = this.currentUserId ?? "debug";
    let event: UserPubSubEvent;
    if (payload.kind === "notification") {
      event = {
        kind: "notification",
        at,
        topic: `${NOTIFICATIONS_TOPIC_PREFIX}${userId}`,
        messageType: payload.messageType ?? "create-notification",
        notificationType: payload.notificationType ?? "user_drop_reward_reminder_notification",
      };
    } else if (payload.kind === "drop-claim") {
      event = {
        kind: "drop-claim",
        at,
        topic: `${DROPS_TOPIC_PREFIX}${userId}`,
        messageType: payload.messageType ?? "drop-claim",
        dropId: payload.dropId,
        dropInstanceId: payload.dropInstanceId ?? `debug-claim-${at}`,
      };
    } else {
      event = {
        kind: "drop-progress",
        at,
        topic: `${DROPS_TOPIC_PREFIX}${userId}`,
        messageType: payload.messageType ?? "drop-progress",
        dropId: payload.dropId,
        currentProgressMin: payload.currentProgressMin,
        requiredProgressMin: payload.requiredProgressMin,
      };
    }
    this.state = "ok";
    this.lastErrorMessage = undefined;
    this.lastMessageAt = at;
    this.events += 1;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
    return event;
  }

  private startAuthSyncLoop() {
    this.stopAuthSyncLoop();
    this.authSyncTimer = setInterval(() => {
      void this.syncSessionState();
    }, this.authSyncIntervalMs);
  }

  private stopAuthSyncLoop() {
    if (!this.authSyncTimer) return;
    clearInterval(this.authSyncTimer);
    this.authSyncTimer = null;
  }

  private async syncSessionState() {
    if (!this.running || this.disposed) return;
    const session = await this.sessionProvider().catch(() => null);
    const token = session?.accessToken?.trim() ?? "";
    if (!token) {
      this.currentAccessToken = null;
      this.currentUserId = null;
      this.listening = false;
      this.state = "idle";
      this.lastErrorMessage = undefined;
      this.disconnect("No active Twitch session", true);
      return;
    }
    if (this.currentAccessToken && this.currentAccessToken !== token) {
      this.currentAccessToken = token;
      this.listening = false;
      this.disconnect("Session token changed", true);
      void this.ensureConnection();
      return;
    }
    if (this.connectionState === "disconnected" && !this.reconnectTimer) {
      void this.ensureConnection();
    }
  }

  private async ensureConnection() {
    if (!this.running || this.disposed) return;
    if (this.ws && this.connectionState !== "disconnected") return;
    this.connectionState = "connecting";
    const auth = await this.resolveAuthContext();
    if (!auth) {
      this.connectionState = "disconnected";
      this.listening = false;
      this.state = this.state === "error" ? "error" : "idle";
      this.scheduleReconnect(this.authSyncIntervalMs);
      return;
    }

    this.currentAccessToken = auth.accessToken;
    this.currentUserId = auth.userId;
    let ws: NodeWebSocket;
    try {
      ws = new NodeWebSocket(this.wsUrl);
    } catch (err) {
      this.markError(err);
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;
    ws.on("open", () => {
      if (this.ws !== ws) return;
      this.clearReconnectTimer();
      this.connectionState = "connected";
      this.state = "ok";
      this.reconnectAttempts = 0;
      this.lastErrorMessage = undefined;
      this.startPingLoop();
      this.sendListen(auth);
    });
    ws.on("message", (raw: RawData) => {
      if (this.ws !== ws) return;
      this.handleMessage(raw);
    });
    ws.on("error", (err) => {
      if (this.ws !== ws) return;
      this.markError(err);
    });
    ws.on("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.listening = false;
      this.connectionState = "disconnected";
      this.stopPingLoop();
      this.scheduleReconnect();
    });
  }

  private disconnect(reason: string, clearState: boolean) {
    this.stopPingLoop();
    const ws = this.ws;
    this.ws = null;
    this.connectionState = "disconnected";
    this.listening = false;
    if (clearState) {
      this.reconnectAttempts = 0;
    }
    if (!ws) return;
    try {
      ws.close(1000, reason);
    } catch {
      // ignore close errors
    }
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      if (!this.isOpen()) return;
      this.sendRaw({ type: "PING" });
    }, this.pingIntervalMs);
  }

  private stopPingLoop() {
    if (!this.pingTimer) return;
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private scheduleReconnect(delayMs?: number) {
    if (!this.running || this.disposed) return;
    if (this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const baseDelay =
      delayMs ??
      Math.min(
        this.reconnectMaxMs,
        this.reconnectMinMs * 2 ** Math.min(this.reconnectAttempts - 1, 6),
      );
    const jitter = Math.floor(Math.random() * 500);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnection();
    }, baseDelay + jitter);
  }

  private isOpen() {
    return !!this.ws && this.ws.readyState === NodeWebSocket.OPEN;
  }

  private sendRaw(payload: Record<string, unknown>) {
    if (!this.isOpen() || !this.ws) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (err) {
      this.markError(err);
    }
  }

  private sendListen(auth: AuthContext) {
    this.sendRaw({
      type: "LISTEN",
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      data: {
        topics: [
          `${DROPS_TOPIC_PREFIX}${auth.userId}`,
          `${NOTIFICATIONS_TOPIC_PREFIX}${auth.userId}`,
        ],
        auth_token: auth.accessToken,
      },
    });
  }

  private handleMessage(raw: unknown) {
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
      this.lastErrorMessage = undefined;
      return;
    }
    if (type === "RECONNECT") {
      this.disconnect("Twitch requested reconnect", true);
      this.scheduleReconnect(500);
      return;
    }
    if (type === "RESPONSE") {
      const error = String(envelope.error ?? "").trim();
      if (error.length > 0) {
        this.markError(`PubSub listen failed: ${error}`);
      } else {
        this.listening = true;
        this.state = "ok";
        this.lastErrorMessage = undefined;
      }
      return;
    }
    if (type !== "MESSAGE") return;

    const event = parseUserPubSubEvent(
      envelope.data?.topic,
      envelope.data?.message,
      Date.now(),
      this.notificationTypes,
    );
    if (!event) return;
    this.state = "ok";
    this.lastErrorMessage = undefined;
    this.lastMessageAt = event.at;
    this.events += 1;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  private markError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    this.state = "error";
    this.lastErrorAt = Date.now();
    this.lastErrorMessage = message;
  }

  private async resolveAuthContext(): Promise<AuthContext | null> {
    const session = await this.sessionProvider().catch(() => null);
    const accessToken = session?.accessToken?.trim();
    if (!accessToken) return null;
    let res: Response;
    try {
      res = await fetch("https://id.twitch.tv/oauth2/validate", {
        headers: {
          Authorization: `OAuth ${accessToken}`,
        },
      });
    } catch (err) {
      this.markError(err);
      return null;
    }
    if (res.status === 401) {
      return null;
    }
    if (!res.ok) {
      this.markError(`Validate failed (${res.status})`);
      return null;
    }
    let data: { user_id?: string };
    try {
      data = (await res.json()) as { user_id?: string };
    } catch (err) {
      this.markError(err);
      return null;
    }
    const userId = data.user_id?.trim();
    if (!userId) return null;
    return { accessToken, userId };
  }
}
