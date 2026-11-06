import { describe, expect, it } from "vitest";
import { pickActiveSection, settingsSections } from "./settingsSections";

describe("settingsSections", () => {
  it("lists the six sections in order", () => {
    expect(settingsSections({ showApp: true }).map((s) => s.key)).toEqual([
      "autopilot",
      "notifications",
      "appearance",
      "app",
      "account",
      "advanced",
    ]);
  });

  it("gives every section a unique anchor id", () => {
    const ids = settingsSections({ showApp: true }).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("settings-"))).toBe(true);
  });

  it("leaves out app when the platform has no app options", () => {
    expect(settingsSections({ showApp: false }).map((s) => s.key)).not.toContain("app");
    expect(settingsSections({ showApp: false })).toHaveLength(5);
  });
});

describe("pickActiveSection", () => {
  const positions = [
    { key: "autopilot" as const, top: -400 },
    { key: "notifications" as const, top: -20 },
    { key: "appearance" as const, top: 300 },
    { key: "advanced" as const, top: 900 },
  ];

  it("picks the last section whose heading passed the offset", () => {
    expect(pickActiveSection(positions, { offset: 0, atBottom: false })).toBe("notifications");
    expect(pickActiveSection(positions, { offset: 320, atBottom: false })).toBe("appearance");
  });

  it("picks the first section before any heading passed", () => {
    const below = positions.map((p) => ({ ...p, top: p.top + 1000 }));
    expect(pickActiveSection(below, { offset: 0, atBottom: false })).toBe("autopilot");
  });

  it("picks the last section at the bottom of the page", () => {
    expect(pickActiveSection(positions, { offset: 0, atBottom: true })).toBe("advanced");
  });

  it("returns null without sections", () => {
    expect(pickActiveSection([], { offset: 0, atBottom: false })).toBeNull();
    expect(pickActiveSection([], { offset: 0, atBottom: true })).toBeNull();
  });
});
