import type { ClaimStatus, InventoryItem, UserPubSubEvent } from "@renderer/shared/types";
import { errorInfoFromIpc, errorInfoFromUnknown } from "@renderer/shared/utils/errors";
import { logInfo, logWarn } from "@renderer/shared/utils/logger";
import {
  isIpcAuthErrorResponse,
  isIpcErrorResponse,
  isIpcOkFalseResponse,
} from "@renderer/shared/utils/ipc";
import { TWITCH_ERROR_CODES } from "../../../../shared/errorCodes";
import {
  buildClaimRetrySignature,
  canClaimDrop,
  CLAIM_ATTEMPT_RETRY_MS,
  getClaimRetryDelay,
} from "./inventoryRules";

const MAX_FALLBACK_AUTO_CLAIMS_PER_RUN = 1;
const MAX_CLAIM_ERROR_LOGS_PER_RUN = 3;

export type ClaimRetryState = { attempts: number; nextAllowedAt: number; signature: string };

export type ClaimDropPayload = {
  dropInstanceId?: string;
  dropId?: string;
  campaignId?: string;
  endsAt?: string;
};

type ClaimEngineBaseDeps = {
  claimDrop: (payload: ClaimDropPayload) => Promise<unknown>;
  onAuthError: (message?: string) => void;
  setClaimStatus: (status: ClaimStatus) => void;
  now?: () => number;
};

type AutoClaimDeps = ClaimEngineBaseDeps & {
  onClaimed: (payload: { title: string; game: string }) => void;
};

type PubSubClaimDeps = ClaimEngineBaseDeps & {
  event: UserPubSubEvent;
  claimedItem?: InventoryItem;
};

export const isAutoClaimCandidate = (item: InventoryItem, now = Date.now()): boolean => {
  return canClaimDrop(item, { now, allowFallbackWhenNotExplicit: true });
};

export type AutoClaimRunResult = {
  claimedCount: number;
  claimedIds: string[];
};

const throwIfClaimErrorResponse = (response: unknown): void => {
  if (isIpcErrorResponse(response)) {
    if (isIpcAuthErrorResponse(response)) {
      const authErr = new Error(response.message || "Authentication required");
      authErr.name = "ClaimAuthError";
      throw authErr;
    }
    throw errorInfoFromIpc(response, {
      code: TWITCH_ERROR_CODES.CLAIM_FAILED,
      message: "Drop claim failed",
    });
  }
  if (isIpcOkFalseResponse(response)) {
    throw errorInfoFromIpc(response, {
      code: TWITCH_ERROR_CODES.CLAIM_FAILED,
      message: "Drop claim failed",
    });
  }
};

const getClaimErrorInfo = (err: unknown) =>
  errorInfoFromUnknown(err, {
    code: TWITCH_ERROR_CODES.CLAIM_FAILED,
    message: "Drop claim failed",
  });

export class InventoryClaimEngine {
  private readonly claimAttemptsById = new Map<string, number>();
  private readonly claimRetryByDropId = new Map<string, ClaimRetryState>();
  private readonly successfullyClaimedIds = new Set<string>();

  reset(): void {
    this.claimAttemptsById.clear();
    this.claimRetryByDropId.clear();
    this.successfullyClaimedIds.clear();
  }

  getAutoClaimCandidates(items: InventoryItem[], now = Date.now()): InventoryItem[] {
    return items.filter((item) => isAutoClaimCandidate(item, now));
  }

  canAttemptClaim(claimId: string, now = Date.now()): boolean {
    const id = claimId.trim();
    if (!id) return false;
    const last = this.claimAttemptsById.get(id) ?? 0;
    return now - last >= CLAIM_ATTEMPT_RETRY_MS;
  }

  markClaimAttempt(claimId: string, at = Date.now()): void {
    const id = claimId.trim();
    if (!id) return;
    this.claimAttemptsById.set(id, at);
  }

