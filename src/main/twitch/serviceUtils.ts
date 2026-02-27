export type InventoryStatus = "locked" | "progress" | "claimed";

export type CampaignInfo = {
  id: string;
  name: string;
  game: string;
  imageUrl?: string;
  accountLinkUrl?: string;
  drops?: CampaignDropInfo[];
  isAccountConnected?: boolean;
  startsAt?: string;
  endsAt?: string;
  status?: string;
  isActive: boolean;
  hasUnclaimedDrops?: boolean;
};

export type CampaignDropInfo = {
  id: string;
  name?: string;
  requiredMinutes?: number;
  earnedMinutes?: number;
  status?: InventoryStatus;
  imageUrl?: string;
};

type BoolFlag = boolean | number | string | null | undefined;
type NumberField = number | string | null | undefined;

type CampaignDropReference = {
  id?: string;
};

type BenefitNode = {
  id?: string;
  name?: string;
  distributionType?: string;
  imageAssetURL?: string;
};

type BenefitEdge = {
  benefit?: BenefitNode;
};

type BenefitConnectionEdge = {
  benefit?: BenefitNode;
  node?: BenefitNode;
};

type BenefitEdgesConnection = {
  edges?: Array<BenefitConnectionEdge | null | undefined>;
  nodes?: Array<BenefitNode | null | undefined>;
};

type BenefitEdgesField = BenefitEdge[] | BenefitEdgesConnection;

type CampaignDropSelf = {
  currentMinutesWatched?: number;
  status?: string;
  state?: string;
  dropInstanceID?: string;
  dropInstanceId?: string;
  isClaimed?: BoolFlag;
  hasPreconditionsMet?: BoolFlag;
};

type CampaignDropNode = {
  id: string;
  name: string;
  requiredMinutesWatched?: NumberField;
  status?: string;
  state?: string;
  self?: CampaignDropSelf;
  allow?: {
    isEnabled?: boolean;
    channels?: AllowChannelNode[];
    id?: string | number;
    login?: string;
    name?: string;
    displayName?: string;
    broadcaster?: {
      id?: string | number;
      login?: string;
      name?: string;
      displayName?: string;
    };
    channel?: {
      id?: string | number;
      login?: string;
      name?: string;
      displayName?: string;
    };
  };
  benefitEdges?: BenefitEdgesField;
  preconditionDrops?: Array<string | CampaignDropReference>;
};

type AllowChannelNode = {
  id?: string | number;
  login?: string;
  name?: string;
  displayName?: string;
  broadcaster?: {
    id?: string | number;
    login?: string;
    name?: string;
    displayName?: string;
  };
  channel?: {
    id?: string | number;
    login?: string;
    name?: string;
    displayName?: string;
  };
};

export type CampaignNode = {
  id: string;
  name: string;
  accountLinkURL?: string;
  accountLinkUrl?: string;
  game?: { displayName?: string; boxArtURL?: string; boxArtUrl?: string };
  startAt?: string;
  endAt?: string;
  status?: string;
  imageURL?: string;
  imageUrl?: string;
  allow?: { isEnabled?: BoolFlag; channels?: AllowChannelNode[] };
  self?: { isAccountConnected?: BoolFlag };
  timeBasedDrops?: CampaignDropNode[];
};

export type CampaignEdge = {
  cursor?: string;
  node?: CampaignNode;
};

type CampaignEdgeLike = CampaignEdge | CampaignNode;

export type CampaignsResponse = {
  data?: {
    currentUser?: {
      dropCampaigns?:
        | CampaignEdgeLike[]
        | {
            edges?: CampaignEdgeLike[];
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          };
    };
  };
};

export type InventoryResponse = {
  data?: {
    currentUser?: {
      inventory?: {
        dropCampaignsInProgress?: CampaignEdgeLike[];
        dropCampaigns?: CampaignEdgeLike[];
        gameEventDrops?: Array<{ id?: string }>;
      };
    };
  };
};

export type DropCampaignDetailsResponse = {
  data?: {
    user?: {
      dropCampaign?: CampaignNode;
    };
  };
};

export type ClaimDropRewardsResponse = {
  data?: {
    claimDropRewards?: {
      status?: string;
      error?: string;
      payload?: {
        status?: string;
      };
    };
  };
};

export type VideoPlayerStreamInfoOverlayChannelResponse = {
  data?: {
    user?: {
      id?: string;
      stream?: {
        id?: string;
        stream?: {
          id?: string;
        };
      } | null;
    };
  };
};

export type DirectoryGameRedirectResponse = {
  data?: {
    game?: {
      slug?: string;
      displayName?: string;
      name?: string;
    };
  };
};

