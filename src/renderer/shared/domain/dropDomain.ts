import type { ChannelEntry, InventoryItem, WatchingState } from "@renderer/shared/types";

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const normalizeLogin = (value: unknown): string => String(value ?? "").trim().toLowerCase();

export type ChannelAllowlist = {
  ids: string[];
  logins: string[];
};

type ChannelLike = {
  id?: string;
  login?: string;
};

/**
 * Normalized channel restriction for drops/campaigns.
 * Handles both id-based and login-based allowlists.
 */
export class DropChannelRestriction {
  readonly ids: ReadonlySet<string>;
  readonly logins: ReadonlySet<string>;

  constructor(input?: { ids?: string[]; logins?: string[] }) {
    this.ids = new Set(
      (input?.ids ?? []).map((value) => normalizeId(value)).filter((value) => value.length > 0),
    );
    this.logins = new Set(
      (input?.logins ?? [])
        .map((value) => normalizeLogin(value))
        .filter((value) => value.length > 0),
    );
  }

  static fromInventoryItem(item: Pick<InventoryItem, "allowedChannelIds" | "allowedChannelLogins">) {
    return new DropChannelRestriction({
      ids: item.allowedChannelIds,
      logins: item.allowedChannelLogins,
    });
  }

  static fromAllowlist(allowlist?: ChannelAllowlist | null): DropChannelRestriction {
    return new DropChannelRestriction({
      ids: allowlist?.ids,
      logins: allowlist?.logins,
    });
  }

  get hasConstraints(): boolean {
    return this.ids.size > 0 || this.logins.size > 0;
  }

  toAllowlist(): ChannelAllowlist | null {
    if (!this.hasConstraints) return null;
    return {
      ids: Array.from(this.ids),
      logins: Array.from(this.logins),
    };
  }

  mergedWith(other: DropChannelRestriction): DropChannelRestriction {
    const ids = new Set<string>(this.ids);
    const logins = new Set<string>(this.logins);
    for (const id of other.ids) ids.add(id);
    for (const login of other.logins) logins.add(login);
    return new DropChannelRestriction({
      ids: Array.from(ids),
      logins: Array.from(logins),
    });
  }

  matchesId(channelId: unknown): boolean {
    const normalized = normalizeId(channelId);
    return normalized.length > 0 && this.ids.has(normalized);
  }

  matchesLogin(channelLogin: unknown): boolean {
    const normalized = normalizeLogin(channelLogin);
    return normalized.length > 0 && this.logins.has(normalized);
  }

  allowsChannel(channel: ChannelLike): boolean {
    if (!this.hasConstraints) return true;
    if (this.matchesId(channel.id)) return true;
    if (this.matchesLogin(channel.login)) return true;
    return false;
  }

  allowsWatching(watching: WatchingState): boolean {
    if (!watching) return false;
    return this.allowsChannel({
      id: normalizeId(watching.channelId ?? watching.id),
      login: normalizeLogin(watching.login ?? watching.name),
    });
  }
}

/**
 * Immutable normalized view over an inventory drop item.
 */
export class InventoryDrop {
  readonly raw: InventoryItem;
  readonly restriction: DropChannelRestriction;

  constructor(raw: InventoryItem) {
    this.raw = raw;
    this.restriction = DropChannelRestriction.fromInventoryItem(raw);
  }

  get id(): string {
    return this.raw.id;
  }

  get game(): string {
    return this.raw.game;
  }

  get title(): string {
    return this.raw.title || "";
  }

  get requiredMinutes(): number {
    return Math.max(0, Number(this.raw.requiredMinutes) || 0);
  }

  get earnedMinutes(): number {
    return Math.max(0, Number(this.raw.earnedMinutes) || 0);
  }

  get remainingMinutes(): number {
    return Math.max(0, this.requiredMinutes - this.earnedMinutes);
  }

  get isBlocked(): boolean {
    return this.raw.blocked === true;
  }

  isExpired(now = Date.now()): boolean {
    const status = String(this.raw.campaignStatus ?? "")
      .trim()
      .toUpperCase();
    if (status === "EXPIRED") return true;
    if (!this.raw.endsAt) return false;
    const endsAt = Date.parse(this.raw.endsAt);
    return Number.isFinite(endsAt) && endsAt < now;
  }

  canProgressOnWatchingChannel(watching: WatchingState, targetGame: string): boolean {
    if (!watching || watching.game !== targetGame) return false;
    return this.restriction.allowsWatching(watching);
  }

  canProgressOnChannel(channel: ChannelEntry): boolean {
    return this.restriction.allowsChannel(channel);
  }
}

/**
 * Small domain aggregate used by hooks for deterministic ordering and filtering.
 */
export class InventoryDropCollection {
  readonly items: readonly InventoryDrop[];

  constructor(items: InventoryItem[]) {
    this.items = items.map((item) => new InventoryDrop(item));
  }

  forGame(game: string): InventoryDrop[] {
    return this.items.filter((item) => item.game === game);
  }
}
