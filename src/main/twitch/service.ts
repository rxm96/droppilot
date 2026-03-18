import type { SessionData } from "../core/storage";
import { loadRecentClaimedDropIds, markRecentClaimedDrop } from "../core/claimedDrops";
import { TWITCH_WEB_USER_AGENT } from "../config";
import { TwitchClient, TwitchAuthError, type RevalidateResult, type TwitchUser } from "./client";
import { buildPriorityPlan, type PriorityPlan } from "./channels";
import { TwitchServiceError } from "./errors";
import { TWITCH_ERROR_CODES } from "../../shared/errorCodes";
import { extractSpadeUrl, SETTINGS_PATTERN } from "./spade";
import {
  buildCampaignSummaries,
  collectBlockingReasonHints,
  collectLockedReasonHints,
  createPersistedQuery,
  dropHasBadgeOrEmote,
  extractAllowedChannelFilters,
  extractCampaignImageUrl,
  extractBenefitEdges,
  extractDropImageUrl,
  extractPreconditionDropIds,
  hasClaimedBenefit,
  isPersistedQueryNotFound,
  isTruthyFlag,
  isWithinClaimWindow,
  mergePrimaryData,
  normalizeDropWatchState,
  parseIsoMs,
  pickRequiredMinutes,
  unlockGuidanceForReason,
  type AvailableDropsResponse,
  type CampaignEdge,
  type CampaignInfo,
  type CampaignNode,
  type CampaignsResponse,
  type ClaimDropRewardsResponse,
  type DirectoryGameRedirectResponse,
  type DirectoryPageGameResponse,
  type DirectoryStreamNode,
  type DropCampaignDetailsResponse,
  type InventoryResponse,
  type VideoPlayerStreamInfoOverlayChannelResponse,
} from "./serviceUtils";

export interface InventoryItem {
  id: string;
  game: string;
  title: string;
  requiredMinutes: number;
  earnedMinutes: number;
  status: "locked" | "progress" | "claimed";
  imageUrl?: string;
  campaignImageUrl?: string;
  linked?: boolean;
  campaignHasBadgeOrEmote?: boolean;
  campaignStatus?: string;
  campaignName?: string;
  startsAt?: string;
  endsAt?: string;
  excluded?: boolean;
  dropInstanceId?: string;
  campaignId?: string;
  isClaimable?: boolean;
  recentlyClaimed?: boolean;
  blocked?: boolean;
  blockingReasonHints?: string[];
  allowedChannelIds?: string[];
  allowedChannelLogins?: string[];
}

const DIRECTORY_PAGE_GAME_HASHES = [
  "76cb069d835b8a02914c08dc42c421d0dafda8af5b113a3f19141824b901402f",
  "98a996c3c3ebb1ba4fd65d6671c6028d7ee8d615cb540b0731b3db2a911d3649",
];

export type ChannelInfo = {
  id: string; // broadcaster id
  displayName: string;
  login: string;
  streamId?: string;
  title: string;
  viewers: number;
  language?: string;
  thumbnail?: string;
  game: string;
};

export type InventoryBundle = {
  items: InventoryItem[];
  campaigns: CampaignInfo[];
};

export class TwitchService {
  private client: TwitchClient;
  private debug = (...args: unknown[]) => console.log("[TwitchService]", ...args);
  private loggedCampaignDiagnostics = new Set<string>();

  constructor(sessionProvider: () => Promise<SessionData | null>) {
    this.client = new TwitchClient(sessionProvider);
  }

  async getProfile(): Promise<TwitchUser> {
    try {
      return await this.client.getUser();
    } catch (err) {
      if (this.isAuthError(err)) {
        throw err;
      }
      throw new TwitchServiceError(
        TWITCH_ERROR_CODES.PROFILE_FETCH_FAILED,
        "Profile fetch failed",
        err,
      );
    }
  }

  async revalidateSession(): Promise<RevalidateResult> {
    return this.client.revalidateSession();
  }

  async getInventoryBundle(): Promise<InventoryBundle> {
    const validate = await this.client.getValidateInfo();
    const recentlyClaimedIds = await loadRecentClaimedDropIds();
    const { edges, summary, claimedBenefitIds } = await this.fetchCampaignEdges({
      includeAvailable: true,
      availableStatuses: ["ACTIVE", "UPCOMING"],
    });
    if (edges.length === 0) {
      return { items: [], campaigns: [] };
    }
    const detailed = await this.enrichCampaigns(edges);
    const items = this.buildInventoryItems(
      detailed,
      claimedBenefitIds,
      summary,
      recentlyClaimedIds,
      validate.userId,
    );
    const campaigns = buildCampaignSummaries(detailed, claimedBenefitIds);
    return { items, campaigns };
  }

