import type { AlertEventType } from "./alertRouting";

export type DiscordWebhookBody = {
  username: string;
  embeds: Array<{ title: string; description?: string; color: number; timestamp: string }>;
};

const EMBED_COLOR: Record<AlertEventType, number> = {
  "drop-claimed": 0x2ecc71,
  "watch-error": 0xe74c3c,
  "drop-ending-soon": 0xe67e22,
  "auto-switch": 0x3498db,
  "new-drops": 0x8b5cf6,
};

export function buildDiscordPayload(event: {
  type: AlertEventType;
  title: string;
  body?: string;
  timestampIso: string;
}): DiscordWebhookBody {
  return {
    username: "DropPilot",
    embeds: [
      {
        title: event.title,
        ...(event.body ? { description: event.body } : {}),
        color: EMBED_COLOR[event.type],
        timestamp: event.timestampIso,
      },
    ],
  };
}
