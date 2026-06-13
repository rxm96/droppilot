import { describe, expect, it } from "vitest";
import { narrateEngineCountdown } from "./controlHelpers";

const DICT: Record<string, string> = {
  "control.watchEngineNext.suppressedCountdown": "Resuming in {time} after the stall hold.",
  "control.watchEngineNext.cooldownCountdown": "Cooldown ends in {time}, then auto-select retries.",
};

const t = (key: string, vars?: Record<string, string | number>): string => {
  const template = DICT[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? "")) : template;
};

describe("narrateEngineCountdown", () => {
  it("returns empty when no time remains", () => {
    expect(narrateEngineCountdown("suppressed", "stall-stop", 0, t)).toBe("");
    expect(narrateEngineCountdown("cooldown", null, -5, t)).toBe("");
  });

  it("narrates the stall-stop suppression hold with a live duration", () => {
    expect(narrateEngineCountdown("suppressed", "stall-stop", 252_000, t)).toBe(
      "Resuming in 4m 12s after the stall hold.",
    );
  });

  it("does not narrate a manual-stop suppression (user must resume)", () => {
    expect(narrateEngineCountdown("suppressed", "manual-stop", 252_000, t)).toBe("");
  });

  it("narrates a cooldown countdown", () => {
    expect(narrateEngineCountdown("cooldown", null, 65_000, t)).toBe(
      "Cooldown ends in 1m 05s, then auto-select retries.",
    );
  });

  it("returns empty for decisions without a countdown", () => {
    expect(narrateEngineCountdown("watching-progress", null, 99_000, t)).toBe("");
  });
});
