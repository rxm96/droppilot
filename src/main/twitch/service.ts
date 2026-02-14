import type { SessionData } from "../core/storage";
import { TWITCH_WEB_USER_AGENT } from "../config";
import { TwitchClient, TwitchAuthError, type TwitchUser } from "./client";
import { buildPriorityPlan, type PriorityPlan } from "./channels";
import { TwitchServiceError } from "./errors";
import { TWITCH_ERROR_CODES } from "../../shared/errorCodes";

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
  campaignStatus?: string;
  campaignName?: string;
  startsAt?: string;
  endsAt?: string;
  excluded?: boolean;
  dropInstanceId?: string;
  campaignId?: string;
  isClaimable?: boolean;
}

type CampaignInfo = {
  id: string;
  name: string;
  game: string;
  startsAt?: string;
  endsAt?: string;
  status?: string;
  isActive: boolean;
  hasUnclaimedDrops?: boolean;
};

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

export class TwitchService {
  private client: TwitchClient;
  private debug = (...args: unknown[]) => console.log("[TwitchService]", ...args);

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

  async getInventory(): Promise<InventoryItem[]> {
    const { edges, summary } = await this.fetchCampaignEdges({ includeAvailable: false });
    if (edges.length === 0) {
      this.debug("Inventory empty (no active campaigns)", { summary });
      return [];
    }
    const detailed = await this.enrichCampaigns(edges);
    const items: InventoryItem[] = [];
    let dropsCount = 0;

    this.debug(
      "Detailed campaigns",
      detailed.length,
      "drop lengths",
      detailed.map((c) => c.timeBasedDrops?.length ?? 0),
    );

    for (const campaign of detailed) {
      if (!campaign || !campaign.timeBasedDrops) continue;
      const game = campaign.game?.displayName ?? "Unknown game";
      const linked = (campaign as any)?.self?.isAccountConnected ?? false;
      const campaignStatus = (campaign as any)?.status as string | undefined;
      const campaignName = (campaign as any)?.name as string | undefined;
      const startsAt = (campaign as any)?.startAt as string | undefined;
      const endsAt = (campaign as any)?.endAt as string | undefined;
      const campaignImageUrl = extractCampaignImageUrl(campaign);
      // Some campaigns expose allow.isEnabled === false even though the user can earn progress.
      // Only treat it as excluded if Twitch explicitly disabled the campaign AND we have no progress yet.
      const allowDisabled = (campaign as any)?.allow?.isEnabled === false;
      const campaignId = (campaign as any)?.id;
      for (const drop of campaign.timeBasedDrops) {
        dropsCount += 1;
        let watched = drop.self?.currentMinutesWatched ?? 0;
        const rawStatus =
          drop.self?.status ??
          // some schemas use different keys
          (drop.self as any)?.state ??
          (drop as any).status;
        const dropInstanceId = drop.self?.dropInstanceID ?? (drop.self as any)?.dropInstanceId;
        const isClaimed = isTruthyFlag(drop.self?.isClaimed);
        // Some schemas expose multiple required fields; pick the smallest positive to avoid overcount
        const requiredCandidates = [
          // @ts-ignore
          (drop as any).requiredMinutesWatched,
          // @ts-ignore
          (drop as any).required_minutes,
          // @ts-ignore
          (drop as any).requiredMinutes,
          drop.minutesWatchedRequired,
        ];
        const requiredValid = requiredCandidates
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n) && n > 0);
        const requiredMinutes = requiredValid.length ? Math.min(...requiredValid) : 0;
        let status = mapStatus(rawStatus, drop);
        if (status === "claimed" && requiredMinutes > 0 && watched === 0) {
          // Claimed drops report full progress.
          watched = requiredMinutes;
        }
        // Heuristics: treat watched progress as "progress" even if status says locked; treat fully watched as claimable
        const progressDone = requiredMinutes > 0 && watched >= requiredMinutes;
        if (isClaimed) {
          status = "claimed";
        } else if (progressDone && status !== "claimed") {
          status = "progress";
        } else if (watched > 0 && status === "locked") {
          status = "progress";
        }
        const earnedMinutes = requiredMinutes > 0 ? Math.min(requiredMinutes, watched) : watched;
        const imageUrl = extractDropImageUrl(drop);
        if (dropsCount <= 3) {
          const benefitEdges = (drop as any)?.benefitEdges;
          const benefitEdgesList = Array.isArray(benefitEdges)
            ? benefitEdges
            : (benefitEdges?.edges ?? benefitEdges?.nodes ?? []);
          const benefitEdgeSample = Array.isArray(benefitEdgesList) ? benefitEdgesList[0] : null;
          const benefitNode =
            benefitEdgeSample?.node ?? benefitEdgeSample?.benefit ?? benefitEdgeSample ?? null;
          this.debug("Drop image sample", {
            dropId: drop.id,
            dropName: drop.name,
            imageUrl: imageUrl ?? "<missing>",
            benefitKeys: drop?.benefit ? Object.keys(drop.benefit) : [],
            benefitEdgesCount: Array.isArray(benefitEdgesList) ? benefitEdgesList.length : 0,
            benefitEdgeKeys: benefitEdgeSample ? Object.keys(benefitEdgeSample) : [],
            benefitNodeKeys: benefitNode ? Object.keys(benefitNode) : [],
            localizedKeys: drop?.localizedContent ? Object.keys(drop.localizedContent) : [],
            dropKeys: drop ? Object.keys(drop) : [],
            campaignKeys: campaign ? Object.keys(campaign) : [],
          });
        }
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
          campaignStatus,
          campaignName,
          startsAt,
          endsAt,
          excluded: allowDisabled && watched <= 0 && !isClaimed,
          campaignId,
          dropInstanceId,
          isClaimable: !!dropInstanceId && !isClaimed && status !== "claimed" && progressDone,
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

  async getCampaigns(): Promise<CampaignInfo[]> {
    const { edges } = await this.fetchCampaignEdges({ includeAvailable: true });
    if (edges.length === 0) {
      return [];
    }
    const nodes = await this.enrichCampaigns(edges);
    const now = Date.now();
    const campaigns: CampaignInfo[] = [];
    for (const node of nodes) {
      if (!node?.id || !node?.name) continue;
      const game = node.game?.displayName?.trim() ?? "";
      if (!game) continue;
      const startsAt = typeof node.startAt === "string" ? node.startAt : undefined;
      const endsAt = typeof node.endAt === "string" ? node.endAt : undefined;
      const isActive = isCampaignActive({ startsAt, endsAt }, now);
      let hasUnclaimedDrops: boolean | undefined = undefined;
      if (Array.isArray(node.timeBasedDrops)) {
        if (node.timeBasedDrops.length === 0) {
          hasUnclaimedDrops = false;
        } else {
          let sawEvidence = false;
          let sawUnclaimed = false;
          for (const drop of node.timeBasedDrops) {
            const self = (drop as any)?.self;
            const rawStatus =
              self?.status ?? (drop as any)?.status ?? (drop as any)?.state ?? undefined;
            const hasEvidence = !!self || typeof rawStatus === "string";
            if (!hasEvidence) continue;
            sawEvidence = true;
            if (self && isTruthyFlag(self?.isClaimed)) continue;
            const status = mapStatus(rawStatus, drop);
            if (status !== "claimed") {
              sawUnclaimed = true;
              break;
            }
          }
          hasUnclaimedDrops = sawEvidence ? sawUnclaimed : undefined;
        }
      } else {
        hasUnclaimedDrops = false;
      }
      campaigns.push({
        id: node.id,
        name: node.name,
        game,
        startsAt,
        endsAt,
        status: node.status,
        isActive,
        hasUnclaimedDrops,
      });
    }
    return campaigns;
  }

  async getPriorityPlan(priorityGames: string[]): Promise<PriorityPlan> {
    const items = await this.getInventory();
    return buildPriorityPlan(items, priorityGames);
  }

  async resolveGameSlug(name: string): Promise<string | null> {
    const res = await this.gqlRequest<any>(
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
    const res = await this.gqlRequest<any>(
      {
        operationName: "DirectoryPage_Game",
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "98a996c3c3ebb1ba4fd65d6671c6028d7ee8d615cb540b0731b3db2a911d3649",
          },
        },
        variables: {
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
        },
      },
      "DirectoryPage_Game",
    );

    const edges = res?.data?.game?.streams?.edges ?? [];
    const channels: ChannelInfo[] = edges
      .map((e: any) => e?.node)
      .filter(Boolean)
      .filter((n: any) => n?.broadcaster?.broadcastSettings?.isDropsEnabled !== false)
      .map((n: any) => ({
        id: n.broadcaster?.id ?? n.id,
        streamId: n.id,
        displayName: n.broadcaster?.displayName ?? n.broadcaster?.login ?? "unknown",
        login: n.broadcaster?.login ?? n.broadcaster?.displayName ?? "",
        title: n.broadcaster?.broadcastSettings?.title ?? "",
        viewers: n.viewersCount ?? 0,
        language: n.broadcaster?.language ?? "",
        thumbnail: n.previewImageURL,
        game: gameName,
      }));

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

  async claimDrop(payload: { dropInstanceId?: string; dropId?: string; campaignId?: string }) {
    this.debug("claim: start", payload);
    const claimId =
      payload.dropInstanceId ?? (await this.buildClaimId(payload.dropId, payload.campaignId));
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
    const res = await this.gqlRequest<any>(body, "DropsPage_ClaimDropRewards");
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

    const SETTINGS_PATTERN = /src="(https:\/\/[\w.]+\/config\/settings\.[0-9a-f]{32}\.js)"/i;
    const SPADE_PATTERN =
      /"beacon_?url": ?"(https:\/\/video-edge-[.\w\-/]+\.ts(?:\?allow_stream=true)?)"/i;

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

    let match = html.match(SPADE_PATTERN);
    if (!match) {
      const settingsMatch = html.match(SETTINGS_PATTERN);
      if (!settingsMatch) {
        throw new TwitchServiceError(TWITCH_ERROR_CODES.SPADE_URL_MISSING, "Spade URL missing");
      }
      const settingsJs = await fetchText(settingsMatch[1]);
      match = settingsJs.match(SPADE_PATTERN);
      if (!match) {
        throw new TwitchServiceError(TWITCH_ERROR_CODES.SPADE_URL_MISSING, "Spade URL missing");
      }
    }

    const spade = match[1];
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
    const res = await this.gqlRequest<any>(body, "VideoPlayerStreamInfoOverlayChannel");
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
      cookieHeader,
      payloadBody,
    });

