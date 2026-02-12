import type { ChannelInfo, TwitchService } from "./service";

export type ChannelTrackerMode = "polling" | "ws" | "hybrid";

export interface ChannelTracker {
  mode: ChannelTrackerMode;
  getChannelsForGame(gameName: string): Promise<ChannelInfo[]>;
}

export class PollingChannelTracker implements ChannelTracker {
  mode: ChannelTrackerMode = "polling";

  constructor(private readonly twitch: TwitchService) {}

  getChannelsForGame(gameName: string): Promise<ChannelInfo[]> {
    return this.twitch.getChannelsForGame(gameName);
  }
}