export type DirectoryStreamNode = {
  id?: string;
  viewersCount?: number;
  previewImageURL?: string;
  broadcaster?: {
    id?: string;
    login?: string;
    displayName?: string;
    language?: string;
    broadcastSettings?: {
      title?: string;
      isDropsEnabled?: boolean;
    };
  };
};

export type DirectoryPageGameResponse = {
  data?: {
    game?: {
      streams?: {
        edges?: Array<{ node?: DirectoryStreamNode }>;
      };
    };
  };
};

export type AvailableDropsResponse = {
  data?: {
    channel?: {
      id?: string;
      viewerDropCampaigns?: CampaignEdgeLike[];
    };
  };
};

export const parseIsoMs = (value?: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

export const pickRequiredMinutes = (drop: CampaignDropNode): number => {
  const value = Number(drop.requiredMinutesWatched);
  return Number.isFinite(value) && value > 0 ? value : 0;
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

export function createPersistedQuery(
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

export function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function isWithinClaimWindow(endsAt?: string, now = Date.now()): boolean {
  if (!endsAt) return true;
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(endMs)) return true;
  return now < endMs + 24 * 60 * 60 * 1000;
}

export function extractPreconditionDropIds(drop: CampaignDropNode): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const pushId = (value?: string) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    ids.push(trimmed);
  };
  const preconditions = drop.preconditionDrops;
  if (!Array.isArray(preconditions)) return ids;
  for (const entry of preconditions) {
    if (typeof entry === "string") {
      pushId(entry);
      continue;
    }
    pushId(entry.id);
  }
  return ids;
}

export function collectLockedReasonHints({
  requiredMinutes,
  watched,
  blockingReasonHints,
}: {
  requiredMinutes: number;
  watched: number;
  blockingReasonHints: string[];
}): string[] {
  const reasons = [...blockingReasonHints];
  if (requiredMinutes > 0) {
    if (watched <= 0) reasons.push("no_watch_progress");
    if (watched > 0 && watched < requiredMinutes) reasons.push("watch_more_minutes");
  }
  if (reasons.length === 0) return ["unknown_locked_state"];
  return Array.from(new Set(reasons));
}

export function collectBlockingReasonHints({
  linked,
  campaignNotStarted,
  campaignExpired,
  missingPrerequisiteDropIds,
  hasPreconditionsMet,
  progressDone,
  dropInstanceId,
  withinClaimWindow,
  isClaimed,
}: {
  linked: boolean;
  campaignNotStarted: boolean;
  campaignExpired: boolean;
  missingPrerequisiteDropIds: string[];
  hasPreconditionsMet?: BoolFlag;
  progressDone: boolean;
  dropInstanceId?: string;
  withinClaimWindow: boolean;
  isClaimed: boolean;
}): string[] {
  if (isClaimed) return [];
  const reasons: string[] = [];
  if (!linked) reasons.push("account_not_linked");
  if (campaignNotStarted) reasons.push("campaign_not_started");
  if (campaignExpired) reasons.push("campaign_expired");
  if (missingPrerequisiteDropIds.length > 0) {
    reasons.push(`missing_prerequisite_drops:${missingPrerequisiteDropIds.join(",")}`);
  } else if (hasPreconditionsMet === false) {
    reasons.push("preconditions_not_met");
  }
  if (progressDone && !dropInstanceId) reasons.push("missing_drop_instance_id");
  if (progressDone && !withinClaimWindow) reasons.push("claim_window_closed");
  return Array.from(new Set(reasons));
}

export function unlockGuidanceForReason(reason: string): string {
  if (reason === "account_not_linked") return "Linke dein Game-Account mit Twitch.";
  if (reason === "campaign_not_started")
    return "Warte bis `startsAt`; vorher ist der Drop gesperrt.";
  if (reason === "campaign_expired")
    return "Kampagne ist vorbei; dieser Drop ist nicht mehr freischaltbar.";
  if (reason === "campaign_allow_disabled")
    return "Twitch markiert die Kampagne als deaktiviert (Eligibility/Region/Account checken).";
  if (reason === "preconditions_not_met")
    return "Drop-Voraussetzungen sind nicht erfuellt; vorherige Schritte zuerst abschliessen.";
  if (reason === "no_watch_progress")
    return "Schaue einen eligible Stream fuer diese Kampagne, um Fortschritt zu starten.";
  if (reason === "watch_more_minutes")
    return "Mehr Watchtime noetig, bis `requiredMinutes` erreicht ist.";
  if (reason === "missing_drop_instance_id")
    return "Fortschritt ist voll, aber Claim-ID fehlt. Inventory neu laden und erneut pruefen.";
  if (reason === "claim_window_closed")
    return "Claim-Fenster ist abgelaufen (nach Kampagnenende nur begrenzt claimbar).";
  if (reason.startsWith("missing_prerequisite_drops:")) {
    const ids = reason.slice("missing_prerequisite_drops:".length).trim();
    return ids
      ? `Vorherige Pflicht-Drops zuerst abschliessen/claimen: ${ids}`
      : "Vorherige Pflicht-Drops zuerst abschliessen/claimen.";
  }
  return "Unklarer Locked-Zustand; Raw-Felder der Kampagne im Debug-Log pruefen.";
}