  async autoClaimFromInventory(
    items: InventoryItem[],
    deps: AutoClaimDeps,
  ): Promise<AutoClaimRunResult> {
    const now = deps.now?.() ?? Date.now();
    const candidates = this.getAutoClaimCandidates(items, now);
    const explicitClaimable = candidates.filter((drop) => drop.isClaimable === true);
    const fallbackClaimable = candidates.filter((drop) => drop.isClaimable !== true);
    const fallbackQueue = fallbackClaimable.slice(0, MAX_FALLBACK_AUTO_CLAIMS_PER_RUN);
    const claimable = [...explicitClaimable, ...fallbackQueue];
    if (fallbackClaimable.length > fallbackQueue.length) {
      logInfo("inventory: fallback auto-claim capped", {
        totalFallbackCandidates: fallbackClaimable.length,
        processedFallbackCandidates: fallbackQueue.length,
      });
    }
    let claimedCount = 0;
    const claimedIds: string[] = [];
    let suppressedClaimErrorLogs = 0;
    let emittedClaimErrorLogs = 0;
    for (const drop of claimable) {
      if (this.successfullyClaimedIds.has(drop.id)) continue;

      const retrySignature = buildClaimRetrySignature(drop);
      const retryState = this.claimRetryByDropId.get(drop.id);
      if (retryState && retryState.signature === retrySignature && now < retryState.nextAllowedAt) {
        continue;
      }

      this.claimAttemptsById.set(drop.id, now);
      try {
        const response = await deps.claimDrop({
          dropInstanceId: drop.dropInstanceId,
          dropId: drop.id,
          campaignId: drop.campaignId,
          endsAt: drop.endsAt,
        });
        throwIfClaimErrorResponse(response);

        deps.onClaimed({ title: drop.title, game: drop.game });
        this.successfullyClaimedIds.add(drop.id);
        this.claimRetryByDropId.delete(drop.id);
        claimedCount += 1;
        claimedIds.push(drop.id);
        logInfo("inventory: auto-claimed", {
          title: drop.title,
          game: drop.game,
          id: drop.id,
        });
        deps.setClaimStatus({
          kind: "success",
          message: `Auto-claimed: ${drop.title}`,
          at: Date.now(),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "ClaimAuthError") {
          logWarn("inventory: claim auth error", { message: err.message });
          deps.onAuthError(err.message);
          return { claimedCount, claimedIds };
        }

        if (emittedClaimErrorLogs < MAX_CLAIM_ERROR_LOGS_PER_RUN) {
          emittedClaimErrorLogs += 1;
          logWarn("inventory: claim error", { title: drop.title, err });
        } else {
          suppressedClaimErrorLogs += 1;
        }
        const prevRetryState = this.claimRetryByDropId.get(drop.id);
        const attempts =
          prevRetryState && prevRetryState.signature === retrySignature
            ? prevRetryState.attempts + 1
            : 1;
        this.claimRetryByDropId.set(drop.id, {
          attempts,
          nextAllowedAt: now + getClaimRetryDelay(attempts),
          signature: retrySignature,
        });

        const errInfo = getClaimErrorInfo(err);
        deps.setClaimStatus({
          kind: "error",
          message: errInfo.message,
          code: errInfo.code,
          title: drop.title,
          at: Date.now(),
        });
      }
    }
    if (suppressedClaimErrorLogs > 0) {
      logInfo("inventory: claim errors suppressed", {
        suppressed: suppressedClaimErrorLogs,
        emitted: emittedClaimErrorLogs,
      });
    }
    return { claimedCount, claimedIds };
  }

  async claimFromPubSubDropClaim(deps: PubSubClaimDeps): Promise<void> {
    const { event, claimedItem } = deps;
    if (event.kind !== "drop-claim") return;

    const dropInstanceIdFromEvent = event.dropInstanceId?.trim();
    const dropIdFromEvent = event.dropId?.trim();
    const claimId = dropIdFromEvent || claimedItem?.id || dropInstanceIdFromEvent;
    if (!claimId) return;
    if (this.successfullyClaimedIds.has(claimId)) return;

    const now = deps.now?.() ?? Date.now();
    if (!this.canAttemptClaim(claimId, now)) return;
    this.markClaimAttempt(claimId, now);

    const claimPayload: ClaimDropPayload = {
      dropInstanceId: dropInstanceIdFromEvent || claimedItem?.dropInstanceId,
      dropId: dropIdFromEvent || claimedItem?.id,
      campaignId: claimedItem?.campaignId,
      endsAt: claimedItem?.endsAt,
    };

    try {
      const response = await deps.claimDrop(claimPayload);
      throwIfClaimErrorResponse(response);
      this.successfullyClaimedIds.add(claimId);
      if (claimedItem) {
        deps.setClaimStatus({
          kind: "success",
          message: `Auto-claimed: ${claimedItem.title}`,
          at: Date.now(),
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "ClaimAuthError") {
        logWarn("inventory: claim auth error", { message: err.message });
        deps.onAuthError(err.message);
        return;
      }

      const errInfo = getClaimErrorInfo(err);
      deps.setClaimStatus({
        kind: "error",
        message: errInfo.message,
        code: errInfo.code,
        title: claimedItem?.title ?? dropIdFromEvent,
        at: Date.now(),
      });
    }
  }
}
