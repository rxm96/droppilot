import type { ChannelEntry, InventoryItem, PriorityPlan, ProfileState } from "./types";

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgDataUri(width: number, height: number, label: string, color: string) {
  const safeLabel = escapeSvgText(label);
  const fontSize = Math.max(14, Math.round(height / 6));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="${color}"/>
  <text x="50%" y="54%" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#ffffff">${safeLabel}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const demoAvatar = svgDataUri(64, 64, "DP", "#ff8a00");

export const demoProfile: ProfileState = {
  status: "ready",
  displayName: "Demo Pilot",
  login: "demopilot",
  avatar: demoAvatar,
};

export function buildDemoInventory(now = Date.now()): InventoryItem[] {
  const iso = (minutesFromNow: number) => new Date(now + minutesFromNow * 60_000).toISOString();
  return [
    {
      id: "demo-valorant-1",
      game: "VALORANT",
      title: "Prime Vandal",
      requiredMinutes: 60,
      earnedMinutes: 20,
      status: "progress",
      linked: true,
      startsAt: iso(-720),
      endsAt: iso(1440),
      campaignId: "camp-valorant",
      dropInstanceId: "drop-valorant-1",
    },
    {
      id: "demo-valorant-2",
      game: "VALORANT",
      title: "Player Card",
      requiredMinutes: 30,
      earnedMinutes: 0,
      status: "locked",
      linked: true,
      startsAt: iso(120),
      endsAt: iso(1560),
      campaignId: "camp-valorant",
      dropInstanceId: "drop-valorant-2",
    },
    {
      id: "demo-valorant-3",
      game: "VALORANT",
      title: "Spray: Headshot",
      requiredMinutes: 45,
      earnedMinutes: 45,
      status: "claimed",
      linked: true,
      startsAt: iso(-1440),
      endsAt: iso(1440),
      campaignId: "camp-valorant",
    },
    {
      id: "demo-apex-1",
      game: "Apex Legends",
      title: "Legend Skin",
      requiredMinutes: 120,
      earnedMinutes: 90,
      status: "progress",
      linked: true,
      startsAt: iso(-2880),
      endsAt: iso(2880),
      campaignId: "camp-apex",
      dropInstanceId: "drop-apex-1",
    },
    {
      id: "demo-apex-2",
      game: "Apex Legends",
      title: "Weapon Charm",
      requiredMinutes: 30,
      earnedMinutes: 0,
      status: "locked",
      linked: true,
      startsAt: iso(240),
      endsAt: iso(2880),
      campaignId: "camp-apex",
    },
    {
      id: "demo-fortnite-1",
      game: "Fortnite",
      title: "Emote: Victory Lap",
      requiredMinutes: 60,
      earnedMinutes: 10,
      status: "progress",
      linked: true,
      startsAt: iso(-1440),
      endsAt: iso(-60),
      campaignStatus: "EXPIRED",
      campaignId: "camp-fortnite",
    },
    {
      id: "demo-overwatch-1",
      game: "Overwatch 2",
      title: "OW2 Icon",
      requiredMinutes: 15,
      earnedMinutes: 0,
      status: "locked",
      linked: true,
      excluded: true,
      startsAt: iso(-60),
      endsAt: iso(720),
      campaignId: "camp-ow2",
    },
    {
      id: "demo-rust-1",
      game: "Rust",
      title: "Metal Door Skin",
      requiredMinutes: 120,
      earnedMinutes: 0,
      status: "locked",
      linked: false,
      startsAt: iso(-120),
      endsAt: iso(1440),
      campaignId: "camp-rust",
    },
    {
      id: "demo-cs2-1",
      game: "Counter-Strike 2",
      title: "Sticker Drop",
      requiredMinutes: 90,
      earnedMinutes: 45,
      status: "progress",
      linked: true,
      startsAt: iso(-300),
      endsAt: iso(1080),
      campaignId: "camp-cs2",
      dropInstanceId: "drop-cs2-1",
    },
  ];
}

function makeChannel(
  game: string,
  login: string,
  displayName: string,
  title: string,
  viewers: number,
  color: string,
): ChannelEntry {
  return {
    id: `demo-${login}`,
    login,
    displayName,
    streamId: `stream-${login}`,
    title,
    viewers,
    language: "en",
    thumbnail: svgDataUri(640, 360, displayName, color),
    game,
  };
}

const demoChannelsByGame: Record<string, ChannelEntry[]> = {
  VALORANT: [
    makeChannel(
      "VALORANT",
      "agentzero",
      "AgentZero",
      "Ranked grind and drop progress",
      12800,
      "#6d28d9",
    ),
    makeChannel(
      "VALORANT",
      "spikerush",
      "SpikeRushTV",
      "Warmup into custom lobbies",
      7200,
      "#ec4899",
    ),
    makeChannel("VALORANT", "vct_chill", "VCT_Chill", "Co-stream vibes", 4200, "#0ea5e9"),
  ],
  "Apex Legends": [
    makeChannel(
      "Apex Legends",
      "jumpmaster",
      "JumpMaster",
      "Hot drops and clutch plays",
      9800,
      "#f97316",
    ),
    makeChannel(
      "Apex Legends",
      "lootgoblin",
      "LootGoblin",
      "Loot routes and chill comms",
      5100,
      "#14b8a6",
    ),
    makeChannel("Apex Legends", "arenapod", "ArenaPod", "Ranked trio push", 2600, "#22c55e"),
  ],
  Fortnite: [
    makeChannel("Fortnite", "buildmode", "BuildMode", "Zero build practice", 11200, "#f43f5e"),
    makeChannel("Fortnite", "busdriver", "BusDriver", "Arena sessions", 6400, "#eab308"),
    makeChannel("Fortnite", "stormsurge", "StormSurge", "Late game labs", 3100, "#38bdf8"),
  ],
  "Overwatch 2": [
    makeChannel(
      "Overwatch 2",
      "payloadpro",
      "PayloadPro",
      "Support queue and drops",
      5600,
      "#4f46e5",
    ),
    makeChannel("Overwatch 2", "ultready", "UltReady", "Scrims and review", 2400, "#16a34a"),
  ],
  Rust: [
    makeChannel("Rust", "metalbeams", "MetalBeams", "Base tour and raids", 3900, "#f59e0b"),
    makeChannel("Rust", "rocketraid", "RocketRaid", "Wipe day chaos", 2100, "#ef4444"),
  ],
  "Counter-Strike 2": [
    makeChannel(
      "Counter-Strike 2",
      "spraycontrol",
      "SprayControl",
      "Aim labs and drops",
      8600,
      "#06b6d4",
    ),
    makeChannel("Counter-Strike 2", "smokeplay", "SmokePlay", "Utility lineups", 3300, "#a855f7"),
  ],
};

function buildFallbackChannels(game: string): ChannelEntry[] {
  const slug = slugify(game || "stream");
  const label = game || "Live";
  return [
    makeChannel(game, `${slug}-hub`, `${label}Hub`, "Community watch party", 2800, "#3b82f6"),
    makeChannel(game, `${slug}-grind`, `${label}Grind`, "Progress session", 1400, "#8b5cf6"),
  ];
}

export function getDemoChannels(game: string): ChannelEntry[] {
  if (!game) return [];
  const list = demoChannelsByGame[game];
  if (list) return list;
  return buildFallbackChannels(game);
}

export function buildDemoPriorityPlan(
  items: InventoryItem[],
  priorityGames: string[],
): PriorityPlan {
  const activeItems = items.filter((i) => i.status !== "claimed");
  const availableGames = Array.from(new Set(activeItems.map((i) => i.game)));
  const order: string[] = [];

  for (const g of priorityGames) {
    if (availableGames.includes(g) && !order.includes(g)) {
      order.push(g);
    }
  }
  for (const g of availableGames) {
    if (!order.includes(g)) {
      order.push(g);
    }
  }

  const missingPriority = priorityGames.filter((g) => !availableGames.includes(g));

  return {
    order,
    availableGames,
    missingPriority,
    totalActiveDrops: activeItems.length,
  };
}
