import type { ErrorInfo } from "../types";
import type { AppErrorCode } from "../../shared/errorCodes";
import { toErrorKey } from "../../shared/errorCodes";

type TFunc = (key: string, vars?: Record<string, string | number>) => string;
type ErrorFallback = string | { code?: AppErrorCode; message: string };

type IpcErrorPayload = {
  error?: string;
  code?: string;
  message?: string;
};

function normalizeFallback(fallback: ErrorFallback): { code?: string; message: string } {
  return typeof fallback === "string" ? { message: fallback } : fallback;
}

export function errorInfoFromIpc(
  res: IpcErrorPayload | null | undefined,
  fallback: ErrorFallback,
): ErrorInfo {
  const normalized = normalizeFallback(fallback);
  if (!res || typeof res !== "object") {
    return { code: normalized.code, message: normalized.message };
  }
  const code = typeof res.code === "string" && res.code.length > 0 ? res.code : normalized.code;
  const message =
    typeof res.message === "string" && res.message.length > 0 ? res.message : normalized.message;
  return { code, message };
}

export function errorInfoFromUnknown(err: unknown, fallback: ErrorFallback): ErrorInfo {
  const normalized = normalizeFallback(fallback);
  if (err && typeof err === "object") {
    const maybeCode = (err as { code?: unknown }).code;
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeCode === "string" || typeof maybeMessage === "string") {
      return {
        code: typeof maybeCode === "string" && maybeCode.length > 0 ? maybeCode : normalized.code,
        message:
          typeof maybeMessage === "string" && maybeMessage.length > 0
            ? maybeMessage
            : normalized.message,
      };
    }
  }
  if (err instanceof Error) {
    return { code: normalized.code, message: err.message };
  }
  return { code: normalized.code, message: normalized.message };
}

export function resolveErrorMessage(
  t: TFunc,
  error: ErrorInfo | null | undefined,
  fallbackKey = "error.unknown",
): string {
  if (!error) return t(fallbackKey);
  if (error.code) {
    const key = error.code.startsWith("error.") ? error.code : toErrorKey(error.code);
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }
  if (error.message) {
    const translated = t(error.message);
    if (translated !== error.message) {
      return translated;
    }
    return error.message;
  }
  return t(fallbackKey);
}
