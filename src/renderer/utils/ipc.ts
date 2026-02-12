import type {
  ChannelEntry,
  ChannelLiveDiff,
  ChannelTrackerStatus,
  InventoryItem,
  PriorityPlan,
  StatsData,
} from "../types";

type UnknownRecord = Record<string, unknown>;

export type IpcErrorResponse = {
  error: string;
  code?: string;
  message?: string;
  status?: number;
};

export type IpcAuthErrorResponse = IpcErrorResponse & {
  error: "auth";
};

export type TwitchProfile = {
  id?: string;
  login: string;
  displayName: string;
  profileImageUrl?: string;
  email?: string;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNullableFiniteNumber = (value: unknown): value is number | null =>
  value === null || isFiniteNumber(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isTrackerConnectionState = (value: unknown): boolean =>
  value === undefined || value === "disconnected" || value === "connecting" || value === "connected";

const isTrackerEffectiveMode = (value: unknown): boolean =>
  value === undefined || value === "polling" || value === "ws";

export const isArrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every((item) => guard(item));

export const isIpcErrorResponse = (value: unknown): value is IpcErrorResponse =>
  isRecord(value) && isString(value.error);

export const isIpcAuthErrorResponse = (value: unknown): value is IpcAuthErrorResponse =>
  isIpcErrorResponse(value) && value.error === "auth";

export const isIpcOkFalseResponse = (
  value: unknown,
): value is { ok: false; status?: string; message?: string } =>
  isRecord(value) && value.ok === false;

export const isTwitchProfile = (value: unknown): value is TwitchProfile => {
  if (!isRecord(value)) return false;
  return isString(value.login) && isString(value.displayName);
};

export const isPriorityPlan = (value: unknown): value is PriorityPlan => {
  if (!isRecord(value)) return false;
  return (
    isStringArray(value.order) &&
    isStringArray(value.availableGames) &&
    isStringArray(value.missingPriority) &&
    isFiniteNumber(value.totalActiveDrops)
  );
};

export const isChannelTrackerStatus = (value: unknown): value is ChannelTrackerStatus => {
  if (!isRecord(value)) return false;
  const mode = value.mode;
  const state = value.state;
  const validMode = mode === "polling" || mode === "ws" || mode === "hybrid";
  const validState = state === "idle" || state === "ok" || state === "error";
  const validMessage = value.lastErrorMessage === undefined || isString(value.lastErrorMessage);
  const validSubscriptions =
    value.subscriptions === undefined || isFiniteNumber(value.subscriptions);
  const validDesiredSubscriptions =
    value.desiredSubscriptions === undefined || isFiniteNumber(value.desiredSubscriptions);
  const validReconnectAttempts =
    value.reconnectAttempts === undefined || isFiniteNumber(value.reconnectAttempts);
  const validEffectiveMode = isTrackerEffectiveMode(value.effectiveMode);
  const validFallbackActive =
    value.fallbackActive === undefined || typeof value.fallbackActive === "boolean";
  const validFallbackUntil =
    value.fallbackUntil === undefined || isNullableFiniteNumber(value.fallbackUntil);
  return (
    validMode &&
    validEffectiveMode &&
    validState &&
    isNullableFiniteNumber(value.lastRequestAt) &&
    isNullableFiniteNumber(value.lastSuccessAt) &&
    isNullableFiniteNumber(value.lastErrorAt) &&
    validMessage &&
    isTrackerConnectionState(value.connectionState) &&
    isFiniteNumber(value.requests) &&
    isFiniteNumber(value.failures) &&
    validSubscriptions &&
    validDesiredSubscriptions &&
    validReconnectAttempts &&
    validFallbackActive &&
    validFallbackUntil
  );
};

export const isChannelEntry = (value: unknown): value is ChannelEntry => {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.login) &&
    isString(value.displayName) &&
    isString(value.title) &&
    isFiniteNumber(value.viewers) &&
    isString(value.game)
  );
};

export const isChannelLiveDiff = (value: unknown): value is ChannelLiveDiff => {
  if (!isRecord(value)) return false;
  const source = value.source;
  const reason = value.reason;
  const validSource = source === "ws" || source === "fetch";
  const validReason =
    reason === "snapshot" || reason === "stream-up" || reason === "stream-down" || reason === "viewers";
  return (
    isString(value.game) &&
    isFiniteNumber(value.at) &&
    validSource &&
    validReason &&
    isArrayOf(value.added, isChannelEntry) &&
    isStringArray(value.removedIds) &&
    isArrayOf(value.updated, isChannelEntry)
  );
};

export const isInventoryItem = (value: unknown): value is InventoryItem => {
  if (!isRecord(value)) return false;
  const status = value.status;
  const validStatus = status === "locked" || status === "progress" || status === "claimed";
  return (
    isString(value.id) &&
    isString(value.game) &&
    isString(value.title) &&
    isFiniteNumber(value.requiredMinutes) &&
    isFiniteNumber(value.earnedMinutes) &&
    validStatus
  );
};

export const isStatsData = (value: unknown): value is StatsData => {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.totalMinutes)) return false;
  if (!isFiniteNumber(value.totalClaims)) return false;
  if (!isFiniteNumber(value.lastReset)) return false;
  if (!isRecord(value.claimsByGame)) return false;
  const claimsByGame = value.claimsByGame as UnknownRecord;
  return Object.values(claimsByGame).every((entry) => isFiniteNumber(entry));
};
