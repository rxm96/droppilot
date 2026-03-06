import { describe, expect, it } from "vitest";
import {
  DEFAULT_UPDATE_CHANNEL,
  allowsPrereleaseBuilds,
  normalizeUpdateChannel,
} from "./updateChannels";

describe("updateChannels", () => {
  it("defaults to stable for unknown input", () => {
    expect(normalizeUpdateChannel(undefined)).toBe(DEFAULT_UPDATE_CHANNEL);
    expect(normalizeUpdateChannel("beta")).toBe(DEFAULT_UPDATE_CHANNEL);
  });

  it("accepts explicit stable and preview channels", () => {
    expect(normalizeUpdateChannel("stable")).toBe("stable");
    expect(normalizeUpdateChannel("preview")).toBe("preview");
  });

  it("maps legacy betaUpdates true to preview", () => {
    expect(normalizeUpdateChannel(undefined, true)).toBe("preview");
  });

  it("treats preview as prerelease-enabled", () => {
    expect(allowsPrereleaseBuilds("preview")).toBe(true);
    expect(allowsPrereleaseBuilds("stable")).toBe(false);
  });
});
