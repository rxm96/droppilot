import { describe, expect, it } from "vitest";
import {
  DEFAULT_UPDATE_CHANNEL,
  allowsPrereleaseBuilds,
  getAvailableUpdateVersion,
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

describe("getAvailableUpdateVersion", () => {
  it("returns the version when the updater reports an update", () => {
    expect(
      getAvailableUpdateVersion({ isUpdateAvailable: true, updateInfo: { version: "4.1.0" } }),
    ).toBe("4.1.0");
  });

  it("ignores an older or rejected version the updater did not accept", () => {
    // e.g. on 4.0.1-rc.1 switching to stable: latest stable 4.0.0 is older.
    expect(
      getAvailableUpdateVersion({ isUpdateAvailable: false, updateInfo: { version: "4.0.0" } }),
    ).toBeNull();
  });

  it("returns null without a result", () => {
    expect(getAvailableUpdateVersion(null)).toBeNull();
  });
});