export function mapStatus(status: string | undefined, drop?: CampaignDropNode): InventoryStatus {
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
  if (isTruthyFlag(drop?.self?.isClaimed)) {
    return "claimed";
  }
  return "locked";
}

export function normalizeDropWatchState({
  drop,
  rawStatus,
  requiredMinutes,
  watchedMinutes,
  benefitClaimed = false,
}: {
  drop: CampaignDropNode;
  rawStatus?: string;
  requiredMinutes: number;
  watchedMinutes: number;
  benefitClaimed?: boolean;
}): {
  status: InventoryStatus;
  watchedMinutes: number;
  earnedMinutes: number;
  progressDone: boolean;
  isClaimed: boolean;
} {
  let watched = Math.max(0, Number(watchedMinutes) || 0);
  let status = mapStatus(rawStatus, drop);
  const isClaimed = isTruthyFlag(drop.self?.isClaimed) || benefitClaimed;

  if (isClaimed) {
    status = "claimed";
  }
  if (status === "claimed" && requiredMinutes > 0 && watched === 0) {
    // Claimed drops should always report full progress, even on stale minute snapshots.
    watched = requiredMinutes;
  }

  const progressDone = requiredMinutes > 0 && watched >= requiredMinutes;
  if (!isClaimed) {
    if (progressDone && status !== "claimed") {
      status = "progress";
    } else if (watched > 0 && status === "locked") {
      status = "progress";
    }
  }

  const earnedMinutes = requiredMinutes > 0 ? Math.min(requiredMinutes, watched) : watched;
  return {
    status,
    watchedMinutes: watched,
    earnedMinutes,
    progressDone,
    isClaimed,
  };
}

const normalizeId = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeLogin = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
};

type AllowContainer = {
  isEnabled?: BoolFlag;
  channels?: AllowChannelNode[];
  id?: string | number;
  login?: string;
  name?: string;
  displayName?: string;
  broadcaster?: {
    id?: string | number;
    login?: string;
    name?: string;
    displayName?: string;
  };
  channel?: {
    id?: string | number;
    login?: string;
    name?: string;
    displayName?: string;
  };
};

const isAllowExplicitlyDisabled = (allow: unknown): boolean => {
  if (!allow || typeof allow !== "object") return false;
  const container = allow as AllowContainer;
  return container.isEnabled !== undefined && !isTruthyFlag(container.isEnabled);
};

const collectAllowEntries = (allow: unknown): AllowChannelNode[] => {
  if (!allow || typeof allow !== "object") return [];
  if (isAllowExplicitlyDisabled(allow)) return [];
  const container = allow as AllowContainer;
  const entries: AllowChannelNode[] = [];
  if (Array.isArray(container.channels)) {
    entries.push(...container.channels.filter((entry) => !!entry));
  }
  const hasDirectChannelShape =
    container.id !== undefined ||
    container.login !== undefined ||
    container.name !== undefined ||
    container.displayName !== undefined ||
    container.broadcaster !== undefined ||
    container.channel !== undefined;
  if (hasDirectChannelShape) {
    entries.push({
      id: container.id,
      login: container.login,
      name: container.name,
      displayName: container.displayName,
      broadcaster: container.broadcaster,
      channel: container.channel,
    });
  }
  return entries;
};

const collectFiltersFromEntries = (
  entries: AllowChannelNode[],
): { ids: string[]; logins: string[] } => {
  if (entries.length === 0) return { ids: [], logins: [] };
  const idSet = new Set<string>();
  const loginSet = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const candidates = [
      entry.id,
      entry.channel?.id,
      entry.broadcaster?.id,
      entry.login,
      entry.channel?.login,
      entry.broadcaster?.login,
      entry.name,
      entry.channel?.name,
      entry.broadcaster?.name,
      entry.displayName,
      entry.channel?.displayName,
      entry.broadcaster?.displayName,
    ];
    for (const value of candidates.slice(0, 3)) {
      const id = normalizeId(value);
      if (id) idSet.add(id);
    }
    for (const value of candidates.slice(3)) {
      const login = normalizeLogin(value);
      if (login) loginSet.add(login);
    }
  }
  return {
    ids: Array.from(idSet),
    logins: Array.from(loginSet),
  };
};

