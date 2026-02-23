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
  CLAIM_ATTEMPT_RETRY_MS,
  getClaimRetryDelay,
  isWithinClaimWindow,
} from "./inventoryRules";

export type ClaimRetryState = { attempts: number; nextAllowedAt: number; signature: string };

export type ClaimDropPayload = {
  dropInstanceId?: string;
  dropId?: string;
  campaignId?: string;
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
  if (item.status === "claimed") return false;
  if (!isWithinClaimWindow(item, now)) return false;
  const req = Math.max(0, Number(item.requiredMinutes) || 0);
  const earned = Math.max(0, Number(item.earnedMinutes) || 0);
  const progressDone = req === 0 || earned >= req;
  if (!progressDone) return false;

  const hasClaimIdCandidate = Boolean(item.dropInstanceId || (item.campaignId && item.id));
  if (!hasClaimIdCandidate) return false;

  if (item.isClaimable === true) return true;
  if (item.isClaimable === false) {
    const hardBlockingHints = (item.blockingReasonHints ?? []).filter(
      (reason) =>
        reason !== "missing_drop_instance_id" &&
        reason !== "account_not_linked" &&
        reason !== "campaign_allow_disabled",
    );
    if (hardBlockingHints.length > 0) return false;
  }

  // Accept fallback claim path when Twitch has progress but no explicit claimable flag yet.
  return true;
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

  reset(): void {
    this.claimAttemptsById.clear();
    this.claimRetryByDropId.clear();
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

  async autoClaimFromInventory(items: InventoryItem[], deps: AutoClaimDeps): Promise<void> {
    const now = deps.now?.() ?? Date.now();
    const claimable = this.getAutoClaimCandidates(items, now);
    for (const drop of claimable) {
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
        });
        throwIfClaimErrorResponse(response);

        deps.onClaimed({ title: drop.title, game: drop.game });
        this.claimRetryByDropId.delete(drop.id);
        this.claimAttemptsById.delete(drop.id);
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
          return;
        }

        logWarn("inventory: claim error", { title: drop.title, err });
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
  }

  async claimFromPubSubDropClaim(deps: PubSubClaimDeps): Promise<void> {
    const { event, claimedItem } = deps;
    if (event.kind !== "drop-claim") return;

    const dropInstanceIdFromEvent = event.dropInstanceId?.trim();
    const dropIdFromEvent = event.dropId?.trim();
    const claimId = dropIdFromEvent || claimedItem?.id || dropInstanceIdFromEvent;
    if (!claimId) return;

    const now = deps.now?.() ?? Date.now();
    if (!this.canAttemptClaim(claimId, now)) return;
    this.markClaimAttempt(claimId, now);

    const claimPayload: ClaimDropPayload = {
      dropInstanceId: dropInstanceIdFromEvent || claimedItem?.dropInstanceId,
      dropId: dropIdFromEvent || claimedItem?.id,
      campaignId: claimedItem?.campaignId,
    };

    try {
      const response = await deps.claimDrop(claimPayload);
      throwIfClaimErrorResponse(response);
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
