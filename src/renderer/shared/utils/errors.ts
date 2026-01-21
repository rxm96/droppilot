import type { ErrorInfo } from "../../types";

type TFunc = (key: string, vars?: Record<string, string | number>) => string;

type IpcErrorPayload = {
  error?: string;
  code?: string;
  message?: string;
};

export function errorInfoFromIpc(
  res: IpcErrorPayload | null | undefined,
  fallbackMessage: string,
): ErrorInfo {
  if (!res || typeof res !== "object") {
    return { message: fallbackMessage };
  }
  const code = typeof res.code === "string" ? res.code : undefined;
  const message =
    typeof res.message === "string" && res.message.length > 0 ? res.message : fallbackMessage;
  return { code, message };
}

export function errorInfoFromUnknown(err: unknown, fallbackMessage: string): ErrorInfo {
  if (err && typeof err === "object") {
    const maybeCode = (err as { code?: unknown }).code;
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeCode === "string" || typeof maybeMessage === "string") {
      return {
        code: typeof maybeCode === "string" ? maybeCode : undefined,
        message: typeof maybeMessage === "string" ? maybeMessage : fallbackMessage,
      };
    }
  }
  if (err instanceof Error) {
    return { message: err.message };
  }
  return { message: fallbackMessage };
}

export function resolveErrorMessage(
  t: TFunc,
  error: ErrorInfo | null | undefined,
  fallbackKey = "error.unknown",
): string {
  if (!error) return t(fallbackKey);
  if (error.code) {
    const key = `error.${error.code}`;
    const translated = t(key);
    if (translated !== key) {
      return translated;
    }
  }
  if (error.message) return error.message;
  return t(fallbackKey);
}
