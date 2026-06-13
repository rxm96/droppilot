import type { ClaimStatus } from "@renderer/shared/types";
import { resolveErrorMessage } from "@renderer/shared/utils/errors";

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

export type ClaimNarration = { tone: "ok" | "warn" | "err"; text: string };

/** Compact retry remaining: "4m" once a minute or more out, else "30s". */
const formatRetryRemaining = (ms: number): string => {
  if (ms >= 60_000) return `${Math.ceil(ms / 60_000)}m`;
  return `${Math.ceil(ms / 1000)}s`;
};

/**
 * Turn a ClaimStatus into a single narrated line + tone. Pure: pass `now` so the
 * caller (a TimeText leaf) can re-evaluate the countdown each tick.
 *
 * - success            → ok   (its message; null when there is nothing to show)
 * - error + future retry → warn (localized message + "· retry in 4m") — not scary red
 * - error otherwise    → err  (terminal)
 */
export function narrateClaim(
  status: ClaimStatus | null | undefined,
  now: number,
  t: Translator,
): ClaimNarration | null {
  if (!status) return null;

  if (status.kind === "success") {
    const message = status.message?.trim();
    return message ? { tone: "ok", text: message } : null;
  }

  const base = resolveErrorMessage(t, { code: status.code, message: status.message });

  if (typeof status.nextRetryAt === "number" && status.nextRetryAt > now) {
    const remaining = formatRetryRemaining(status.nextRetryAt - now);
    return { tone: "warn", text: `${base} · ${t("hero.claim.retryIn", { time: remaining })}` };
  }

  return { tone: "err", text: base };
}