    // Keep headers minimal.
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "User-Agent": TWITCH_WEB_USER_AGENT,
      // Client-Id is intentionally omitted for Spade.
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    this.debug("Watch ping request", { url: spadeUrl, headers, body: formBody });

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
  }): Promise<{ edges: CampaignEdge[]; summary: string }> {
    const campaignsById = new Map<string, CampaignEdge>();
    let inventorySummary = "n/a";
    let campaignsSummary = "n/a";
    const includeAvailable = opts?.includeAvailable !== false;

    const normalizeEdge = (edge: CampaignEdge | any): CampaignEdge => {
      if (!edge) return {};
      if ((edge as CampaignEdge).node) return edge as CampaignEdge;
      return { node: edge as CampaignEdge["node"] };
    };

    // 1) Inventory (in-progress campaigns).
    const inventoryPayload = createPersistedQuery(
      "Inventory",
      "d86775d0ef16a63a33ad52e80eaff963b2d5b72fada7c991504a57496e1d8e4b",
      { fetchRewardCampaigns: true },
    );
    const inv = await this.gqlRequest<InventoryResponse>(inventoryPayload, "Inventory");
    const inProgressRaw = inv?.data?.currentUser?.inventory?.dropCampaignsInProgress ?? [];
    const allInventoryRaw = inv?.data?.currentUser?.inventory?.dropCampaigns ?? [];
    const combinedInventoryRaw =
      inProgressRaw.length > 0 ? [...inProgressRaw, ...allInventoryRaw] : allInventoryRaw;
    const inProgress = combinedInventoryRaw.map(normalizeEdge);
    for (const edge of inProgress) {
      const id = edge.node?.id;
      if (id) campaignsById.set(id, edge);
    }
    inventorySummary = `currentUser: ${!!inv?.data?.currentUser}, inProgress: ${inProgressRaw.length}, all: ${allInventoryRaw.length}, combined: ${combinedInventoryRaw.length}, normalized: ${campaignsById.size}`;
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
      this.debug("Inventory raw edge[0]", JSON.stringify(inProgress[0], null, 2));
    }

    if (includeAvailable) {
      // 2) ViewerDropsDashboard (available campaigns) — merge/overwrite by id
      const campaignsPayloadBase = {
        operationName: "ViewerDropsDashboard",
        sha: "5a4da2ab3d5b47c9f9ce864e727b2cb346af1e3ea8b897fe8f704a97ff017619",
      };
      const campaignsPages = 4;
      let nextCursor: string | null | undefined;
      let fetchedEdges = 0;
      for (let page = 0; page < campaignsPages; page += 1) {
        const variables: Record<string, unknown> = { fetchRewardCampaigns: false, first: 100 };
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
        const dropCampaigns = campaigns?.data?.currentUser?.dropCampaigns;
        const availableRaw = Array.isArray(dropCampaigns)
          ? dropCampaigns
          : (dropCampaigns?.edges ?? []);
        const available = availableRaw.map(normalizeEdge);
        fetchedEdges += availableRaw.length;
        for (const edge of available) {
          const id = edge.node?.id;
          if (id) campaignsById.set(id, edge);
        }
        const pageInfo = dropCampaigns?.pageInfo;
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
              this.debug("Campaign raw edge[0]", JSON.stringify(available[0], null, 2));
            }
          }
          break;
        }
      }
      if (campaignsSummary === "n/a") {
        campaignsSummary = `currentUser: unknown, edges: ${fetchedEdges}, pages: ${campaignsPages}`;
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
      };
    }

    return {
      edges: mergedEdges,
      summary: `Campaigns(${campaignsSummary}); Inventory(${inventorySummary}); totalEdges=${mergedEdges.length}`,
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

      const responses = await this.gqlRequest<any>(gqlPayload, "DropCampaignDetails");
      const responseList = Array.isArray(responses) ? responses : [responses];
      for (const res of responseList) {
        const node = res?.data?.user?.dropCampaign as CampaignNode | undefined;
        if (node?.id && campaignsById.has(node.id)) {
          const base = campaignsById.get(node.id)!;
          let mergedDrops = node.timeBasedDrops;
          if (base.timeBasedDrops && node.timeBasedDrops) {
            const baseById = new Map((base.timeBasedDrops ?? []).map((d) => [d.id, d]));
            mergedDrops = node.timeBasedDrops.map((d) => {
              const baseDrop = baseById.get(d.id);
              return {
                ...baseDrop,
                ...d,
                self: d.self ?? baseDrop?.self, // preserve progress info
              };
            });
          } else if (base.timeBasedDrops && !node.timeBasedDrops) {
            mergedDrops = base.timeBasedDrops;
          }
          campaignsById.set(node.id, { ...base, ...node, timeBasedDrops: mergedDrops });
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
      const res = await this.gqlRequest<any>(payload, "DropsHighlightService_AvailableDrops");
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

function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function mapStatus(status: string | undefined, drop?: any): InventoryItem["status"] {
  const s = (status ?? "").toLowerCase();
  if (
    s === "claimed" ||
    s === "fulfilled" ||
    s === "ended" ||
    s === "complete" ||
    s === "completed"
  ) {
    return "claimed";
  }
  if (s === "in_progress" || s === "active" || s === "progress") {
    return "progress";
  }
  if (isTruthyFlag((drop as any)?.self?.isClaimed)) {
    return "claimed";
  }
  return "locked";
}

function extractDropImageUrl(drop: any): string | undefined {
  const benefitEdgesRaw =
    (Array.isArray(drop?.benefitEdges) ? drop.benefitEdges : drop?.benefitEdges?.edges) ??
    drop?.benefitEdges?.nodes ??
    [];
  const benefitNodes = Array.isArray(benefitEdgesRaw)
    ? benefitEdgesRaw.map((edge: any) => edge?.node ?? edge?.benefit ?? edge).filter(Boolean)
    : [];
  const benefitCandidates: unknown[] = [];
  for (const node of benefitNodes) {
    benefitCandidates.push(
      node?.imageAssetURL,
      node?.imageAssetUrl,
      node?.imageURL,
      node?.imageUrl,
      node?.image?.url,
      node?.image?.URL,
      node?.benefit?.imageURL,
      node?.benefit?.imageUrl,
      node?.benefit?.image?.url,
      node?.benefit?.image?.URL,
      node?.benefit?.imageAssetURL,
      node?.benefit?.imageAssetUrl,
    );
  }
  const candidates = [
    ...benefitCandidates,
    drop?.benefit?.imageURL,
    drop?.benefit?.imageUrl,
    drop?.benefit?.image?.url,
    drop?.benefit?.image?.URL,
    drop?.imageURL,
    drop?.imageUrl,
    drop?.image?.url,
    drop?.image?.URL,
    drop?.artworkURL,
    drop?.artworkUrl,
    drop?.localizedContent?.imageURL,
    drop?.localizedContent?.imageUrl,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function extractCampaignImageUrl(campaign: any): string | undefined {
  const candidates = [
    campaign?.imageURL,
    campaign?.imageUrl,
    campaign?.game?.boxArtURL,
    campaign?.game?.boxArtUrl,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

type CampaignEdge = {
  cursor?: string;
  node?: {
    id: string;
    name: string;
    game?: { displayName?: string };
    startAt?: string;
    endAt?: string;
    status?: string;
    timeBasedDrops?: Array<{
      id: string;
      name: string;
      minutesWatchedRequired: number;
      self?: { currentMinutesWatched?: number; status?: string };
    }>;
  };
};

type CampaignNode = CampaignEdge["node"];

type CampaignsResponse = {
  data?: {
    currentUser?: {
      dropCampaigns?: {
        edges?: CampaignEdge[];
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      };
    };
  };
};

type InventoryResponse = {
  data?: {
    currentUser?: {
      inventory?: {
        dropCampaignsInProgress?: CampaignEdge[];
        dropCampaigns?: CampaignEdge[];
      };
    };
  };
};

const parseIsoMs = (value?: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const isCampaignActive = (
  {
    startsAt,
    endsAt,
  }: {
    startsAt?: string;
    endsAt?: string;
  },
  now = Date.now(),
): boolean => {
  const startMs = parseIsoMs(startsAt);
  if (startMs !== null && now < startMs) return false;
  const endMs = parseIsoMs(endsAt);
  if (endMs !== null && now > endMs) return false;
  return true;
};

function createPersistedQuery(
  operationName: string,
  sha: string,
  variables: Record<string, unknown>,
) {
  return {
    operationName,
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: sha,
      },
    },
    variables,
  };
}