  async getInventory(): Promise<InventoryItem[]> {
    const bundle = await this.getInventoryBundle();
    return bundle.items;
  }

  async getCampaigns(): Promise<CampaignInfo[]> {
    const { edges } = await this.fetchCampaignEdges({ includeAvailable: true });
    if (edges.length === 0) {
      return [];
    }
    const nodes = await this.enrichCampaigns(edges);
    return buildCampaignSummaries(nodes);
  }

  async getPriorityPlan(priorityGames: string[]): Promise<PriorityPlan> {
    const items = await this.getInventory();
    return buildPriorityPlan(items, priorityGames);
  }

  async resolveGameSlug(name: string): Promise<string | null> {
    const res = await this.gqlRequest<DirectoryGameRedirectResponse>(
      {
        operationName: "DirectoryGameRedirect",
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "1f0300090caceec51f33c5e20647aceff9017f740f223c3c532ba6fa59f6b6cc",
          },
        },
        variables: { name },
      },
      "DirectoryGameRedirect",
    );
    const slug =
      res?.data?.game?.slug ?? res?.data?.game?.displayName ?? res?.data?.game?.name ?? null;
    return slug;
  }

  async getChannelsForGame(gameName: string): Promise<ChannelInfo[]> {
    const slug = await this.resolveGameSlug(gameName);
    if (!slug) {
      throw new TwitchServiceError(
        TWITCH_ERROR_CODES.GAME_SLUG_MISSING,
        `Game slug missing for ${gameName}`,
      );
    }
    const variables = {
      limit: 20,
      slug,
      imageWidth: 70,
      includeCostreaming: false,
      options: {
        broadcasterLanguages: [],
        freeformTags: null,
        includeRestricted: ["SUB_ONLY_LIVE"],
        recommendationsContext: { platform: "web" },
        sort: "VIEWER_COUNT",
        systemFilters: ["DROPS_ENABLED"], // only show drops-enabled streams
        tags: [],
        requestID: "COD-CHANNEL-FETCH",
      },
      sortTypeIsRecency: false,
    };

    let res: DirectoryPageGameResponse | null = null;
    let lastPersistedQueryErr: unknown = null;
    for (const sha of DIRECTORY_PAGE_GAME_HASHES) {
      try {
        res = await this.gqlRequest<DirectoryPageGameResponse>(
          {
            operationName: "DirectoryPage_Game",
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash: sha,
              },
            },
            variables,
          },
          "DirectoryPage_Game",
        );
        break;
      } catch (err) {
        if (isPersistedQueryNotFound(err)) {
          lastPersistedQueryErr = err;
          this.debug("DirectoryPage_Game persisted query not found", {
            gameName,
            slug,
            sha,
          });
          continue;
        }
        throw err;
      }
    }
    if (!res) {
      if (lastPersistedQueryErr) throw lastPersistedQueryErr;
      throw new TwitchServiceError(
        TWITCH_ERROR_CODES.GQL_FAILED,
        "DirectoryPage_Game failed: no successful persisted query",
      );
    }

    const edges = res?.data?.game?.streams?.edges ?? [];
    const channels: ChannelInfo[] = edges
      .map((e) => e?.node)
      .filter((node): node is DirectoryStreamNode => !!node)
      .filter((node) => node.broadcaster?.broadcastSettings?.isDropsEnabled !== false)
      .map((node) => ({
        id: node.broadcaster?.id ?? node.id ?? "",
        streamId: node.id,
        displayName: node.broadcaster?.displayName ?? node.broadcaster?.login ?? "unknown",
        login: node.broadcaster?.login ?? node.broadcaster?.displayName ?? "",
        title: node.broadcaster?.broadcastSettings?.title ?? "",
        viewers: node.viewersCount ?? 0,
        language: node.broadcaster?.language ?? "",
        thumbnail: node.previewImageURL,
        game: gameName,
      }))
      .filter((channel) => channel.id && channel.login);

    // Additional eligibility check: ensure the channel actually has viewerDropCampaigns.
    try {
      const eligibleIds = await this.getChannelsWithAvailableDrops(channels.map((c) => c.id));
      if (eligibleIds.size > 0) {
        return channels.filter((c) => eligibleIds.has(c.id));
      }
    } catch (err) {
      this.debug("AvailableDrops filter failed", err);
    }

    return channels;
  }

  async claimDrop(payload: {
    dropInstanceId?: string;
    dropId?: string;
    campaignId?: string;
    endsAt?: string;
  }) {
    this.debug("claim: start", payload);
    const claimId =
      payload.dropInstanceId ?? (await this.buildClaimId(payload.dropId, payload.campaignId));
    const canonicalClaimKey = await this.buildClaimId(payload.dropId, payload.campaignId);
    if (!claimId) {
      this.debug("claim: missing claim id", payload);
      throw new TwitchServiceError(TWITCH_ERROR_CODES.CLAIM_MISSING_ID, "Claim id missing");
    }
    const body = createPersistedQuery(
      "DropsPage_ClaimDropRewards",
      "a455deea71bdc9015b78eb49f4acfbce8baa7ccbedd28e549bb025bd0f751930",
      {
        input: { dropInstanceID: claimId },
      },
    );
    const res = await this.gqlRequest<ClaimDropRewardsResponse>(body, "DropsPage_ClaimDropRewards");
    const status =
      res?.data?.claimDropRewards?.status ??
      res?.data?.claimDropRewards?.payload?.status ??
      res?.data?.claimDropRewards?.error ??
      null;
    const ok =
      status === "ELIGIBLE_FOR_ALL" ||
      status === "DROP_INSTANCE_ALREADY_CLAIMED" ||
      status === "ALREADY_CLAIMED";
    if (!ok) {
      this.debug("claim: failed", { claimId, status });
      throw new TwitchServiceError(
        TWITCH_ERROR_CODES.CLAIM_FAILED,
        status ? `Claim failed: ${status}` : "Claim failed",
      );
    }
    const persistedClaimKeys = new Set<string>(
      [claimId, canonicalClaimKey].filter(
        (key): key is string => typeof key === "string" && key.trim().length > 0,
      ),
    );
    await Promise.all(
      Array.from(persistedClaimKeys, (key) =>
        markRecentClaimedDrop(key, {
          endsAt: payload.endsAt,
        }),
      ),
    );
    this.debug("claim: success", { claimId, status });
    return { ok: true, status, claimId };
  }

  private spadeCache = new Map<string, string>();

  private async buildClaimId(dropId?: string, campaignId?: string): Promise<string | null> {
    if (!dropId || !campaignId) return null;
    const validate = await this.client.getValidateInfo();
    if (!validate?.userId) return null;
    return `${validate.userId}#${campaignId}#${dropId}`;
  }

  private async resolveSpadeUrl(login: string): Promise<string> {
    if (this.spadeCache.has(login)) {
      return this.spadeCache.get(login)!;
    }

    const fetchText = async (url: string) => {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": TWITCH_WEB_USER_AGENT,
        },
      });
      if (!res.ok) {
        throw new TwitchServiceError(
          TWITCH_ERROR_CODES.SPADE_FETCH_FAILED,
          `Spade fetch failed (${res.status})`,
        );
      }
      return await res.text();
    };

    let html: string;
    try {
      html = await fetchText(`https://www.twitch.tv/${login}`);
    } catch (err) {
      if (err instanceof TwitchServiceError) {
        throw err;
      }
      throw new TwitchServiceError(
        TWITCH_ERROR_CODES.SPADE_FETCH_FAILED,
        "Spade fetch failed",
        err,
      );
    }

    let spade = extractSpadeUrl(html);
    if (!spade) {
      const settingsMatch = html.match(SETTINGS_PATTERN);
      if (!settingsMatch) {
        throw new TwitchServiceError(TWITCH_ERROR_CODES.SPADE_URL_MISSING, "Spade URL missing");
      }
      const settingsJs = await fetchText(settingsMatch[1]);
      spade = extractSpadeUrl(settingsJs);
      if (!spade) {
        throw new TwitchServiceError(TWITCH_ERROR_CODES.SPADE_URL_MISSING, "Spade URL missing");
      }
    }

    this.spadeCache.set(login, spade);
    return spade;
  }

  private async fetchStreamInfo(login: string): Promise<{
    broadcastId?: string;
    channelId?: string;
    streamId?: string;
  } | null> {
    const body = {
      operationName: "VideoPlayerStreamInfoOverlayChannel",
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "198492e0857f6aedead9665c81c5a06d67b25b58034649687124083ff288597d",
        },
      },
      variables: { channel: login },
    };
    const res = await this.gqlRequest<VideoPlayerStreamInfoOverlayChannelResponse>(
      body,
      "VideoPlayerStreamInfoOverlayChannel",
    );
    const user = res?.data?.user;
    const stream = user?.stream ?? null;
    if (!stream) return null;
    return {
      broadcastId: stream.id ?? stream.stream?.id,
      channelId: user?.id,
      streamId: stream.id,
    };
  }

  async sendWatchPing(payload: { channelId: string; login: string; streamId?: string }) {
    const login = payload.login?.trim();
    if (!login) {
      throw new TwitchServiceError(TWITCH_ERROR_CODES.WATCH_MISSING_LOGIN, "Watch login missing");
    }

    const streamInfo = await this.fetchStreamInfo(login);
    if (!streamInfo) {
      throw new TwitchServiceError(TWITCH_ERROR_CODES.WATCH_OFFLINE, "Watch stream offline");
    }

    const spadeUrl = await this.resolveSpadeUrl(login);
    const validate = await this.client.getValidateInfo();
    const cookieHeader = await this.client.getCookieHeader().catch(() => "");
    const broadcastId = streamInfo.broadcastId ?? payload.streamId ?? streamInfo.streamId;
    const channelId = streamInfo.channelId ?? payload.channelId;

    if (!broadcastId || !channelId) {
      throw new TwitchServiceError(
        TWITCH_ERROR_CODES.WATCH_MISSING_IDS,
        "Watch identifiers missing",
      );
    }

    const payloadBody = [
      {
        event: "minute-watched",
        properties: {
          broadcast_id: String(broadcastId),
          channel_id: String(channelId),
          channel: login,
          hidden: false,
          live: true,
          location: "channel",
          logged_in: true,
          muted: false,
          player: "site",
          user_id: Number(validate.userId),
        },
      },
    ];

    const data = Buffer.from(JSON.stringify(payloadBody)).toString("base64");
    const formBody = new URLSearchParams({ data }).toString();

    this.debug("Watch ping start", {
      login,
      channelId,
      streamId: payload.streamId ?? streamInfo.streamId,
      broadcastId,
      spade: spadeUrl ?? "<none>",
      hasCookieHeader: cookieHeader.length > 0,
      payloadEventCount: payloadBody.length,
    });

    // Keep headers minimal.
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "User-Agent": TWITCH_WEB_USER_AGENT,
      // Client-Id is intentionally omitted for Spade.
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    this.debug("Watch ping request", {
      url: spadeUrl,
      headers: headers.Cookie ? { ...headers, Cookie: "<redacted>" } : headers,
      bodyLength: formBody.length,
    });

    const res = await fetch(spadeUrl, {
      method: "POST",
      headers,
      body: formBody,
    });

    if (res.status === 204) {
      this.debug("Watch ping ok", { login, channelId, broadcastId });
      return { ok: true };
    }

    const text = await res.text();
    this.debug("Watch ping failed", {
      status: res.status,
      login,
      channelId,
      broadcastId,
      body: text,
    });
    throw new TwitchServiceError(
      TWITCH_ERROR_CODES.WATCH_PING_FAILED,
      text ? `Watch ping failed: ${text}` : `Watch ping failed (${res.status})`,
    );
  }

  private async fetchCampaignEdges(opts?: {
    includeAvailable?: boolean;
    availableStatuses?: string[];
  }): Promise<{ edges: CampaignEdge[]; summary: string; claimedBenefitIds: Set<string> }> {
    const campaignsById = new Map<string, CampaignEdge>();
    let inventorySummary = "n/a";
    let campaignsSummary = "n/a";
    const includeAvailable = opts?.includeAvailable !== false;
    const availableStatuses = Array.isArray(opts?.availableStatuses)
      ? opts?.availableStatuses.map((entry) => String(entry).toUpperCase())
      : [];
    const claimedBenefitIds = new Set<string>();

    const normalizeEdge = (edge: CampaignEdge | CampaignNode | null | undefined): CampaignEdge => {
      if (!edge) return {};
      if ("id" in edge) return { node: edge };
      return edge;
    };

    // 1) Inventory (in-progress campaigns).
    const inventoryPayload = createPersistedQuery(
      "Inventory",
      "d86775d0ef16a63a33ad52e80eaff963b2d5b72fada7c991504a57496e1d8e4b",
      { fetchRewardCampaigns: true },
    );
    const inv = await this.gqlRequest<InventoryResponse>(inventoryPayload, "Inventory");
    const inventoryRoot = inv?.data?.currentUser?.inventory;
    const inProgressRaw = inventoryRoot?.dropCampaignsInProgress ?? [];
    const allInventoryRaw = inventoryRoot?.dropCampaigns ?? [];
    const combinedInventoryRaw =
      inProgressRaw.length > 0 ? [...inProgressRaw, ...allInventoryRaw] : allInventoryRaw;
    const inProgress = combinedInventoryRaw.map(normalizeEdge);
    for (const edge of inProgress) {
      const id = edge.node?.id;
      if (id) campaignsById.set(id, edge);
    }
    const gameEventDropsRaw = Array.isArray(inventoryRoot?.gameEventDrops)
      ? inventoryRoot?.gameEventDrops
      : [];
    for (const entry of gameEventDropsRaw) {
      const id = typeof entry?.id === "string" ? entry.id.trim() : "";
      if (id) claimedBenefitIds.add(id);
    }
    inventorySummary = `currentUser: ${!!inv?.data?.currentUser}, inProgress: ${inProgressRaw.length}, all: ${allInventoryRaw.length}, combined: ${combinedInventoryRaw.length}, normalized: ${campaignsById.size}, claimedBenefits: ${claimedBenefitIds.size}`;
    this.debug("Inventory fetch", inventorySummary);
    this.debug(
      "Inventory edges sample",
      inProgress.slice(0, 3).map((e) => ({
        id: e?.node?.id,
        name: e?.node?.name,
        game: e?.node?.game?.displayName,
        dropCount: e?.node?.timeBasedDrops?.length,
        rawKeys: e ? Object.keys(e) : [],
      })),
    );
    if (inProgress.length > 0 && inProgress[0] && !inProgress[0].node) {
      this.debug("Inventory edge shape mismatch", {
        hasNode: !!inProgress[0].node,
        edgeKeys: Object.keys(inProgress[0]),
      });
    }

    if (includeAvailable) {
      // 2) ViewerDropsDashboard (available campaigns) — merge/overwrite by id
      const campaignsPayloadBase = {
        operationName: "ViewerDropsDashboard",
        sha: "5a4da2ab3d5b47c9f9ce864e727b2cb346af1e3ea8b897fe8f704a97ff017619",
      };
      const maxCampaignPages = 20;
      let nextCursor: string | null | undefined;
      let fetchedEdges = 0;
      let fetchedPages = 0;
      let sawCurrentUser = false;
      for (let page = 0; page < maxCampaignPages; page += 1) {
        fetchedPages = page + 1;
        const variables: { fetchRewardCampaigns: boolean; first: number; after?: string } = {
          fetchRewardCampaigns: false,
          first: 100,
        };
        if (nextCursor) variables.after = nextCursor;
        const campaignsPayload = createPersistedQuery(
          campaignsPayloadBase.operationName,
          campaignsPayloadBase.sha,
          variables,
        );
        const campaigns = await this.gqlRequest<CampaignsResponse>(
          campaignsPayload,
          campaignsPayloadBase.operationName,
        );
        sawCurrentUser = sawCurrentUser || !!campaigns?.data?.currentUser;
        if (page === 0) {
          this.debug("Campaigns first page summary", {
            hasCurrentUser: !!campaigns?.data?.currentUser,
            dropCampaignsShape: Array.isArray(campaigns?.data?.currentUser?.dropCampaigns)
              ? "array"
              : "connection",
            requestedFirst: variables.first,
          });
        }
        const dropCampaigns = campaigns?.data?.currentUser?.dropCampaigns;
        const dropCampaignConnection = Array.isArray(dropCampaigns) ? undefined : dropCampaigns;
        const availableRaw = Array.isArray(dropCampaigns)
          ? dropCampaigns
          : (dropCampaignConnection?.edges ?? []);
        const available = availableRaw.map(normalizeEdge).filter((edge) => {
          if (availableStatuses.length === 0) return true;
          const status = typeof edge.node?.status === "string" ? edge.node?.status : "";
          return availableStatuses.includes(status.toUpperCase());
        });
        fetchedEdges += availableRaw.length;
        for (const edge of available) {
          const id = edge.node?.id;
          if (!id) continue;
          const existing = campaignsById.get(id);
          if (existing) {
            campaignsById.set(id, mergePrimaryData(existing, edge) as CampaignEdge);
          } else {
            campaignsById.set(id, edge);
          }
        }
        const pageInfo = dropCampaignConnection?.pageInfo;
        nextCursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
        if (!nextCursor) {
          campaignsSummary = `currentUser: ${!!campaigns?.data?.currentUser}, edges: ${fetchedEdges}, pages: ${
            page + 1
          }`;
          if (available.length > 0) {
            this.debug(
              "Campaigns edges sample",
              available.slice(0, 3).map((e) => ({
                id: e?.node?.id,
                name: e?.node?.name,
                game: e?.node?.game?.displayName,
                dropCount: e?.node?.timeBasedDrops?.length,
                rawKeys: e ? Object.keys(e) : [],
              })),
            );
            if (available[0] && !available[0].node) {
              this.debug("Campaign edge shape mismatch", {
                hasNode: !!available[0].node,
                edgeKeys: Object.keys(available[0]),
              });
            }
          }
          break;
        }
      }
      const paginationTruncated = !!nextCursor;
      if (campaignsSummary === "n/a") {
        campaignsSummary = `currentUser: ${sawCurrentUser}, edges: ${fetchedEdges}, pages: ${fetchedPages}, truncated: ${paginationTruncated}`;
      }
      if (paginationTruncated) {
        this.debug("Campaigns pagination truncated", {
          fetchedPages,
          maxCampaignPages,
        });
      }
      this.debug("Campaigns fetch", campaignsSummary);
    } else {
      campaignsSummary = "skipped";
      this.debug("Campaigns fetch", campaignsSummary);
    }

    const mergedEdges = Array.from(campaignsById.values());
    if (mergedEdges.length === 0) {
      this.debug("No campaigns returned", {
        campaignsSummary,
        inventorySummary,
      });
      return {
        edges: [],
        summary: `Campaigns(${campaignsSummary}); Inventory(${inventorySummary}); totalEdges=0`,
        claimedBenefitIds,
      };
    }

    return {
      edges: mergedEdges,
      summary: `Campaigns(${campaignsSummary}); Inventory(${inventorySummary}); totalEdges=${mergedEdges.length}`,
      claimedBenefitIds,
    };
  }

  private async enrichCampaigns(edges: CampaignEdge[]): Promise<CampaignNode[]> {
    const validate = await this.client.getValidateInfo();
    // fetch details in chunks to avoid huge payload
    const campaignsById = new Map<string, CampaignNode>();
    for (const edge of edges) {
      if (edge.node?.id) {
        campaignsById.set(edge.node.id, edge.node);
      }
    }

    const chunkSize = 20;
    const ids = Array.from(campaignsById.keys());
    this.debug("Enrich campaigns", { total: ids.length, chunkSize });

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      this.debug("Detail chunk", { idx: i, size: chunk.length });
      const gqlPayload = chunk.map((cid) =>
        createPersistedQuery(
          "DropCampaignDetails",
          "039277bf98f3130929262cc7c6efd9c141ca3749cb6dca442fc8ead9a53f77c1",
          {
            channelLogin: validate.login, // use login as user identifier
            dropID: cid,
          },
        ),
      );

      const responses = await this.gqlRequest<
        DropCampaignDetailsResponse | DropCampaignDetailsResponse[]
      >(gqlPayload, "DropCampaignDetails");
      const responseList = Array.isArray(responses) ? responses : [responses];
      for (const res of responseList) {
        const node = res?.data?.user?.dropCampaign;
        if (node?.id && campaignsById.has(node.id)) {
          const base = campaignsById.get(node.id)!;
          const merged = mergePrimaryData(base, node) as CampaignNode;
          campaignsById.set(node.id, merged);
        }
      }
    }

    const merged = Array.from(campaignsById.values());
    this.debug(
      "Enriched campaigns",
      merged.length,
      "drop lengths",
      merged.map((c) => c.timeBasedDrops?.length ?? 0),
    );

    return merged;
  }

  private async getChannelsWithAvailableDrops(channelIds: string[]): Promise<Set<string>> {
    const eligible = new Set<string>();
    if (!channelIds.length) return eligible;

    const chunkSize = 20;
    for (let i = 0; i < channelIds.length; i += chunkSize) {
      const chunk = channelIds.slice(i, i + chunkSize);
      const payload = chunk.map((id) =>
        createPersistedQuery(
          "DropsHighlightService_AvailableDrops",
          "9a62a09bce5b53e26e64a671e530bc599cb6aab1e5ba3cbd5d85966d3940716f",
          { channelID: String(id) },
        ),
      );
      const res = await this.gqlRequest<AvailableDropsResponse | AvailableDropsResponse[]>(
        payload,
        "DropsHighlightService_AvailableDrops",
      );
      const list = Array.isArray(res) ? res : [res];
      for (const entry of list) {
        const channel = entry?.data?.channel;
        const id = channel?.id;
        const campaigns = channel?.viewerDropCampaigns ?? [];
        if (id && Array.isArray(campaigns) && campaigns.length > 0) {
          eligible.add(String(id));
        }
      }
    }

    return eligible;
  }

  private buildInventoryItems(
    detailed: CampaignNode[],
    claimedBenefitIds: Set<string>,
    summary: string,
    recentlyClaimedIds: Set<string> = new Set(),
    currentUserId?: string,
  ): InventoryItem[] {
    const items: InventoryItem[] = [];
    let dropsCount = 0;
    const now = Date.now();

    this.debug(
      "Detailed campaigns",
      detailed.length,
      "drop lengths",
      detailed.map((c) => c.timeBasedDrops?.length ?? 0),
    );

    for (const campaign of detailed) {
      if (!campaign.timeBasedDrops) continue;
      const game = campaign.game?.displayName ?? "Unknown game";
      const linked = isTruthyFlag(campaign.self?.isAccountConnected);
      const campaignStatus = campaign.status;
      const campaignName = campaign.name;
      const startsAt = campaign.startAt;
      const endsAt = campaign.endAt;
      const campaignNotStarted = (() => {
        const startMs = parseIsoMs(startsAt);
        return startMs !== null && now < startMs;
      })();
      const campaignExpired = (() => {
        const endMs = parseIsoMs(endsAt);
        return endMs !== null && now > endMs;
      })();
      const campaignImageUrl = extractCampaignImageUrl(campaign);
      const campaignAllowChannelFilters = extractAllowedChannelFilters(campaign);
      const campaignHasBadgeOrEmote = campaign.timeBasedDrops.some((drop) =>
        dropHasBadgeOrEmote(drop),
      );
      const withinClaimWindow = isWithinClaimWindow(endsAt, now);
      const allowDisabled = campaign.allow?.isEnabled === false;
      const campaignId = campaign.id;
      const campaignLogKey =
        [campaignId, campaignName, game]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter(Boolean)
          .join("::") || `campaign-${items.length}`;
      const claimedDropIds = new Set<string>();
      for (const drop of campaign.timeBasedDrops) {
        const benefitClaimed = hasClaimedBenefit(claimedBenefitIds, drop);
        const isClaimed = isTruthyFlag(drop.self?.isClaimed) || benefitClaimed;
        if (isClaimed && typeof drop?.id === "string" && drop.id.trim()) {
          claimedDropIds.add(drop.id);
        }
      }
      const campaignDiagnostics = {
        campaignId,
        campaignName,
        campaignStatus,
        game,
        startsAt,
        endsAt,
        linked,
        allowDisabled,
        allowChannelFilters: campaignAllowChannelFilters,
        campaignNotStarted,
        campaignExpired,
        withinClaimWindow,
        counters: {
          total: 0,
          locked: 0,
          progress: 0,
          claimed: 0,
          excluded: 0,
          claimable: 0,
          blocked: 0,
        },
        drops: [] as Array<Record<string, unknown>>,
      };
      for (const drop of campaign.timeBasedDrops) {
        const allowChannelFilters = extractAllowedChannelFilters(campaign, drop);
        dropsCount += 1;
        let watched = Number(drop.self?.currentMinutesWatched ?? 0) || 0;
        const rawStatus =
          drop.self?.status ??
          // some schemas use different keys
          drop.self?.state ??
          drop.status;
        const dropInstanceId = drop.self?.dropInstanceID ?? drop.self?.dropInstanceId;
        const benefitClaimed = hasClaimedBenefit(claimedBenefitIds, drop);
        const isClaimed = isTruthyFlag(drop.self?.isClaimed) || benefitClaimed;
        const requiredMinutes = pickRequiredMinutes(drop);
        const normalized = normalizeDropWatchState({
          drop,
          rawStatus,
          requiredMinutes,
          watchedMinutes: watched,
          benefitClaimed,
        });
        watched = normalized.watchedMinutes;
        const status = normalized.status;
        const progressDone = normalized.progressDone;
        const earnedMinutes = normalized.earnedMinutes;
        const imageUrl = extractDropImageUrl(drop);
        const excluded = false;
        const hasPreconditionsMet = drop.self?.hasPreconditionsMet;
        const prerequisiteDropIds = extractPreconditionDropIds(drop);
        const missingPrerequisiteDropIds = prerequisiteDropIds.filter(
          (preId) => !claimedDropIds.has(preId),
        );
        const blockingReasonHints = collectBlockingReasonHints({
          linked,
          campaignNotStarted,
          campaignExpired,
          missingPrerequisiteDropIds,
          hasPreconditionsMet,
          progressDone,
          dropInstanceId,
          withinClaimWindow,
          isClaimed,
        });
        const hardBlockingReasonHints = blockingReasonHints.filter(
          (reason) => reason !== "missing_drop_instance_id" && reason !== "account_not_linked",
        );
        const blocked = hardBlockingReasonHints.length > 0;
        const canBuildFallbackClaimId = Boolean(campaignId && drop.id);
        const canonicalClaimKey =
          currentUserId && campaignId && drop.id
            ? `${currentUserId}#${campaignId}#${drop.id}`
            : null;
        const recentlyClaimed =
          !isClaimed &&
          ((typeof dropInstanceId === "string" && recentlyClaimedIds.has(dropInstanceId)) ||
            (typeof canonicalClaimKey === "string" && recentlyClaimedIds.has(canonicalClaimKey)));
        const isClaimable =
          (Boolean(dropInstanceId) || canBuildFallbackClaimId) &&
          !isClaimed &&
          !recentlyClaimed &&
          status !== "claimed" &&
          progressDone &&
          withinClaimWindow &&
          !blocked;
        const lockedReasonHints =
          status === "locked"
            ? collectLockedReasonHints({
                requiredMinutes,
                watched,
                blockingReasonHints,
              })
            : [];
        const unlockGuidance = (status === "locked" ? lockedReasonHints : blockingReasonHints).map(
          unlockGuidanceForReason,
        );
        if (dropsCount <= 3) {
          const benefitEdgesList = extractBenefitEdges(drop);
          const benefitEdgeSample = Array.isArray(benefitEdgesList) ? benefitEdgesList[0] : null;
          const benefitNode = benefitEdgeSample?.benefit ?? null;
          this.debug("Drop image sample", {
            dropId: drop.id,
            dropName: drop.name,
            imageUrl: imageUrl ?? "<missing>",
            benefitKeys: benefitNode ? Object.keys(benefitNode) : [],
            benefitEdgesCount: Array.isArray(benefitEdgesList) ? benefitEdgesList.length : 0,
            benefitEdgeKeys: benefitEdgeSample ? Object.keys(benefitEdgeSample) : [],
            benefitNodeKeys: benefitNode ? Object.keys(benefitNode) : [],
            dropKeys: drop ? Object.keys(drop) : [],
            campaignKeys: campaign ? Object.keys(campaign) : [],
          });
        }
        campaignDiagnostics.counters.total += 1;
        if (status === "locked") campaignDiagnostics.counters.locked += 1;
        if (status === "progress") campaignDiagnostics.counters.progress += 1;
        if (status === "claimed") campaignDiagnostics.counters.claimed += 1;
        if (excluded) campaignDiagnostics.counters.excluded += 1;
        if (isClaimable) campaignDiagnostics.counters.claimable += 1;
        if (blocked) campaignDiagnostics.counters.blocked += 1;
        campaignDiagnostics.drops.push({
          dropId: drop.id,
          dropName: drop.name,
          rawStatus,
          normalizedStatus: status,
          requiredMinutes,
          watched,
          earnedMinutes,
          isClaimed,
          benefitClaimed,
          recentlyClaimed,
          dropInstanceId,
          excluded,
          isClaimable,
          blocked,
          blockingReasonHints,
          prerequisiteDropIds,
          missingPrerequisiteDropIds,
          lockedReasonHints,
          unlockGuidance,
          allowChannelFilters,
          dropAllow: drop.allow ?? null,
          dropSelf: drop.self ?? null,
          dropKeySample: drop ? Object.keys(drop) : [],
        });
        items.push({
          id: drop.id,
          game,
          title: drop.name,
          requiredMinutes,
          earnedMinutes,
          status,
          imageUrl,
          campaignImageUrl,
          linked,
          campaignHasBadgeOrEmote,
          campaignStatus,
          campaignName,
          startsAt,
          endsAt,
          excluded,
          campaignId,
          dropInstanceId,
          isClaimable,
          recentlyClaimed,
          blocked,
          blockingReasonHints,
          allowedChannelIds:
            allowChannelFilters.ids.length > 0 ? allowChannelFilters.ids : undefined,
          allowedChannelLogins:
            allowChannelFilters.logins.length > 0 ? allowChannelFilters.logins : undefined,
        });
      }
      if (!this.loggedCampaignDiagnostics.has(campaignLogKey)) {
        this.loggedCampaignDiagnostics.add(campaignLogKey);
        this.debug("Campaign diagnostics (first seen)", {
          ...campaignDiagnostics,
          campaignAllow: campaign.allow ?? null,
          campaignSelf: campaign.self ?? null,
          campaignKeySample: campaign ? Object.keys(campaign) : [],
        });
      }
    }

    if (items.length === 0) {
      this.debug("Inventory empty (no claimable/progress drops)", { summary, dropsCount });
      return [];
    }

    this.debug("Built inventory items", items.length);
    return items;
  }

  isAuthError(err: unknown): err is TwitchAuthError {
    return err instanceof TwitchAuthError;
  }

  private async gqlRequest<T>(
    body: Record<string, unknown> | Record<string, unknown>[],
    context: string,
  ): Promise<T> {
    try {
      return await this.client.gqlRequest<T>(body);
    } catch (err) {
      if (this.isAuthError(err)) {
        throw err;
      }
      if (err instanceof TwitchServiceError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new TwitchServiceError(
        TWITCH_ERROR_CODES.GQL_FAILED,
        `GQL failed (${context}): ${message}`,
        err,
      );
    }
  }
}
