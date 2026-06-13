import { describe, expect, it } from "vitest";
import { buildDiscordPayload } from "./discordPayload";

describe("buildDiscordPayload", () => {
  it("builds a single-embed Discord body with username and timestamp", () => {
    const body = buildDiscordPayload({
      type: "drop-claimed",
      title: "Drop claimed",
      body: "Some Drop (Some Game)",
      timestampIso: "2026-06-13T10:00:00.000Z",
    });
    expect(body.username).toBe("DropPilot");
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0]).toMatchObject({
      title: "Drop claimed",
      description: "Some Drop (Some Game)",
      color: 0x2ecc71,
      timestamp: "2026-06-13T10:00:00.000Z",
    });
  });

  it("maps a distinct color per event type", () => {
    const color = (type: Parameters<typeof buildDiscordPayload>[0]["type"]) =>
      buildDiscordPayload({ type, title: "t", timestampIso: "x" }).embeds[0].color;
    expect(color("watch-error")).toBe(0xe74c3c);
    expect(color("drop-ending-soon")).toBe(0xe67e22);
    expect(color("auto-switch")).toBe(0x3498db);
    expect(color("new-drops")).toBe(0x8b5cf6);
  });

  it("omits description when body is absent", () => {
    const body = buildDiscordPayload({ type: "new-drops", title: "New drops", timestampIso: "x" });
    expect(body.embeds[0]).not.toHaveProperty("description");
  });
});
