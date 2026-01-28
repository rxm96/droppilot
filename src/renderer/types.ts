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

export type PriorityPlan = {
  order: string[];
  availableGames: string[];
  missingPriority: string[];
  totalActiveDrops: number;
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
  | { status: "error"; message: string };

export type ClaimStatus = {
  kind: "success" | "error";
  message?: string;
  code?: string;
  title?: string;
  at: number;
};
