import type { ChannelEntry, InventoryItem, PriorityPlan, StatsData } from "../types";

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
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

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
