export type AuthState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ok" }
  | { status: "error"; message: string };

export type ProfileState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; displayName: string; login: string; avatar?: string }
  | { status: "error"; message: string; code?: string };

export type ErrorInfo = {
  code?: string;
  message?: string;
};

export type InventoryItem = {
  id: string;
  game: string;
  title: string;
  requiredMinutes: number;
  earnedMinutes: number;
  status: "locked" | "progress" | "claimed";
  linked?: boolean;
  campaignStatus?: string;
  startsAt?: string;
  endsAt?: string;
  excluded?: boolean;
  dropInstanceId?: string;
  campaignId?: string;
  isClaimable?: boolean;
};

export type InventoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; items: InventoryItem[] }
  | { status: "error"; message: string; code?: string; items?: InventoryItem[] };

export type FilterKey =
  | "all"
  | "in-progress"
  | "upcoming"
  | "finished"
  | "not-linked"
  | "expired"
  | "excluded";

export type View = "overview" | "inventory" | "control" | "priorities" | "settings" | "debug";

export type ChannelEntry = {
  id: string;
  login: string;
  displayName: string;
  streamId?: string;
  title: string;
  viewers: number;
  language?: string;
  thumbnail?: string;
  game: string;
};

export type ChannelDiff = {
  at: number;
  addedIds: string[];
  removedIds: string[];
  updatedIds: string[];
  titleChangedIds: string[];
  viewerDeltaById: Record<string, number>;
};

export type ChannelLiveDiff = {
  game: string;
  at: number;
  source: "ws" | "fetch";
  reason: "snapshot" | "stream-up" | "stream-down" | "viewers";
  added: ChannelEntry[];
  removedIds: string[];
  updated: ChannelEntry[];
};

export type PriorityPlan = {
  order: string[];
  availableGames: string[];
  missingPriority: string[];
  totalActiveDrops: number;
};

export type ChannelTrackerMode = "polling" | "ws" | "hybrid";
export type ChannelTrackerState = "idle" | "ok" | "error";
export type ChannelTrackerConnectionState = "disconnected" | "connecting" | "connected";
export type ChannelTrackerShardStatus = {
  id: number;
  connectionState: ChannelTrackerConnectionState;
  subscriptions: number;
  desiredSubscriptions: number;
  reconnectAttempts: number;
  socketOpen: boolean;
};
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
  shards?: ChannelTrackerShardStatus[];
};

export type UserPubSubState = "idle" | "ok" | "error";
export type UserPubSubConnectionState = "disconnected" | "connecting" | "connected";
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

export type UserPubSubEvent = {
  kind: "drop-progress" | "drop-claim" | "notification";
  at: number;
  topic: string;
  messageType: string;
  dropId?: string;
  dropInstanceId?: string;
  currentProgressMin?: number;
  requiredProgressMin?: number;
  notificationType?: string;
};

export type WatchingState = {
  id: string;
  name: string;
  game: string;
  login?: string;
  channelId?: string;
  streamId?: string;
} | null;

export type AutoSwitchInfo = {
  at: number;
  reason: "offline";
  from?: { id: string; name: string };
  to: { id: string; name: string };
};

export type StatsData = {
  totalMinutes: number;
  totalClaims: number;
  lastReset: number;
  lastMinuteAt?: number;
  lastClaimAt?: number;
  lastDropTitle?: string;
  lastGame?: string;
  claimsByGame: Record<string, number>;
};

export type StatsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: StatsData }
  | { status: "error"; message: string; code?: string };

export type ClaimStatus = {
  kind: "success" | "error";
  message?: string;
  code?: string;
  title?: string;
  at: number;
};