export function extractAllowedChannelFilters(
  campaign: CampaignNode,
  drop?: CampaignDropNode,
): {
  ids: string[];
  logins: string[];
} {
  if (drop && isAllowExplicitlyDisabled(drop.allow)) {
    return { ids: [], logins: [] };
  }
  const dropFilters = drop ? collectFiltersFromEntries(collectAllowEntries(drop.allow)) : null;
  if (dropFilters && (dropFilters.ids.length > 0 || dropFilters.logins.length > 0)) {
    return dropFilters;
  }
  return collectFiltersFromEntries(collectAllowEntries(campaign.allow));
}

function normalizeBenefitType(value?: string | null): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

function isBadgeOrEmoteType(value?: string | null): boolean {
  const normalized = normalizeBenefitType(value);
  if (!normalized) return false;
  return normalized.includes("BADGE") || normalized.includes("EMOTE");
}

export function extractBenefitEdges(drop: CampaignDropNode): BenefitEdge[] {
  const raw = drop.benefitEdges;
  if (Array.isArray(raw)) {
    return raw;
  }
  if (!raw) {
    return [];
  }
  const edgesFromConnection = Array.isArray(raw.edges)
    ? raw.edges
        .map((edge) => {
          if (!edge) return undefined;
          if (edge.benefit) return { benefit: edge.benefit };
          if (edge.node) return { benefit: edge.node };
          return undefined;
        })
        .filter((edge): edge is BenefitEdge => !!edge?.benefit)
    : [];
  const nodesFromConnection = Array.isArray(raw.nodes)
    ? raw.nodes
        .map((node) => (node ? { benefit: node } : undefined))
        .filter((edge): edge is BenefitEdge => !!edge?.benefit)
    : [];
  return [...edgesFromConnection, ...nodesFromConnection];
}

function extractBenefits(drop: CampaignDropNode): BenefitNode[] {
  return extractBenefitEdges(drop)
    .map((edge) => edge?.benefit)
    .filter((benefit): benefit is BenefitNode => !!benefit);
}

export function dropHasBadgeOrEmote(drop: CampaignDropNode): boolean {
  const benefits = extractBenefits(drop);
  return benefits.some((benefit) => isBadgeOrEmoteType(benefit.distributionType));
}

export function extractDropImageUrl(drop: CampaignDropNode): string | undefined {
  for (const benefit of extractBenefits(drop)) {
    const value = benefit.imageAssetURL;
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function collectBenefitIds(drop: CampaignDropNode): string[] {
  const ids: string[] = [];
  const pushId = (value?: string) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed) ids.push(trimmed);
  };
  for (const benefit of extractBenefits(drop)) pushId(benefit.id);
  return ids;
}

export function hasClaimedBenefit(claimed: Set<string>, drop: CampaignDropNode): boolean {
  if (!claimed || claimed.size === 0) return false;
  const ids = collectBenefitIds(drop);
  if (ids.length === 0) return false;
  return ids.some((id) => claimed.has(id));
}

function extractAccountLinkUrl(campaign: CampaignNode): string | undefined {
  const candidates = [campaign.accountLinkURL, campaign.accountLinkUrl];
  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^www\.twitch\.tv\//i.test(trimmed)) return `https://${trimmed}`;
    if (trimmed.startsWith("/")) return `https://www.twitch.tv${trimmed}`;
  }
  return undefined;
}

export function extractCampaignImageUrl(campaign: CampaignNode): string | undefined {
  const value = campaign.game?.boxArtURL;
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  return normalizeTwitchImageUrl(value.trim(), 88, 88);
}

function normalizeTwitchImageUrl(value: string, width: number, height: number): string {
  return value
    .replace("{width}", String(width))
    .replace("{height}", String(height))
    .replace("%7Bwidth%7D", String(width))
    .replace("%7Bheight%7D", String(height));
}

function hasPreferredMergeValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getRecordId(value: unknown): string | null {
  if (!isRecordObject(value)) return null;
  const raw = value.id;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

function canMergeArraysById(primary: unknown[], secondary: unknown[]): boolean {
  if (primary.length === 0 || secondary.length === 0) return false;
  return (
    primary.every((entry) => getRecordId(entry) !== null) &&
    secondary.every((entry) => getRecordId(entry) !== null)
  );
}

function mergeArrayById(primary: unknown[], secondary: unknown[], path: string[]): unknown[] {
  const primaryById = new Map<string, unknown>();
  for (const entry of primary) {
    const id = getRecordId(entry);
    if (!id || primaryById.has(id)) continue;
    primaryById.set(id, entry);
  }

  const merged: unknown[] = [];
  const seenIds = new Set<string>();
  for (const entry of secondary) {
    const id = getRecordId(entry);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    merged.push(mergePrimaryData(primaryById.get(id), entry, [...path, id]));
  }
  for (const entry of primary) {
    const id = getRecordId(entry);
    if (!id || seenIds.has(id)) continue;
    merged.push(entry);
  }
  return merged;
}

export function mergePrimaryData(
  primary: unknown,
  secondary: unknown,
  path: string[] = [],
): unknown {
  if (primary === undefined) return secondary;
  if (secondary === undefined) return primary;

  if (Array.isArray(primary) || Array.isArray(secondary)) {
    if (Array.isArray(primary) && Array.isArray(secondary)) {
      if (canMergeArraysById(primary, secondary)) {
        return mergeArrayById(primary, secondary, path);
      }
      return secondary.length > 0 ? secondary : primary;
    }
    return hasPreferredMergeValue(secondary) ? secondary : primary;
  }

  if (isRecordObject(primary) && isRecordObject(secondary)) {
    const out: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(primary), ...Object.keys(secondary)]);
    for (const key of keys) {
      out[key] = mergePrimaryData(primary[key], secondary[key], [...path, key]);
    }
    return out;
  }

  const leafKey = path[path.length - 1];
  if (leafKey === "currentMinutesWatched" || leafKey === "requiredMinutesWatched") {
    const primaryNum = toFiniteNumber(primary);
    const secondaryNum = toFiniteNumber(secondary);
    if (primaryNum !== null && secondaryNum !== null) {
      return Math.max(primaryNum, secondaryNum);
    }
  }

  return hasPreferredMergeValue(secondary) ? secondary : primary;
}

export function isPersistedQueryNotFound(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error) {
    return /PersistedQueryNotFound/i.test(err.message);
  }
  return false;
}

export function buildCampaignSummaries(
  nodes: CampaignNode[],
  claimedBenefitIds?: Set<string>,
): CampaignInfo[] {
  const now = Date.now();
  const campaigns: CampaignInfo[] = [];
  for (const node of nodes) {
    if (!node?.id || !node?.name) continue;
    const game = node.game?.displayName?.trim() ?? "";
    if (!game) continue;
    const startsAt = typeof node.startAt === "string" ? node.startAt : undefined;
    const endsAt = typeof node.endAt === "string" ? node.endAt : undefined;
    const isActive = isCampaignActive({ startsAt, endsAt }, now);
    const imageUrl = extractCampaignImageUrl(node);
    const accountLinkUrl = extractAccountLinkUrl(node);
    const isAccountConnected =
      typeof node.self?.isAccountConnected === "boolean"
        ? Boolean(node.self.isAccountConnected)
        : undefined;
    let drops: CampaignDropInfo[] | undefined;
    let hasUnclaimedDrops: boolean | undefined;
    if (Array.isArray(node.timeBasedDrops)) {
      drops = [];
      for (const drop of node.timeBasedDrops) {
        if (!drop?.id) continue;
        const self = drop.self;
        const rawStatus = self?.status ?? self?.state ?? drop.status ?? drop.state ?? undefined;
        const requiredMinutes = pickRequiredMinutes(drop);
        const benefitClaimed =
          claimedBenefitIds && claimedBenefitIds.size > 0
            ? hasClaimedBenefit(claimedBenefitIds, drop)
            : false;
        const normalized = normalizeDropWatchState({
          drop,
          rawStatus,
          requiredMinutes,
          watchedMinutes: Number(self?.currentMinutesWatched ?? 0) || 0,
          benefitClaimed,
        });
        drops.push({
          id: drop.id,
          name: drop.name,
          requiredMinutes,
          earnedMinutes: normalized.earnedMinutes,
          status: normalized.status,
          imageUrl: extractDropImageUrl(drop),
        });
      }
      hasUnclaimedDrops =
        drops.length === 0
          ? false
          : drops.some(
              (drop) =>
                Math.max(0, Number(drop.requiredMinutes) || 0) > 0 && drop.status !== "claimed",
            );
    } else {
      hasUnclaimedDrops = false;
    }
    campaigns.push({
      id: node.id,
      name: node.name,
      game,
      imageUrl,
      accountLinkUrl,
      drops,
      isAccountConnected,
      startsAt,
      endsAt,
      status: node.status,
      isActive,
      hasUnclaimedDrops,
    });
  }
  return campaigns;
}
